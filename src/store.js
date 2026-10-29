// Yerel veri deposu: tek bir JSON dosyası (kayıtlar, panolar, ayarlar).
// İleride SQLite'a geçmek için tüm erişim bu modülden geçiyor.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const EMPTY = { version: 1, items: [], boards: [], settings: {} };

class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'ilham.json');
    this.thumbDir = path.join(dir, 'kapaklar');
    this.cacheDir = path.join(dir, 'onbellek');
    for (const d of [dir, this.thumbDir, this.cacheDir]) fs.mkdirSync(d, { recursive: true });
    this.data = this._load();
    this._timer = null;
  }

  _load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return { ...EMPTY, ...raw };
    } catch {
      return structuredClone(EMPTY);
    }
  }

  // Yazmayı biraz geciktirip toplu yap; çökmeye karşı önce geçici dosyaya yaz.
  save() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), 150);
  }

  flush() {
    clearTimeout(this._timer);
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 1));
    fs.renameSync(tmp, this.file);
  }

  id() {
    return crypto.randomUUID();
  }

  // ---- Kayıtlar ----
  listItems() {
    return [...this.data.items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getItem(id) {
    return this.data.items.find((i) => i.id === id);
  }

  findBySource(sourceUrl) {
    return this.data.items.find((i) => i.sourceUrl && i.sourceUrl === sourceUrl);
  }

  findByHash(hash) {
    return this.data.items.find((i) => i.hash && i.hash === hash);
  }

  addItem(fields) {
    const item = {
      id: this.id(),
      type: 'gorsel', // gorsel | video
      platform: 'diger',
      title: '',
      note: '',
      tags: [],
      sourceUrl: '',
      pageUrl: '',
      thumb: '', // kapaklar/ içindeki dosya adı
      width: 0,
      height: 0,
      driveId: '',
      localFile: '', // Drive bağlı değilken tam dosya
      mime: '',
      size: 0,
      hash: '',
      status: 'bekliyor', // bekliyor | indiriliyor | yukleniyor | tamam | hata
      error: '',
      createdAt: new Date().toISOString(),
      ...fields,
    };
    this.data.items.push(item);
    this.save();
    return item;
  }

  updateItem(id, patch) {
    const item = this.getItem(id);
    if (!item) return null;
    Object.assign(item, patch);
    this.save();
    return item;
  }

  removeItem(id) {
    const item = this.getItem(id);
    this.data.items = this.data.items.filter((i) => i.id !== id);
    for (const b of this.data.boards) b.itemIds = b.itemIds.filter((x) => x !== id);
    this.save();
    return item;
  }

  // ---- Panolar ----
  listBoards() {
    return this.data.boards;
  }

  addBoard(name) {
    const board = { id: this.id(), name, itemIds: [], createdAt: new Date().toISOString() };
    this.data.boards.push(board);
    this.save();
    return board;
  }

  renameBoard(id, name) {
    const b = this.data.boards.find((x) => x.id === id);
    if (b) { b.name = name; this.save(); }
    return b;
  }

  removeBoard(id) {
    this.data.boards = this.data.boards.filter((b) => b.id !== id);
    this.save();
  }

  reorderBoards(ids) {
    const map = new Map(this.data.boards.map((b) => [b.id, b]));
    const ordered = ids.map((id) => map.get(id)).filter(Boolean);
    const rest = this.data.boards.filter((b) => !ids.includes(b.id));
    this.data.boards = [...ordered, ...rest];
    this.save();
  }

  // Bir işi panoya ekle (index verilirse o sıraya). Zaten varsa yerini değiştirir.
  placeInBoard(boardId, itemId, index = -1) {
    const b = this.data.boards.find((x) => x.id === boardId);
    if (!b) return null;
    b.itemIds = b.itemIds.filter((x) => x !== itemId);
    if (index < 0 || index > b.itemIds.length) b.itemIds.push(itemId);
    else b.itemIds.splice(index, 0, itemId);
    this.save();
    return b;
  }

  removeFromBoard(boardId, itemId) {
    const b = this.data.boards.find((x) => x.id === boardId);
    if (!b) return null;
    b.itemIds = b.itemIds.filter((x) => x !== itemId);
    this.save();
    return b;
  }

  moveBetweenBoards(fromId, toId, itemId, index = -1) {
    if (fromId && fromId !== toId) this.removeFromBoard(fromId, itemId);
    return this.placeInBoard(toId, itemId, index);
  }

  // ---- Ayarlar ----
  getSetting(key, fallback = null) {
    return key in this.data.settings ? this.data.settings[key] : fallback;
  }

  setSetting(key, value) {
    this.data.settings[key] = value;
    this.save();
  }
}

module.exports = { Store };
