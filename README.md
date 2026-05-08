# ARSupportSystem
AR-Enhanced Maintenance Support System for Public Transport Environments.

This repo contains:
- **Backend**: FastAPI + SQLAlchemy services for authentication, fault management, markers, annotations, tools, tool sessions, and audit logs.
- **Frontend**: React + Vite UI for AR scanning, dashboards, monitoring, marker admin, and tool management.

## Workspace Layout

```
backend/   # FastAPI server + database models
frontend/  # React + Vite web UI
```

## Quick Start

### Backend

```bash
cd backend
cp .env.example .env
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend expects the backend API at `http://localhost:8000` by default. To change it, set `VITE_API_BASE_URL` in `frontend/.env`.

## Notes

- Local tooling folders (such as `.tools/`) are ignored by git to keep the repo clean.
