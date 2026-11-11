# PHARMA ERP desktop

The existing pharmacy web application, packaged as a Windows/macOS desktop application with its own SQLite database. The normal interface, routes, styling, billing, stock, suppliers, purchase orders, expiry alerts, employee accounts, settings, migration imports and customer credit workflows are retained. Features that are placeholders in the web application remain placeholders here.

All desktop source, tooling and generated artifacts live in this folder. The parent web application's source, credentials and database are not changed or copied into the desktop database. This directory is self-contained and can also be maintained as a separate repository.

## Install and use

Use the installer for your operating system and processor from `release/`:

- macOS: open the `.dmg` and drag **PHARMA ERP** to Applications. Apple Silicon and Intel require their corresponding builds.
- Windows x64: run the `windows-x64-setup.exe` installer. A desktop shortcut and Start menu entry are created.

On first launch, create the local superadmin account. Then use the same login screen and application screens as the web app. There is no default password. Users you create in **User Management** belong to this installation. Web accounts and cloud records do not automatically appear on this computer; use the existing migration CSV templates to bring over records.

The installed app includes its backend and Python runtime. End users do **not** need Node, Python, PostgreSQL, a browser, or a separate server installation. Core operations run without internet. Email delivery, password recovery by email and WhatsApp require internet and configured provider credentials, just as they do on the web.

The installer never changes the hosted web application's database. Desktop data is local to the current OS user and computer, with no automatic synchronization. A shared multi-computer database is a separate deployment mode and is not enabled by pointing multiple installations at the same SQLite file.

## Local storage

The database is created automatically outside the application installation, so upgrading the app does not replace it:

| Platform | Data folder |
| --- | --- |
| macOS | `~/Library/Application Support/PHARMA ERP/data/` |
| Windows | `%APPDATA%\PHARMA ERP\data\` |

The main file is `pharma-erp.sqlite3`. SQLite foreign keys and WAL are enabled. The desktop app binds the backend to loopback on a dynamically selected port, and supplies a per-launch access key from Electron's main process. A second native-only key protects database maintenance. The renderer has no Node or filesystem access. These controls isolate the local service; the SQLite file itself is not encrypted.

Use **File → Open Data Folder** to locate the database, integration configuration and `desktop.log`. On Windows the menu is hidden until you press **Alt**. The app allows one instance per OS user and closes its backend on exit; if the desktop process crashes, closing its private pipe also stops the backend.

## Backup and restore

- **File → Back Up Database…** saves a consistent snapshot including committed WAL data. Use this rather than copying a live `.sqlite3` file.
- **File → Restore Database…** validates a selected PHARMA ERP backup, asks before replacing local records, keeps a safety backup, stops the backend, restores the database and opens the login screen. The current database and its sidecar files are also retained in `data/recovery/`.
- Before the first launch each day, the backend saves an automatic snapshot before applying migrations. The latest seven automatic daily snapshots are kept in `data/backups/`. Manual and pre-restore safety backups are not rotated automatically.

Finish billing and data entry before restoring. Backups contain all pharmacy records and should be stored with the same care as the live database. Restoring is a replacement operation, not a merge. A compatible desktop backup can be moved between Windows and macOS.

## Email and WhatsApp

Open **File → Email and WhatsApp Settings…**. Edit `integrations.env` in the data folder and restart the app. Only the integration variables in `resources/integrations.env.example` are loaded. Database configuration from this file or a developer shell cannot switch desktop storage to the hosted database.

Password recovery uses a `pharma-erp://reset-password?...` link. Open the link on the computer containing the installation whose account you are recovering. The installer registers this protocol; links open the existing password-reset screen. No passwords are emailed. Invoice printing and CSV import/download use the same app screens and the OS print/file dialogs.

## Development setup

Build prerequisites: Node **22.12+ within major 22**, npm, and Python **3.11**. On Windows install the Python launcher (`py`) or set `ERP_DESKTOP_PYTHON` to a Python 3.11 executable. On macOS `python3` is used unless that override is set. Electron, Python and compiled wheels must target the same processor architecture.

