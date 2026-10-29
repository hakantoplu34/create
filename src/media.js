// Kaydetme hattı: indir, aynısı var mı bak, kapak üret, Drive'a yükle.
// İşler sırayla yürür; platformlara art arda istek atılmaz.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { session, nativeImage } = require('electron');

const BIN_DIRS = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', 'C:\\ffmpeg\\bin', 'C:\\yt-dlp'];

// Uygulamayla gelen yt-dlp ve ffmpeg önce aranır; yoksa sistemdekiler.
function bundledBinDir() {
  const packaged = process.resourcesPath && path.join(process.resourcesPath, 'bin');
  if (packaged && fs.existsSync(packaged)) return packaged;
  const dev = path.join(__dirname, '..', 'bin', process.arch);
  return fs.existsSync(dev) ? dev : null;
}

function findBin(name) {
  const exe = process.platform === 'win32' ? name + '.exe' : name;
  const dirs = [bundledBinDir(), ...(process.env.PATH || '').split(path.delimiter), ...BIN_DIRS].filter(Boolean);
  for (const d of dirs) {
    const p = path.join(d, exe);
    try { fs.accessSync(p, fs.constants.X_OK); return p; } catch { /* sıradaki */ }
  }
  return null;
}

function run(bin, args, timeoutMs = 10 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message).toString().split('\n').filter(Boolean).slice(-2).join(' ')));
      else resolve(stdout.toString());
    });
  });
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(file).on('data', (c) => h.update(c)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };

class Media {
  constructor(store, drive, onChange) {
    this.store = store;
    this.drive = drive;
    this.onChange = onChange;
    this.queue = [];
    this.busy = false;
    this.mediaDir = path.join(store.dir, 'medya'); // Drive bağlı değilken
    fs.mkdirSync(this.mediaDir, { recursive: true });
  }

  tools() {
    return { ffmpeg: !!findBin('ffmpeg'), ytdlp: !!findBin('yt-dlp') };
  }

  _emit(item) {
    this.onChange?.(item);
  }

  _set(id, patch) {
    const item = this.store.updateItem(id, patch);
    if (item) this._emit(item);
    return item;
  }

  // Gömülü tarayıcıdan gelen kayıt isteği.
  save(payload) {
    const key = payload.kind === 'video' ? payload.pageUrl : payload.src;
    const existing = key && this.store.findBySource(key);
    if (existing) return { item: existing, duplicate: true };

    const item = this.store.addItem({
      type: payload.kind === 'video' ? 'video' : 'gorsel',
      platform: payload.platform || 'diger',
      title: (payload.title || '').slice(0, 200),
      sourceUrl: key || '',
      pageUrl: payload.pageUrl || '',
      width: payload.width || 0,
      height: payload.height || 0,
      boardHint: payload.boardId || '',
      partition: payload.partition || '',
    });
    this._emit(item);
    this.queue.push({ id: item.id, payload });
    this._next();
    return { item, duplicate: false };
  }

  // Bilgisayardan sürüklenen dosya.
  saveLocalFile(filePath) {
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const isVideo = ['mp4', 'mov', 'webm', 'm4v'].includes(ext);
    const item = this.store.addItem({
      type: isVideo ? 'video' : 'gorsel',
      platform: 'dosya',
      title: path.basename(filePath, path.extname(filePath)),
    });
    this._emit(item);
    this.queue.push({ id: item.id, localPath: filePath });
    this._next();
    return item;
  }

  retry(id) {
    const item = this.store.getItem(id);
    if (!item || item.status !== 'hata') return;
    this._set(id, { status: 'bekliyor', error: '' });
    this.queue.push({
      id,
      payload: {
        kind: item.type === 'video' ? 'video' : 'gorsel',
        src: item.type === 'video' ? '' : item.sourceUrl,
        pageUrl: item.pageUrl,
        partition: item.partition || 'persist:' + item.platform,
      },
    });
    this._next();
  }

  async _next() {
    if (this.busy || !this.queue.length) return;
    this.busy = true;
    const job = this.queue.shift();
    try {
      await this._process(job);
    } catch (e) {
      this._set(job.id, { status: 'hata', error: e.message });
    } finally {
      this.busy = false;
      // İki iş arasında kısa, rastgele bekleme.
      setTimeout(() => this._next(), 800 + Math.random() * 1500);
    }
  }

