# AR Support System — Backend API

FastAPI backend for the COMP5067 AR-Enhanced Maintenance Support System.  
Provides secure REST endpoints for fault detection, tool tracking, AR annotations, analytics, and access control.

---

## Quick Start

```bash
cd backend
cp .env.example .env        # edit SECRET_KEY before running
pip install -r requirements.txt
uvicorn app.main:app --reload
```

- API base: `http://localhost:8000`
- Interactive docs (Swagger UI): `http://localhost:8000/docs`
- Alternative docs (ReDoc): `http://localhost:8000/redoc`

---

## Project Structure

```
backend/
├── app/
│   ├── main.py                    # App entry point — CORS, DB init
│   ├── core/
│   │   ├── config.py              # Settings loaded from .env
│   │   ├── database.py            # SQLAlchemy + SQLite connection
│   │   └── security.py            # JWT creation/decoding, bcrypt hashing
│   ├── models/                    # Database table definitions (SQLAlchemy)
│   │   ├── user.py
│   │   ├── fault.py
│   │   ├── tool.py
│   │   ├── annotation.py
│   │   └── audit_log.py
│   ├── schemas/                   # Request/response data shapes (Pydantic)
│   │   ├── auth.py
│   │   ├── user.py
│   │   ├── fault.py
│   │   ├── tool.py
│   │   └── annotation.py
│   └── api/
│       ├── deps.py                # JWT auth dependency + role guards
│       ├── routes.py              # Registers all routers under /api
│       └── endpoints/
│           ├── auth.py            # Login, token refresh, current user
│           ├── users.py           # User management
│           ├── faults.py          # Fault reporting and management
│           ├── tools.py           # Tool inventory + tool-check sessions
│           ├── annotations.py     # AR overlay annotations
│           ├── analytics.py       # Dashboard KPIs and charts
│           └── audit.py           # Security audit log
```

---

## Authentication

The API uses **JWT (JSON Web Tokens)** via the OAuth2 Bearer scheme.

### How it works

1. The client calls the login endpoint with email and password.
2. The server returns a signed JWT token.
3. Every subsequent request must include the token in the `Authorization` header.

```
Authorization: Bearer <your_token>
```

The token encodes the user's **ID**, **email**, and **role** (`admin`, `supervisor`, `technician`).  
It expires after 60 minutes (configurable via `.env`).

### Role levels

| Role | What they can do |
|------|-----------------|
| `technician` | Report faults, manage their own tool sessions, create annotations |
| `supervisor` | Everything a technician can do, plus view all users and audit logs |
| `admin` | Full access — create/delete users, tools, faults |

---

## Endpoint Reference

> All endpoints are prefixed with `/api`.  
> Protected endpoints require `Authorization: Bearer <token>` header.  
> `[any]` = any authenticated user. `[admin]` = admin only. `[sup+]` = supervisor or admin.

---

### Auth — `/api/auth`

---

#### `POST /api/auth/token`

**Purpose:** OAuth2 standard login. Used by the Swagger UI "Authorize" button so you can test protected endpoints interactively.

**Who can call it:** Anyone (public)

**Request body** (`application/x-www-form-urlencoded`):

```
username=jane@rail.com&password=secret123
```

> Note: The field is called `username` (OAuth2 standard) but should contain the user's email address.

**Response:**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 3600
}
```

**Assignment relevance:** Satisfies the Cyber Security pathway requirement for authentication and access control.

---

#### `POST /api/auth/login`

**Purpose:** JSON login endpoint — this is the one the React frontend calls. Functionally identical to `/token` but accepts JSON.

**Who can call it:** Anyone (public)

**Request body:**

```json
{
  "email": "jane@rail.com",
  "password": "secret123"
}
```

**Response:**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 3600
}
```

**What the frontend does with this:** Stores the token (e.g. in `localStorage`) and attaches it to every subsequent API call. The `expires_in` value (3600 seconds = 1 hour) tells the frontend when to ask the user to log in again.

**Assignment relevance:** Secure user login for maintenance engineers and technicians accessing the AR system.

---

#### `GET /api/auth/me`

**Purpose:** Returns the profile of whoever is currently logged in. Used by the frontend to show "Welcome, Jane" and to check the user's role for showing/hiding UI elements.

**Who can call it:** `[any]`

**Response:**

```json
{
  "id": 3,
  "email": "jane@rail.com",
  "full_name": "Jane Smith",
  "role": "technician",
  "is_active": true,
  "created_at": "2026-04-01T10:00:00Z"
}
```

