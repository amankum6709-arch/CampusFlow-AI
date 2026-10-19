# CampusFlow AI — Frontend

React + Vite single-page application for CampusFlow AI (landing page, auth, dashboard, university setup wizard, timetable workspace with AI assistant panel, Excel import/export).

## Tech stack

- React 19 + React DOM (`react`, `react-dom`)
- React Router (`react-router-dom`) — routes defined in `src/routes/AppRoutes.jsx`
- Icons (`react-icons`), Excel I/O (`xlsx`)
- Vite 8 build tooling, ESLint (`eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`)

## Project structure

```text
frontend/
├── index.html
├── package.json / package-lock.json
├── vite.config.js / eslint.config.js
├── public/                 # Static assets served as-is (favicon, icons)
└── src/
    ├── main.jsx            # Entry point (imports styles/global.css)
    ├── App.jsx
    ├── assets/             # Bundled image assets
    ├── components/         # Reusable UI (Navbar, Footer, Hero, CampusHero, AIAssistant, …)
    ├── layouts/            # AppLayout wrapper
    ├── pages/              # Home, Auth, Dashboard/, UniversitySetup, Timetable/
    ├── routes/             # AppRoutes.jsx
    ├── services/           # api.js (backend client), scheduling engine, sync
    ├── styles/             # global.css, theme.css, variables.css
    ├── utils/              # validators, subscription plans, Excel helpers
    └── workers/            # timetableWorker.js (client-side generation fallback)
```

## Installation

From this directory:

```powershell
npm install
```

## Development server

```powershell
npm run dev
```

Open `http://localhost:5173`. The app talks to the backend API (see “Environment variables” below); start the backend first per the root README.

## Build and preview

```powershell
npm run build    # production build into dist/
npm run preview  # serve the production build locally
npm run lint     # run ESLint
```

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | no | API base URL (defaults to `http://localhost:8000/api/v1`) |

Copy `.env.example` to `.env` to override the default. Never commit `.env`.