  async _process(job) {
    const { id } = job;
    let tmp;
    let mime;

    this._set(id, { status: 'indiriliyor', error: '' });
    if (job.localPath) {
      const ext = path.extname(job.localPath).slice(1).toLowerCase();
      mime = Object.keys(EXT).find((m) => EXT[m] === ext) || (ext === 'm4v' ? 'video/mp4' : 'application/octet-stream');
      tmp = path.join(this.store.cacheDir, `${id}.${ext}`);
      fs.copyFileSync(job.localPath, tmp);
    } else {
      ({ tmp, mime } = await this._download(id, job.payload));
    }

    // Aynı dosya daha önce kaydedildiyse ikinci kopyayı tutma.
    const hash = await sha256File(tmp);
    const twin = this.store.findByHash(hash);
    if (twin && twin.id !== id) {
      fs.rmSync(tmp, { force: true });
      const hint = this.store.getItem(id)?.boardHint;
      if (hint) this.store.placeInBoard(hint, twin.id);
      this.store.removeItem(id);
      this.onChange?.({ id, removed: true, duplicateOf: twin.id });
      return;
    }

    const size = fs.statSync(tmp).size;
    const item = this.store.getItem(id);
    const thumb = await this._thumbnail(id, tmp, item.type, job.payload);
    this._set(id, { hash, mime, size, thumb: thumb.file, width: item.width || thumb.width, height: item.height || thumb.height });

    if (item.boardHint) this.store.placeInBoard(item.boardHint, id);

    if (this.drive.isConnected()) {
      this._set(id, { status: 'yukleniyor', progress: 0 });
      const name = `${(item.title || item.platform || 'ilham').replace(/[\\/:*?"<>|]/g, ' ').slice(0, 80)} ${id.slice(0, 8)}.${EXT[mime] || 'bin'}`;
      let last = 0;
      const driveId = await this.drive.upload(tmp, name, mime, (p) => {
        if (p - last > 0.05) { last = p; this._set(id, { progress: p }); }
      });
      this._keepInCache(tmp);
      this._set(id, { driveId, status: 'tamam', progress: 1, localFile: '' });
    } else {
      const dest = path.join(this.mediaDir, path.basename(tmp));
      fs.renameSync(tmp, dest);
      this._set(id, { localFile: dest, status: 'tamam' });
    }
  }

  async _download(id, p) {
    const ses = session.fromPartition(p.partition || 'persist:diger');
    const isDirect = p.src && /^https?:/i.test(p.src);

    if (p.kind !== 'video' && isDirect) {
      const r = await ses.fetch(p.src, { headers: p.pageUrl ? { Referer: p.pageUrl } : {} });
      if (!r.ok) throw new Error(`Görsel indirilemedi (${r.status}).`);
      const mime = (r.headers.get('content-type') || 'image/jpeg').split(';')[0];
      const tmp = path.join(this.store.cacheDir, `${id}.${EXT[mime] || 'jpg'}`);
      fs.writeFileSync(tmp, Buffer.from(await r.arrayBuffer()));
      return { tmp, mime };
    }

    // Video: doğrudan mp4 bağlantısı varsa onu, yoksa yt-dlp'yi oturum çerezleriyle kullan.
    if (isDirect && /\.(mp4|webm|mov)(\?|$)/i.test(p.src)) {
      const r = await ses.fetch(p.src, { headers: p.pageUrl ? { Referer: p.pageUrl } : {} });
      if (r.ok) {
        const mime = (r.headers.get('content-type') || 'video/mp4').split(';')[0];
        const tmp = path.join(this.store.cacheDir, `${id}.${EXT[mime] || 'mp4'}`);
        fs.writeFileSync(tmp, Buffer.from(await r.arrayBuffer()));
        return { tmp, mime };
      }
    }

    const ytdlp = findBin('yt-dlp');
    if (!ytdlp) throw new Error('Video indirmek için yt-dlp gerekli. Kurulum: Terminal\'de "brew install yt-dlp ffmpeg".');
    if (!p.pageUrl) throw new Error('Videonun sayfa adresi bulunamadı.');

    const cookieFile = path.join(this.store.cacheDir, `${id}.cookies.txt`);
    await this._exportCookies(ses, cookieFile);
    const outTpl = path.join(this.store.cacheDir, `${id}.%(ext)s`);
    const args = [
      '--cookies', cookieFile,
      '--no-playlist',
      '-f', 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b',
      '--merge-output-format', 'mp4',
      '-o', outTpl,
      p.pageUrl,
    ];
    const ffmpeg = findBin('ffmpeg');
    if (ffmpeg) args.unshift('--ffmpeg-location', ffmpeg);
    try {
      await run(ytdlp, args);
    } finally {
      fs.rmSync(cookieFile, { force: true });
    }
    const file = fs.readdirSync(this.store.cacheDir).find((f) => f.startsWith(id + '.') && !f.endsWith('.part') && !f.endsWith('.txt'));
    if (!file) throw new Error('Video indirilemedi. Sayfa açık ve oturum geçerli mi, kontrol et.');
    const ext = path.extname(file).slice(1);
    return { tmp: path.join(this.store.cacheDir, file), mime: Object.keys(EXT).find((m) => EXT[m] === ext) || 'video/mp4' };
  }

