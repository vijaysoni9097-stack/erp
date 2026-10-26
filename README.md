# Pharmacy ERP — frontend and backend

The application now lives in one repository. The React UI and FastAPI API remain independently deployable services, backed by the same configured hosted PostgreSQL database.

```text
erp/
├── frontend/              React/Vite UI, public assets, JS tests and lockfile
├── backend/               FastAPI app, Python tests, requirements and Dockerfile
├── scripts/               Root launchers and legacy administration utilities
├── docs/                  Feature notes and deployment/cutover instructions
├── supabase/              Historical SQL administration migrations
├── .github/workflows/     Frontend checks, backend tests and Docker build
└── render.yaml            Both Render services from this repository
```

The original separate backend checkout has not been deleted or changed by this consolidation. Git provenance for its imported source is recorded in [docs/backend-import.json](docs/backend-import.json). No private environment files, databases, backups, outputs or virtual environments were imported.

## Frontend development

Use Node **22.12+ within major version 22**.

```sh
npm ci
npm run dev
```

Root `npm ci` installs the frontend dependencies too. Existing root commands `npm run build`, `npm run preview`, `npm run lint` and `npm test` continue to work. Or run `npm ci && npm run dev` directly in `frontend/`.

The UI still connects to the hosted Render API by default, including local development. This uses the same accounts and data as the hosted UI. The Vite proxy handles browser origin restrictions. **Actions from a local UI can change hosted records.**

Optional frontend overrides belong in `frontend/.env.local` (ignored by Git):

```dotenv
VITE_API_BASE_URL=https://pharmacy-erp-testing-api.onrender.com/api/v1
```

Vite reads environment files from `frontend/`; restart it after changing them. Stop and restart any old Vite process that was started before the directory move.

## Backend development

Use Python 3.11+. On macOS/Linux:

```sh
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements-hosting.txt
# Create backend/.env from backend/.env.example and supply your private settings.
npm run dev:backend
```

On Windows create the same venv using `python -m venv backend/.venv`; its interpreter is `backend/.venv/Scripts/python.exe`. You can run `python scripts/run_backend.py` directly. The launcher uses that venv when present and starts Uvicorn from `backend/`, so backend `.env` paths continue to resolve correctly. `ERP_BACKEND_PYTHON` can select another existing interpreter.

The hosted application requires `DATABASE_URL`, `DATABASE_SCHEMA=erp_app`, `REQUIRE_POSTGRES=true`, and appropriate `CORS_ORIGINS`. Configure existing email/reset URLs in the same backend environment. Never put private DB or SMTP settings in a `VITE_*` variable.

To intentionally use the new local API, set `VITE_API_BASE_URL=http://127.0.0.1:8000/api/v1` in `frontend/.env.local` and restart Vite. Provision/configure its database and accounts separately. There is no background sync between a separate development DB and the hosted DB.

## Checks

```sh
npm test
npm run build
npm run test:backend
```

The backend test launcher runs in an isolated temporary directory and database, with no developer `.env` loaded. CI uses the same launcher. A frontend lint command is retained; it requires the native oxlint dependency installed for your machine.

## Build and deploy

```sh
docker build -t pharmacy-erp-api backend
```

The Docker image requires a PostgreSQL URL at runtime; it no longer silently creates a SQLite deployment. It runs as a non-root user. Docker context `backend/` excludes private files by an allowlist.

Both Render services are defined in the root `render.yaml`, using the `feature/ui_0.2` branch of `vijaysoni9097-stack/erp`. API: root `backend`, Dockerfile `./Dockerfile`, context `.`. UI: root `frontend`, build `npm ci && npm run build`, publish `dist`. Build filters isolate frontend/backend deployments. Existing service URLs can stay unchanged.

**Changing files locally does not update existing Render service settings.** After committing/pushing, follow the [deployment and one-time cutover guide](docs/deployment.md) to repoint the existing API service from the old repository and set both root directories. Keep all existing Render environment secrets and the current database/schema. Do not create a replacement DB or delete an existing service.

For Vercel, either import the repository root (root `vercel.json` uses `frontend/dist`) or choose `frontend` as the project root (its own `vercel.json` uses `dist`).

Legacy `supabase/` SQL and root Python import tools are retained for reference/explicit administration; normal application deployment does not execute them. The online-only API owns normal business transactions. See [backend/ONLINE_ONLY_README.md](backend/ONLINE_ONLY_README.md).