---

#### `POST /api/auth/refresh`

**Purpose:** Issues a fresh token without requiring the user to log in again. The frontend calls this before the current token expires to keep the session alive.

**Who can call it:** `[any]`

**Response:** Same shape as `/login`.

---

### Users — `/api/users`

---

#### `GET /api/users`

**Purpose:** List all registered users in the system. Used by supervisors and admins to manage who has access to the AR maintenance system.

**Who can call it:** `[sup+]`

**Response:**

```json
[
  { "id": 1, "email": "admin@rail.com", "full_name": "Admin User", "role": "admin", "is_active": true, "created_at": "..." },
  { "id": 2, "email": "bob@rail.com",   "full_name": "Bob Jones",   "role": "technician", "is_active": true, "created_at": "..." }
]
```

---

#### `POST /api/users`

**Purpose:** Register a new authorised user. Only admins can do this — ensuring that only verified maintenance personnel can access the system.

**Who can call it:** `[admin]`

**Request body:**

```json
{
  "email": "alice@rail.com",
  "full_name": "Alice Brown",
  "password": "securepassword",
  "role": "technician"
}
```

> `role` options: `admin`, `supervisor`, `technician`

**Response:** The created user object (same shape as above, password not returned).

**Assignment relevance:** Enforces that only authorised personnel can access the AR maintenance system — a key Cyber Security requirement.

---

#### `GET /api/users/{user_id}`

**Purpose:** Get a specific user's profile. Technicians can only view their own profile. Supervisors and admins can view anyone.

**Who can call it:** `[any]` (own profile) or `[sup+]` (any profile)

**Example:** `GET /api/users/3`

**Response:** Single user object.

---

#### `PUT /api/users/{user_id}`

**Purpose:** Update a user's name or role. Users can change their own name; only admins can change roles.

**Who can call it:** Self or `[admin]`

**Request body** (all fields optional):

```json
{
  "full_name": "Jane A. Smith",
  "role": "supervisor",
  "is_active": true
}
```

---

#### `DELETE /api/users/{user_id}`

**Purpose:** Deactivates a user account (soft delete — the record is kept for the audit trail but the account can no longer log in). Used when a technician leaves the team.

**Who can call it:** `[admin]`

**Response:** `204 No Content`

---

### Faults — `/api/faults`

Faults are the core data entity. They represent infrastructure problems found during maintenance — e.g. a cracked wall in a tunnel, faulty signalling, or a damaged train panel.

---

#### `GET /api/faults`

**Purpose:** List all reported faults. The dashboard and AR interface use this to show what needs attention. Supports filtering to narrow results.

**Who can call it:** `[any]`

**Query parameters (all optional):**

| Parameter | Values | Example |
|-----------|--------|---------|
| `status` | `open`, `in_progress`, `resolved`, `closed` | `?status=open` |
| `severity` | `low`, `medium`, `high`, `critical` | `?severity=critical` |
| `location` | `tunnel`, `station`, `track`, `vehicle`, `platform`, `service_corridor`, `plant_room`, `other` | `?location=tunnel` |
| `assigned_to_id` | integer user ID | `?assigned_to_id=3` |

**Example:** `GET /api/faults?status=open&severity=critical`

**Response:**

```json
[
  {
    "id": 7,
    "title": "Stress fracture on tunnel wall",
    "description": "Visible crack approximately 30cm long, section B-4",
    "severity": "critical",
    "status": "open",
    "location": "tunnel",
    "location_detail": "Northern Line, Section B-4",
    "ar_marker_id": "MARKER-042",
    "reported_by_id": 3,
    "assigned_to_id": 5,
    "created_at": "2026-04-10T09:15:00Z",
    "updated_at": null,
    "resolved_at": null
  }
]
```

**Assignment relevance:** Powers the AR fault visualisation screen — the frontend fetches this list and overlays fault markers on the camera view.

---

#### `POST /api/faults`

**Purpose:** A technician reports a new fault they have identified. The `ar_marker_id` links the fault to a physical QR/AR marker placed at the fault location.

**Who can call it:** `[any]`

**Request body:**

```json
{
  "title": "Electrical panel corrosion",
  "description": "Corrosion on panel contacts, risk of short circuit",
  "severity": "high",
  "location": "platform",
  "location_detail": "Platform 2, South End",
  "ar_marker_id": "MARKER-017",
  "assigned_to_id": 4
}
```

