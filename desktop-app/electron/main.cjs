const { app, BrowserWindow, dialog, Menu, nativeTheme, session, shell } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Backend, deepLinkPath, isLocalUrl } = require('./runtime.cjs');

const project = path.resolve(__dirname, '..');
const smoke = process.argv.includes('--smoke-test');
const development = process.argv.includes('--development-backend');
app.setName('PHARMA ERP');
if (smoke) app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'pharma-desktop-smoke-')));
const dataDir = path.join(app.getPath('userData'), 'data');
let backend, window, log, quitting = false, finishing = false, maintenance = false;
let pendingLink = process.argv.map(deepLinkPath).find(Boolean);

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('open-url', (event, url) => { event.preventDefault(); openDeepLink(url); });
  app.on('second-instance', (_event, argv) => {
    const target = argv.find(value => deepLinkPath(value));
    if (target) openDeepLink(target);
    if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); }
  });
  app.whenReady().then(start).catch(fatal);
}

function openDeepLink(url) {
  const route = deepLinkPath(url);
  if (!route) return;
  if (window && backend && !backend.setupRequired && !maintenance) window.loadURL(backend.origin + route).catch(fatal);
  else pendingLink = route;
}

async function launchBackend() {
  backend = new Backend({ project, resources: process.resourcesPath, packaged: app.isPackaged,
    development, dataDir, log });
  await backend.start();
  backend.child.on('exit', () => {
    if (!backend.stopping && !quitting) fatal(new Error('The local service stopped unexpectedly. Your database is saved; restart PHARMA ERP.'));
  });
}

function secureSession() {
  const desktop = session.fromPartition('pharma-erp-desktop');
  desktop.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  desktop.setPermissionCheckHandler(() => false);
  desktop.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'file://*/*'] }, (details, callback) => {
    callback({ cancel: !backend || !isLocalUrl(details.url, backend.origin) });
  });
  desktop.webRequest.onBeforeSendHeaders((details, callback) => {
    if (backend && isLocalUrl(details.url, backend.origin)) details.requestHeaders['X-Pharma-Desktop-Key'] = backend.key;
    callback({ requestHeaders: details.requestHeaders });
  });
  desktop.on('will-download', (_event, item) => {
    item.setSaveDialogOptions({ title: 'Save file', defaultPath: path.join(app.getPath('downloads'), path.basename(item.getFilename())) });
  });
  return desktop;
}

