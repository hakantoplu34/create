// Keşfet: bir kelimeyi platformlarda kullanıcının kendi oturumlarıyla arar,
// sonuç sayfalarını görünmez pencerelerde açıp kartları okur.
// Platformlar paralel, bir platformun içindeki işler sırayla ve insan hızında yürür.
const fs = require('fs');
const path = require('path');
const { BrowserWindow } = require('electron');
const { partitionFor } = require('./platforms');

const enc = encodeURIComponent;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (min, max) => min + Math.random() * (max - min);

// pattern: sonuç kartının bağlantı yolu. kind: 'auto' ise yola göre karar verilir.
const PLATFORMS = {
  pinterest: {
    name: 'Pinterest', partition: partitionFor('pinterest'), login: false,
    url: (q) => `https://www.pinterest.com/search/pins/?q=${enc(q)}&rs=typed`,
    pattern: '^/pin/\\d+', kind: 'gorsel', scrolls: 3, ratio: 1.5,
  },
  instagram: {
    name: 'Instagram', partition: partitionFor('instagram'), login: true,
    url: (q) => `https://www.instagram.com/explore/search/keyword/?q=${enc(q)}`,
    fallbackUrl: (q) => `https://www.instagram.com/explore/tags/${enc(q.replace(/[\s#]+/g, '').toLocaleLowerCase('tr-TR'))}/`,
    pattern: '^/(?:[\\w.]+/)?(p|reel)/[\\w-]+', kind: 'auto', scrolls: 2, ratio: 1.25,
  },
  tiktok: {
    name: 'TikTok', partition: partitionFor('tiktok'), login: true,
    url: (q) => `https://www.tiktok.com/search/video?q=${enc(q)}`,
    pattern: '^/@[\\w.-]+/(video|photo)/\\d+', kind: 'video', scrolls: 2, ratio: 1.33,
  },
  youtube: {
    name: 'YouTube', partition: partitionFor('youtube'), login: false,
    url: (q) => `https://www.youtube.com/results?search_query=${enc(q)}`,
    custom: 'youtube', kind: 'video', scrolls: 0, ratio: 0.5625,
  },
  behance: {
    name: 'Behance', partition: partitionFor('behance'), login: false,
    url: (q) => `https://www.behance.net/search/projects?search=${enc(q)}`,
    pattern: '^/gallery/\\d+', kind: 'gorsel', scrolls: 2, ratio: 0.78,
  },
  adsoftheworld: {
    name: 'Ads of the World', partition: 'persist:genel', login: false,
    url: (q) => `https://www.adsoftheworld.com/search?q=${enc(q)}`,
    pattern: '^/campaigns/[\\w-]+', kind: 'gorsel', scrolls: 1, ratio: 0.75,
  },
};

// Sayfada çalışır. Bağlantı kalıbına uyan, içinde (ya da yakınında) görsel olan kartları toplar.
function genericExtractor(pattern, platform) {
  return `(() => {
    const re = new RegExp(${JSON.stringify(pattern)});
    const best = (img) => {
      const set = img.getAttribute('srcset') || '';
      let url = img.currentSrc || img.src || '', w = 0;
      for (const part of set.split(',')) {
        const [u, d] = part.trim().split(/\\s+/);
        const n = parseFloat(d) || 0;
        if (u && n >= w) { w = n; url = u; }
      }
      try { return new URL(url, location.href).href; } catch { return ''; }
    };
    const out = [];
    const seen = new Set();
    for (const a of document.querySelectorAll('a[href]')) {
      let u;
      try { u = new URL(a.href, location.href); } catch { continue; }
      if (u.host !== location.host && !u.host.endsWith(location.host.replace(/^www\\./, ''))) continue;
      if (!re.test(u.pathname)) continue;
      const key = u.origin + u.pathname;
      if (seen.has(key)) continue;
      let img = a.querySelector('img');
      let node = a;
      for (let i = 0; !img && i < 3 && node.parentElement; i++) {
        node = node.parentElement;
        const imgs = node.querySelectorAll('img');
        if (imgs.length === 1) img = imgs[0];
      }
      const video = a.querySelector('video');
      const src = img ? best(img) : (video && video.poster) || '';
      if (!src || src.startsWith('data:')) continue;
      const r = (img || video || a).getBoundingClientRect();
      if (r.width && r.width < 80) continue;
      seen.add(key);
      const viewsEl = a.querySelector('[data-e2e*="views"], [data-e2e*="play-count"]');
      out.push({
        platform: ${JSON.stringify(platform)},
        pageUrl: key,
        path: u.pathname,
        src,
        title: ((img && img.alt) || a.getAttribute('aria-label') || a.title || a.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 200),
        width: (img && img.naturalWidth) || Math.round(r.width) || 0,
        height: (img && img.naturalHeight) || Math.round(r.height) || 0,
        viewsText: viewsEl ? viewsEl.textContent.trim() : '',
      });
    }
    return out;
  })()`;
}