> `ar_marker_id` is the ID printed on the physical AR marker placed at the fault location. When a technician scans this marker with their phone, the app uses it to pull the fault record from the backend.

**Response:** The created fault object with its new database `id`.

**Assignment relevance:** Directly implements "simulate faults using markers" — the backend stores the fault and its marker reference so the AR interface can retrieve it on scan.

---

#### `GET /api/faults/marker/{marker_id}`

**Purpose:** The critical AR endpoint. When a technician points their phone at a physical AR marker (e.g. `MARKER-042`), the AR interface calls this to instantly retrieve the fault data associated with that marker — without the technician needing to type anything.

**Who can call it:** `[any]`

**Example:** `GET /api/faults/marker/MARKER-042`

**Response:** Single fault object (same shape as above).

**Assignment relevance:** This is the core of "fault detection with backend connection" — the AR camera scans a marker, calls this endpoint, and overlays the fault information on screen.

---

#### `GET /api/faults/{fault_id}`

**Purpose:** Get full details of a specific fault by its database ID. Used when the user taps on a fault in a list to see more detail.

**Who can call it:** `[any]`

**Example:** `GET /api/faults/7`

**Response:** Single fault object.

---

#### `PUT /api/faults/{fault_id}`

**Purpose:** Update fault details — e.g. add more description, reassign to a different technician, correct the location. Technicians can only edit faults they reported themselves.

**Who can call it:** `[any]` (own faults) or `[sup+]` (any fault)

**Request body** (all fields optional):

```json
{
  "description": "Crack now 45cm, spreading towards support beam",
  "severity": "critical",
  "assigned_to_id": 6
}
```

---

#### `PATCH /api/faults/{fault_id}/status`

**Purpose:** Change the workflow status of a fault — e.g. mark it as `in_progress` when a technician starts working on it, or `resolved` when fixed. When set to `resolved`, the timestamp is automatically recorded.

**Who can call it:** `[any]`

**Request body:**

```json
{ "status": "resolved" }
```

> Status flow: `open` → `in_progress` → `resolved` → `closed`

**Response:** Updated fault object (with `resolved_at` populated if resolved).

**Assignment relevance:** Enables the dashboard to track fault resolution rates over time — feeds into the Data Analytics pathway's predictive modelling.

---

#### `DELETE /api/faults/{fault_id}`

**Purpose:** Permanently remove a fault record. Restricted to admins only.

**Who can call it:** `[admin]`

**Response:** `204 No Content`

---

### Tools — `/api/tools` and `/api/tools/sessions`

Tool tracking has two parts: the **tool inventory** (what tools exist) and **tool sessions** (a pre/post check that tracks which tools were taken to and returned from a job).

---

#### `GET /api/tools`

**Purpose:** List all tools in the inventory. Optionally filter to only available tools — e.g. before starting a job, a technician checks what is free to use.

**Who can call it:** `[any]`

**Query parameters:**

| Parameter | Values | Example |
|-----------|--------|---------|
| `available_only` | `true` / `false` | `?available_only=true` |

**Response:**

```json
[
  {
    "id": 1,
    "name": "Torque Wrench",
    "category": "hand_tool",
    "description": "25-110 Nm range",
    "serial_number": "TW-00123",
    "is_available": true,
    "created_at": "2026-03-01T08:00:00Z"
  }
]
```

---

#### `POST /api/tools`

**Purpose:** Register a new tool in the system inventory. Each tool gets a unique serial number for accountability.

**Who can call it:** `[admin]`

**Request body:**

```json
{
  "name": "Voltage Tester",
  "category": "diagnostic",
  "description": "Non-contact AC/DC voltage detector",
  "serial_number": "VT-00456"
}
```

> `category` options: `hand_tool`, `power_tool`, `measuring`, `safety`, `diagnostic`, `other`

---

#### `GET /api/tools/{tool_id}`

**Purpose:** Get details of a specific tool. Used in the AR tool-check screen to show tool information when a tool is scanned.

**Who can call it:** `[any]`

---

#### `PUT /api/tools/{tool_id}`

**Purpose:** Update tool details — e.g. mark a tool as unavailable (sent for calibration) or update its description.

**Who can call it:** `[admin]`

**Request body** (all optional):

```json
{ "is_available": false }
```

---

#### `DELETE /api/tools/{tool_id}`

**Purpose:** Remove a tool from the inventory (e.g. decommissioned).

**Who can call it:** `[admin]`

**Response:** `204 No Content`

