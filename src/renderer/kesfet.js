/* Keşfet: tek aramayla platformlarda toplu arama. app.js'teki yardımcıları kullanır. */
const kesfet = {
  platforms: [],
  selected: new Set(),
  searchId: 0,
  status: {},   // platform -> { status, count, message }
  results: {},  // platform -> [sonuç]
  saved: new Map(), // sonuç id -> arşiv kaydı id
  running: false,
  query: '',
};

const K_STATUS = {
  araniyor: ['aranıyor', 'busy'],
  tamam: ['', 'ok'],
  bos: ['sonuç yok', ''],
  giris: ['giriş gerekli', 'bad'],
  dogrulama: ['doğrulama istedi', 'bad'],
  onay: ['onay istiyor', 'bad'],
  sinir: ['sınır doldu', 'bad'],
  hata: ['okunamadı', 'bad'],
  iptal: ['durduruldu', ''],
};

function kAccountOk(id) {
  return state.accountStatus[id] === 'bagli';
}

function kRenderPlatforms() {
  $('#kPlatforms').replaceChildren(...kesfet.platforms.map((p) => {
    const ok = !p.login || kAccountOk(p.id);
    return h('button', {
      type: 'button', class: 'k-plat', 'aria-pressed': String(kesfet.selected.has(p.id)),
      title: p.login && !ok ? `${p.name}: giriş yapılmadı, sonuç gelmeyebilir` : p.name,
      onclick: () => {
        if (kesfet.selected.has(p.id)) kesfet.selected.delete(p.id); else kesfet.selected.add(p.id);
        try { localStorage.setItem('kesfetPlatformlar', JSON.stringify([...kesfet.selected])); } catch { /* önemli değil */ }
        kRenderPlatforms();
      },
    }, h('span', { class: `dot ${p.login ? (ok ? 'ok' : '') : 'ok'}` }), p.name);
  }));
}

function kRenderBoards() {
  const sel = $('#kBoard');
  const cur = sel.value;
  sel.replaceChildren(h('option', { value: '', text: 'Panoya ekleme' }), ...state.boards.map((b) => h('option', { value: b.id, text: b.name })));
  sel.value = state.boards.some((b) => b.id === cur) ? cur : '';
}

function kRenderStatus() {
  const ids = Object.keys(kesfet.status);
  $('#kBar').hidden = !ids.length;
  $('#kStatus').replaceChildren(...ids.map((id) => {
    const p = kesfet.platforms.find((x) => x.id === id);
    const s = kesfet.status[id];
    const [label, cls] = K_STATUS[s.status] || ['', ''];
    const el = h('span', { class: `k-st ${cls}`, title: s.message || '' },
      h('span', { class: 'dot' }),
      h('b', { text: p ? p.name : id }),
      s.status === 'tamam' || (s.status === 'araniyor' && s.count) ? ` ${s.count}` : '',
      label ? ` ${label}` : '');
    if (['giris', 'dogrulama', 'onay'].includes(s.status) && p) {
      const acc = state.accounts.find((a) => a.id === id);
      el.append(' ', h('button', {
        type: 'button', text: s.status === 'giris' ? 'Giriş yap' : 'Aç',
        onclick: () => openTab(acc ? acc.url : 'https://' + id + '.com', p.partition, p.name),
      }));
    }
    return el;
  }));
  $('#kStop').hidden = !kesfet.running;
  $('#kGo').hidden = kesfet.running;
}

function kAllResults() {
  const lists = kesfet.platforms.map((p) => kesfet.results[p.id] || []).filter((l) => l.length);
  const sort = $('#kSort').value;
  if (sort === 'platform') return lists.flat();
  if (sort === 'izlenme') return lists.flat().sort((a, b) => (b.views ?? -1) - (a.views ?? -1));
  // Karışık: platformlar sırayla, her birinden birer sonuç.
  const out = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (l[i]) out.push(l[i]);
  return out;
}

function kInArchive(r) {
  if (kesfet.saved.has(r.id)) return kesfet.saved.get(r.id);
  for (const it of state.items.values()) {
    if (it.pageUrl && it.pageUrl === r.pageUrl) return it.id;
    if (it.sourceUrl && (it.sourceUrl === r.src || it.sourceUrl === r.pageUrl)) return it.id;
  }
  return null;
}

const kViews = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '').replace('.', ',') + ' Mn' : n >= 1e3 ? Math.round(n / 1e3) + ' B' : String(n));

