// Google Drive: OAuth (masaüstü uygulaması, loopback), klasör, yükleme ve akışla okuma.
// Yalnızca drive.file kapsamı kullanılır: uygulama sadece kendi oluşturduğu dosyaları görür.
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const { Readable } = require('stream');
const { shell, safeStorage } = require('electron');

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_NAME = 'İlham Arşivi';

class Drive {
  constructor(store) {
    this.store = store;
    this._token = null; // { access_token, expiresAt }
  }

  // ---- Şifreli ayar saklama ----
  _setSecret(key, value) {
    if (!value) return this.store.setSetting(key, '');
    const enc = safeStorage.isEncryptionAvailable()
      ? 'enc:' + safeStorage.encryptString(value).toString('base64')
      : 'raw:' + Buffer.from(value).toString('base64');
    this.store.setSetting(key, enc);
  }

  _getSecret(key) {
    const v = this.store.getSetting(key, '');
    if (!v) return '';
    const [kind, b64] = [v.slice(0, 4), v.slice(4)];
    const buf = Buffer.from(b64, 'base64');
    try {
      return kind === 'enc:' ? safeStorage.decryptString(buf) : buf.toString();
    } catch {
      return '';
    }
  }

  setClient(clientId, clientSecret) {
    this._setSecret('driveClientId', clientId.trim());
    this._setSecret('driveClientSecret', clientSecret.trim());
  }

  status() {
    return {
      hasClient: !!this._getSecret('driveClientId'),
      connected: !!this._getSecret('driveRefreshToken'),
      email: this.store.getSetting('driveEmail', ''),
    };
  }

  isConnected() {
    return !!this._getSecret('driveRefreshToken');
  }

  disconnect() {
    this._setSecret('driveRefreshToken', '');
    this.store.setSetting('driveEmail', '');
    this.store.setSetting('driveFolderId', '');
    this._token = null;
  }

