# Hosting from the ERP monorepo

The current deployment configuration is the root [`render.yaml`](../render.yaml). Both services build from `vijaysoni9097-stack/erp`.

See the [deployment/cutover guide](../docs/deployment.md) and [root README](../README.md) for exact settings and local commands. The API root is `backend/`; the UI root is `frontend/`. Keep existing Render secrets and database/schema unchanged.
