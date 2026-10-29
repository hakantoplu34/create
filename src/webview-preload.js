// Gömülü tarayıcıda çalışır: imleç altındaki görsel ya da videonun köşesine
// "Arşive kaydet" butonu koyar. Sitenin kendi katmanları (Pinterest, Instagram)
// görselin üstünü kapattığı için hedef, imlecin altındaki tüm katmanlardan bulunur.
const { ipcRenderer } = require('electron');

const MIN = 140; // bundan küçük görselleri (ikon, avatar) atla
let host;
let btn;
let toast;
let target = null;
let hideTimer;

function ui() {
  if (host) return;
  host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `
    <style>
      button{position:fixed;display:none;pointer-events:auto;font:600 13px/1 system-ui,-apple-system,sans-serif;
        background:#EE3525;color:#fff;border:0;border-radius:8px;padding:10px 14px;cursor:pointer;
        box-shadow:0 4px 14px rgba(0,0,0,.25)}
      button:hover{background:#D42C1D}
      button:focus-visible{outline:2px solid #fff;outline-offset:2px}
      .t{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);display:none;pointer-events:none;
        background:#2B2E33;color:#fff;font:500 13px/1.4 system-ui,-apple-system,sans-serif;padding:10px 16px;border-radius:8px;
        box-shadow:0 4px 14px rgba(0,0,0,.3)}
    </style>
    <button type="button">Arşive kaydet</button><div class="t" role="status"></div>`;
  btn = root.querySelector('button');
  toast = root.querySelector('.t');
  btn.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  btn.addEventListener('mouseleave', scheduleHide);
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (target) save(target);
  });
  (document.documentElement || document.body).appendChild(host);
}

function scheduleHide() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { if (btn) btn.style.display = 'none'; target = null; }, 400);
}

function bestFromSrcset(img) {
  const set = img.getAttribute('srcset');
  if (!set) return img.currentSrc || img.src;
  let best = { w: 0, url: img.currentSrc || img.src };
  for (const part of set.split(',')) {
    const [url, d] = part.trim().split(/\s+/);
    const w = parseFloat(d) || 0;
    if (url && w >= best.w) best = { w, url };
  }
  return new URL(best.url, location.href).href;
}

// Instagram/TikTok/YouTube'da videonun kalıcı sayfa adresi.
function permalinkFor(el) {
  const patterns = /\/(p|reel|reels|tv)\/|\/video\/|\/watch\?|\/shorts\/|\/pin\//;
  let node = el;
  if (patterns.test(location.href)) return location.href;
  for (let i = 0; node && i < 12; i++, node = node.parentElement) {
    const a = node.matches?.('a[href]') ? node : node.querySelector?.('a[href]');
    if (a && patterns.test(a.href)) return a.href;
  }
  return '';
}

function metaContent(prop) {
  return document.querySelector(`meta[property="${prop}"],meta[name="${prop}"]`)?.content || '';
}

function payloadFor(el) {
  const title = (el.alt || el.getAttribute('aria-label') || metaContent('og:title') || document.title || '').trim();
  if (el.tagName === 'VIDEO') {
    const src = el.currentSrc || el.src || el.querySelector('source')?.src || '';
    // Akış sayfasında (feed) videonun kendi adresi yoksa, doğrudan dosya da yoksa kaydedilemez.
    const permalink = permalinkFor(el) || (/^https?:/.test(src) ? location.href : '');
    return {
      kind: 'video',
      src,
      poster: el.poster || metaContent('og:image'),
      pageUrl: permalink,
      title,
      width: el.videoWidth,
      height: el.videoHeight,
    };
  }
  return {
    kind: 'gorsel',
    src: bestFromSrcset(el),
    pageUrl: permalinkFor(el) || location.href,
    // Görselde anahtar her zaman dosya adresi olduğu için akış sayfası adresi sorun değil.
    title,
    width: el.naturalWidth,
    height: el.naturalHeight,
  };
}

function save(el) {
  const p = payloadFor(el);
  if (!p.src && p.kind === 'gorsel') return showToast('Bu görselin adresi okunamadı.');
  if (p.kind === 'video' && !p.pageUrl) return showToast('Videoyu kendi sayfasında aç, sonra kaydet.');
  btn.textContent = 'Kaydediliyor';
  ipcRenderer.sendToHost('ilham-save', p);
}

function showToast(msg) {
  ui();
  toast.textContent = msg;
  toast.style.display = 'block';
  clearTimeout(showToast.t);
  showToast.t = setTimeout(() => { toast.style.display = 'none'; }, 2600);
}

ipcRenderer.on('ilham-saved', (_e, res) => {
  if (btn) btn.textContent = 'Arşive kaydet';
  showToast(res.message);
});

// Üst çubuktaki "Sayfayı kaydet": ekrandaki en büyük video, yoksa en büyük görsel, yoksa paylaşım görseli.
ipcRenderer.on('ilham-save-page', () => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width >= MIN && r.height >= MIN && r.bottom > 0 && r.top < innerHeight ? r.width * r.height : 0;
  };
  const pick = (list) => list.map((el) => [el, visible(el)]).filter(([, a]) => a).sort((a, b) => b[1] - a[1])[0]?.[0];
  const el = pick([...document.querySelectorAll('video')]) || pick([...document.querySelectorAll('img')]);
  if (el) { ui(); return save(el); }
  const og = metaContent('og:video') || metaContent('og:image');
  if (og) {
    ipcRenderer.sendToHost('ilham-save', {
      kind: metaContent('og:video') ? 'video' : 'gorsel',
      src: og,
      poster: metaContent('og:image'),
      pageUrl: location.href,
      title: metaContent('og:title') || document.title,
    });
  } else {
    showToast('Bu sayfada kaydedilecek görsel ya da video bulunamadı.');
  }
});

let raf = 0;
window.addEventListener('mousemove', (e) => {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    ui();
    const path = document.elementsFromPoint(e.clientX, e.clientY);
    if (path.includes(host)) return;
    const el = path.find((n) => n.tagName === 'VIDEO' || (n.tagName === 'IMG' && n.complete));
    if (!el) return scheduleHide();
    const r = el.getBoundingClientRect();
    if (r.width < MIN || r.height < MIN) return scheduleHide();
    clearTimeout(hideTimer);
    target = el;
    btn.style.display = 'block';
    btn.style.top = Math.max(8, r.top + 10) + 'px';
    btn.style.left = Math.min(innerWidth - 140, r.right - 130) + 'px';
  });
}, { passive: true, capture: true });

window.addEventListener('scroll', scheduleHide, { passive: true, capture: true });
