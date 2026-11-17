"""User management, authentication, and session handling for MeTube."""

from __future__ import annotations

import copy
import hashlib
import hmac
import logging
import os
import re
import secrets
import time
import uuid
from dataclasses import asdict, dataclass
from typing import Any, Optional

from state_store import AtomicJsonStore

log = logging.getLogger("users")

_USERNAME_RE = re.compile(r"^[a-zA-Z0-9_.-]{2,32}$")
_SESSION_TTL_SECONDS = 30 * 24 * 3600  # 30 days


def validate_username(username: str) -> tuple[bool, str]:
    """Validate username: 2-32 chars, alphanumeric plus '.', '-', '_'."""
    if not isinstance(username, str) or not username:
        return False, "Username is required"
    if username in (".", ".."):
        return False, "Username cannot be '.' or '..'"
    if len(username) < 2:
        return False, "Username must be at least 2 characters long"
    if len(username) > 32:
        return False, "Username must be at most 32 characters long"
    if not _USERNAME_RE.match(username):
        return False, "Username may only contain letters, numbers, '.', '-', and '_'"
    return True, ""


def hash_password(password: str, salt: Optional[bytes] = None) -> str:
    """Hash password using scrypt with random salt."""
    if salt is None:
        salt = os.urandom(16)
    key = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=16384, r=8, p=1)
    return f"scrypt${salt.hex()}${key.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    """Verify password against scrypt stored hash in constant time."""
    try:
        parts = stored_hash.split("$")
        if len(parts) != 3 or parts[0] != "scrypt":
            return False
        salt = bytes.fromhex(parts[1])
        expected_key = bytes.fromhex(parts[2])
        actual_key = hashlib.scrypt(
            password.encode("utf-8"), salt=salt, n=16384, r=8, p=1
        )
        return hmac.compare_digest(actual_key, expected_key)
    except Exception as exc:
        log.warning("Password verification failed with exception: %s", exc)
        return False


@dataclass
class User:
    id: str
    username: str
    password_hash: str
    role: str = "user"  # "admin" or "user"
    created_at: float = 0.0
    disabled: bool = False

    def to_public_dict(self) -> dict[str, Any]:
        """Client-safe representation of user."""
        return {
            "id": self.id,
            "username": self.username,
            "role": self.role,
            "created_at": self.created_at,
            "disabled": self.disabled,
        }

    def to_dict(self) -> dict[str, Any]:
        return self.to_public_dict()

    def verify_password(self, password: str) -> bool:
        return verify_password(password, self.password_hash)


class UserManager:
    """Manages users persisted via AtomicJsonStore."""

    def __init__(self, state_dir: str):
        self.state_dir = state_dir
        self.store = AtomicJsonStore(os.path.join(state_dir, "users.json"), kind="users", schema_version=1)
        self._users: dict[str, User] = {}  # keyed by user.id
        self._load()

    def _load(self) -> None:
        payload = self.store.load()
        self._users = {}
        if payload and isinstance(payload.get("users"), list):
            for u in payload["users"]:
                if isinstance(u, dict) and "id" in u and "username" in u and "password_hash" in u:
                    user = User(
                        id=str(u["id"]),
                        username=str(u["username"]).lower(),
                        password_hash=str(u["password_hash"]),
                        role=str(u.get("role", "user")),
                        created_at=float(u.get("created_at", 0.0)),
                        disabled=bool(u.get("disabled", False)),
                    )
                    self._users[user.id] = user

    def _save(self) -> None:
        payload = {
            "users": [asdict(u) for u in self._users.values()],
        }
        self.store.save(payload)

    def has_users(self) -> bool:
        return len(self._users) > 0

    def list_users(self) -> list[User]:
        return sorted(list(self._users.values()), key=lambda u: u.created_at)

    def get_by_id(self, user_id: str) -> Optional[User]:
        return self._users.get(user_id)

    def get_by_username(self, username: str) -> Optional[User]:
        normalized = username.strip().lower()
        for user in self._users.values():
            if user.username.lower() == normalized:
                return user
        return None

    def authenticate(self, username: str, password: str) -> Optional[User]:
        user = self.get_by_username(username)
        if user is None or user.disabled:
            return None
        if user.verify_password(password):
            return user
        return None

    get_user_by_id = get_by_id
    get_user_by_username = get_by_username

    def change_password(self, user_id: str, new_password: str) -> User:
        return self.update_user(user_id, password=new_password)

    def update_user_role(self, user_id: str, new_role: str) -> User:
        user = self.get_by_id(user_id)
        if user is None:
            raise ValueError(f"User '{user_id}' not found.")
        if user.role == "admin" and new_role != "admin":
            admin_count = sum(1 for u in self._users.values() if u.role == "admin" and not u.disabled)
            if admin_count <= 1:
                raise ValueError("Cannot demote the last active admin.")
        return self.update_user(user_id, role=new_role)

    def create_user(
        self, username: str, password: str, role: str = "user"
    ) -> User:
        username_clean = username.strip().lower()
        valid, err = validate_username(username_clean)
        if not valid:
            raise ValueError(
                f"Invalid username '{username}': {err}"
            )
        if self.get_by_username(username_clean) is not None:
            raise ValueError(f"User '{username_clean}' already exists.")
        if len(password) < 4:
            raise ValueError("Password must be at least 4 characters long.")
        if role not in ("admin", "user"):
            raise ValueError(f"Invalid role '{role}'. Must be 'admin' or 'user'.")

        user_id = str(uuid.uuid4())
        pw_hash = hash_password(password)
        user = User(
            id=user_id,
            username=username_clean,
            password_hash=pw_hash,
            role=role,
            created_at=time.time(),
            disabled=False,
        )
        self._users[user.id] = user
        self._save()
        log.info("Created user: %s (role=%s, id=%s)", user.username, user.role, user.id)
        return user

    def update_user(
        self,
        user_id: str,
        *,
        password: Optional[str] = None,
        role: Optional[str] = None,
        disabled: Optional[bool] = None,
    ) -> User:
        user = self.get_by_id(user_id)
        if user is None:
            raise ValueError(f"User with id '{user_id}' not found.")

        if password is not None:
            if len(password) < 4:
                raise ValueError("Password must be at least 4 characters long.")
            user.password_hash = hash_password(password)

        if role is not None:
            if role not in ("admin", "user"):
                raise ValueError(f"Invalid role '{role}'. Must be 'admin' or 'user'.")
            user.role = role

        if disabled is not None:
            user.disabled = bool(disabled)

        self._save()
        log.info("Updated user: %s", user.username)
        return user

    def delete_user(self, user_id: str) -> bool:
        if user_id in self._users:
            user = self._users[user_id]
            if user.role == "admin":
                admin_count = sum(1 for u in self._users.values() if u.role == "admin" and not u.disabled)
                if admin_count <= 1:
                    raise ValueError("Cannot delete the last active admin.")
            username = user.username
            del self._users[user_id]
            self._save()
            log.info("Deleted user: %s (%s)", username, user_id)
            return True
        return False

    def bootstrap_admin(self, username: str, password: str) -> User:
        """Create initial admin if it doesn't already exist."""
        existing = self.get_by_username(username)
        if existing:
            return existing
        return self.create_user(username, password, role="admin")