async function start() {
  nativeTheme.themeSource = 'light';
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const logPath = path.join(dataDir, 'desktop.log');
  if (fs.existsSync(logPath) && fs.statSync(logPath).size > 2 * 1024 * 1024) fs.renameSync(logPath, logPath + '.previous');
  log = fs.createWriteStream(logPath, { flags: 'a', mode: 0o600 });
  const config = path.join(dataDir, 'integrations.env');
  if (!fs.existsSync(config)) fs.copyFileSync(path.join(project, 'resources/integrations.env.example'), config);
  fs.chmodSync(config, 0o600);
  if (!smoke) {
    if (process.defaultApp) app.setAsDefaultProtocolClient('pharma-erp', process.execPath, [project]);
    else app.setAsDefaultProtocolClient('pharma-erp');
  }
  await launchBackend();
  window = new BrowserWindow({ width: 1440, height: 960, minWidth: 900, minHeight: 650,
    icon: path.join(project, 'resources/icon.png'),
    title: 'PHARMA ERP', show: false, backgroundColor: '#f6f7fa', autoHideMenuBar: true,
    webPreferences: { session: secureSession(), nodeIntegration: false, contextIsolation: true, sandbox: true,
      webSecurity: true, allowRunningInsecureContent: false, webviewTag: false, spellcheck: false, devTools: !app.isPackaged || smoke } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => { if (!isLocalUrl(event.url, backend.origin)) event.preventDefault(); });
  window.webContents.on('will-frame-navigate', event => {
    if (!isLocalUrl(event.url, backend.origin) && !(event.url === 'about:blank' && !event.isMainFrame)) event.preventDefault();
  });
  window.on('close', event => { if (maintenance && !quitting) event.preventDefault(); });
  window.on('closed', () => { window = null; if (!quitting) app.quit(); });
  installMenu();
  await window.loadURL(backend.origin + (backend.setupRequired ? '/desktop/setup' : pendingLink || '/'));
  window.show();
  if (smoke) await require('./smoke.cjs').run({ app, window, backend, launchBackend, getBackend: () => backend, project, dataDir });
}

function guarded(action) {
  return async () => {
    if (maintenance) return;
    maintenance = true;
    try { await action(); }
    catch (error) { await dialog.showMessageBox(window, { type: 'error', title: 'PHARMA ERP', message: error.message }); }
    finally { maintenance = false; }
  };
}

function installMenu() {
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [
      { label: 'Back Up Database…', click: guarded(backupDatabase) },
      { label: 'Restore Database…', click: guarded(restoreDatabase) }, { type: 'separator' },
      { label: 'Open Data Folder', click: () => shell.openPath(dataDir) },
      { label: 'Email and WhatsApp Settings…', click: guarded(async () => {
        await shell.openPath(path.join(dataDir, 'integrations.env'));
        await dialog.showMessageBox(window, { message: 'Save the integration settings and restart PHARMA ERP to apply them.' });
      }) }, { type: 'separator' }, { role: 'quit' },
    ] },
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
    { role: 'windowMenu' },
    { label: 'Help', submenu: [{ label: 'Desktop Guide', click: () => shell.openPath(app.isPackaged ? path.join(process.resourcesPath, 'desktop-guide.html') : path.join(project, 'build/desktop-guide.html')) }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function backupDatabase() {
  const choice = await dialog.showSaveDialog(window, { title: 'Back up PHARMA ERP database',
    defaultPath: `PHARMA-ERP-backup-${new Date().toISOString().slice(0, 10)}.sqlite3`, filters: [{ name: 'SQLite database', extensions: ['sqlite3'] }] });
  if (choice.canceled) return;
  const result = await backend.request('/desktop/control/backup', { method: 'POST', control: true });
  if (path.resolve(choice.filePath) === path.join(dataDir, 'pharma-erp.sqlite3')) throw new Error('Choose a backup location other than the live database.');
  fs.copyFileSync(result.path, choice.filePath); fs.chmodSync(choice.filePath, 0o600);
  await dialog.showMessageBox(window, { message: 'Database backup saved successfully.' });
}

function moveDatabaseAside(folder) {
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  for (const suffix of ['', '-wal', '-shm']) {
    const source = path.join(dataDir, 'pharma-erp.sqlite3' + suffix);
    if (fs.existsSync(source)) fs.renameSync(source, path.join(folder, path.basename(source)));
  }
}

async function restoreDatabase() {
  const choice = await dialog.showOpenDialog(window, { title: 'Restore PHARMA ERP database', properties: ['openFile'], filters: [{ name: 'SQLite database', extensions: ['sqlite3', 'sqlite', 'db'] }] });
  if (choice.canceled) return;
  const confirm = await dialog.showMessageBox(window, { type: 'warning', title: 'Restore database',
    message: 'Replace this computer’s pharmacy data with the selected backup?',
    detail: 'Finish any billing or data entry first. The app will restart its local service. A safety backup of the current data is kept automatically.',
    buttons: ['Cancel', 'Restore Database'], defaultId: 0, cancelId: 0 });
  if (confirm.response !== 1) return;
  const prepared = await backend.request('/desktop/control/prepare-restore', { method: 'POST', control: true, body: { path: choice.filePaths[0] } });
  const recovery = path.join(dataDir, 'recovery', String(Date.now()));
  window.hide();
  await backend.stop();
  try {
    moveDatabaseAside(recovery);
    fs.copyFileSync(prepared.staged, path.join(dataDir, 'pharma-erp.sqlite3'));
    fs.chmodSync(path.join(dataDir, 'pharma-erp.sqlite3'), 0o600);
    await launchBackend();
    await window.webContents.session.clearStorageData();
    await window.loadURL(backend.origin + (backend.setupRequired ? '/desktop/setup' : '/login'));
  } catch (error) {
    await backend.stop();
    moveDatabaseAside(path.join(recovery, 'failed-restore'));
    fs.copyFileSync(prepared.safety, path.join(dataDir, 'pharma-erp.sqlite3'));
    await launchBackend();
    await window.loadURL(backend.origin + '/login');
    throw new Error(`Restore failed; the previous database was recovered. ${error.message}`);
  } finally { window.show(); }
}

async function fatal(error) {
  if (finishing) return;
  log?.write(`Desktop error: ${error.message}\n`);
  if (!smoke) dialog.showErrorBox('PHARMA ERP could not continue', `${error.message}\n\nData and logs: ${dataDir}`);
  else { process.stderr.write(`Desktop smoke test failed: ${error.stack}\n`); process.exitCode = 1; }
  app.quit();
}

app.on('before-quit', event => {
  if (finishing) return;
  event.preventDefault();
  if (quitting) return;
  quitting = true;
  (async () => {
    await backend?.stop();
    if (log) await new Promise(resolve => log.end(resolve));
    if (smoke) {
      try { fs.rmSync(app.getPath('userData'), { recursive: true, force: true }); }
      catch { /* Windows releases Chromium's temporary cache handles after process exit. */ }
    }
    finishing = true; app.exit(process.exitCode || 0);
  })().catch(() => { finishing = true; app.exit(1); });
});
app.on('window-all-closed', () => app.quit());
