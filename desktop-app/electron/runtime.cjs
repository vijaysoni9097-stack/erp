const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { existsSync, mkdirSync } = require('node:fs');
const path = require('node:path');
const { createInterface } = require('node:readline');

function deepLinkPath(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'pharma-erp:' || url.hostname !== 'reset-password' || !['', '/'].includes(url.pathname)) return null;
    const token = url.searchParams.get('token');
    return /^[A-Za-z0-9_-]{32,256}$/.test(token || '') ? `/reset-password?token=${encodeURIComponent(token)}` : null;
  } catch { return null; }
}

function isLocalUrl(value, origin) {
  try { return new URL(value).origin === origin; } catch { return false; }
}

function readyMessage(line) {
  try {
    const value = JSON.parse(line);
    if (value.event === 'ready' && Number.isInteger(value.port) && value.port > 0 && value.port <= 65535 && typeof value.setup_required === 'boolean') return value;
  } catch { /* Other log lines are not readiness signals. */ }
  return null;
}

class Backend {
  constructor({ project, resources, packaged, development, dataDir, log }) {
    this.dataDir = dataDir;
    this.log = log;
    this.key = randomBytes(32).toString('hex');
    this.controlKey = randomBytes(32).toString('hex');
    this.uiDir = packaged ? path.join(resources, 'ui') : path.join(project, 'build/ui');
    const frozen = packaged ? path.join(resources, 'backend') : path.join(project, 'build/backend/pharma-erp-api');
    this.command = development && !packaged
      ? path.join(project, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
      : path.join(frozen, process.platform === 'win32' ? 'pharma-erp-api.exe' : 'pharma-erp-api');
    this.args = development && !packaged ? [path.join(project, 'backend/entry.py')] : [];
  }

  async start() {
    if (!existsSync(this.command) || !existsSync(path.join(this.uiDir, 'index.html'))) throw new Error('Application files are missing. Run npm run build or reinstall PHARMA ERP.');
    mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
    this.child = spawn(this.command, this.args, { cwd: this.dataDir, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.child.stdin.on('error', () => {});
    this.closed = new Promise(resolve => this.child.once('close', resolve));
    this.child.stderr.on('data', data => this.log.write(data));
    const lines = createInterface({ input: this.child.stdout });
    const ready = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => failed(new Error('The local database did not start within 60 seconds. See the desktop log.')), 60000);
      const cleanup = () => { clearTimeout(timeout); this.child.off('error', failed); this.child.off('exit', exited); lines.off('line', onLine); };
      const failed = error => { cleanup(); reject(error); };
      const exited = code => failed(new Error(`The local backend stopped during startup (${code}). See the desktop log.`));
      const onLine = line => {
        const message = readyMessage(line);
        if (message) { cleanup(); resolve(message); }
        else this.log.write(line + '\n');
      };
      this.child.once('error', failed); this.child.once('exit', exited); lines.on('line', onLine);
      this.child.stdin.write(JSON.stringify({ data_dir: this.dataDir, ui_dir: this.uiDir, key: this.key, control_key: this.controlKey }) + '\n');
    });
    this.origin = `http://127.0.0.1:${ready.port}`;
    this.setupRequired = ready.setup_required;
    // The ready signal follows schema setup; wait until Uvicorn is accepting requests.
    for (let attempt = 0; attempt < 100; attempt++) {
      try { await this.request('/desktop/status'); return this; }
      catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    throw new Error('The local backend is not responding.');
  }

  async request(route, { method = 'GET', body, control = false, bearer } = {}) {
    if (!this.origin || !route.startsWith('/') || route.startsWith('//')) throw new Error('Invalid local request');
    const headers = { 'X-Pharma-Desktop-Key': this.key };
    if (control) headers['X-Pharma-Desktop-Control'] = this.controlKey;
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(this.origin + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60000) });
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'The local operation could not be completed.');
    return data;
  }

  async stop() {
    if (!this.child || this.child.exitCode !== null || this.child.signalCode !== null) return;
    this.stopping = true;
    this.child.stdin.end();
    const timer = setTimeout(() => this.child.kill('SIGKILL'), 10000);
    await this.closed;
    clearTimeout(timer);
  }
}

module.exports = { Backend, deepLinkPath, isLocalUrl, readyMessage };
