// Ace Runs! - minimal, safe bridge for desktop-only conveniences (fullscreen, quit).
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('aceRunsDesktop', {
  isDesktop: true,
  platform: process.platform,
  toggleFullscreen: () => ipcRenderer.invoke('ace-runs:toggle-fullscreen'),
  isFullscreen: () => ipcRenderer.invoke('ace-runs:is-fullscreen'),
  quit: () => ipcRenderer.invoke('ace-runs:quit'),
});
