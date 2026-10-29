/* İlham arayüzü. Çerçeve yok; DOM'a doğrudan yazılır. */
const api = window.ilham;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style') el.style.cssText = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null) el.append(kid);
  return el;
}

function icon(path) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = path;
  return s;
}
const ICON_X = '<path d="M6 6l12 12M18 6L6 18"/>';
const ICON_PLAY = '<path d="M8 5v14l11-7z"/>';

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const tarih = (iso) => { const d = new Date(iso); return `${d.getDate()} ${AYLAR[d.getMonth()]} ${d.getFullYear()}`; };
const boyut = (b) => (b > 1e9 ? (b / 1e9).toFixed(1).replace('.', ',') + ' GB' : b > 1e6 ? Math.round(b / 1e6) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB');
const trLower = (s) => (s || '').toLocaleLowerCase('tr-TR');

const PLATFORM_ADI = {
  instagram: 'Instagram', pinterest: 'Pinterest', tiktok: 'TikTok', youtube: 'YouTube', behance: 'Behance', linkedin: 'LinkedIn',
  adsoftheworld: 'Ads of the World', lovethework: 'Cannes Lions', dandad: 'D&AD', oneshow: 'The One Show',
  metaads: 'Meta Reklam Kütüphanesi', tiktokcc: 'TikTok Creative Center', dosya: 'Bilgisayardan', web: 'Web', diger: 'Diğer',
};
const DURUM = { bekliyor: 'Sırada', indiriliyor: 'İndiriliyor', yukleniyor: "Drive'a yükleniyor" };

const state = {
  items: new Map(),
  boards: [],
  view: 'arsiv',
  boardId: null,
  q: '',
  type: '',
  platform: '',
  accounts: [],
  sources: [],
  accountStatus: {},
  drive: {},
  tools: {},
  tabs: [],
  activeTab: null,
  detailId: null,
};

/* ---------------- Bildirim ---------------- */
let toastTimer;
function toast(msg, undo) {
  const el = $('#toast');
  el.replaceChildren(h('span', { text: msg }));
  if (undo) el.append(h('button', { text: 'Geri al', onclick: () => { undo(); el.hidden = true; } }));
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, undo ? 6000 : 3000);
}

/* ---------------- Görünümler ---------------- */
function show(view, boardId = null) {
  state.view = view;
  if (view === 'arsiv') state.boardId = boardId;
  for (const v of ['arsiv', 'tarayici', 'hesaplar', 'ayarlar']) $(`#view-${v}`).hidden = v !== view;
  for (const b of $$('.nav-btn')) {
    if (b.dataset.view === view && !(view === 'arsiv' && state.boardId)) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  }
  renderBoards();
  if (view === 'arsiv') renderGrid();
  if (view === 'hesaplar') refreshAccounts();
  if (view === 'ayarlar') renderSettings();
  if (view === 'tarayici') renderTabs();
}

/* ---------------- Panolar (kenar çubuğu) ---------------- */
function boardById(id) { return state.boards.find((b) => b.id === id); }

let drag = null; // { kind: 'item'|'board', id, fromBoard }

function renderBoards() {
  const list = $('#boardList');
  list.replaceChildren();
  $('#boardsEmpty').hidden = state.boards.length > 0;
  for (const b of state.boards) {
    const li = h('li', {
      class: 'board-item', tabindex: 0, draggable: 'true', 'data-id': b.id,
      'aria-current': state.view === 'arsiv' && state.boardId === b.id ? 'page' : null,
      onclick: () => show('arsiv', b.id),
      onkeydown: (e) => { if (e.key === 'Enter') show('arsiv', b.id); },
      ondragstart: (e) => {
        drag = { kind: 'board', id: b.id };
        e.dataTransfer.setData('application/x-ilham-board', b.id);
        e.dataTransfer.effectAllowed = 'move';
        li.classList.add('dragging');
      },
      ondragend: () => { li.classList.remove('dragging'); drag = null; clearDropMarks(); },
      ondragover: (e) => {
        if (!drag) return;
        if (drag.kind === 'board' && drag.id !== b.id) { e.preventDefault(); clearDropMarks(); li.classList.add('drop-before'); }
        if (drag.kind === 'item' && drag.fromBoard !== b.id) { e.preventDefault(); clearDropMarks(); li.classList.add('drop-hit'); }
      },
      ondragleave: () => li.classList.remove('drop-hit', 'drop-before'),
      ondrop: (e) => { e.preventDefault(); onDropOnBoard(b.id, e.altKey); },
    },
    h('span', { class: 'name', text: b.name }),
    h('span', { class: 'n', text: String(b.itemIds.length) }));
    list.append(li);
  }
  $('#saveBoard').replaceChildren(
    h('option', { value: '', text: 'Panoya ekleme' }),
    ...state.boards.map((b) => h('option', { value: b.id, text: b.name })),
  );
}

