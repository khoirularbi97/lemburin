# lemburin

Sistem pencatatan dan perhitungan lembur karyawan dengan QR code di ID card.
Petugas scan QR karyawan sekali tap, sistem langsung menghitung upah lembur
sesuai PP No. 35 Tahun 2021.

| Bagian | Teknologi | Deploy |
|---|---|---|
| Frontend (PWA) | React 18 + Vite + html5-qrcode | Vercel |
| Backend (REST API) | Express 4 + Prisma 5 + JWT | Render |
| Database | PostgreSQL | Neon |

## Aturan perhitungan

| Hari | Jam hitung per tap | Setara jam aktual |
|---|---|---|
| Senin–Jumat | 5,5 jam | 3 jam (1 × 1,5 + 2 × 2) |
| Sabtu, Minggu, tanggal merah | 14 jam | 7 jam × 2 |

- Upah sejam = 1/173 × upah sebulan (upah pokok + tunjangan tetap).
- Upah lembur = jam hitung × upah sejam.
- Satu karyawan hanya bisa tap satu kali per tanggal (dijaga oleh unique constraint di database).
- Tanggal selalu dihitung menurut WIB (Asia/Jakarta), bukan jam server.
- Upah sejam disimpan di setiap tap, jadi kenaikan gaji tidak mengubah data lama.
- Tap terlewat (misalnya lupa scan tanggal 20) hanya bisa ditambahkan **admin** lewat Rekap → *Tambah tap manual*. Aturannya: tanggal paling lama tanggal 1 bulan lalu dan tidak boleh di masa depan, alasan wajib diisi (misalnya nomor SPL), jenis hari dan jam hitung tetap otomatis, dan satu tap per hari tetap berlaku. Tap manual diberi label *Manual* di rekap dan di Excel (kolom Sumber, Dicatat oleh, Alasan manual).

Semua aturan ada di `server/src/lib/lembur.js` dan diuji di `server/test/lembur.test.js`.

## Logo & branding

Nama aplikasi ditulis **lemburin** (huruf kecil, "in" berwarna teal): akrab diucapkan, dan "in" juga terbaca sebagai *tap in* saat scan ID card. Untuk judul laporan atau skripsi, tetap sebutkan teknologinya, misalnya *lemburin: Sistem Penghitung Lembur Berbasis QR Code*.

Logo menggabungkan **bingkai sudut QR** (ketepatan pencatatan), **jam analog emas
yang menunjuk pukul 17.00** (jam kerja usai, lembur dimulai), dan **tiga modul data**
(satu tap, satu catatan, satu hari) di atas gradasi **teal ke navy** (peralihan jam
kerja ke malam). Logo dimiringkan **-8°**, mengikuti ikon QR di desain awal, supaya
terasa dinamis seperti kartu yang sedang di-tap. Tagline: *Satu tap, lembur tercatat*.

- Logo di dalam aplikasi, splash, dan logo horizontal: seluruh ikon miring -8°.
- Ikon layar utama HP dan favicon: kotaknya tetap tegak (karena dipotong otomatis
  oleh sistem), isinya yang miring -8°.
- `brand/`: logo miring, logo horizontal (terang & gelap), ikon aplikasi, logo satu
  warna, dan `buat-logo.py` untuk membuat ulang semua file (butuh `pip install cairosvg pillow`).
- `client/public/`: `favicon.ico` + `icon.svg` (tab browser), `logo.svg` (di dalam
  aplikasi), ikon PWA 192/512/maskable, `apple-touch-icon.png`, dan `splash/` untuk iPhone.
- Splash Android dibuat otomatis dari ikon PWA + `background_color` navy di manifest.
- `index.html` juga menampilkan splash sendiri selama JavaScript dimuat, jadi layar
  tidak putih kosong saat server atau jaringan lambat.

## Struktur folder

