# Vinyl Collection Manager

A full-stack web application for managing a vinyl record collection with barcode
scanning, Discogs enrichment, Spotify playlist sync, and custom metadata.

## Features

- 📷 **Barcode scanning** using the device camera
- 🎵 **Discogs integration** for record metadata (artist, album, year, label, genres, styles, contributors)
- 🎶 **Spotify integration** for playlist management and auto-sync
- 📊 **Advanced table** with sorting, filtering, resizing, and drag-to-reorder columns
- 🏷️ **Custom columns** for personal metadata (condition, rating, location, etc.)
- 🔍 **Multiple lookup methods**: barcode, Discogs URL, artist/album search
- 📸 **Photo recognition** (experimental): identify an album from a cover photo via Claude vision, then resolve it on Discogs
- 📱 **Responsive UI** for mobile and desktop
- 🔐 **Authentication** via Supabase with per-user row-level security
- 💾 **Per-user preferences** (column order/visibility) persisted to the backend

## Tech Stack

**Frontend** — React 18 + TypeScript, Mantine UI, TanStack Table, React Router,
Vite, Axios.

**Backend** — Flask (Python) organized into blueprints, served by Gunicorn in
production. Supabase (PostgreSQL) for database and auth. Discogs and Spotify APIs
for enrichment.

## Project Structure

```
vinyl-collection-manager/
├── barcode_scanner/          # Flask backend
│   ├── server.py             # App setup, config, blueprint registration
│   ├── extensions.py         # Shared extensions (CORS, rate limiter)
│   ├── auth_utils.py         # @require_auth and auth helpers
│   ├── db.py                 # Supabase client
│   ├── spotify.py            # Spotify helpers
│   └── blueprints/           # Routes: auth, lookup, records, custom, spotify, analytics
├── frontend/                 # React + TypeScript (Vite) SPA
│   └── src/
│       ├── pages/            # Route pages (Collection, MusicianNetwork, ...)
│       ├── components/       # UI components (ResizableTable, Layout, ...)
│       ├── hooks/            # useBackendSettings, useCsvImport, useSpotifySync, ...
│       ├── contexts/         # AuthContext
│       ├── services/         # api.ts (shared axios instance)
│       └── lib/              # appEvents (typed event emitter)
├── discogs_lookup.py         # Discogs API helpers
├── requirements.txt          # Python dependencies (pip)
├── gunicorn.conf.py          # Gunicorn config (production)
├── start_server.sh           # Local backend launcher
├── render.yaml               # Render deployment config
└── .env.example              # Environment variable template
```

## Setup

### 1. Clone

```bash
git clone <your-repo-url>
cd vinyl-collection-manager
```

### 2. Configure environment

Copy `.env.example` to `.env` in the project root and fill in real values
(Supabase, Discogs, and Spotify credentials):

```bash
cp .env.example .env
```

### 3. Install backend dependencies

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 4. Install frontend dependencies

```bash
cd frontend
npm install
```

> Requires Node.js 20+.

## Running Locally

You need two processes: the Flask backend and the Vite dev server.

### Terminal 1 — backend

```bash
./start_server.sh
```

The backend runs on **port 3000** in development. `start_server.sh` activates a
local `.venv` if present, then runs the app as a module
(`python -m barcode_scanner.server`) so the package imports resolve correctly.

### Terminal 2 — frontend (dev server with hot reload)

```bash
cd frontend
npm run dev
```

Vite runs on **port 5173** and proxies API requests to the backend on port 3000.

**Open the app at http://localhost:5173**

### Production build (optional, served by the backend)

```bash
cd frontend
npm run build
```

The backend serves the built files from `frontend/dist` at **http://localhost:3000**.
Note that the production build targets the deployed API URL; for local testing
prefer the dev server above.

## Environment Variables

All backend configuration is provided via environment variables (loaded from
`.env` locally). See `.env.example` for the full list:

| Variable | Description |
| --- | --- |
| `FLASK_ENV` | `development` locally, `production` on deploy |
| `FLASK_SECRET_KEY` | Secret used to sign Flask sessions |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_KEY` | Supabase anon (public) key |
| `DISCOGS_TOKEN` | Discogs API token |
| `SPOTIFY_CLIENT_ID` | Spotify app client ID |
| `SPOTIFY_CLIENT_SECRET` | Spotify app client secret |
| `SPOTIFY_REDIRECT_URI` | Registered Spotify redirect URI |
| `SYNC_SECRET_KEY` | Authorizes the automated (cron) playlist-sync endpoint. Required in production; optional locally (only needed to test `/api/spotify/playlist/sync/automated`). |
| `ANTHROPIC_API_KEY` | Anthropic API key for the photo-recognition feature. Optional — the feature is disabled (returns a clear error) if unset. |
| `ANTHROPIC_MODEL` | Optional. Vision model for photo recognition (default `claude-haiku-4-5`). |

## Deployment

The app is configured for [Render](https://render.com) via `render.yaml`:

- Build: `pip install -r requirements.txt && cd frontend && npm install && npm run build`
- Start: `gunicorn -c gunicorn.conf.py barcode_scanner.server:app`
- Backend runs with Gunicorn; the built frontend is served as static files.
- Set the secret environment variables (marked `sync: false`) in the Render dashboard.

### Automated Spotify sync (cron)

Playlists are re-synced on a schedule by a Supabase `pg_cron` job
(`public.sync_spotify_playlists_cron`) that POSTs to
`/api/spotify/playlist/sync/automated` with an `X-Sync-Key` header.

The secret lives in **two places that must match**:

1. The `SYNC_SECRET_KEY` environment variable on Render (read by the backend).
2. The `sync_secret_key` row in the Supabase `app_settings` table (read by the
   cron function, alongside `api_url`).

> ⚠️ The SQL files under `supabase/migrations/` are **not authoritative** — the
> live cron schedule, endpoint path, and secret source differ from them. Inspect
> the running database (e.g. `cron.job`, `pg_get_functiondef`, `app_settings`)
> rather than trusting those files.

## Troubleshooting

**"Network Error" / requests hitting the production URL when logging in locally.**
You're loading a production build. Use the dev server (`npm run dev`) on port 5173.

**401 / "User not authenticated".**
Use `http://localhost:5173` (dev) or `http://localhost:3000` (production build),
not other ports.

**`Address already in use` on port 3000.**

```bash
lsof -ti:3000 | xargs kill -9
```

**`ImportError: attempted relative import with no known parent package`.**
Start the backend with `./start_server.sh` (or `python -m barcode_scanner.server`),
not `python barcode_scanner/server.py`.

## License

MIT