function clearDropMarks() {
  $$('.drop-hit,.drop-before').forEach((el) => el.classList.remove('drop-hit', 'drop-before'));
}

async function onDropOnBoard(targetId, copy) {
  clearDropMarks();
  if (!drag) return;
  const d = drag;
  drag = null;
  if (d.kind === 'board') {
    const ids = state.boards.map((b) => b.id).filter((x) => x !== d.id);
    ids.splice(ids.indexOf(targetId), 0, d.id);
    state.boards = await api.reorderBoards(ids);
    renderBoards();
    return;
  }
  const target = boardById(targetId);
  if (d.fromBoard && !copy) {
    const from = boardById(d.fromBoard);
    const oldIndex = from.itemIds.indexOf(d.id);
    await api.moveBetweenBoards(d.fromBoard, targetId, d.id, -1);
    from.itemIds = from.itemIds.filter((x) => x !== d.id);
    if (!target.itemIds.includes(d.id)) target.itemIds.push(d.id);
    renderBoards(); renderGrid();
    toast(`"${target.name}" panosuna taşındı.`, async () => {
      await api.moveBetweenBoards(targetId, d.fromBoard, d.id, oldIndex);
      target.itemIds = target.itemIds.filter((x) => x !== d.id);
      from.itemIds.splice(oldIndex, 0, d.id);
      renderBoards(); renderGrid();
    });
  } else {
    if (target.itemIds.includes(d.id)) return toast(`Bu iş zaten "${target.name}" panosunda.`);
    await api.placeInBoard(targetId, d.id, -1);
    target.itemIds.push(d.id);
    renderBoards();
    toast(`"${target.name}" panosuna eklendi.`, async () => {
      await api.removeFromBoard(targetId, d.id);
      target.itemIds = target.itemIds.filter((x) => x !== d.id);
      renderBoards(); renderGrid();
    });
  }
}

$('#newBoardBtn').addEventListener('click', () => {
  const f = $('#newBoardForm');
  f.hidden = !f.hidden;
  if (!f.hidden) $('#newBoardName').focus();
});
$('#newBoardForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#newBoardName').value.trim();
  if (!name) return;
  const b = await api.addBoard(name);
  state.boards.push(b);
  $('#newBoardName').value = '';
  $('#newBoardForm').hidden = true;
  show('arsiv', b.id);
});
$('#newBoardName').addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#newBoardForm').hidden = true; });