// YouTube: sayfanın kendi verisi (ytInitialData) DOM'dan daha güvenilir.
const YOUTUBE_EXTRACTOR = `(() => {
  const out = [];
  const seen = new Set();
  const text = (t) => (t && (t.simpleText || (t.runs || []).map((r) => r.text).join(''))) || '';
  const walk = (o, depth) => {
    if (!o || typeof o !== 'object' || depth > 40) return;
    if (o.videoRenderer && o.videoRenderer.videoId) {
      const v = o.videoRenderer;
      if (!seen.has(v.videoId)) {
        seen.add(v.videoId);
        const th = (v.thumbnail && v.thumbnail.thumbnails) || [];
        out.push({
          platform: 'youtube', kind: 'video',
          pageUrl: 'https://www.youtube.com/watch?v=' + v.videoId,
          src: 'https://i.ytimg.com/vi/' + v.videoId + '/hqdefault.jpg',
          poster: (th[th.length - 1] || {}).url || '',
          title: text(v.title),
          author: text(v.ownerText),
          viewsText: text(v.viewCountText),
          published: text(v.publishedTimeText),
          duration: text(v.lengthText),
          width: 16, height: 9,
        });
      }
    }
    const r = o.reelItemRenderer || null;
    if (r && r.videoId && !seen.has(r.videoId)) {
      seen.add(r.videoId);
      out.push({
        platform: 'youtube', kind: 'video',
        pageUrl: 'https://www.youtube.com/shorts/' + r.videoId,
        src: 'https://i.ytimg.com/vi/' + r.videoId + '/oar2.jpg',
        title: text(r.headline), viewsText: text(r.viewCountText), width: 9, height: 16,
      });
    }
    const s = o.shortsLockupViewModel;
    if (s) {
      const id = ((s.onTap || {}).innertubeCommand || {}).reelWatchEndpoint?.videoId || (s.entityId || '').replace(/^shorts-shelf-item-/, '');
      if (id && !seen.has(id)) {
        seen.add(id);
        out.push({
          platform: 'youtube', kind: 'video',
          pageUrl: 'https://www.youtube.com/shorts/' + id,
          src: ((s.thumbnail || {}).sources || [])[0]?.url || 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg',
          title: (s.overlayMetadata || {}).primaryText?.content || s.accessibilityText || '',
          viewsText: (s.overlayMetadata || {}).secondaryText?.content || '',
          width: 9, height: 16,
        });
      }
    }
    for (const k in o) walk(o[k], depth + 1);
  };
  walk(window.ytInitialData, 0);
  return out;
})()`;

