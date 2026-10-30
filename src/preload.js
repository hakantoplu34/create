const { contextBridge, ipcRenderer, webUtils } = require('electron');

const call = (ch) => (...args) => ipcRenderer.invoke(ch, ...args);

contextBridge.exposeInMainWorld('ilham', {
  init: call('init'),
  accountStatus: call('accounts:status'),
  logout: call('accounts:logout'),

  save: call('item:save'),
  saveFiles: (files) => ipcRenderer.invoke('item:files', [...files].map((f) => webUtils.getPathForFile(f)).filter(Boolean)),
  updateItem: call('item:update'),
  retryItem: call('item:retry'),
  removeItem: call('item:remove'),

  addBoard: call('board:add'),
  renameBoard: call('board:rename'),
  removeBoard: call('board:remove'),
  reorderBoards: call('board:reorder'),
  placeInBoard: call('board:place'),
  moveBetweenBoards: call('board:move'),
  removeFromBoard: call('board:removeItem'),

  setDriveClient: call('drive:setClient'),
  connectDrive: call('drive:connect'),
  disconnectDrive: call('drive:disconnect'),
  setSetting: call('settings:set'),

  openExternal: call('open:external'),
  openDataFolder: call('open:dataFolder'),

  onItemChanged: (fn) => ipcRenderer.on('item:changed', (_e, item) => fn(item)),

  discoverPlatforms: call('discover:platforms'),
  discover: call('discover:search'),
  cancelDiscover: call('discover:cancel'),
  onDiscover: (fn) => ipcRenderer.on('discover:progress', (_e, u) => fn(u)),
});