/* ---------------- Arşiv ızgarası (masonry) ---------------- */
function visibleItems() {
  const board = state.boardId && boardById(state.boardId);
  let list = board ? board.itemIds.map((id) => state.items.get(id)).filter(Boolean)
    : [...state.items.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const q = trLower(state.q.trim());
  if (q) {
    list = list.filter((i) => trLower([i.title, i.note, (i.tags || []).join(' '), PLATFORM_ADI[i.platform] || i.platform].join(' ')).includes(q));
  }
  if (state.type) list = list.filter((i) => i.type === state.type);
  if (state.platform) list = list.filter((i) => i.platform === state.platform);
  return list;
}

function ratioOf(item) {
  const w = item.width || (item.type === 'video' ? 9 : 4);
  const h = item.height || (item.type === 'video' ? 16 : 5);
  return Math.min(2.2, Math.max(0.45, h / w)); // yükseklik / genişlik
}

const cardEls = new Map();

function renderGrid() {
  const board = state.boardId && boardById(state.boardId);
  $('#gridTitle').textContent = board ? board.name : 'Arşiv';
  renderBoardTools(board);

  const items = visibleItems();
  $('#gridCount').textContent = items.length ? `${items.length} iş` : '';
  const grid = $('#grid');
  grid.replaceChildren();
  cardEls.clear();

  const empty = $('#gridEmpty');
  if (!items.length) {
    grid.hidden = true;
    empty.hidden = false;
    const filtered = state.q || state.type || state.platform;
    empty.replaceChildren(
      h('h2', { text: filtered ? 'Bu aramayla eşleşen iş yok' : board ? 'Bu pano henüz boş' : 'Arşivin henüz boş' }),
      h('p', { text: filtered ? 'Arama kelimesini ya da filtreleri değiştir.'
        : board ? 'Arşivdeki işleri soldaki pano adının üstüne sürükle, ya da tarayıcıda kaydederken bu panoyu seç.'
          : 'Tarayıcıda gezerken görselin ya da videonun üstüne gel, köşede çıkan butonla kaydet. Bilgisayarındaki dosyaları da buraya sürükleyebilirsin.' }),
      filtered ? h('button', { class: 'ghost', text: 'Filtreleri temizle', onclick: clearFilters })
        : h('button', { class: 'primary', text: 'Tarayıcıyı aç', onclick: () => (state.tabs.length ? show('tarayici') : show('hesaplar')) }),
    );
    return;
  }
  grid.hidden = false;
  empty.hidden = true;

  const width = grid.clientWidth || 1000;
  const cols = Math.max(2, Math.floor((width - 64) / 214));
  const colEls = Array.from({ length: cols }, () => h('div', { class: 'col' }));
  const heights = new Array(cols).fill(0);
  for (const item of items) {
    const i = heights.indexOf(Math.min(...heights));
    heights[i] += ratioOf(item) + 0.08;
    const card = buildCard(item);
    cardEls.set(item.id, card);
    colEls[i].append(card);
  }
  grid.append(...colEls);
}

function buildCard(item) {
  const board = state.boardId;
  const card = h('div', {
    class: 'card', tabindex: 0, draggable: 'true', 'data-id': item.id,
    style: `aspect-ratio: 1 / ${ratioOf(item)}`,
    'aria-label': item.title || PLATFORM_ADI[item.platform] || 'Kayıt',
    onclick: () => openDetail(item.id),
    onkeydown: (e) => { if (e.key === 'Enter') openDetail(item.id); },
    ondragstart: (e) => {
      drag = { kind: 'item', id: item.id, fromBoard: board };
      e.dataTransfer.setData('application/x-ilham-item', item.id);
      e.dataTransfer.effectAllowed = 'copyMove';
      card.classList.add('dragging');
      stopPreview(card);
    },
    ondragend: () => { card.classList.remove('dragging'); drag = null; clearDropMarks(); },
    ondragover: (e) => {
      if (board && drag?.kind === 'item' && drag.fromBoard === board && drag.id !== item.id) {
        e.preventDefault(); clearDropMarks(); card.classList.add('drop-before');
      }
    },
    ondragleave: () => card.classList.remove('drop-before'),
    ondrop: async (e) => {
      if (!(board && drag?.kind === 'item' && drag.fromBoard === board)) return;
      e.preventDefault();
      e.stopPropagation();
      const b = boardById(board);
      const ids = b.itemIds.filter((x) => x !== drag.id);
      const index = ids.indexOf(item.id);
      ids.splice(index, 0, drag.id);
      b.itemIds = ids;
      await api.placeInBoard(board, drag.id, index);
      drag = null;
      clearDropMarks();
      renderGrid();
    },
    onmouseenter: () => startPreview(card, item.id),
    onmouseleave: () => stopPreview(card),
  });
  fillCard(card, item);
  return card;
}

function fillCard(card, item) {
  const kids = [];
  if (item.thumb) kids.push(h('img', { src: `ilham://kapak/${encodeURIComponent(item.thumb)}`, alt: '', loading: 'lazy', draggable: 'false' }));
  else kids.push(h('div', { class: 'ph', text: item.status === 'hata' ? 'Kapak yok' : 'Hazırlanıyor' }));
  if (item.type === 'video') kids.push(h('span', { class: 'badge' }, icon(ICON_PLAY), 'Video'));
  kids.push(h('div', { class: 'info' },
    h('div', { class: 't', text: item.title || 'Başlıksız' }),
    h('div', { class: 'p', text: PLATFORM_ADI[item.platform] || item.platform })));
  if (item.status === 'hata') kids.push(h('div', { class: 'state err', text: 'Kaydedilemedi. Ayrıntı için aç.' }));
  else if (DURUM[item.status]) {
    const st = h('div', { class: 'state', text: DURUM[item.status] });
    if (item.status === 'yukleniyor') st.append(h('div', { class: 'bar-p' }, h('i', { style: `width:${Math.round((item.progress || 0) * 100)}%` })));
    kids.push(st);
  }
  card.replaceChildren(...kids);
}

let previewTimer;
function startPreview(card, id) {
  const item = state.items.get(id);
  if (!item || item.type !== 'video' || item.status !== 'tamam') return;
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    if (card.querySelector('video')) return;
    const v = h('video', { src: `ilham://medya/${id}`, muted: true, loop: true, playsinline: true, autoplay: true, style: 'position:absolute;inset:0' });
    v.muted = true;
    card.prepend(v);
  }, 350);
}
function stopPreview(card) {
  clearTimeout(previewTimer);
  card.querySelector('video')?.remove();
}