function kCard(r) {
  const p = kesfet.platforms.find((x) => x.id === r.platform);
  const card = h('div', {
    class: 'card', tabindex: 0, style: `aspect-ratio: 1 / ${r.ratio}`,
    'aria-label': r.title || p?.name || 'Sonuç',
    onclick: (e) => { if (!e.target.closest('button')) openTab(r.pageUrl, r.partition, r.title || p?.name); },
    onkeydown: (e) => { if (e.key === 'Enter' && e.target === card) openTab(r.pageUrl, r.partition, r.title || p?.name); },
  });
  const img = h('img', { src: r.src, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', draggable: 'false' });
  img.addEventListener('error', () => {
    if (r.poster && img.src !== r.poster) img.src = r.poster;
    else img.classList.add('broken');
  });
  card.append(img);
  if (r.kind === 'video') card.append(h('span', { class: 'badge' }, icon(ICON_PLAY), r.duration || 'Video'));
  if (r.views) card.append(h('span', { class: 'k-views', text: `${kViews(r.views)} izlenme` }));
  card.append(h('div', { class: 'info' },
    h('div', { class: 't', text: r.title || 'Başlıksız' }),
    h('div', { class: 'p', text: [p?.name, r.author, r.published].filter(Boolean).join(', ') })));
  kFillSaveState(card, r);
  return card;
}

function kFillSaveState(card, r) {
  card.querySelector('.k-acts, .k-saved')?.remove();
  if (kInArchive(r)) {
    card.append(h('span', { class: 'k-saved', text: 'Arşivde' }));
    return;
  }
  card.append(h('div', { class: 'k-acts' },
    h('button', { type: 'button', class: 'primary', text: 'Kaydet', onclick: (e) => kSave(r, card, e.currentTarget) })));
}

async function kSave(r, card, btn) {
  btn.disabled = true;
  btn.textContent = 'Kaydediliyor';
  const boardId = $('#kBoard').value || '';
  try {
    const res = await api.save({
      kind: r.kind, src: r.kind === 'video' ? '' : (r.platform === 'pinterest' ? r.src.replace('/474x/', '/736x/') : r.src), poster: r.kind === 'video' ? (r.src || r.poster) : '',
      pageUrl: r.pageUrl, title: r.title, width: r.width, height: r.height, partition: r.partition, boardId,
    });
    kesfet.saved.set(r.id, res.item.id);
    state.items.set(res.item.id, res.item);
    if (boardId) {
      const b = boardById(boardId);
      if (b && !b.itemIds.includes(res.item.id)) {
        if (res.duplicate) await api.placeInBoard(b.id, res.item.id, -1);
        b.itemIds.push(res.item.id);
        renderBoards();
      }
    }
    kFillSaveState(card, r);
    toast(res.duplicate ? 'Bu iş zaten arşivde.' : boardId ? `Arşive ve "${boardById(boardId)?.name}" panosuna eklendi.` : 'Arşive eklendi, arka planda indiriliyor.');
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Kaydet';
    toast('Kaydedilemedi: ' + err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
  }
}

let kRenderTimer;
function kRenderGrid() {
  clearTimeout(kRenderTimer);
  kRenderTimer = setTimeout(() => {
    const items = kAllResults();
    const grid = $('#kGrid');
    $('#kEmpty').hidden = items.length > 0 || kesfet.running;
    grid.hidden = !items.length;
    const width = grid.clientWidth || (window.innerWidth - 300);
    const cols = Math.max(2, Math.floor((width - 64) / 214));
    const colEls = Array.from({ length: cols }, () => h('div', { class: 'col' }));
    const heights = new Array(cols).fill(0);
    for (const r of items) {
      const i = heights.indexOf(Math.min(...heights));
      heights[i] += r.ratio + 0.08;
      colEls[i].append(kCard(r));
    }
    grid.replaceChildren(...colEls);
    if (!items.length && !kesfet.running && Object.keys(kesfet.status).length) {
      $('#kEmpty').replaceChildren(
        h('h2', { text: 'Bu aramada sonuç gelmedi' }),
        h('p', { text: 'Daha genel bir kelime dene, İngilizcesini ekle (zeytin, olive) ya da üstteki durumlara bak: giriş gereken platformlar varsa giriş yap.' }));
      $('#kEmpty').hidden = false;
    }
  }, 120);
}

async function kSearch(e) {
  e?.preventDefault();
  const terms = $('#kInput').value.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 3);
  if (!terms.length) { $('#kInput').focus(); return; }
  if (!kesfet.selected.size) return toast('En az bir platform seç.');
  kesfet.searchId += 1;
  kesfet.query = terms.join(', ');
  kesfet.status = {};
  kesfet.results = {};
  for (const id of kesfet.selected) kesfet.status[id] = { status: 'araniyor', count: 0 };
  kesfet.running = true;
  $('#kEmpty').hidden = true;
  kRenderStatus();
  kRenderGrid();
  const order = kesfet.platforms.map((p) => p.id).filter((id) => kesfet.selected.has(id));
  await api.discover(kesfet.searchId, terms, order);
}

api.onDiscover((u) => {
  if (u.searchId !== kesfet.searchId) return;
  if (u.done) {
    kesfet.running = false;
    kRenderStatus();
    kRenderGrid();
    return;
  }
  kesfet.status[u.platform] = { status: u.status, count: u.count, message: u.message };
  if (u.items) kesfet.results[u.platform] = u.items;
  kRenderStatus();
  if (u.items) kRenderGrid();
});

$('#kForm').addEventListener('submit', kSearch);
$('#kStop').addEventListener('click', () => api.cancelDiscover());
$('#kSort').addEventListener('change', kRenderGrid);

let kResizeCols = 0;
window.addEventListener('resize', () => {
  if (state.view !== 'kesfet') return;
  const cols = Math.max(2, Math.floor((($('#kGrid').clientWidth || 1000) - 64) / 214));
  if (cols !== kResizeCols) { kResizeCols = cols; kRenderGrid(); }
});

async function kInit() {
  kesfet.platforms = await api.discoverPlatforms();
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('kesfetPlatformlar') || 'null'); } catch { /* yok say */ }
  const ids = kesfet.platforms.map((p) => p.id);
  const defaults = kesfet.platforms.filter((p) => !p.login || kAccountOk(p.id)).map((p) => p.id);
  kesfet.selected = new Set((Array.isArray(saved) ? saved : defaults).filter((id) => ids.includes(id)));
  kRenderPlatforms();
}

function renderKesfet() {
  kRenderBoards();
  kRenderPlatforms();
  api.accountStatus().then((st) => { state.accountStatus = st; kRenderPlatforms(); });
  if (Object.keys(kesfet.results).length) kRenderGrid();
  setTimeout(() => $('#kInput').focus(), 0);
}
