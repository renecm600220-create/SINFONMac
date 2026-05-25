const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');

let mainWindow = null;
let pyProc = null;
const PY_PORT = 34568;
const WEB_PORT = 34567;

function getScriptsDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'scripts')
    : path.join(__dirname, '..', 'scripts');
}

function getPythonCmd() {
  if (app.isPackaged) {
    if (process.platform === 'darwin') {
      return path.join(process.resourcesPath, 'python-embed', 'bin', 'python3');
    }
    return path.join(process.resourcesPath, 'python-embed', 'python.exe');
  }
  if (process.platform === 'darwin') {
    return path.join(__dirname, '..', 'python-embed', 'bin', 'python3');
  }
  return path.join(__dirname, '..', 'python-embed', 'python.exe');
}

function waitForReady(proc) {
  return new Promise((resolve, reject) => {
    let timeout = setTimeout(() => reject(new Error('Timeout')), 300000);
    proc.stdout.on('data', (data) => {
      var msg = data.toString();
      if (msg.indexOf('READY') >= 0) {
        clearTimeout(timeout);
        resolve(proc);
      }
    });
    proc.stderr.on('data', (data) => {
      console.log('PY:', data.toString());
    });
    proc.on('exit', (code) => {
      console.log('Python exit:', code);
    });
  });
}

function startPython() {
  var scriptsDir = getScriptsDir();
  var pyScript = path.join(scriptsDir, 'server.py');
  var pythonCmd = getPythonCmd();
  console.log('Python:', pythonCmd);
  console.log('Script:', pyScript);
  var py = spawn(pythonCmd, [pyScript, String(PY_PORT)], { cwd: scriptsDir });
  return waitForReady(py);
}

function startServer() {
  var buildDir = app.isPackaged
    ? path.join(process.resourcesPath, 'build')
    : path.join(__dirname, '..', 'build');
  var server = http.createServer((req, res) => {
    var filePath = path.join(buildDir, req.url === '/' ? 'index.html' : req.url);
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      var ext = path.extname(filePath);
      var types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png' };
      res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
      res.end(data);
    });
  });
  return new Promise((resolve) => {
    server.listen(WEB_PORT, '127.0.0.1', () => resolve(server));
  });
}

app.whenReady().then(async () => {
  try { pyProc = await startPython(); } catch (e) { console.error(e); }
  await startServer();

  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
    title: 'SINFON'
  });
  mainWindow.loadURL('http://127.0.0.1:34567');
  mainWindow.on('closed', () => { mainWindow = null; });
});

app.on('window-all-closed', () => {
  if (pyProc) pyProc.kill();
  app.quit();
});

var gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); } else {
  app.on('second-instance', () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
  });
}