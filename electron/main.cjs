// Ace Runs! - Electron main process (desktop build for Windows, macOS and Linux).
const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    backgroundColor: '#9fd6f0',
    title: 'Ace Runs!',
    show: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      // Audio plays without a first click in the desktop app.
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => win && win.show());
  // Keep the window title fixed (the page title is the same, but never let it drift).
  win.on('page-title-updated', (e) => e.preventDefault());
  const devUrl = process.env.ACE_DEV_URL;
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  // Self-contained: never navigate the game window away or open popups.
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:') && !(devUrl && url.startsWith(devUrl))) e.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11' && win) win.setFullScreen(!win.isFullScreen());
  });
  win.on('closed', () => {
    win = null;
  });
}

ipcMain.handle('ace-runs:toggle-fullscreen', () => {
  if (!win) return false;
  win.setFullScreen(!win.isFullScreen());
  return win.isFullScreen();
});
ipcMain.handle('ace-runs:is-fullscreen', () => (win ? win.isFullScreen() : false));
ipcMain.handle('ace-runs:quit', () => app.quit());

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('window-all-closed', () => app.quit());