function renderBoardTools(board) {
  const tools = $('.bar-tools');
  $$('[data-board-tool]', tools).forEach((el) => el.remove());
  $('#boardMenuBtn').hidden = true;
  if (!board) return;
  tools.append(
    h('button', { class: 'ghost', 'data-board-tool': '', text: 'Adını değiştir', onclick: () => renameBoardInline(board) }),
    h('button', { class: 'danger', 'data-board-tool': '', text: 'Panoyu sil', onclick: () => deleteBoard(board) }),
  );
}

function renameBoardInline(board) {
  const title = $('#gridTitle');
  const input = h('input', { value: board.name, maxlength: 60, 'aria-label': 'Pano adı', style: 'font-size:20px;font-weight:700;height:40px' });
  title.replaceWith(input);
  input.focus();
  input.select();
  const finish = async (saveIt) => {
    const name = input.value.trim();
    if (saveIt && name && name !== board.name) { await api.renameBoard(board.id, name); board.name = name; }
    input.replaceWith(h('h1', { id: 'gridTitle', text: board.name }));
    renderBoards();
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
  input.addEventListener('blur', () => finish(true), { once: true });
}

async function deleteBoard(board) {
  if (!confirm(`"${board.name}" panosu silinsin mi? İçindeki işler arşivde kalır.`)) return;
  await api.removeBoard(board.id);
  state.boards = state.boards.filter((b) => b.id !== board.id);
  show('arsiv');
  toast('Pano silindi.');
}

function clearFilters() {
  state.q = ''; state.type = ''; state.platform = '';
  $('#search').value = '';
  $('#platformFilter').value = '';
  $$('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.type === '')));
  renderGrid();
}

function renderPlatformFilter() {
  const used = [...new Set([...state.items.values()].map((i) => i.platform))];
  const sel = $('#platformFilter');
  const cur = sel.value;
  sel.replaceChildren(h('option', { value: '', text: 'Tüm platformlar' }),
    ...used.sort().map((p) => h('option', { value: p, text: PLATFORM_ADI[p] || p })));
  sel.value = used.includes(cur) ? cur : '';
}

let searchTimer;
$('#search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.q = e.target.value; renderGrid(); }, 150);
});
$$('.seg button').forEach((b) => b.addEventListener('click', () => {
  state.type = b.dataset.type;
  $$('.seg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  renderGrid();
}));
$('#platformFilter').addEventListener('change', (e) => { state.platform = e.target.value; renderGrid(); });

let resizeTimer;
let lastCols = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const cols = Math.max(2, Math.floor((($('#grid').clientWidth || 1000) - 64) / 214));
    if (cols !== lastCols && state.view === 'arsiv') { lastCols = cols; renderGrid(); }
  }, 120);
});