  // yt-dlp'nin okuyabileceği Netscape çerez dosyası.
  async _exportCookies(ses, file) {
    const cookies = await ses.cookies.get({});
    const lines = ['# Netscape HTTP Cookie File'];
    for (const c of cookies) {
      const domain = c.domain.startsWith('.') || !c.hostOnly ? (c.domain.startsWith('.') ? c.domain : '.' + c.domain) : c.domain;
      lines.push([domain, domain.startsWith('.') ? 'TRUE' : 'FALSE', c.path || '/', c.secure ? 'TRUE' : 'FALSE', Math.floor(c.expirationDate || 0), c.name, c.value].join('\t'));
    }
    fs.writeFileSync(file, lines.join('\n') + '\n', { mode: 0o600 });
  }

  async _thumbnail(id, file, type, payload) {
    const out = path.join(this.store.thumbDir, `${id}.jpg`);
    let buf = null;

    if (type === 'video') {
      const ffmpeg = findBin('ffmpeg');
      if (ffmpeg) {
        const frame = path.join(this.store.cacheDir, `${id}.frame.png`);
        try {
          await run(ffmpeg, ['-y', '-ss', '1', '-i', file, '-frames:v', '1', frame], 60 * 1000);
          buf = fs.readFileSync(frame);
        } catch { /* afişe düş */ } finally { fs.rmSync(frame, { force: true }); }
      }
      if (!buf && payload?.poster && /^https?:/.test(payload.poster)) {
        try {
          const r = await session.fromPartition(payload.partition || 'persist:diger').fetch(payload.poster);
          if (r.ok) buf = Buffer.from(await r.arrayBuffer());
        } catch { /* kapaksız devam */ }
      }
    } else {
      buf = fs.readFileSync(file);
    }

    if (!buf) return { file: '', width: 0, height: 0 };
    let img = nativeImage.createFromBuffer(buf);
    if (img.isEmpty()) return { file: '', width: 0, height: 0 };
    const size = img.getSize();
    if (size.width > 480) img = img.resize({ width: 480, quality: 'good' });
    fs.writeFileSync(out, img.toJPEG(82));
    return { file: path.basename(out), width: size.width, height: size.height };
  }

  // Son açılan/yüklenen dosyalar için sınırlı önbellek.
  _keepInCache(file) {
    const limit = this.store.getSetting('cacheLimitMb', 2048) * 1024 * 1024;
    const files = fs.readdirSync(this.store.cacheDir)
      .filter((f) => !f.endsWith('.part') && !f.endsWith('.txt'))
      .map((f) => {
        const p = path.join(this.store.cacheDir, f);
        const st = fs.statSync(p);
        return { p, size: st.size, t: st.atimeMs };
      })
      .sort((a, b) => b.t - a.t);
    let total = 0;
    for (const f of files) {
      total += f.size;
      if (total > limit && f.p !== file) fs.rmSync(f.p, { force: true });
    }
  }

  cachedFile(item) {
    if (!item) return null;
    const p = path.join(this.store.cacheDir, `${item.id}.${EXT[item.mime] || 'bin'}`);
    return fs.existsSync(p) ? p : null;
  }
}

// Mac: dmg'den kopyalanan gömülü araçlar karantina işaretiyle gelir; kaldırılmazsa çalışmazlar.
function prepareBundledBins() {
  const dir = bundledBinDir();
  if (!dir || process.platform !== 'darwin') return;
  for (const f of fs.readdirSync(dir)) {
    try { fs.chmodSync(path.join(dir, f), 0o755); } catch { /* salt okunur olabilir */ }
  }
  execFile('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', dir], () => {});
}

module.exports = { Media, findBin, prepareBundledBins };