---

#### `GET /api/tools/sessions`

**Purpose:** List tool-check sessions. Supervisors/admins see all sessions; technicians only see their own. Used by the dashboard to monitor tool accountability across all jobs.

**Who can call it:** `[any]`

**Query parameters (all optional):**

| Parameter | Values | Example |
|-----------|--------|---------|
| `technician_id` | integer | `?technician_id=3` |
| `session_status` | `active`, `completed`, `incomplete` | `?session_status=incomplete` |

**Response:**

```json
[
  {
    "id": 1,
    "session_name": "Platform 2 Signal Repair - Pre-check",
    "technician_id": 3,
    "fault_id": 7,
    "status": "completed",
    "notes": "All tools accounted for",
    "started_at": "2026-04-10T09:00:00Z",
    "completed_at": "2026-04-10T14:30:00Z",
    "items": [
      { "id": 1, "tool_id": 1, "expected_count": 1, "actual_count": 1, "is_verified": true },
      { "id": 2, "tool_id": 3, "expected_count": 2, "actual_count": 2, "is_verified": true }
    ]
  }
]
```

---

#### `POST /api/tools/sessions`

**Purpose:** Start a new tool-check session before a job begins. The technician declares which tools they are taking and how many of each. This creates a verifiable record of what left the tool store.

**Who can call it:** `[any]`

**Request body:**

```json
{
  "session_name": "Platform 2 Signal Repair - Pre-check",
  "fault_id": 7,
  "notes": "Routine pre-job tool check",
  "items": [
    { "tool_id": 1, "expected_count": 1 },
    { "tool_id": 3, "expected_count": 2 }
  ]
}
```

> `fault_id` optionally links the session to a specific fault being worked on.

**Response:** Created session object including its new `id`.

**Assignment relevance:** This is the "AR tool check" feature — simulates the pre-job tool declaration shown in Figure 2 of the brief.

---

#### `GET /api/tools/sessions/{session_id}`

**Purpose:** Get full details of a specific session including all items and their verification status.

**Who can call it:** `[any]` (own session) or `[sup+]` (any session)

---

#### `PATCH /api/tools/sessions/{session_id}/complete`

**Purpose:** Close a session after the job finishes. The technician submits the actual count of each tool they are returning. If any count is less than expected, the session is marked `incomplete` — flagging a potential missing tool as a security risk.

**Who can call it:** `[any]` (own session) or `[sup+]`

**Request body:**

```json
{
  "verified_items": [
    { "tool_id": 1, "actual_count": 1 },
    { "tool_id": 3, "actual_count": 1 }
  ],
  "notes": "WARNING: One spanner unaccounted for"
}
```

**Response:** Completed session. `status` will be:
- `completed` — all actual counts met or exceeded expected counts
- `incomplete` — one or more tools are missing

**Assignment relevance:** Directly addresses "accurate recording and counting of tools to reduce safety and security risks." A missing tool in a high-security engineering environment is a serious safety concern.

---

### Annotations — `/api/annotations`

AR annotations are digital overlays anchored to physical locations or fault markers. They appear on the technician's AR screen when they view a fault location.

---

#### `GET /api/annotations`

**Purpose:** Retrieve all annotations, optionally filtered by fault or marker. The AR camera view calls this (filtered by `ar_marker_id`) to load what should be displayed on screen when a marker is detected.

**Who can call it:** `[any]`

**Query parameters (optional):**

| Parameter | Example |
|-----------|---------|
| `fault_id` | `?fault_id=7` |
| `ar_marker_id` | `?ar_marker_id=MARKER-042` |

**Response:**

```json
[
  {
    "id": 2,
    "fault_id": 7,
    "annotation_type": "fault_marker",
    "title": "Stress Fracture",
    "content": "Critical — do not apply load. Report to supervisor immediately.",
    "ar_position": { "x": 0.15, "y": 0.80, "z": -0.30 },
    "ar_marker_id": "MARKER-042",
    "created_by_id": 3,
    "created_at": "2026-04-10T09:20:00Z",
    "updated_at": null
  }
]
```

> `ar_position` is an `{x, y, z}` coordinate in 3D space relative to the AR marker. The frontend Three.js/WebXR layer uses this to place the overlay at the correct position in the real world.

**Assignment relevance:** Enables "annotate faults" — technicians can leave persistent notes anchored to physical locations that other authorised users can see when they scan the same marker.

---

#### `POST /api/annotations`

