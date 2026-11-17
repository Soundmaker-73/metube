# Multi-User Guide for MeTube

This document details the multi-user functionality, architecture, configuration, and deployment instructions for MeTube.

---

## 1. Overview

MeTube includes full multi-user support with:
- **Authentication**: Secure session-based auth (cookies with `HttpOnly`, `SameSite=Lax` and `Authorization: Bearer <token>` support).
- **Password Security**: Salted hashing with `hashlib.scrypt` (memory-hard, Python standard library).
- **Role-Based Access Control**:
  - `admin`: Full access to downloads, subscriptions, and the User Management panel (create, promote/demote, password reset, delete users).
  - `user`: Isolated personal workspace for downloads, queue, history, subscriptions, and personal cookies.
- **Filesystem Isolation**: Files are downloaded directly into private directories:
  - Video: `DOWNLOAD_DIR/<username>/...`
  - Audio: `AUDIO_DOWNLOAD_DIR/<username>/...`
  - Web download serving enforces user ownership and strictly guards against directory traversal attacks (`../`).
- **Real-Time Event Isolation**: Socket.IO events are routed exclusively to individual user rooms (`user:<username>`).

---

## 2. Configuration & Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `AUTH_ENABLED` | `true` | Enables multi-user authentication. Set to `false` for open single-user mode. |
| `ADMIN_USER` | *(empty)* | Optional initial admin username for unattended setup on first startup. |
| `ADMIN_PASSWORD` | *(empty)* | Optional initial admin password for unattended setup on first startup. |

---

## 3. Getting Started

### First-Time Setup
1. Launch MeTube with `AUTH_ENABLED=true`.
2. Open the web interface at `http://<host>:8081`.
3. If no users exist and `ADMIN_USER`/`ADMIN_PASSWORD` were not supplied in the environment, the **First-time setup** screen will prompt you to create the initial admin account.
4. Once created, you are automatically logged in as `admin`.

### Managing Users
- In the top navbar, click on your username/role badge and select **Manage Users**.
- **Create User**: Enter username, password (min 6 characters), and role (`user` or `admin`).
- **Promote / Demote**: Toggle user role between `user` and `admin`. Safety check prevents demoting or deleting the last remaining admin.
- **Reset Password**: Admin can reset any user's password directly from the modal.
- **Delete User**: Removes the user and invalidates all active sessions for that account.

### Changing Password
- Any logged-in user can click their username in the navbar and select **Change Password** to update their own password.

---

## 4. Directory & Storage Architecture

When files are downloaded:
```
/downloads/
├── alice/                  # Alice's private video downloads
│   └── video.mp4
├── bob/                    # Bob's private video downloads
│   └── movie.mkv
└── .metube/                # Internal state storage (JSON)
    ├── users.json          # User accounts & scrypt password hashes
    ├── sessions.json       # Active user sessions
    ├── queue.json          # Active download queue (tagged by user)
    ├── history.json        # Completed/failed downloads (tagged by user)
    ├── subscriptions.json  # Subscriptions (tagged by user)
    ├── cookies_alice.txt   # Alice's uploaded cookies
    └── cookies_bob.txt     # Bob's uploaded cookies
```

---

## 5. Deployment with Portainer

### Method A: Portainer Stack (Build from Git)
1. In Portainer, go to **Stacks** -> **Add stack**.
2. Select **Web editor** and enter:
```yaml
version: "3.8"

services:
  metube:
    build: https://github.com/Soundmaker-73/MeTube.git#master
    container_name: metube
    restart: unless-stopped
    ports:
      - "8081:8081"
    volumes:
      - /path/to/downloads:/downloads
    environment:
      - PUID=1000
      - PGID=1000
      - AUTH_ENABLED=true
      - ADMIN_USER=admin
      - ADMIN_PASSWORD=admin
```
3. Click **Deploy the stack**.

### Method B: Portainer Stack (Pre-built Image)
If using GitHub Container Registry or a local image:
```yaml
version: "3.8"

services:
  metube:
    image: ghcr.io/soundmaker-73/metube:latest
    container_name: metube
    restart: unless-stopped
    ports:
      - "8081:8081"
    volumes:
      - /path/to/downloads:/downloads
    environment:
      - PUID=1000
      - PGID=1000
      - AUTH_ENABLED=true
```

---

## 6. REST API Reference

All requests accept session cookies or `Authorization: Bearer <token>`:

- `GET /api/auth/status` — Get current authentication status and user profile.
- `POST /api/auth/setup` — Bootstrap the initial admin user (`{"username": "...", "password": "..."}`).
- `POST /api/auth/login` — Sign in (`{"username": "...", "password": "..."}`).
- `POST /api/auth/logout` — Invalidate current session and clear cookie.
- `GET /api/auth/me` — Retrieve current authenticated user.
- `POST /api/auth/change-password` — Change password (`{"current_password": "...", "new_password": "..."}`).
- `GET /api/users` — Admin only: list all users.
- `POST /api/users` — Admin only: create new user (`{"username": "...", "password": "...", "role": "user"|"admin"}`).
- `PUT /api/users/{user_id}` — Admin only: update user role or password (`{"role": "admin"}`, `{"password": "..."}`).
- `DELETE /api/users/{user_id}` — Admin only: delete a user.