```sh
cd desktop-app
npm ci
npm run setup
npm run dev
```

`setup` creates an isolated `.venv`, installs Python dependencies, installs the desktop frontend dependencies and ensures the original login photograph is bundled locally. It needs internet once. `dev` builds the identical web interface against `/api/v1` and starts the source backend inside Electron using the desktop database location. It never starts or connects to the hosted API. Running development creates a real local desktop installation; use smoke tests for disposable test data.

```sh
npm run build:ui
npm test
npm run build
npm run test:smoke
```

`npm test` runs the desktop integration checks, the copied web backend regression suite and frontend test scripts. The desktop checks start real local HTTP processes against temporary databases, including hostile inherited PostgreSQL settings to verify local-only storage. `test:smoke` launches an actual Electron window and frozen backend, exercises setup/login/navigation/CSV import/billing/restart, and writes screenshots and a report to `test-output/`. It uses a disposable user-data directory and never touches your normal pharmacy database. GUI and loopback networking access are required.

`npm run start` starts an already built backend/UI. `npm run dev` runs the source backend. Both use the same desktop data folder for that OS user.

## Build installers

Build on each target operating system. PyInstaller includes the active platform's Python interpreter; a macOS backend cannot be placed in a Windows installer. See the [PyInstaller platform explanation](https://pyinstaller.org/en/stable/operating-mode.html).

```sh
# On macOS, matching your Node/Python processor architecture:
npm run dist:mac

# On Windows x64:
npm run dist:win
```

Installers, archives and `SHA256SUMS.txt` are written to `release/`. The frozen backend is under `build/backend/pharma-erp-api/` and the bundled frontend under `build/ui/`. The same app source is packaged for both systems; build Intel macOS on an Intel runner and Apple Silicon on an arm64 runner.

The ready-to-use workflow template is `ci/build-desktop.yml`. To enable it in the parent ERP repository, copy it to the repository's `.github/workflows/build-desktop.yml`. Alternatively put this desktop folder in its own repository and place the workflow in that repository's `.github/workflows/`. It detects either layout. The workflow builds Windows x64, macOS Intel and macOS Apple Silicon separately, runs the tests and Electron smoke test on their native OS, and uploads the installers. It is a template here so all newly created files stay under `desktop-app` as requested; it does not run until installed in the repository workflow directory.

Unsigned builds work for local testing. Public distribution requires your own Apple Developer signing/notarization identity and Windows signing certificate. The repository contains no certificates, signing passwords or provider credentials. Standard electron-builder signing environment variables can be supplied by your release pipeline. See [Electron's security guidance](https://www.electronjs.org/docs/latest/tutorial/security) and [electron-builder](https://www.electron.build/) for release configuration.

## Updating the app source

`frontend/src`, `frontend/public` and `backend/app` are snapshots of the current web application. To deliberately refresh them while this directory is inside the ERP monorepo:

```sh
npm run sync:web
npm run setup
npm run build
npm test
```

`sync:web` copies only allowlisted application files, package manifests and tests. It excludes web `.env` files, databases, virtual environments, node modules, caches and deployment configuration. Desktop setup, launchers and packaging configuration are preserved. Review dependency lock changes after syncing. The only desktop presentation adaptation is using a local copy of the exact login photograph; the app screens and styles are retained.

## Folder map

```text
desktop-app/
  frontend/              Existing React UI plus one-time setup entry
  backend/app/           Existing business API and models
  backend/entry.py       Packaged backend entry point
  backend/desktop_runtime.py  Local hosting, setup, email links and native controls
  backend/storage.py     Validated SQLite snapshots
  electron/              Native window, menus, process lifecycle and smoke checks
  resources/             Integration template and snapshot provenance
  scripts/               Setup, source sync, build and test commands
  tests/                 Desktop-specific process and database integration checks
  ci/                    Windows/macOS build workflow template
  build/                 Generated UI and Python backend (ignored)
  release/               Generated installers and checksums (ignored)
  test-output/           Electron screenshots and reports (ignored)
```