/* Bilgisayardan dosya sürükleme */
const arsivView = $('#view-arsiv');
let fileDragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
arsivView.addEventListener('dragenter', (e) => { if (hasFiles(e)) { fileDragDepth++; $('#dropCover').hidden = false; } });
arsivView.addEventListener('dragleave', (e) => { if (hasFiles(e) && --fileDragDepth <= 0) { fileDragDepth = 0; $('#dropCover').hidden = true; } });
arsivView.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
arsivView.addEventListener('drop', async (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  fileDragDepth = 0;
  $('#dropCover').hidden = true;
  const files = [...e.dataTransfer.files].filter((f) => /^(image|video)\//.test(f.type));
  if (!files.length) return toast('Sadece görsel ve video dosyaları eklenebilir.');
  const created = await api.saveFiles(files);
  for (const it of created) {
    state.items.set(it.id, it);
    if (state.boardId) { await api.placeInBoard(state.boardId, it.id, -1); boardById(state.boardId).itemIds.push(it.id); }
  }
  renderPlatformFilter(); renderBoards(); renderGrid();
  toast(`${created.length} dosya arşive ekleniyor.`);
});
document.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
document.addEventListener('drop', (e) => e.preventDefault());

/* Kaydetme hattından gelen güncellemeler */
api.onItemChanged((item) => {
  if (item.removed) {
    state.items.delete(item.id);
    for (const b of state.boards) b.itemIds = b.itemIds.filter((x) => x !== item.id);
    if (item.duplicateOf && state.view === 'tarayici') toast('Bu dosya arşivde zaten vardı; tek kopya tutuldu.');
    if (state.view === 'arsiv') renderGrid();
    renderBoards();
    return;
  }
  const isNew = !state.items.has(item.id);
  state.items.set(item.id, item);
  if (item.boardHint) {
    const b = boardById(item.boardHint);
    if (b && !b.itemIds.includes(item.id)) b.itemIds.push(item.id);
  }
  if (state.view === 'arsiv') {
    const card = cardEls.get(item.id);
    if (card && !isNew) fillCard(card, item);
    else renderGrid();
  }
  if (isNew) { renderPlatformFilter(); renderBoards(); }
  if (state.detailId === item.id) renderDetailMeta(item);
});

/* ---------------- Detay ---------------- */
function openDetail(id) {
  const item = state.items.get(id);
  if (!item) return;
  state.detailId = id;
  const media = $('#dMedia');
  media.replaceChildren();
  if (item.status === 'tamam') {
    media.append(item.type === 'video'
      ? h('video', { src: `ilham://medya/${id}`, controls: true, autoplay: true })
      : h('img', { src: `ilham://medya/${id}`, alt: item.title || '' }));
  } else if (item.thumb) {
    media.append(h('img', { src: `ilham://kapak/${encodeURIComponent(item.thumb)}`, alt: '' }));
  } else {
    media.append(h('div', { class: 'ph', text: 'Önizleme hazır değil.' }));
  }
  $('#dPlatform').textContent = PLATFORM_ADI[item.platform] || item.platform;
  $('#dTitle').value = item.title || '';
  $('#dNote').value = item.note || '';
  $('#dTags').value = (item.tags || []).join(', ');
  $('#dSource').hidden = !item.pageUrl;
  renderDetailBoards(item);
  renderDetailMeta(item);
  $('#detail').hidden = false;
  $('#dTitle').focus();
}

function renderDetailBoards(item) {
  const inBoards = state.boards.filter((b) => b.itemIds.includes(item.id));
  $('#dBoards').replaceChildren(...(inBoards.length ? inBoards.map((b) => h('span', { class: 'chip' }, b.name,
    h('button', {
      'aria-label': `${b.name} panosundan çıkar`,
      onclick: async () => {
        await api.removeFromBoard(b.id, item.id);
        b.itemIds = b.itemIds.filter((x) => x !== item.id);
        renderDetailBoards(item); renderBoards();
      },
    }, icon(ICON_X)))) : [h('span', { class: 'muted', text: 'Henüz bir panoda değil.' })]));
  const sel = $('#dAddBoard');
  const rest = state.boards.filter((b) => !b.itemIds.includes(item.id));
  sel.hidden = !rest.length;
  sel.replaceChildren(h('option', { value: '', text: 'Panoya ekle' }), ...rest.map((b) => h('option', { value: b.id, text: b.name })));
}

$('#dAddBoard').addEventListener('change', async (e) => {
  const b = boardById(e.target.value);
  const item = state.items.get(state.detailId);
  if (!b || !item) return;
  await api.placeInBoard(b.id, item.id, -1);
  b.itemIds.push(item.id);
  renderDetailBoards(item); renderBoards();
});

function renderDetailMeta(item) {
  const rows = [
    ['Eklendi', tarih(item.createdAt)],
    ['Tür', item.type === 'video' ? 'Video' : 'Görsel'],
    item.width ? ['Boyut', `${item.width} × ${item.height}`] : null,
    item.size ? ['Dosya', boyut(item.size)] : null,
    ['Depolama', item.driveId ? 'Google Drive' : item.localFile ? 'Bu bilgisayar' : '-'],
    ['Durum', item.status === 'tamam' ? 'Hazır' : item.status === 'hata' ? 'Kaydedilemedi' : DURUM[item.status]],
    item.error ? ['Hata', item.error] : null,
  ].filter(Boolean);
  $('#dMeta').replaceChildren(...rows.flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })]));
  $('#dRetry').hidden = item.status !== 'hata';
}

