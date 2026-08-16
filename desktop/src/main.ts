import {
  BrowserWindow,
  app,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  screen,
  session,
} from 'electron';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';

/**
 * ABI masaustu kabugu.
 *
 * Uc pencere modu var:
 *  - window  : normal uygulama penceresi
 *  - overlay : saydam, her zaman ustte, istege bagli tiklama gecirgen
 *  - mini    : kucuk yuzen emblem (200-320 px)
 *
 * Ctrl+Shift+A goster/gizle. Overlay ve mini modda arka plan saydam;
 * karakter masaustunun uzerinde duruyormus gibi gorunur.
 */

type Mode = 'window' | 'overlay' | 'mini';

const DEV = process.argv.includes('--dev');
const WEB_DEV_URL = process.env.ABI_WEB_URL ?? 'http://127.0.0.1:5273';
const SERVER_PORT = process.env.PORT ?? '8787';

const GEOMETRY: Record<Mode, { width: number; height: number }> = {
  window: { width: 1180, height: 760 },
  overlay: { width: 380, height: 460 },
  mini: { width: 260, height: 300 },
};

let win: BrowserWindow | null = null;
let mode: Mode = 'window';
let clickThrough = false;
let serverProcess: ChildProcess | null = null;

/** Uretimde arayuz kendi sunucumuzdan gelir; file:// altinda varlik yollari
 *  ve localStorage calismiyor. */
function appUrl(): string {
  return DEV ? WEB_DEV_URL : `http://127.0.0.1:${SERVER_PORT}`;
}

function createWindow(): void {
  const bounds = GEOMETRY[mode];
  const overlay = mode !== 'window';

  win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: 240,
    minHeight: 260,
    show: false,
    frame: !overlay,
    transparent: overlay,
    backgroundColor: overlay ? '#00000000' : '#060708',
    alwaysOnTop: overlay,
    skipTaskbar: overlay,
    resizable: true,
    hasShadow: !overlay,
    title: 'ABİ',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // Karakterin sesi ve mikrofonu kullanici hareketi beklemeden calissin.
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  if (overlay) placeInCorner();

  // Mikrofon, kamera ve ekran paylasimi izinleri: masaustunde soru sorulmaz,
  // pencereyi zaten kullanici acti.
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(['media', 'display-capture', 'audioCapture', 'videoCapture'].includes(permission));
  });

  // getDisplayMedia icin kaynak secimi: ilk ekran otomatik verilir.
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    void desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      callback(sources[0] ? { video: sources[0] } : { video: undefined });
    });
  });

  const created = win;
  loadWithRetry(created);

  created.once('ready-to-show', () => created.show());
  created.on('closed', () => {
    // Mod degisiminde eski pencere kapanirken yeni pencerenin referansini silme.
    if (win === created) win = null;
  });
}

/** Sunucu birkac yuz ms sonra hazir olabiliyor; sessizce yeniden dene. */
function loadWithRetry(target: BrowserWindow, attempt = 0): void {
  void target.loadURL(appUrl()).catch(() => undefined);
  target.webContents.once('did-fail-load', () => {
    if (target.isDestroyed() || attempt > 20) return;
    setTimeout(() => loadWithRetry(target, attempt + 1), 400);
  });
}

/** Overlay ve mini modda pencere sag uste yaslanir. */
function placeInCorner(): void {
  if (!win) return;
  const display = screen.getPrimaryDisplay().workArea;
  const { width, height } = GEOMETRY[mode];
  win.setBounds({
    x: display.x + display.width - width - 24,
    y: display.y + 24,
    width,
    height,
  });
}

function setMode(next: Mode): void {
  if (!win || next === mode) return;
  mode = next;

  const overlay = next !== 'window';
  // frame ve transparent calisma aninda degistirilemiyor; pencere yeniden kurulur.
  const previous = win;
  createWindow();
  previous.destroy();

  win?.setAlwaysOnTop(overlay, 'screen-saver');
  if (!overlay) setClickThrough(false);
}

function setClickThrough(enabled: boolean): void {
  clickThrough = enabled;
  // forward: true -> fare olaylari yine de pencereye bildirilir, boylece
  // uzerine gelince kontroller geri acilabilir.
  win?.setIgnoreMouseEvents(enabled, { forward: true });
}

function toggleVisibility(): void {
  if (!win) {
    createWindow();
    return;
  }
  if (win.isVisible()) win.hide();
  else {
    win.show();
    win.focus();
  }
}

/** Uretim modunda sunucu da bu surecle birlikte kalkar. */
function startServer(): void {
  if (DEV) return;
  const entry = path.join(__dirname, '..', '..', 'server', 'dist', 'index.js');
  serverProcess = spawn(process.execPath, [entry], {
    env: { ...process.env, PORT: SERVER_PORT, ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'inherit',
  });
  serverProcess.on('exit', (code) => {
    if (code && code !== 0) console.error(`abi sunucusu ${code} koduyla kapandi`);
  });
}

app.whenReady().then(() => {
  startServer();
  createWindow();

  globalShortcut.register('CommandOrControl+Shift+A', toggleVisibility);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  serverProcess?.kill();
});

/* ------------------------------------------------------------------ IPC */

ipcMain.handle('abi:mode', (_event, next: Mode) => {
  setMode(next);
  return mode;
});

ipcMain.handle('abi:click-through', (_event, enabled: boolean) => {
  setClickThrough(Boolean(enabled));
  return clickThrough;
});

ipcMain.handle('abi:state', () => ({ mode, clickThrough, desktop: true }));

ipcMain.handle('abi:quit', () => app.quit());