class SessionManager:
    """Manages active user sessions stored atomically."""

    def __init__(self, state_dir: str):
        self.state_dir = state_dir
        self.store = AtomicJsonStore(os.path.join(state_dir, "sessions.json"), kind="sessions", schema_version=1)
        # token -> {"user_id": str, "created_at": float, "expires_at": float}
        self._sessions: dict[str, dict[str, Any]] = {}
        self._load()

    def _load(self) -> None:
        payload = self.store.load()
        self._sessions = {}
        now = time.time()
        if payload and isinstance(payload.get("sessions"), dict):
            for token, sess in payload["sessions"].items():
                if isinstance(sess, dict) and sess.get("expires_at", 0) > now:
                    self._sessions[token] = sess

    def _save(self) -> None:
        payload = {
            "sessions": self._sessions,
        }
        self.store.save(payload)

    def create_session(self, user_id: str, ttl: float = _SESSION_TTL_SECONDS) -> str:
        token = secrets.token_urlsafe(32)
        now = time.time()
        self._sessions[token] = {
            "user_id": user_id,
            "created_at": now,
            "expires_at": now + ttl,
        }
        self._save()
        return token

    def get_user(self, token: str, user_mgr: UserManager) -> Optional[User]:
        if not token or token not in self._sessions:
            return None
        sess = self._sessions[token]
        if sess["expires_at"] < time.time():
            del self._sessions[token]
            self._save()
            return None
        return user_mgr.get_by_id(sess["user_id"])

    def delete_session(self, token: str) -> None:
        if token in self._sessions:
            del self._sessions[token]
            self._save()

    def delete_user_sessions(self, user_id: str) -> None:
        tokens_to_delete = [
            t for t, s in self._sessions.items() if s.get("user_id") == user_id
        ]
        for t in tokens_to_delete:
            del self._sessions[t]
        if tokens_to_delete:
            self._save()

    delete_sessions_for_user = delete_user_sessions
