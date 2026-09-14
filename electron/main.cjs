'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, Menu, dialog, nativeTheme, protocol, session } = require('electron');
const { APP_URL, isAppNavigation, resolveAppRequest, serveAppRequest } = require('./protocol.cjs');

const TITLE = '弈境 · 中国象棋';
const APP_ID = 'com.ovo4096.xiangqi';
const smokeTest = process.argv.includes('--smoke-test');
const distPath = path.join(__dirname, '..', 'dist');
let mainWindow;

// A standard secure origin supports relative module imports and the NPC Web Worker.
// It deliberately does not bypass CSP or enable service workers / Node.js.
protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
}]);
app.enableSandbox();
// Electron includes the internal app name in HTTP-style request headers.
// Keep it ASCII; all user-visible window/menu/installer labels remain Chinese.
app.setName('YiJing Xiangqi');
app.setAppUserModelId(APP_ID);

function installMenu() {
  const viewItems = [
    { label: '切换全屏', role: 'togglefullscreen', accelerator: 'F11' },
  ];
  if (!app.isPackaged) {
    viewItems.push({ type: 'separator' }, { label: '重新加载', role: 'reload' }, { label: '开发者工具', role: 'toggleDevTools' });
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: '游戏', submenu: [
        { label: '退出弈境', role: 'quit', accelerator: 'Alt+F4' },
      ],
    },
    { label: '视图', submenu: viewItems },
    {
      label: '帮助', submenu: [{
        label: '关于弈境',
        click: () => dialog.showMessageBox(mainWindow, {
          type: 'info', title: '关于弈境', message: TITLE,
          detail: `版本 ${app.getVersion()}\n\n木质 3D 棋盘 · 人机对弈 · 本地双人对战\n\n方向键选择棋位，回车落子，F11 切换全屏。`,
          buttons: ['知道了'], noLink: true,
        }),
      }],
    },
  ]));
}

function secureSession(targetSession) {
  targetSession.protocol.handle('app', request => serveAppRequest(distPath, request));
  // The game is fully offline. Block every remote and file: request in addition to CSP.
  targetSession.webRequest.onBeforeRequest((details, callback) => {
    const local = resolveAppRequest(distPath, details.url).status === 200;
    const inMemory = details.url.startsWith('data:') || details.url.startsWith('blob:app://xiangqi/');
    callback({ cancel: !(local || inMemory) });
  });
  targetSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(permission === 'fullscreen' && !!contents && isAppNavigation(contents.getURL()) && isAppNavigation(details.requestingUrl));
  });
  targetSession.setPermissionCheckHandler((contents, permission, origin, details) => {
    return permission === 'fullscreen' && !!contents && isAppNavigation(contents.getURL()) && details.isMainFrame && origin === 'app://xiangqi';
  });
  targetSession.setDevicePermissionHandler(() => false);
  targetSession.on('will-download', event => event.preventDefault());
}

function createWindow(targetSession) {
  const icon = path.join(__dirname, '..', 'build', 'icon.png');
  const win = new BrowserWindow({
    title: TITLE, width: 1380, height: 900, minWidth: 960, minHeight: 700,
    backgroundColor: '#151b18', show: false,
    ...(fs.existsSync(icon) ? { icon } : {}),
    webPreferences: {
      session: targetSession,
      contextIsolation: true, sandbox: true, nodeIntegration: false,
      nodeIntegrationInWorker: false, nodeIntegrationInSubFrames: false,
      webSecurity: true, allowRunningInsecureContent: false, webviewTag: false,
      webgl: true, backgroundThrottling: !smokeTest, devTools: !app.isPackaged,
      navigateOnDragDrop: false,
    },
  });
  win.on('page-title-updated', event => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  for (const name of ['will-navigate', 'will-frame-navigate', 'will-redirect']) {
    win.webContents.on(name, (event, url) => {
      if (!isAppNavigation(typeof url === 'string' ? url : event.url)) event.preventDefault();
    });
  }
  win.webContents.on('will-attach-webview', event => event.preventDefault());
  win.once('ready-to-show', () => { if (!smokeTest) win.show(); });
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });
  if (!smokeTest) {
    win.webContents.on('render-process-gone', (_event, details) => {
      if (details.reason !== 'clean-exit') {
        dialog.showErrorBox('棋盘意外关闭', '请关闭窗口后重新启动弈境。');
      }
    });
  }
  return win;
}

const primaryInstance = smokeTest || app.requestSingleInstanceLock();
if (!primaryInstance) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); }
  });
  app.whenReady().then(async () => {
    nativeTheme.themeSource = 'dark';
    const targetSession = smokeTest ? session.fromPartition('xiangqi-smoke') : session.defaultSession;
    secureSession(targetSession);
    if (!smokeTest) installMenu();
    mainWindow = createWindow(targetSession);
    if (smokeTest) {
      await require('./smoke.cjs').runSmokeTest({ app, window: mainWindow, distPath, url: APP_URL });
    } else {
      await mainWindow.loadURL(APP_URL);
    }
    app.on('activate', () => {
      if (!smokeTest && BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow(targetSession);
        void mainWindow.loadURL(APP_URL);
      }
    });
  }).catch(error => {
    console.error(error);
    if (!smokeTest) dialog.showErrorBox('无法启动弈境', '游戏资源未能加载，请重新安装后再试。');
    app.exit(1);
  });
  app.on('window-all-closed', () => { if (!smokeTest && process.platform !== 'darwin') app.quit(); });
}
