const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, ipcMain, protocol, session, shell, Menu } = require('electron');
const { Store } = require('./store');
const { Drive } = require('./drive');
const { Media, prepareBundledBins } = require('./media');
const { ACCOUNTS, SOURCES, platformOf, partitionFor } = require('./platforms');

// Gömülü tarayıcı sitelere "Electron" olarak görünmesin; standart Chrome kimliği.
const CHROME_UA = `Mozilla/5.0 (${process.platform === 'darwin' ? 'Macintosh; Intel Mac OS X 10_15_7' : 'Windows NT 10.0; Win64; x64'}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;
app.userAgentFallback = CHROME_UA;

protocol.registerSchemesAsPrivileged([
  { scheme: 'ilham', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true } },
]);

let win;
let store;
let drive;
let media;

function send(channel, data) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
}

// Yerel dosyayı Range desteğiyle sun (video ileri sarma için şart).
function serveFile(file, mime, rangeHeader) {
  const size = fs.statSync(file).size;
  const m = /bytes=(\d*)-(\d*)/.exec(rangeHeader || '');
  if (!m) {
    return new Response(fs.readFileSync(file), {
      status: 200,
      headers: { 'Content-Type': mime, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' },
    });
  }
  const start = m[1] ? parseInt(m[1], 10) : size - parseInt(m[2], 10);
  const end = m[1] && m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1;
  const len = end - start + 1;
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(len);
  fs.readSync(fd, buf, 0, len, start);
  fs.closeSync(fd);
  return new Response(buf, {
    status: 206,
    headers: {
      'Content-Type': mime,
      'Content-Length': String(len),
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
    },
  });
}

function registerProtocol() {
  protocol.handle('ilham', async (req) => {
    const url = new URL(req.url);
    const [kind, name] = [url.hostname, decodeURIComponent(url.pathname.slice(1))];

    if (kind === 'kapak') {
      const file = path.join(store.thumbDir, path.basename(name));
      if (!fs.existsSync(file)) return new Response('', { status: 404 });
      return serveFile(file, 'image/jpeg');
    }

    if (kind === 'medya') {
      const item = store.getItem(name);
      if (!item) return new Response('', { status: 404 });
      const range = req.headers.get('range');
      const local = item.localFile && fs.existsSync(item.localFile) ? item.localFile : media.cachedFile(item);
      if (local) return serveFile(local, item.mime || 'application/octet-stream', range);
      if (item.driveId) {
        try {
          const r = await drive.stream(item.driveId, range);
          const headers = {};
          for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
            const v = r.headers.get(h);
            if (v) headers[h] = v;
          }
          if (!headers['content-type']) headers['content-type'] = item.mime;
          return new Response(r.body, { status: r.status, headers });
        } catch (e) {
          return new Response(e.message, { status: 502 });
        }
      }
      return new Response('', { status: 404 });
    }

    return new Response('', { status: 404 });
  });
}

async function accountStatus() {
  const out = {};
  for (const a of ACCOUNTS) {
    if (!a.loginCookie) { out[a.id] = 'bilinmiyor'; continue; }
    const cookies = await session.fromPartition(partitionFor(a.id)).cookies.get({ name: a.loginCookie });
    const hit = cookies.find((c) => c.domain.replace(/^\./, '').endsWith(a.domain) && (!a.loginValue || c.value === a.loginValue));
    out[a.id] = hit ? 'bagli' : 'bagli-degil';
  }
  return out;
}

function setupIpc() {
  ipcMain.handle('init', async () => ({
    items: store.listItems(),
    boards: store.listBoards(),
    accounts: ACCOUNTS.map(({ id, name, url }) => ({ id, name, url, partition: partitionFor(id) })),
    sources: SOURCES.map((s) => ({ ...s, partition: 'persist:genel' })),
    accountStatus: await accountStatus(),
    drive: drive.status(),
    tools: media.tools(),
    settings: { cacheLimitMb: store.getSetting('cacheLimitMb', 2048) },
  }));

  ipcMain.handle('accounts:status', () => accountStatus());
  ipcMain.handle('accounts:logout', async (_e, id) => {
    await session.fromPartition(partitionFor(id)).clearStorageData();
    return accountStatus();
  });

  ipcMain.handle('item:save', (_e, payload) => {
    payload.platform = platformOf(payload.pageUrl || payload.src || '');
    return media.save(payload);
  });
  ipcMain.handle('item:files', (_e, paths) => paths.filter((p) => fs.existsSync(p)).map((p) => media.saveLocalFile(p)));
  ipcMain.handle('item:update', (_e, id, patch) => {
    const allowed = {};
    for (const k of ['title', 'note', 'tags']) if (k in patch) allowed[k] = patch[k];
    return store.updateItem(id, allowed);
  });
  ipcMain.handle('item:retry', (_e, id) => media.retry(id));
  ipcMain.handle('item:remove', async (_e, id) => {
    const item = store.removeItem(id);
    if (!item) return false;
    if (item.driveId && drive.isConnected()) { try { await drive.remove(item.driveId); } catch { /* Drive'da kalsa da olur */ } }
    for (const f of [item.localFile, media.cachedFile(item), item.thumb && path.join(store.thumbDir, item.thumb)]) {
      if (f) fs.rmSync(f, { force: true });
    }
    return true;
  });

  ipcMain.handle('board:add', (_e, name) => store.addBoard(name));
  ipcMain.handle('board:rename', (_e, id, name) => store.renameBoard(id, name));
  ipcMain.handle('board:remove', (_e, id) => store.removeBoard(id));
  ipcMain.handle('board:reorder', (_e, ids) => { store.reorderBoards(ids); return store.listBoards(); });
  ipcMain.handle('board:place', (_e, boardId, itemId, index) => store.placeInBoard(boardId, itemId, index));
  ipcMain.handle('board:move', (_e, fromId, toId, itemId, index) => store.moveBetweenBoards(fromId, toId, itemId, index));
  ipcMain.handle('board:removeItem', (_e, boardId, itemId) => store.removeFromBoard(boardId, itemId));

  ipcMain.handle('drive:setClient', (_e, id, secret) => { drive.setClient(id, secret); return drive.status(); });
  ipcMain.handle('drive:connect', () => drive.connect());
  ipcMain.handle('drive:disconnect', () => { drive.disconnect(); return drive.status(); });

  ipcMain.handle('settings:set', (_e, key, value) => {
    if (key === 'cacheLimitMb') store.setSetting(key, Math.max(256, Number(value) || 2048));
    return { cacheLimitMb: store.getSetting('cacheLimitMb', 2048) };
  });

  ipcMain.handle('open:external', (_e, url) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
  });
  ipcMain.handle('open:dataFolder', () => shell.openPath(store.dir));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    title: 'İlham',
    backgroundColor: '#F5F5F3',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
    },
  });

  // Gömülü tarayıcıları kilitle: Node yok, sadece bizim preload.
  win.webContents.on('will-attach-webview', (_e, prefs, params) => {
    delete prefs.preloadURL;
    prefs.preload = path.join(__dirname, 'webview-preload.js');
    prefs.nodeIntegration = false;
    prefs.contextIsolation = true;
    prefs.sandbox = true;
    if (!/^persist:[a-z0-9-]+$/.test(params.partition || '')) params.partition = 'persist:genel';
  });

  // Yeni sekmede açılan bağlantılar aynı gömülü pencerede açılsın.
  win.webContents.on('did-attach-webview', (_e, wc) => {
    wc.setUserAgent(CHROME_UA);
    wc.setWindowOpenHandler(({ url }) => {
      if (/^https?:/.test(url)) wc.loadURL(url);
      return { action: 'deny' };
    });
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (process.env.ILHAM_SHOT) {
    win.webContents.once('did-finish-load', async () => {
      const steps = (process.env.ILHAM_SHOT_JS || '').split('||').filter(Boolean);
      const shots = process.env.ILHAM_SHOT.split(',');
      for (let i = 0; i < shots.length; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        if (steps[i]) await win.webContents.executeJavaScript(steps[i]).catch((e) => console.error(e));
        await new Promise((r) => setTimeout(r, 900));
        const img = await win.webContents.capturePage();
        fs.writeFileSync(shots[i], img.toPNG());
      }
      app.quit();
    });
  }
}

// Geliştirme için: ayrı veri klasörü ve otomatik ekran görüntüsü.
if (process.env.ILHAM_DATA) app.setPath('userData', process.env.ILHAM_DATA);

app.whenReady().then(() => {
  prepareBundledBins();
  store = new Store(path.join(app.getPath('userData'), 'arsiv'));
  drive = new Drive(store);
  media = new Media(store, drive, (item) => send('item:changed', item));
  registerProtocol();
  setupIpc();

  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { role: 'appMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
    ]));
  }
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('before-quit', () => store?.flush());
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