function closeDetail() {
  const id = state.detailId;
  if (!id) return;
  const item = state.items.get(id);
  const patch = {
    title: $('#dTitle').value.trim(),
    note: $('#dNote').value.trim(),
    tags: $('#dTags').value.split(',').map((t) => t.trim()).filter(Boolean),
  };
  if (item && (patch.title !== item.title || patch.note !== item.note || patch.tags.join() !== (item.tags || []).join())) {
    Object.assign(item, patch);
    api.updateItem(id, patch);
    const card = cardEls.get(id);
    if (card) fillCard(card, item);
  }
  $('#dMedia').replaceChildren();
  $('#detail').hidden = true;
  state.detailId = null;
}

$$('[data-close]').forEach((el) => el.addEventListener('click', closeDetail));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#detail').hidden) closeDetail(); });
$('#dSource').addEventListener('click', () => {
  const item = state.items.get(state.detailId);
  if (!item?.pageUrl) return;
  closeDetail();
  openTab(item.pageUrl, item.partition || 'persist:genel', item.title);
});
$('#dRetry').addEventListener('click', () => { api.retryItem(state.detailId); });
$('#dDelete').addEventListener('click', async () => {
  const item = state.items.get(state.detailId);
  if (!item) return;
  if (!confirm('Bu iş arşivden ve tüm panolardan silinsin mi? Drive\'daki dosya çöp kutusuna taşınır.')) return;
  const id = item.id;
  closeDetail();
  await api.removeItem(id);
  state.items.delete(id);
  for (const b of state.boards) b.itemIds = b.itemIds.filter((x) => x !== id);
  renderBoards(); renderGrid(); renderPlatformFilter();
  toast('Arşivden silindi.');
});

/* ---------------- Tarayıcı ---------------- */
const SEARCH = {
  'persist:pinterest': (q) => `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(q)}`,
  'persist:tiktok': (q) => `https://www.tiktok.com/search?q=${encodeURIComponent(q)}`,
  'persist:youtube': (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
  'persist:behance': (q) => `https://www.behance.net/search/projects?search=${encodeURIComponent(q)}`,
  'persist:instagram': (q) => `https://www.instagram.com/explore/tags/${encodeURIComponent(q.replace(/[\s#]+/g, ''))}/`,
  'persist:linkedin': (q) => `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(q)}`,
};

function toUrl(text, partition) {
  const t = text.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t)) return 'https://' + t;
  const fn = SEARCH[partition];
  return fn ? fn(t) : `https://www.google.com/search?q=${encodeURIComponent(t)}`;
}

let tabSeq = 0;
function openTab(url, partition, title = '') {
  const id = 't' + ++tabSeq;
  const wv = document.createElement('webview');
  wv.setAttribute('partition', partition);
  wv.setAttribute('src', url);
  const tab = { id, url, partition, title: title || new URL(url).hostname.replace(/^www\./, ''), wv };
  wv.addEventListener('page-title-updated', (e) => { tab.title = e.title; renderTabs(); });
  const nav = (e) => { tab.url = e.url; if (state.activeTab === id) $('#addrInput').value = e.url; };
  wv.addEventListener('did-navigate', nav);
  wv.addEventListener('did-navigate-in-page', (e) => { if (e.isMainFrame) nav(e); });
  wv.addEventListener('ipc-message', async (e) => {
    if (e.channel !== 'ilham-save') return;
    const payload = { ...e.args[0], partition, boardId: $('#saveBoard').value || '' };
    try {
      const res = await api.save(payload);
      if (res.duplicate) {
        wv.send('ilham-saved', { message: 'Bu iş zaten arşivde.' });
        if (payload.boardId) {
          const b = boardById(payload.boardId);
          if (b && !b.itemIds.includes(res.item.id)) { await api.placeInBoard(b.id, res.item.id, -1); b.itemIds.push(res.item.id); renderBoards(); }
        }
      } else {
        wv.send('ilham-saved', { message: 'Arşive eklendi, arka planda işleniyor.' });
      }
    } catch (err) {
      wv.send('ilham-saved', { message: 'Kaydedilemedi: ' + err.message });
    }
  });
  $('#webviews').append(wv);
  state.tabs.push(tab);
  activateTab(id);
  show('tarayici');
}