```
lembur-qr/
├── render.yaml              Blueprint Render (backend)
├── server/                  Express API
│   ├── prisma/
│   │   ├── schema.prisma    Skema database
│   │   ├── migrations/      Migrasi SQL
│   │   └── seed.js          Data awal (akun, contoh karyawan, libur tanggal tetap)
│   ├── src/
│   │   ├── app.js           Middleware, CORS, routing, error handler
│   │   ├── index.js         Entry point
│   │   ├── lib/lembur.js    Aturan perhitungan lembur
│   │   ├── middleware/      JWT & peran
│   │   └── routes/          auth, scan, karyawan, libur, rekap, dashboard, pengguna
│   └── test/                Unit test aturan lembur
└── client/                  React PWA
    ├── vercel.json          Rewrite SPA untuk Vercel
    └── src/
        ├── pages/petugas/   Scan (kamera), Riwayat, Akun
        └── pages/admin/     Dashboard, Rekap, Karyawan & ID card, Libur, Pengguna
```

## Menjalankan di komputer sendiri

Butuh Node.js 20 atau lebih baru dan database PostgreSQL. Paling mudah pakai
database Neon juga (buat branch `dev` supaya data produksi tidak tercampur).

```bash
# 1. Backend
cd server
cp .env.example .env          # isi DATABASE_URL, DIRECT_URL, JWT_SECRET
npm install
npx prisma migrate deploy     # buat tabel
npm run db:seed               # akun awal + contoh karyawan
npm run dev                   # http://localhost:4000

# 2. Frontend (terminal lain)
cd client
cp .env.example .env          # VITE_API_URL=http://localhost:4000
npm install
npm run dev                   # http://localhost:5173
```

Kamera hanya bisa dibuka di `localhost` atau HTTPS. Untuk mencoba scanner dari
HP di jaringan yang sama, pakai `npm run dev -- --host` lalu buka lewat
tunnel HTTPS (misalnya ngrok), atau langsung coba setelah deploy ke Vercel.

### Akun awal (dari seed)

| Username | Peran | Kata sandi |
|---|---|---|
| admin.hrd | Admin | nilai `SEED_ADMIN_PASSWORD` (default `admin123`) |
| petugas.line1 | Petugas scan | nilai `SEED_PETUGAS_PASSWORD` (default `petugas123`) |
| petugas.line2 | Petugas scan | sama dengan di atas |

Ganti kata sandi default sebelum dipakai sungguhan (menu Pengguna > Reset sandi).

### Unit test

```bash
cd server && npm test
```

## Deploy

Urutannya: Neon → Render → Vercel → kembali ke Render untuk CORS.

### 1. Neon (database)

