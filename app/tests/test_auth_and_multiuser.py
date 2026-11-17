import asyncio
import os
import shutil
import tempfile
import json
import pytest
from unittest.mock import AsyncMock, MagicMock
from aiohttp import web

from users import (
    hash_password,
    verify_password,
    validate_username,
    User,
    UserManager,
    SessionManager,
)
import main
from main import (
    auth_status,
    auth_setup,
    auth_login,
    auth_logout,
    auth_me,
    auth_change_password,
    list_users_route,
    create_user_route,
    update_user_route,
    delete_user_route,
    _serve_download_file,
    auth_middleware,
    get_custom_dirs,
    get_user_cookies_path,
)
from download_options import DownloadOptions


class TestPasswordAndUserManager:
    def setup_method(self):
        self.test_dir = tempfile.mkdtemp()

    def teardown_method(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_password_hashing(self):
        pw = "SuperSecret123!"
        hashed = hash_password(pw)
        assert hashed.startswith("scrypt$")
        assert verify_password(pw, hashed) is True
        assert verify_password("WrongPassword", hashed) is False

    def test_username_validation(self):
        assert validate_username("alice")[0] is True
        assert validate_username("john_doe-99")[0] is True
        assert validate_username("a")[0] is False  # too short
        assert validate_username("invalid username")[0] is False  # spaces
        assert validate_username("invalid@user")[0] is False  # special chars
        assert validate_username("..")[0] is False  # traversal

    def test_user_manager_crud(self):
        mgr = UserManager(self.test_dir)
        assert mgr.has_users() is False

        # Create admin
        user1 = mgr.create_user("alice", "password123", role="admin")
        assert user1.username == "alice"
        assert user1.role == "admin"
        assert mgr.has_users() is True

        # Auth
        assert mgr.authenticate("alice", "password123") is not None
        assert mgr.authenticate("alice", "wrong") is None
        assert mgr.authenticate("bob", "password123") is None

        # Duplicate
        with pytest.raises(ValueError):
            mgr.create_user("alice", "newpass")

        # Create regular user
        user2 = mgr.create_user("bob", "bobpassword", role="user")
        assert len(mgr.list_users()) == 2

        # Change password
        mgr.change_password(user2.id, "newbobpassword")
        assert mgr.authenticate("bob", "newbobpassword") is not None

        # Prevent demoting last active admin
        with pytest.raises(ValueError):
            mgr.update_user_role(user1.id, "user")

        # Promote bob to admin
        mgr.update_user_role(user2.id, "admin")
        assert mgr.get_user_by_id(user2.id).role == "admin"

        # Now alice can be demoted
        mgr.update_user_role(user1.id, "user")
        assert mgr.get_user_by_id(user1.id).role == "user"

        # Prevent deleting last active admin (bob)
        with pytest.raises(ValueError):
            mgr.delete_user(user2.id)

        # Delete alice
        assert mgr.delete_user(user1.id) is True
        assert mgr.get_user_by_id(user1.id) is None

    def test_persistence_reload(self):
        mgr = UserManager(self.test_dir)
        mgr.create_user("alice", "password123", role="admin")

        # Reload from disk
        mgr2 = UserManager(self.test_dir)
        user = mgr2.get_by_username("alice")
        assert user is not None
        assert user.role == "admin"
        assert verify_password("password123", user.password_hash)


class TestSessionManager:
    def setup_method(self):
        self.test_dir = tempfile.mkdtemp()
        self.user_mgr = UserManager(self.test_dir)
        self.user = self.user_mgr.create_user("alice", "password123", role="admin")

    def teardown_method(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_session_lifecycle(self):
        sm = SessionManager(self.test_dir)
        token = sm.create_session(self.user.id)
        assert token is not None

        user = sm.get_user(token, self.user_mgr)
        assert user is not None
        assert user.username == "alice"

        # Invalidate
        sm.delete_session(token)
        assert sm.get_user(token, self.user_mgr) is None

    def test_delete_sessions_for_user(self):
        sm = SessionManager(self.test_dir)
        token1 = sm.create_session(self.user.id)
        token2 = sm.create_session(self.user.id)

        assert sm.get_user(token1, self.user_mgr) is not None
        assert sm.get_user(token2, self.user_mgr) is not None

        sm.delete_sessions_for_user(self.user.id)
        assert sm.get_user(token1, self.user_mgr) is None
        assert sm.get_user(token2, self.user_mgr) is None


def _make_req(body=None, user=None, headers=None, cookies=None, match_info=None, path="/"):
    req = MagicMock(spec=web.Request)
    req.path = path
    req.headers = headers or {}
    req.cookies = cookies or {}
    req.match_info = match_info or {}
    req.json = AsyncMock(return_value=body or {})
    req._dict = {}
    if user:
        req._dict['user'] = user

    def get_item(key):
        return req._dict[key]

    def set_item(key, value):
        req._dict[key] = value

    req.__getitem__.side_effect = get_item
    req.__setitem__.side_effect = set_item
    req.__contains__.side_effect = lambda k: k in req._dict
    req.get = lambda k, d=None: req._dict.get(k, d)
    return req


@pytest.fixture
def auth_env(monkeypatch):
    state_dir = tempfile.mkdtemp()
    dl_dir = tempfile.mkdtemp()
    adl_dir = tempfile.mkdtemp()

    user_mgr = UserManager(state_dir)
    session_mgr = SessionManager(state_dir)

    monkeypatch.setattr(main.config, "AUTH_ENABLED", True)
    monkeypatch.setattr(main.config, "STATE_DIR", state_dir)
    monkeypatch.setattr(main.config, "DOWNLOAD_DIR", dl_dir)
    monkeypatch.setattr(main.config, "AUDIO_DOWNLOAD_DIR", adl_dir)
    monkeypatch.setattr(main, "user_mgr", user_mgr)
    monkeypatch.setattr(main, "session_mgr", session_mgr)

    yield {
        "user_mgr": user_mgr,
        "session_mgr": session_mgr,
        "state_dir": state_dir,
        "dl_dir": dl_dir,
        "adl_dir": adl_dir,
    }

    shutil.rmtree(state_dir, ignore_errors=True)
    shutil.rmtree(dl_dir, ignore_errors=True)
    shutil.rmtree(adl_dir, ignore_errors=True)


@pytest.mark.asyncio
async def test_auth_status_and_setup(auth_env):
    user_mgr = auth_env["user_mgr"]

    # Initial status
    req = _make_req(path="/api/auth/status")
    resp = await auth_status(req)
    assert resp.status == 200
    data = json.loads(resp.text)
    assert data["auth_enabled"] is True
    assert data["setup_required"] is True
    assert data["logged_in"] is False

    # Setup initial admin
    req_setup = _make_req(body={"username": "admin", "password": "adminpassword123"}, path="/api/auth/setup")
    resp_setup = await auth_setup(req_setup)
    assert resp_setup.status == 200
    data_setup = json.loads(resp_setup.text)
    assert data_setup["status"] == "ok"
    assert data_setup["user"]["username"] == "admin"
    assert data_setup["user"]["role"] == "admin"
    assert "token" in data_setup

    # Subsequent setup blocked
    with pytest.raises(web.HTTPForbidden):
        await auth_setup(_make_req(body={"username": "admin2", "password": "adminpassword123"}))


@pytest.mark.asyncio
async def test_auth_login_logout_and_me(auth_env):
    user_mgr = auth_env["user_mgr"]
    session_mgr = auth_env["session_mgr"]
    user = user_mgr.create_user("alice", "password123", role="user")

    # Invalid login
    with pytest.raises(web.HTTPUnauthorized):
        await auth_login(_make_req(body={"username": "alice", "password": "wrongpassword"}))

    # Valid login
    req = _make_req(body={"username": "alice", "password": "password123"})
    resp = await auth_login(req)
    assert resp.status == 200
    data = json.loads(resp.text)
    token = data["token"]
    assert token

    # /api/auth/me with Bearer token
    req_me = _make_req(headers={"Authorization": f"Bearer {token}"})
    resp_me = await auth_me(req_me)
    assert resp_me.status == 200
    data_me = json.loads(resp_me.text)
    assert data_me["user"]["username"] == "alice"

    # Change password
    req_change = _make_req(
        body={"current_password": "password123", "new_password": "newpassword456"},
        headers={"Authorization": f"Bearer {token}"},
    )
    resp_change = await auth_change_password(req_change)
    assert resp_change.status == 200

    # Old password fails
    with pytest.raises(web.HTTPUnauthorized):
        await auth_login(_make_req(body={"username": "alice", "password": "password123"}))

    # New password succeeds
    resp_login2 = await auth_login(_make_req(body={"username": "alice", "password": "newpassword456"}))
    assert resp_login2.status == 200

    # Logout
    req_logout = _make_req(headers={"Authorization": f"Bearer {token}"})
    resp_logout = await auth_logout(req_logout)
    assert resp_logout.status == 200

    # Token now invalid
    with pytest.raises(web.HTTPUnauthorized):
        await auth_me(_make_req(headers={"Authorization": f"Bearer {token}"}))


@pytest.mark.asyncio
async def test_admin_user_management(auth_env):
    user_mgr = auth_env["user_mgr"]
    session_mgr = auth_env["session_mgr"]

    admin = user_mgr.create_user("admin", "adminpass123", role="admin")
    admin_token = session_mgr.create_session(admin.id)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    regular = user_mgr.create_user("bob", "bobpass123", role="user")
    bob_token = session_mgr.create_session(regular.id)
    bob_headers = {"Authorization": f"Bearer {bob_token}"}

    # Regular user cannot list users
    with pytest.raises(web.HTTPForbidden):
        await list_users_route(_make_req(headers=bob_headers))

    # Admin lists users
    resp = await list_users_route(_make_req(headers=admin_headers))
    assert resp.status == 200
    data = json.loads(resp.text)
    assert len(data["users"]) == 2

    # Regular user cannot create user
    with pytest.raises(web.HTTPForbidden):
        await create_user_route(_make_req(body={"username": "charlie", "password": "charliepass", "role": "user"}, headers=bob_headers))

    # Admin creates user
    resp_create = await create_user_route(_make_req(body={"username": "charlie", "password": "charliepass", "role": "user"}, headers=admin_headers))
    assert resp_create.status == 200
    charlie_id = json.loads(resp_create.text)["user"]["id"]

    # Admin promotes charlie
    resp_update = await update_user_route(_make_req(body={"role": "admin"}, headers=admin_headers, match_info={"user_id": charlie_id}))
    assert resp_update.status == 200
    assert json.loads(resp_update.text)["user"]["role"] == "admin"

    # Admin cannot delete own account
    with pytest.raises(web.HTTPBadRequest):
        await delete_user_route(_make_req(headers=admin_headers, match_info={"user_id": admin.id}))

    # Admin deletes bob
    resp_del = await delete_user_route(_make_req(headers=admin_headers, match_info={"user_id": regular.id}))
    assert resp_del.status == 200
    assert user_mgr.get_user_by_id(regular.id) is None


@pytest.mark.asyncio
async def test_file_serving_user_isolation_and_traversal(auth_env):
    user_mgr = auth_env["user_mgr"]
    session_mgr = auth_env["session_mgr"]
    dl_dir = auth_env["dl_dir"]

    alice = user_mgr.create_user("alice", "alicepass", role="user")
    bob = user_mgr.create_user("bob", "bobpass", role="user")

    # Create private files
    alice_dir = os.path.join(dl_dir, "alice")
    os.makedirs(alice_dir, exist_ok=True)
    alice_file = os.path.join(alice_dir, "video.mp4")
    with open(alice_file, "wb") as f:
        f.write(b"Alice Video Content")

    bob_dir = os.path.join(dl_dir, "bob")
    os.makedirs(bob_dir, exist_ok=True)
    bob_file = os.path.join(bob_dir, "song.mp3")
    with open(bob_file, "wb") as f:
        f.write(b"Bob Song Content")

    # Unauthenticated request -> 401
    with pytest.raises(web.HTTPUnauthorized):
        await _serve_download_file(_make_req(match_info={"tail": "video.mp4"}), dl_dir)

    # Alice requests her video -> FileResponse
    resp = await _serve_download_file(_make_req(user=alice, match_info={"tail": "video.mp4"}), dl_dir)
    assert isinstance(resp, web.FileResponse)
    assert os.path.samefile(str(resp._path), alice_file)

    # Bob requests video.mp4 -> 404
    with pytest.raises(web.HTTPNotFound):
        await _serve_download_file(_make_req(user=bob, match_info={"tail": "video.mp4"}), dl_dir)

    # Bob requests song.mp3 -> FileResponse
    resp_bob = await _serve_download_file(_make_req(user=bob, match_info={"tail": "song.mp3"}), dl_dir)
    assert isinstance(resp_bob, web.FileResponse)
    assert os.path.samefile(str(resp_bob._path), bob_file)

    # Directory traversal attempt -> 403 Forbidden
    with pytest.raises(web.HTTPForbidden):
        await _serve_download_file(_make_req(user=bob, match_info={"tail": "../alice/video.mp4"}), dl_dir)


@pytest.mark.asyncio
async def test_auth_middleware(auth_env):
    user_mgr = auth_env["user_mgr"]
    session_mgr = auth_env["session_mgr"]
    user = user_mgr.create_user("alice", "alicepass", role="user")
    token = session_mgr.create_session(user.id)

    dummy_handler = AsyncMock(return_value=web.Response(text="ok"))

    # Whitelisted routes pass without auth
    req_status = _make_req(path="/api/auth/status")
    resp = await auth_middleware(req_status, dummy_handler)
    assert resp.text == "ok"

    req_version = _make_req(path="/version")
    resp = await auth_middleware(req_version, dummy_handler)
    assert resp.text == "ok"

    # Protected route without auth -> 401
    req_add = _make_req(path="/add")
    with pytest.raises(web.HTTPUnauthorized):
        await auth_middleware(req_add, dummy_handler)

    # Protected route with valid Bearer token -> passes and attaches user
    req_add_auth = _make_req(path="/add", headers={"Authorization": f"Bearer {token}"})
    resp = await auth_middleware(req_add_auth, dummy_handler)
    assert resp.text == "ok"
    assert req_add_auth["user"].username == "alice"

    # Protected route with cookie -> passes
    req_add_cookie = _make_req(path="/add", cookies={"metube_session": token})
    resp = await auth_middleware(req_add_cookie, dummy_handler)
    assert resp.text == "ok"
    assert req_add_cookie["user"].username == "alice"


def test_user_cookies_path_isolation(auth_env):
    user_mgr = auth_env["user_mgr"]
    alice = user_mgr.create_user("alice", "alicepass", role="user")
    bob = user_mgr.create_user("bob", "bobpass", role="user")

    alice_cookie = get_user_cookies_path(alice)
    bob_cookie = get_user_cookies_path(bob)

    assert "cookies_alice.txt" in alice_cookie
    assert "cookies_bob.txt" in bob_cookie
    assert alice_cookie != bob_cookie


def test_custom_dirs_user_isolation(auth_env):
    dl_dir = auth_env["dl_dir"]
    adl_dir = auth_env["adl_dir"]

    # Create alice and bob directories
    os.makedirs(os.path.join(dl_dir, "alice", "movies"), exist_ok=True)
    os.makedirs(os.path.join(dl_dir, "bob", "music"), exist_ok=True)

    alice_dirs = get_custom_dirs(for_user="alice")
    bob_dirs = get_custom_dirs(for_user="bob")

    assert "movies" in alice_dirs["download_dir"]
    assert "music" not in alice_dirs["download_dir"]

    assert "music" in bob_dirs["download_dir"]
    assert "movies" not in bob_dirs["download_dir"]