function activateTab(id) {
  state.activeTab = id;
  for (const t of state.tabs) t.wv.classList.toggle('off', t.id !== id);
  const t = state.tabs.find((x) => x.id === id);
  $('#addrInput').value = t ? t.url : '';
  renderTabs();
}

function closeTab(id) {
  const i = state.tabs.findIndex((t) => t.id === id);
  if (i < 0) return;
  state.tabs[i].wv.remove();
  state.tabs.splice(i, 1);
  if (state.activeTab === id) activateTab(state.tabs[Math.max(0, i - 1)]?.id || null);
  else renderTabs();
}

function renderTabs() {
  const has = state.tabs.length > 0;
  $('#browserEmpty').hidden = has;
  $('#tabs').hidden = !has;
  $('.addr').hidden = !has;
  $('#webviews').hidden = !has;
  $('#tabs').replaceChildren(...state.tabs.map((t) => h('button', {
    class: 'tab', role: 'tab', 'aria-selected': String(t.id === state.activeTab), title: t.title,
    onclick: () => activateTab(t.id),
  },
  h('span', { class: 'tt', text: t.title }),
  h('span', { class: 'x', role: 'button', 'aria-label': 'Sekmeyi kapat', onclick: (e) => { e.stopPropagation(); closeTab(t.id); } }, icon(ICON_X)))));
}

const activeWv = () => state.tabs.find((t) => t.id === state.activeTab)?.wv;
$('#backBtn').addEventListener('click', () => { const w = activeWv(); if (w?.canGoBack()) w.goBack(); });
$('#fwdBtn').addEventListener('click', () => { const w = activeWv(); if (w?.canGoForward()) w.goForward(); });
$('#reloadBtn').addEventListener('click', () => activeWv()?.reload());
$('#savePageBtn').addEventListener('click', () => activeWv()?.send('ilham-save-page'));
$('#addrForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const t = state.tabs.find((x) => x.id === state.activeTab);
  if (!t) return;
  const url = toUrl($('#addrInput').value, t.partition);
  if (url) t.wv.loadURL(url);
});
$$('[data-goto]').forEach((b) => b.addEventListener('click', () => show(b.dataset.goto)));

/* ---------------- Hesaplar ---------------- */
async function refreshAccounts() {
  state.accountStatus = await api.accountStatus();
  renderAccounts();
}

function renderAccounts() {
  const label = { bagli: ['Giriş yapıldı', 'ok'], 'bagli-degil': ['Giriş yapılmadı', 'bad'], bilinmiyor: ['Durum sayfada görünür', ''] };
  $('#accountList').replaceChildren(...state.accounts.map((a) => {
    const [txt, cls] = label[state.accountStatus[a.id]] || label.bilinmiyor;
    const logged = state.accountStatus[a.id] === 'bagli';
    return h('li', {},
      h('div', { class: 'grow' }, h('div', { class: 'name', text: a.name }), h('div', { class: `status ${cls}`, text: txt })),
      h('button', { class: 'ghost', text: logged ? 'Aç' : 'Giriş yap', onclick: () => openTab(a.url, a.partition, a.name) }),
      logged ? h('button', {
        class: 'danger', text: 'Çıkış yap',
        onclick: async () => {
          if (!confirm(`${a.name} oturumu bu uygulamadan silinsin mi?`)) return;
          for (const t of [...state.tabs]) if (t.partition === a.partition) closeTab(t.id);
          state.accountStatus = await api.logout(a.id);
          renderAccounts();
        },
      }) : null);
  }));
  $('#sourceList').replaceChildren(...state.sources.map((s) => h('li', {},
    h('div', { class: 'grow' }, h('div', { class: 'name', text: s.name }), h('div', { class: 'status', text: new URL(s.url).hostname.replace(/^www\./, '') })),
    h('button', { class: 'ghost', text: 'Aç', onclick: () => openTab(s.url, s.partition, s.name) }))));
}