**Purpose:** Create a new AR annotation — e.g. a technician adds a note, hazard warning, or repair guide to a fault location.

**Who can call it:** `[any]`

**Request body:**

```json
{
  "fault_id": 7,
  "annotation_type": "hazard",
  "title": "High Voltage — Keep Clear",
  "content": "Live rail exposed. Isolate before proceeding.",
  "ar_position": { "x": 0.0, "y": 1.2, "z": -0.5 },
  "ar_marker_id": "MARKER-042"
}
```

> `annotation_type` options: `fault_marker`, `note`, `measurement`, `hazard`, `repair_guide`

**Response:** Created annotation object.

**Assignment relevance:** Supports "secure sharing of fault information between authorised users" — annotations are stored centrally and accessible to any authorised technician who scans the same marker.

---

#### `GET /api/annotations/{annotation_id}`

**Purpose:** Get a single annotation by ID.

**Who can call it:** `[any]`

---

#### `PUT /api/annotations/{annotation_id}`

**Purpose:** Edit an existing annotation — e.g. update the content after a situation changes. Only the creator or an admin can edit.

**Who can call it:** Creator or `[admin]`

**Request body** (all optional):

```json
{
  "title": "Stress Fracture — Now Critical",
  "content": "Crack has extended. Area cordoned off. Structural engineer called."
}
```

---

#### `DELETE /api/annotations/{annotation_id}`

**Purpose:** Remove an annotation from the AR view. Only the creator or admin can delete.

**Who can call it:** Creator or `[admin]`

**Response:** `204 No Content`

---

### Analytics — `/api/analytics`

These endpoints power the data dashboard. All data is aggregated from the live database.

---

#### `GET /api/analytics/overview`

**Purpose:** The main dashboard headline — a single call that returns all key numbers a supervisor needs at a glance.

**Who can call it:** `[any]`

**Response:**

```json
{
  "faults": {
    "total": 48,
    "open": 12,
    "critical": 3,
    "resolved": 29
  },
  "tool_sessions": {
    "total": 22,
    "incomplete": 1
  },
  "active_users": 8
}
```

**Assignment relevance:** The "1 incomplete tool session" immediately alerts a supervisor that a tool may be unaccounted for — directly supporting the security monitoring requirement.

---

#### `GET /api/analytics/faults`

**Purpose:** Fault trend data broken down by severity, location, and status. Used by the Data Analytics pathway to build bar charts or pie charts showing where and how serious faults are.

**Who can call it:** `[any]`

**Query parameters:**

| Parameter | Default | Description |
|-----------|---------|-------------|
| `days` | `30` | How many days back to include (1–365) |

**Example:** `GET /api/analytics/faults?days=7`

**Response:**

```json
{
  "period_days": 7,
  "by_severity": [
    { "severity": "low",      "count": 4 },
    { "severity": "medium",   "count": 6 },
    { "severity": "high",     "count": 2 },
    { "severity": "critical", "count": 1 }
  ],
  "by_location": [
    { "location": "tunnel",   "count": 5 },
    { "location": "platform", "count": 4 },
    { "location": "track",    "count": 4 }
  ],
  "by_status": [
    { "status": "open",        "count": 8 },
    { "status": "in_progress", "count": 3 },
    { "status": "resolved",    "count": 2 }
  ]
}
```

**Assignment relevance:** Feeds directly into the Data Analytics pathway's "visualisation of faults and system metrics" — e.g. identifying that tunnels have 5x more faults than platforms could drive predictive maintenance scheduling.

---

#### `GET /api/analytics/tools`

**Purpose:** Tool session statistics — used to monitor tool accountability over time and detect patterns in missing tools.

**Who can call it:** `[any]`

**Query parameters:** Same `days` parameter as above.

**Response:**

```json
{
  "period_days": 30,
  "sessions_by_status": [
    { "status": "completed",  "count": 20 },
    { "status": "incomplete", "count": 2 },
    { "status": "active",     "count": 1 }
  ],
  "tool_discrepancies": 3
}
```

> `tool_discrepancies` is the total count of individual tool items where the returned count was less than expected — even if the session overall was marked complete.

**Assignment relevance:** Supports the Cyber Security pathway's "threat awareness" — repeated tool discrepancies from the same technician could indicate an insider threat.

---

#### `GET /api/analytics/activity`

**Purpose:** A real-time feed of recent system events — logins, fault reports, tool session completions. Used on the monitoring dashboard to spot unusual behaviour (e.g. a login at 3am, or repeated failed login attempts).

