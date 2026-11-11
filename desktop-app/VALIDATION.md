# Desktop validation — 11 November 2026

Validated locally on macOS Apple Silicon (`darwin`, `arm64`) with Node 22.23.4, Python 3.11.9, Electron 45.3.0 and PyInstaller 6.22.3.

| Check | Result |
| --- | --- |
| Web source comparison | All copied screens and backend business logic match the parent application. The existing login photograph URL is replaced with its bundled local copy. |
| Native runtime unit checks | 3 passed: local-origin isolation, validated password-reset links and backend readiness messages. |
| Desktop integration checks | 6 passed: first account, access guard, hashed credentials/login, billing/stock persistence, WAL-consistent backups, restore staging/safety backup, invalid backup rejection, password handling and desktop reset email links. |
| Copied backend regression suite | All 87 tests passed against isolated temporary databases. |
| Frontend regression scripts | All 14 scripts passed. |
| Frontend lint | Completed with no errors; four existing unused-variable warnings remain in unchanged Dashboard/Messages source. |
| Frozen backend | Passed startup, superadmin setup, login, supplier persistence, backup and backend restart without the development Python executable. |
| Actual Electron window | Passed setup, normal login, dashboard data loading, nine application routes, CSV upload/preview/commit, billing, backup and persistence after restart. |
| Packaged `.app` | Passed the same complete Electron smoke checks using its bundled backend and UI from the application bundle. |
| Visual inspection | Packaged login and populated dashboard screenshots inspected; bundled fonts, icons and photograph load correctly. |
| Installer integrity | DMG verified by `hdiutil verify`; DMG and ZIP match `release/SHA256SUMS.txt`. |
| Desktop frontend runtime dependency audit | Zero reported production dependency vulnerabilities after compatible Axios/follow-redirects patches in the desktop lockfile. |
| Parent repository changes | No parent frontend/backend files changed. All new project files are under `desktop-app`. Existing unrelated `output/` and `tmp/` folders were left untouched. |

## Built artifacts

- `release/PHARMA-ERP-0.1.0-mac-arm64.dmg`
- `release/PHARMA-ERP-0.1.0-mac-arm64.zip`
- `release/mac-arm64/PHARMA ERP.app`
- `release/SHA256SUMS.txt`

These local builds are unsigned and have not been Apple-notarized. Signing identities and credentials are not included.

## Evidence

`test-output/packaged/smoke-result.json` records the packaged application's checks. That folder contains screenshots of first-run setup, the unchanged login, dashboard, migration preview and populated dashboard after backend restart. The source and frozen smoke checks use temporary user-data directories; no real pharmacy data was read or modified.

Local detailed build and regression logs are in `.cache/package-mac.log` and `.cache/tests-final.log`. Generated artifacts, caches, virtual environments and test screenshots are ignored by Git; all remain present in this desktop project directory.

## Platform and service limits

Windows x64 and Intel macOS packages have not been built or executed on this Apple Silicon machine. `ci/build-desktop.yml` supplies native Windows x64, Intel macOS and Apple Silicon macOS jobs; see the README for enabling it. Distribution commands reject a mismatched operating system or Python/Node processor architecture before creating a misleading installer.

Live SMTP, WhatsApp delivery and physical printer output were not invoked. They require the installation's provider credentials or printer and, for external services, internet access. Email link creation, the existing invoice renderer and backend credit/notification behavior are covered by automated tests. The desktop uses the existing invoice print/file flows.

The public web backend and its database were never used by the desktop checks. Desktop data starts in its own local SQLite file. Existing web placeholders, including Messages, remain unchanged.