// "1,2 Mn", "12,3 B" (Türkçe bin), "1.2M", "345K", "1.234.567 görüntüleme"
function parseCount(text) {
  if (!text) return null;
  const t = String(text).toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
  const m = t.match(/([\d.,]+)\s*(mn|milyon|mr|milyar|bin|b|k|m|bn)?/);
  if (!m) return null;
  let num = m[1];
  const unit = m[2] || '';
  if (!unit) return parseInt(num.replace(/[.,\s]/g, ''), 10) || null;
  num = parseFloat(num.replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
  const mult = { k: 1e3, bin: 1e3, b: 1e3, m: 1e6, mn: 1e6, milyon: 1e6, bn: 1e9, mr: 1e9, milyar: 1e9 }[unit] || 1;
  // İngilizce arayüzde "B" milyar demektir; YouTube/TikTok İngilizce gösterirse "views" kelimesi geçer.
  if (unit === 'b' && /views|plays/.test(t)) return Math.round(num * 1e9);
  return Math.round(num * mult);
}

const BLOCK_PATTERNS = /captcha|unusual traffic|olağan dışı|doğrulama|verify you are human|security check|checkpoint|challenge/i;

class Collector {
  constructor(store, userAgent) {
    this.store = store;
    this.ua = userAgent;
    this.hourly = new Map(); // platform -> zaman damgaları
    this.current = null;
  }

  limitFor(id) {
    return this.store.getSetting('kesfetSaatlikSinir', 30);
  }

  _takeSlot(id) {
    const now = Date.now();
    const list = (this.hourly.get(id) || []).filter((t) => now - t < 3600e3);
    if (list.length >= this.limitFor(id)) { this.hourly.set(id, list); return false; }
    list.push(now);
    this.hourly.set(id, list);
    return true;
  }

  cancel() {
    if (this.current) this.current.cancelled = true;
  }

  // terms: ['zeytin', 'olive'], platforms: ['pinterest', ...]; emit(platformId, update)
  async search(terms, platforms, emit, opts = {}) {
    this.cancel();
    const job = { cancelled: false };
    this.current = job;
    await Promise.all(platforms.filter((p) => PLATFORMS[p]).map(async (id) => {
      const p = PLATFORMS[id];
      const results = new Map();
      emit(id, { status: 'araniyor', count: 0 });
      for (let i = 0; i < terms.length; i++) {
        if (job.cancelled) return emit(id, { status: 'iptal', count: results.size });
        if (!this._takeSlot(id)) {
          return emit(id, { status: 'sinir', count: results.size, message: `${p.name} için saatlik arama sınırı doldu. Biraz sonra tekrar dene.` });
        }
        let res;
        try {
          res = await this._run(id, p, terms[i], job, opts);
        } catch (e) {
          res = { status: 'hata', message: e.message, items: [] };
        }
        for (const it of res.items) if (!results.has(it.pageUrl)) results.set(it.pageUrl, this._normalize(it, p, terms[i]));
        if (res.status !== 'tamam' && !results.size) {
          return emit(id, { status: res.status, count: 0, message: res.message, items: [] });
        }
        emit(id, { status: i === terms.length - 1 ? 'tamam' : 'araniyor', count: results.size, items: [...results.values()] });
        if (i < terms.length - 1) await sleep(jitter(2000, 4000));
      }
    }));
    if (this.current === job) this.current = null;
  }

  _normalize(it, p, term) {
    let kind = it.kind || p.kind;
    if (kind === 'auto') kind = /\/reel\//.test(it.path || it.pageUrl) ? 'video' : 'gorsel';
    let src = it.src;
    if (it.platform === 'pinterest') src = src.replace(/\/(?:\d+x|\d+x\d+)\//, '/736x/');
    const views = parseCount(it.viewsText);
    return {
      id: it.platform + ':' + it.pageUrl,
      platform: it.platform,
      kind,
      pageUrl: it.pageUrl,
      src,
      poster: it.poster || '',
      title: it.title || '',
      author: it.author || '',
      views,
      viewsText: it.viewsText || '',
      published: it.published || '',
      duration: it.duration || '',
      width: it.width || 0,
      height: it.height || 0,
      ratio: it.width && it.height ? Math.min(2, Math.max(0.5, it.height / it.width)) : p.ratio,
      partition: p.partition,
      term,
    };
  }

  async _run(id, p, term, job, opts) {
    const win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 1000,
      webPreferences: {
        partition: p.partition,
        offscreen: true,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
    const wc = win.webContents;
    wc.setAudioMuted(true);
    wc.setUserAgent(this.ua);
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    wc.setFrameRate(5);

    const load = async (url) => {
      try {
        await Promise.race([wc.loadURL(url), sleep(30000).then(() => { throw new Error('zaman aşımı'); })]);
      } catch (e) {
        // Yönlendirmelerde ERR_ABORTED gelir; sayfa yine de açılmış olabilir.
        if (!/ERR_ABORTED|zaman aşımı/.test(e.message)) throw e;
      }
      await sleep(jitter(2500, 4000));
    };

    const shot = async (suffix = '') => {
      if (!opts.debugDir) return;
      try {
        const img = await wc.capturePage();
        fs.writeFileSync(path.join(opts.debugDir, `kesfet-${id}${suffix}.png`), img.toPNG());
        const html = await wc.executeJavaScript('location.href + "\\n" + document.documentElement.outerHTML', true);
        fs.writeFileSync(path.join(opts.debugDir, `kesfet-${id}${suffix}.html`), html.slice(0, 3e6));
      } catch { /* test görüntüsü şart değil */ }
    };

    try {
      await load(p.url(term));
      let items = [];
      const read = async () => {
        const got = await wc.executeJavaScript(p.custom === 'youtube' ? YOUTUBE_EXTRACTOR : genericExtractor(p.pattern, id), true);
        const map = new Map(items.map((x) => [x.pageUrl, x]));
        for (const x of got || []) if (!map.has(x.pageUrl)) map.set(x.pageUrl, x);
        items = [...map.values()];
      };

      const check = async () => {
        const url = wc.getURL();
        const info = await wc.executeJavaScript(`({
          title: document.title,
          text: (document.body && document.body.innerText || '').slice(0, 3000),
          password: !!document.querySelector('input[type=password]'),
        })`, true).catch(() => ({ title: '', text: '', password: false }));
        if (/\/accounts\/login|\/login|\/signin|accounts\.google\.com/i.test(url)) return 'giris';
        if (/consent\.(youtube|google)\.com/.test(url)) return 'onay';
        if (BLOCK_PATTERNS.test(url) || BLOCK_PATTERNS.test(info.title)) return 'dogrulama';
        return info;
      };

      let state = await check();
      if (typeof state === 'string') {
        await shot();
        return { status: state, items: [], message: this._message(state, p) };
      }

      // Sayfalar sonuçları geç yükleyebilir: kartlar görünene kadar 12 sn'ye kadar yokla.
      await read();
      for (let t = 0; !items.length && t < 8 && !job.cancelled; t++) {
        await sleep(1500);
        await read();
      }
      if (!items.length && p.fallbackUrl) {
        await load(p.fallbackUrl(term));
        state = await check();
        if (typeof state === 'string') {
          await shot();
          return { status: state, items: [], message: this._message(state, p) };
        }
        await read();
      }
      for (let i = 0; i < p.scrolls && !job.cancelled; i++) {
        await wc.executeJavaScript('window.scrollBy(0, Math.round(innerHeight * (1.3 + Math.random() * 0.5)))', true);
        await sleep(jitter(1800, 3600));
        await read();
      }
      await shot();

      if (!items.length) {
        const s = await check();
        if (typeof s === 'string') return { status: s, items: [], message: this._message(s, p) };
        if (BLOCK_PATTERNS.test(s.text)) return { status: 'dogrulama', items: [], message: this._message('dogrulama', p) };
        if (p.login && s.password) return { status: 'giris', items: [], message: this._message('giris', p) };
        return { status: 'bos', items: [], message: `${p.name} bu arama için sonuç göstermedi.` };
      }
      return { status: 'tamam', items };
    } finally {
      if (!win.isDestroyed()) win.destroy();
    }
  }

  _message(status, p) {
    return {
      giris: `${p.name} sonuçları için giriş yapman gerekiyor.`,
      dogrulama: `${p.name} bir doğrulama istedi. Platformu tarayıcıda açıp bir kez geç, sonra tekrar ara.`,
      onay: `${p.name} çerez onayı istiyor. Tarayıcıda bir kez açıp onayla.`,
    }[status] || '';
  }
}

module.exports = { Collector, PLATFORMS, parseCount };
