# AR Support System — Frontend

React + Vite frontend for the AR-Enhanced Maintenance Support System. The UI provides:

- AR fault scanning and annotation workflows
- AR tool checklists tied to tool sessions
- Dashboard and monitoring views for supervisors/admins
- Marker management (admin-only)

## Getting Started

```bash
npm install
npm run dev
```

The app expects the backend API at `http://localhost:8000`. To override, create a `.env` file:

```bash
VITE_API_BASE_URL=http://localhost:8000
```

## Scripts

```bash
npm run dev
npm run build
npm run lint
```

## Project Notes

- AR functionality is hosted under `public/arjs/` and embedded in the main React app via an iframe.
- Admin-only pages (Markers, Tools Admin, Monitoring) are role-gated in the UI.
