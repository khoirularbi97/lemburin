// lemburin desktop (Windows, macOS, Linux).
// Membungkus build React yang sama dengan versi web. File aplikasi disajikan
// lewat protokol app://lemburin supaya kamera (butuh "secure context") dan
// React Router berjalan seperti di browser. Data tetap diambil dari backend Render.
const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, protocol, session, shell, systemPreferences, net } = require('electron');
const { pathToFileURL } = require('node:url');

const SKEMA = 'app';
const HOST = 'lemburin';
const ASAL = `${SKEMA}://${HOST}`;
const FOLDER_WEB = path.join(__dirname, 'app');
// npm run dev → buka Vite dev server, bukan file hasil build
const DEV_URL = process.env.LEMBURIN_DEV_URL;

protocol.registerSchemesAsPrivileged([
  { scheme: SKEMA, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

if (!app.requestSingleInstanceLock()) app.quit();

/** Ubah URL app://lemburin/... jadi file di folder app/, cegah keluar folder. */
function fileUntuk(url) {
  const { pathname } = new URL(url);
  const rel = decodeURIComponent(pathname).replace(/^\/+/, '');
  const target = path.normalize(path.join(FOLDER_WEB, rel));
  if (target !== FOLDER_WEB && !target.startsWith(FOLDER_WEB + path.sep)) return null;
  if (rel && fs.existsSync(target) && fs.statSync(target).isFile()) return target;
  // Rute React (/admin/rekap, /scan, ...) → index.html. Aset yang hilang tetap 404.
  return path.extname(rel) ? null : path.join(FOLDER_WEB, 'index.html');
}

let jendela = null;

function bukaJendela() {
  jendela = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 380,
    minHeight: 600,
    show: false,
    title: 'lemburin',
    backgroundColor: '#12152B',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  // Penanda supaya kode React tahu sedang berjalan di desktop
  jendela.webContents.setUserAgent(`${jendela.webContents.getUserAgent()} lemburin-desktop/${app.getVersion()}`);

  jendela.once('ready-to-show', () => jendela.show());

  // Link luar (mis. dokumentasi) dibuka di browser biasa, bukan di jendela aplikasi
  jendela.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  jendela.webContents.on('will-navigate', (e, url) => {
    const dalam = url.startsWith(ASAL) || (DEV_URL && url.startsWith(DEV_URL));
    if (!dalam) { e.preventDefault(); if (/^https?:\/\//.test(url)) shell.openExternal(url); }
  });

  jendela.loadURL(DEV_URL || `${ASAL}/`);
  jendela.on('closed', () => { jendela = null; });
}

app.on('second-instance', () => {
  if (!jendela) return;
  if (jendela.isMinimized()) jendela.restore();
  jendela.focus();
});

app.whenReady().then(async () => {
  protocol.handle(SKEMA, (req) => {
    const file = fileUntuk(req.url);
    if (!file) return new Response('Tidak ditemukan', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });

  // Izinkan kamera (scan QR) hanya untuk halaman aplikasi sendiri
  const asalSendiri = (url) => url.startsWith(ASAL) || (DEV_URL && url.startsWith(DEV_URL));
  session.defaultSession.setPermissionRequestHandler((wc, izin, cb, detail) => {
    cb(izin === 'media' && asalSendiri(detail.requestingUrl || wc.getURL()));
  });
  session.defaultSession.setPermissionCheckHandler((wc, izin, asal) => izin === 'media' && asalSendiri(asal || ''));

  // macOS meminta izin kamera ke pengguna sekali di awal
  if (process.platform === 'darwin') {
    try { await systemPreferences.askForMediaAccess('camera'); } catch { /* ditolak: scan pakai foto */ }
  }

  bukaJendela();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) bukaJendela(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
