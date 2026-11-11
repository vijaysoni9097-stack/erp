const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
app.setPath('userData', path.join(root, '.cache/icon-renderer'));
app.whenReady().then(async () => {
  const window = new BrowserWindow({ width: 1024, height: 1024, useContentSize: true, show: false,
    transparent: true, frame: false, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
  await window.loadURL('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(fs.readFileSync(path.join(root, 'resources/icon.svg'), 'utf8')));
  const icon = await window.capturePage();
  fs.writeFileSync(path.join(root, 'resources/icon.png'), icon.resize({ width: 1024, height: 1024 }).toPNG());
  window.destroy(); app.quit();
}).catch(error => { process.stderr.write(error.stack + '\n'); app.exit(1); });