**Who can call it:** `[any]`

**Query parameters:**

| Parameter | Default | Description |
|-----------|---------|-------------|
| `limit` | `20` | Number of events to return (1–100) |

**Response:**

```json
[
  {
    "id": 101,
    "user_id": 3,
    "action": "LOGIN_SUCCESS",
    "resource_type": "auth",
    "resource_id": null,
    "ip_address": "192.168.1.45",
    "timestamp": "2026-04-11T02:47:00Z"
  },
  {
    "id": 100,
    "user_id": null,
    "action": "LOGIN_FAILED",
    "resource_type": "auth",
    "resource_id": null,
    "ip_address": "10.0.0.99",
    "timestamp": "2026-04-11T02:46:58Z"
  }
]
```

**Assignment relevance:** Directly satisfies "monitoring features that support detection of unusual or suspicious system behaviour" — a failed login at 2:46am followed by a success at 2:47am from the same IP is suspicious and this feed surfaces it.

---

### Audit Log — `/api/audit`

---

#### `GET /api/audit`

**Purpose:** The full, paginated security audit log. Every significant action in the system is recorded here automatically — logins, fault creation, tool session completions. This record cannot be deleted through the API, providing a tamper-evident trail.

**Who can call it:** `[sup+]`

**Query parameters (all optional):**

| Parameter | Example | Description |
|-----------|---------|-------------|
| `action` | `?action=LOGIN_FAILED` | Filter by action keyword (partial match) |
| `user_id` | `?user_id=3` | Filter by user |
| `resource_type` | `?resource_type=fault` | Filter by resource type |
| `skip` | `?skip=0` | Pagination offset |
| `limit` | `?limit=50` | Page size (max 200) |

**Response:**

```json
{
  "total": 324,
  "skip": 0,
  "limit": 50,
  "logs": [
    {
      "id": 324,
      "user_id": 3,
      "action": "LOGIN_SUCCESS",
      "resource_type": "auth",
      "resource_id": null,
      "details": null,
      "ip_address": "192.168.1.45",
      "timestamp": "2026-04-11T09:00:00Z"
    }
  ]
}
```

**Actions automatically recorded:**

| Action | When |
|--------|------|
| `LOGIN_SUCCESS` | Successful login |
| `LOGIN_FAILED` | Wrong credentials — `details` field includes the email attempted |

**Assignment relevance:** Meets the Cyber Security pathway requirement for "protection of system communications and stored data." The audit log demonstrates that the system can detect and record security-relevant events — a core requirement for a high-security engineering environment.

---

### Health Check

#### `GET /health`

**Purpose:** Simple liveness probe. Confirms the server is running. No authentication required.

**Response:**

```json
{ "status": "ok", "app": "AR Support System" }
```

---

## Enum Reference

### Fault Severity
`low` · `medium` · `high` · `critical`

### Fault Status
`open` · `in_progress` · `resolved` · `closed`

### Fault Location
`tunnel` · `station` · `track` · `vehicle` · `platform` · `service_corridor` · `plant_room` · `other`

### Tool Category
`hand_tool` · `power_tool` · `measuring` · `safety` · `diagnostic` · `other`

### Tool Session Status
`active` · `completed` · `incomplete`

### Annotation Type
`fault_marker` · `note` · `measurement` · `hazard` · `repair_guide`

### User Role
`admin` · `supervisor` · `technician`

---

## Assignment Coverage

| Assignment Requirement | Endpoint(s) |
|------------------------|-------------|
| Fault detection with backend connection | `POST /api/faults`, `GET /api/faults/marker/{id}` |
| AR fault visualisation | `GET /api/annotations?ar_marker_id=...` |
| Secure fault sharing between users | `GET /api/faults`, `GET /api/annotations` (JWT protected) |
| AR tool tracking and accountability | `POST /api/tools/sessions`, `PATCH /api/tools/sessions/{id}/complete` |
| Accurate tool counting | `PATCH /api/tools/sessions/{id}/complete` → `incomplete` status |
| Authentication and access control | `POST /api/auth/login`, JWT on all protected routes |
| Audit trail / tamper evidence | `GET /api/audit`, automatic logging on login events |
| Dashboard data visualisation | `GET /api/analytics/overview`, `/faults`, `/tools` |
| Suspicious behaviour monitoring | `GET /api/analytics/activity` |
| Predictive/descriptive analytics | `GET /api/analytics/faults?days=30` (trend data by location/severity) |