/* ---------------- Ayarlar ---------------- */
function renderDrivePill() {
  const d = state.drive;
  const pill = $('#drivePill');
  pill.classList.toggle('on', !!d.connected);
  pill.replaceChildren(h('span', { class: 'dot' }),
    h('span', { text: d.connected ? `Drive bağlı${d.email ? ': ' + d.email : ''}` : 'Drive bağlı değil, dosyalar bu bilgisayarda' }));
}
$('#drivePill').addEventListener('click', () => show('ayarlar'));

function renderSettings() {
  const d = state.drive;
  $('#driveState').replaceChildren(h('span', { class: `status ${d.connected ? 'ok' : 'bad'}`,
    text: d.connected ? `Bağlı${d.email ? ': ' + d.email : ''}` : d.hasClient ? 'Anahtarlar kayıtlı, bağlantı kurulmadı' : 'Bağlı değil' }));
  $('#driveConnectBtn').hidden = !!d.connected;
  $('#driveDisconnectBtn').hidden = !d.connected;
  $('#driveForm .field:nth-of-type(1)').hidden = !!d.connected;
  $('#driveForm .field:nth-of-type(2)').hidden = !!d.connected;
  $('#driveForm [type=submit]').hidden = !!d.connected;

  const t = state.tools;
  $('#toolList').replaceChildren(
    h('li', {}, h('div', { class: 'grow name', text: 'yt-dlp' }), h('span', { class: `status ${t.ytdlp ? 'ok' : 'bad'}`, text: t.ytdlp ? 'Kurulu' : 'Kurulu değil, videolar indirilemez' })),
    h('li', {}, h('div', { class: 'grow name', text: 'ffmpeg' }), h('span', { class: `status ${t.ffmpeg ? 'ok' : 'bad'}`, text: t.ffmpeg ? 'Kurulu' : 'Kurulu değil, video kapakları sayfadan alınır' })),
  );
  $('#cacheLimit').value = state.settings.cacheLimitMb;
}

function driveMsg(text, err = false) {
  const el = $('#driveMsg');
  el.textContent = text;
  el.classList.toggle('err', err);
}

$('#driveForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = $('#clientId').value.trim();
  const secret = $('#clientSecret').value.trim();
  if (!id.endsWith('.apps.googleusercontent.com')) return driveMsg('İstemci kimliği ".apps.googleusercontent.com" ile bitmeli. Google Cloud\'dan tekrar kopyala.', true);
  if (!secret) return driveMsg('Gizli anahtarı da gir.', true);
  state.drive = await api.setDriveClient(id, secret);
  $('#clientSecret').value = '';
  driveMsg('Anahtarlar şifreli olarak kaydedildi. Şimdi Google Drive\'ı bağlayabilirsin.');
  renderSettings();
});

$('#driveConnectBtn').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  driveMsg('Tarayıcında Google girişi açıldı. İzni verip buraya dön.');
  try {
    state.drive = await api.connectDrive();
    driveMsg('Google Drive bağlandı. Yeni kayıtlar "İlham Arşivi" klasörüne yüklenecek.');
  } catch (err) {
    driveMsg(err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), true);
  } finally {
    btn.disabled = false;
    renderSettings(); renderDrivePill();
  }
});

$('#driveDisconnectBtn').addEventListener('click', async () => {
  if (!confirm('Google Drive bağlantısı kesilsin mi? Drive\'daki dosyalar silinmez ama uygulama onları açamaz.')) return;
  state.drive = await api.disconnectDrive();
  driveMsg('Bağlantı kesildi.');
  renderSettings(); renderDrivePill();
});

$('#cacheForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  state.settings = await api.setSetting('cacheLimitMb', $('#cacheLimit').value);
  $('#cacheLimit').value = state.settings.cacheLimitMb;
  toast('Önbellek sınırı kaydedildi.');
});
$('#openDataBtn').addEventListener('click', () => api.openDataFolder());

/* ---------------- Başlangıç ---------------- */
$$('.nav-btn').forEach((b) => b.addEventListener('click', () => show(b.dataset.view)));

(async function start() {
  const d = await api.init();
  for (const it of d.items) state.items.set(it.id, it);
  state.boards = d.boards;
  state.accounts = d.accounts;
  state.sources = d.sources;
  state.accountStatus = d.accountStatus;
  state.drive = d.drive;
  state.tools = d.tools;
  state.settings = d.settings;
  renderDrivePill();
  renderPlatformFilter();
  show('arsiv');
})();