1. Buat project baru di [neon.tech](https://neon.tech), pilih region **AWS Asia Pacific (Singapore)**.
2. Buka **Connection Details**:
   - Salin URL dengan **Pooled connection** aktif → ini `DATABASE_URL` (host mengandung `-pooler`).
   - Matikan **Pooled connection**, salin lagi → ini `DIRECT_URL` (dipakai untuk migrasi).

### 2. Render (backend)

1. Push folder `lembur-qr` ke GitHub.
2. Di [render.com](https://render.com): **New > Blueprint**, pilih repo. Render membaca `render.yaml`.
3. Isi env yang diminta:
   - `DATABASE_URL`, `DIRECT_URL` dari Neon.
   - `CORS_ORIGIN`: isi sementara `http://localhost:5173`, nanti diganti domain Vercel.
   - `JWT_SECRET` dibuat otomatis oleh Render.
4. Deploy. Build command menjalankan `prisma migrate deploy`, jadi tabel otomatis dibuat.
5. Isi data awal dari komputer sendiri (paket gratis Render tidak punya Shell):
   ```bash
   cd server
   # .env berisi DATABASE_URL & DIRECT_URL milik Neon produksi
   npm run db:seed
   ```
6. Cek `https://<nama-service>.onrender.com/health` harus menjawab `{"ok":true,...}`.

Tanpa Blueprint juga bisa: **New > Web Service**, Root Directory `server`,
Build Command `npm ci && npx prisma migrate deploy`, Start Command `npm start`,
Region Singapore, lalu isi env yang sama.

### 3. Vercel (frontend)

1. Di [vercel.com](https://vercel.com): **Add New > Project**, pilih repo yang sama.
2. **Root Directory**: `client`. Framework terdeteksi sebagai Vite.
3. Environment Variables:
   - `VITE_API_URL` = `https://<nama-service>.onrender.com` (tanpa `/` di akhir)
   - `VITE_NAMA_PERUSAHAAN` = nama perusahaan untuk ID card (opsional)
4. Deploy, lalu salin domainnya (misalnya `https://lembur-qr.vercel.app`).

### 4. Sambungkan CORS

Kembali ke Render > Environment, ubah `CORS_ORIGIN` jadi domain Vercel.
Beberapa domain dipisah koma:
`https://lembur-qr.vercel.app,http://localhost:5173`

### 5. Supaya backend tidak tidur

Paket gratis Render mematikan server setelah 15 menit tanpa request, dan
request pertama sesudahnya bisa menunggu sampai sekitar 1 menit. Pasang ping
berkala dari [cron-job.org](https://cron-job.org) atau UptimeRobot:

- URL: `https://<nama-service>.onrender.com/health`
- Jadwal: tiap 10 menit

`/health` sengaja tidak menyentuh database, jadi Neon tetap boleh tidur dan
jatah compute gratisnya hemat. Frontend juga memanggil `/health` saat dibuka
dan menampilkan banner "Menyambungkan ke server…" kalau server baru bangun.

## Pasang di HP sebagai aplikasi

Buka domain Vercel di Chrome Android, lalu menu ⋮ > **Tambahkan ke layar utama**
(atau **Instal aplikasi**). Di iPhone: Safari > Bagikan > **Tambah ke Layar Utama**.

## Endpoint API

Semua endpoint selain `/health` dan `/api/auth/login` butuh header
`Authorization: Bearer <token>`.

| Metode | Path | Peran | Fungsi |
|---|---|---|---|
| GET | `/health` | publik | Cek server hidup |
| POST | `/api/auth/login` | publik | Login, mengembalikan JWT |
| GET | `/api/auth/me` | semua | Data user yang login |
| GET | `/api/scan/hari-ini` | semua | Jenis hari & jam hitung hari ini |
| POST | `/api/scan` | semua | Catat tap dari isi QR |
| GET | `/api/scan/saya` | semua | Riwayat tap petugas hari ini |
| GET | `/api/libur` | semua | Daftar hari libur |
| POST / DELETE | `/api/libur`, `/api/libur/:tanggal` | admin | Kelola hari libur |
| GET/POST/PUT | `/api/karyawan`, `/api/karyawan/:id` | admin | Kelola karyawan |
| POST | `/api/karyawan/:id/ganti-qr` | admin | Buat token QR baru |
| GET | `/api/rekap?bulan=YYYY-MM&departemen=` | admin | Rekap bulanan |
| GET | `/api/rekap/export?bulan=YYYY-MM` | admin | Unduh rekap .xlsx |
| POST | `/api/rekap/tap` | admin | Tap manual untuk lembur yang lupa di-tap |
| DELETE | `/api/rekap/tap/:id` | admin | Hapus tap yang keliru |
| GET | `/api/dashboard` | admin | Ringkasan dashboard |
| GET/POST/PATCH | `/api/pengguna`, `/api/pengguna/:id` | admin | Kelola akun |

Respons `POST /api/scan`:
- `201` tap tercatat
- `409` `SUDAH_TAP` (sudah tap di tanggal yang sama)
- `410` `QR_LAMA` (kartu sudah diganti)
- `404` `QR_TIDAK_DIKENAL`
- `403` `KARYAWAN_NONAKTIF`

## Catatan keamanan

- QR berisi token acak (`LMB-` + 16 heksa), bukan NIK, jadi QR tidak bisa dibuat sendiri.
- Kata sandi disimpan sebagai hash bcrypt. Login dibatasi 20 percobaan per 15 menit per IP.
- `IZINKAN_WAKTU_SIMULASI` harus `false` di produksi. Kalau `true`, klien bisa mengirim waktu scan sendiri (hanya untuk demo).
- QR di kartu tetap bisa difoto orang lain. Untuk mengurangi titip absen, tempatkan scanner di dekat atasan dan cocokkan dengan Surat Perintah Lembur.

## Batasan paket gratis

- Render: server tidur setelah 15 menit tanpa request; filesystem tidak permanen (jangan simpan file upload di server).
- Neon: compute tidur setelah 5 menit, penyimpanan 0,5 GB per project, cukup untuk ratusan ribu tap.