  // ---- OAuth: sistem tarayıcısında Google girişi, 127.0.0.1'e dönüş ----
  connect() {
    const clientId = this._getSecret('driveClientId');
    const clientSecret = this._getSecret('driveClientSecret');
    if (!clientId || !clientSecret) {
      return Promise.reject(new Error('Önce Ayarlar\'dan Google istemci kimliğini ve gizli anahtarını gir.'));
    }
    const verifier = crypto.randomBytes(48).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const state = crypto.randomBytes(16).toString('hex');

    return new Promise((resolve, reject) => {
      const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        if (url.pathname !== '/oauth') { res.writeHead(404); return res.end(); }
        const done = (ok, msg) => {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<html lang="tr"><body style="font-family:system-ui;padding:40px;background:#F5F5F3;color:#2B2E33">
            <h2>${ok ? 'Google Drive bağlandı.' : 'Bağlantı kurulamadı.'}</h2><p>${msg}</p></body></html>`);
          server.close();
        };
        try {
          if (url.searchParams.get('state') !== state) throw new Error('Güvenlik kontrolü tutmadı. Tekrar dene.');
          const err = url.searchParams.get('error');
          if (err) throw new Error('Google izni verilmedi: ' + err);
          const code = url.searchParams.get('code');
          const redirect = `http://127.0.0.1:${server.address().port}/oauth`;
          const tok = await this._tokenRequest({
            grant_type: 'authorization_code',
            code,
            code_verifier: verifier,
            redirect_uri: redirect,
            client_id: clientId,
            client_secret: clientSecret,
          });
          if (!tok.refresh_token) throw new Error('Google yenileme anahtarı vermedi. Drive erişimini Google hesabından kaldırıp tekrar dene.');
          this._setSecret('driveRefreshToken', tok.refresh_token);
          this._token = { access_token: tok.access_token, expiresAt: Date.now() + (tok.expires_in - 60) * 1000 };
          await this._loadEmail();
          await this.ensureFolder();
          done(true, 'Bu sekmeyi kapatıp İlham uygulamasına dönebilirsin.');
          resolve(this.status());
        } catch (e) {
          done(false, e.message);
          reject(e);
        }
      });
      server.listen(0, '127.0.0.1', () => {
        const redirect = `http://127.0.0.1:${server.address().port}/oauth`;
        const p = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirect,
          response_type: 'code',
          scope: SCOPE + ' email',
          access_type: 'offline',
          prompt: 'consent',
          code_challenge: challenge,
          code_challenge_method: 'S256',
          state,
        });
        shell.openExternal('https://accounts.google.com/o/oauth2/v2/auth?' + p);
      });
      setTimeout(() => { server.close(); reject(new Error('Google girişi 5 dakika içinde tamamlanmadı.')); }, 5 * 60 * 1000);
    });
  }

  async _tokenRequest(params) {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
    });
    const j = await r.json();
    if (!r.ok) throw new Error('Google anahtar isteği başarısız: ' + (j.error_description || j.error || r.status));
    return j;
  }

  async accessToken() {
    if (this._token && Date.now() < this._token.expiresAt) return this._token.access_token;
    const refresh = this._getSecret('driveRefreshToken');
    if (!refresh) throw new Error('Google Drive bağlı değil.');
    const tok = await this._tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: refresh,
      client_id: this._getSecret('driveClientId'),
      client_secret: this._getSecret('driveClientSecret'),
    });
    this._token = { access_token: tok.access_token, expiresAt: Date.now() + (tok.expires_in - 60) * 1000 };
    return this._token.access_token;
  }

  async _api(url, opts = {}) {
    const token = await this.accessToken();
    const r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + token } });
    return r;
  }

  async _loadEmail() {
    try {
      const r = await this._api('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)');
      const j = await r.json();
      this.store.setSetting('driveEmail', j.user?.emailAddress || '');
    } catch { /* e-posta gösterimi şart değil */ }
  }

  async ensureFolder() {
    const existing = this.store.getSetting('driveFolderId', '');
    if (existing) {
      const r = await this._api(`https://www.googleapis.com/drive/v3/files/${existing}?fields=id,trashed`);
      if (r.ok) {
        const j = await r.json();
        if (!j.trashed) return existing;
      }
    }
    const r = await this._api('https://www.googleapis.com/drive/v3/files?fields=id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error('Drive klasörü oluşturulamadı: ' + (j.error?.message || r.status));
    this.store.setSetting('driveFolderId', j.id);
    return j.id;
  }

  // Büyük videolar için kesintisiz (resumable) yükleme; dosya bellekte tutulmaz.
  async upload(filePath, name, mime, onProgress) {
    const folderId = await this.ensureFolder();
    const size = fs.statSync(filePath).size;
    const init = await this._api('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mime,
        'X-Upload-Content-Length': String(size),
      },
      body: JSON.stringify({ name, parents: [folderId] }),
    });
    if (!init.ok) throw new Error('Drive yüklemesi başlatılamadı: ' + init.status);
    const location = init.headers.get('location');

    let sent = 0;
    const stream = fs.createReadStream(filePath);
    stream.on('data', (c) => { sent += c.length; onProgress?.(sent / size); });
    const r = await fetch(location, {
      method: 'PUT',
      headers: { 'Content-Type': mime, 'Content-Length': String(size) },
      body: Readable.toWeb(stream),
      duplex: 'half',
    });
    const j = await r.json();
    if (!r.ok) throw new Error('Drive yüklemesi başarısız: ' + (j.error?.message || r.status));
    return j.id;
  }

  // Oynatıcı için akış: Range başlığını aynen Drive'a iletir.
  async stream(fileId, range) {
    const headers = range ? { Range: range } : {};
    return this._api(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers });
  }

  async remove(fileId) {
    // Kalıcı silme yerine çöp kutusuna taşı: 30 gün geri alınabilir.
    await this._api(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
    });
  }
}

module.exports = { Drive };
