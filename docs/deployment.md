# Monorepo deployment and one-time cutover

## Prepared configuration

| Setting | Existing Render API | Existing Render UI |
|---|---|---|
| Service | pharmacy-erp-testing-api | pharmacy-erp-testing-ui |
| Repository | vijaysoni9097-stack/erp | vijaysoni9097-stack/erp |
| Branch | feature/ui_0.2 | feature/ui_0.2 |
| Root directory | backend | frontend |
| Runtime | Docker | Static site |
| Dockerfile / context | ./Dockerfile / . (relative to backend) | Not applicable |
| Build command | Dockerfile | npm ci && npm run build |
| Publish path | Not applicable | dist |
| Health check | /health | Not applicable |

Render root directories affect Docker paths and static publish paths. Build-filter paths remain relative to the repository root. References: [Render monorepo support](https://render.com/docs/monorepo-support), [Blueprint specification](https://render.com/docs/blueprint-spec).

## Before the cutover

1. Commit and push the prepared folder move and imported API to the intended ERP branch. Do not deploy a root-directory change before that branch contains the new paths.
2. Ensure GitHub Actions passes frontend tests/build, isolated backend tests and the API Docker build. Obtain/verify a backup of the current database through the existing operator process before a production cutover.
3. Keep the original API repository/check-out available as a rollback source. Its source commit and import hashes are recorded in `backend-import.json`. This import does not merge the old Git history or delete its repository.
4. Coordinate the UI settings change with the push: the old root-level UI build settings do not match the new layout. A failed automatic build leaves the last successful Render deployment serving; a later build using the new settings should replace it.

## Reconfigure existing services

If they are managed by a Render Blueprint, sync the updated root `render.yaml` and review that it updates the **existing** service names, not replacement services. If managed manually, change the Settings fields in the table above on each existing service. The API currently points at `erp-backend`; it must be switched to `erp` as part of this cutover.

Do not remove or replace `DATABASE_URL`, `DATABASE_SCHEMA`, CORS, SMTP credentials, company data, reset URLs or other private environment values. In particular, keep `DATABASE_SCHEMA=erp_app` and the existing database URL to preserve all patient, invoice, stock and user records. `REQUIRE_POSTGRES=true` prevents accidental SQLite hosting. Old `SYNC_*` variables are ignored by the online-only application and are not in the new blueprint.

For UI environment set `NODE_VERSION=22.16.0` and keep `VITE_API_BASE_URL` pointing at the existing API URL ending in `/api/v1`. Keep the static rewrite `/* → /index.html`.

Deploy API first; check `/health` and that `/openapi.json` contains `/api/v1/inventory/stock`, `/api/v1/inventory/stock/search` and `/api/v1/inventory/stock/summary`. Then deploy UI and verify a login, stock search/scroll, and existing invoice retrieval. Real stock, payment or receipt mutations should only be performed on approved test records.

## Automatic deployment after cutover

The two services use the same repo/branch, but build independently:

- `backend/**` or `render.yaml` changes trigger the API deployment.
- `frontend/**` or `render.yaml` changes trigger the UI deployment.
- Documentation-only changes do not require either service to redeploy.

The blueprint retains the existing commit-triggered auto-deploy behavior. GitHub Actions validates each push/PR separately. If you want deploys gated by CI status, configure Render's after-checks-passed behavior explicitly; this consolidation does not claim that commit-triggered deployments wait for tests.

## Local and CI commands

From the repo root: `npm ci`, `npm test`, `npm run build`, `npm run test:backend`.

Backend tests use a temporary directory and SQLite test DB, regardless of developer `.env`. No live database or Supabase administration tests run in CI. The Docker build context is `backend/` and `.dockerignore` only admits app/requirements/Dockerfile.

## Rollback

Keep the last successful deploy available. If required, restore the API service repository/branch to its original `erp-backend`/`main`, clear its root directory, and deploy the known-good old commit. UI rollback must restore the matching old source and build-root settings together. Preserve the same database URL and schema. Review any schema changes introduced after cutover separately; source rollback does not undo database migrations.
