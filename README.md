# lemburin

Sistem pencatatan dan perhitungan lembur karyawan dengan QR code di ID card.
Petugas scan QR karyawan sekali tap, sistem langsung menghitung upah lembur
sesuai PP No. 35 Tahun 2021.

| Bagian | Teknologi | Deploy |
|---|---|---|
| Frontend (PWA) | React 18 + Vite + html5-qrcode | Vercel |
| Aplikasi Android & iOS | Capacitor 8 (kode React yang sama) | APK / Play Store / App Store |
| Aplikasi desktop | Electron 44 (kode React yang sama) | Installer Windows, macOS, Linux |
| Backend (REST API) | Express 4 + Prisma 5 + JWT | Render |
| Database | PostgreSQL | Neon |

Satu kode React dipakai di semua platform. Web, Android, iOS, dan desktop
memanggil backend Render yang sama, jadi data selalu sinkron.

## Aturan perhitungan

| Hari | Jam hitung per tap | Setara jam aktual |
|---|---|---|
| Senin–Jumat | 5,5 jam | 3 jam (1 × 1,5 + 2 × 2) |
| Sabtu, Minggu, tanggal merah | 14 jam | 7 jam × 2 |

- Upah sejam = 1/173 × upah sebulan (upah pokok + tunjangan tetap).
- Upah lembur = jam hitung × upah sejam.
- Satu karyawan hanya bisa tap satu kali per tanggal (dijaga oleh unique constraint di database).
- Tanggal selalu dihitung menurut WIB (Asia/Jakarta), bukan jam server.
- **Periode lembur: tanggal 21 sampai tanggal 20 bulan berikutnya.** Periode diberi nama bulan tempat ia berakhir, misalnya *November 2026* = 21 Okt – 20 Nov 2026. Rekap, Excel, dashboard, portal karyawan, dan slip PDF memakai periode ini. Untuk mengganti tanggal tutup, isi env `TANGGAL_TUTUP_PERIODE` di server dan ubah `TANGGAL_TUTUP` di `client/src/format.js`.
- Upah sejam disimpan di setiap tap, jadi kenaikan gaji tidak mengubah data lama.
- Tap terlewat (misalnya lupa scan tanggal 20) hanya bisa ditambahkan **admin** lewat Rekap → *Tambah tap manual*. Aturannya: tanggal paling lama awal periode lalu dan tidak boleh di masa depan, alasan wajib diisi (misalnya nomor SPL), jenis hari dan jam hitung tetap otomatis, dan satu tap per hari tetap berlaku. Tap manual diberi label *Manual* di rekap dan di Excel (kolom Sumber, Dicatat oleh, Alasan manual).

Semua aturan ada di `server/src/lib/lembur.js` dan diuji di `server/test/lembur.test.js`.

## Dua shift bergilir & lembur lewat tengah malam

Aktifkan di **Panel admin → Tap mandiri & wajah → Aturan hitung → Pakai 2 shift bergilir per grup**.

| Pengaturan | Bawaan |
|---|---|
| Shift 1 | 07.00–16.00 |
| Shift 2 (shift 1 tidak lembur) | 16.00–24.00 |
| Shift 2 (shift 1 lembur) | 19.30–03.30 |
| Jam ganti hari kerja | 07.00 |
| Rotasi | grup A / B bergantian tiap Senin, mulai dari minggu acuan |

- **Grup** tiap karyawan diisi di Data karyawan (kosong = non-shift, memakai jam pulang normal).
- **Tanggal hari kerja:** scan / tap sebelum jam ganti hari dihitung untuk hari kerja sebelumnya. Contoh: scan Sabtu 01.30
  = lembur hari kerja **Jumat** (5,5 jam), bukan Sabtu (14 jam). Waktu tap tetap tercatat jam sebenarnya.
- **Shift 1 lembur:** petugas/admin mencentang "Shift 1 lembur hari ini" di layar Scan atau Input massal; untuk tanggal itu
  shift 2 dihitung masuk 19.30–03.30.
- **Jam aktual** (tap mandiri, input massal dengan jam mulai): di hari kerja yang dihitung lembur hanya waktu **di luar jam
  shift** karyawan (sebelum masuk atau setelah pulang). Hari libur: semua jam dihitung. Tarif PP 35 mengikuti tanggal hari kerja.
- Scan ID card / tap eksklusif tetap 5,5 / 14 jam, hanya tanggalnya yang mengikuti hari kerja.

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
├── client/                  React (web PWA + sumber aplikasi native)
│   ├── vercel.json          Rewrite SPA untuk Vercel
│   ├── capacitor.config.json  Konfigurasi aplikasi Android/iOS
│   ├── .env.native          Alamat backend untuk build Android/iOS/desktop
│   ├── assets/              Sumber ikon & splash Android/iOS
│   ├── android/             Proyek Android Studio (dibuat Capacitor)
│   ├── ios/                 Proyek Xcode (dibuat Capacitor)
│   └── src/
│       ├── platform.js      Deteksi platform, simpan file, tombol Kembali Android
│       ├── pages/petugas/   Scan (kamera), Riwayat, Akun
│       └── pages/admin/     Dashboard, Rekap, Karyawan & ID card, Libur, Pengguna
├── desktop/                 Aplikasi desktop (Electron)
│   ├── main.cjs             Jendela, protokol app://lemburin, izin kamera
│   └── build/icon.png       Ikon desktop (.ico/.icns dibuat otomatis)
└── .github/workflows/aplikasi.yml   Build APK + installer desktop otomatis
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

## Input lembur massal (centang daftar / foto SPL)

Menu **Input lembur massal** (admin) dan tab **Input** (petugas) untuk mencatat lembur banyak
karyawan sekaligus dari Surat Perintah Lembur. Hasilnya tap manual biasa (5,5 / 14 jam otomatis),
tercatat atas nama yang menginput, dan karyawan menerima notifikasi.

1. **Centang daftar**: pilih tanggal, jam selesai, No. SPL (opsional), pekerjaan, lalu centang karyawan
   (ada pencarian, filter departemen, *Pilih semua*). Yang sudah tap di tanggal itu otomatis tidak bisa dipilih.
2. **Foto SPL**: foto/pilih gambar SPL → dibaca otomatis → **preview** per baris SPL: potongan tulisan
   nama, hasil baca, karyawan yang dicocokkan (badge hijau *Cocok* = otomatis dicentang, kuning *Perlu dipilih*
   = pilih dari 3 saran atau daftar semua karyawan), jam selesai & pekerjaan per orang → **Simpan**.
   Tanda "sama dengan atas" (garis, tanda kutip, kosong) diisi dari baris di atasnya.
   Foto disimpan sebagai bukti dan bisa dibuka admin di Rekap → detail → *Lihat foto SPL*.

Aturan: petugas hanya bisa memilih karyawan di departemen area-nya (area *Semua* = semua karyawan)
dan tidak melihat nominal upah; tanggal mengikuti batas tap manual (periode berjalan + periode lalu);
karyawan yang gagal (sudah tap/nonaktif/luar area) dilewati, sisanya tetap tersimpan.

### Foto bukti SPL di Neon Object Storage

Foto dikompres di HP dulu (hitam-putih, 1400 px, WebP; ±20–150 KB) lalu disimpan di
**Neon Object Storage** (gratis 5 GB per project), bukan di database, jadi kuota database 1 GB tetap lega.
Foto otomatis dihapus setelah `FOTO_SPL_SIMPAN_BULAN` bulan (bawaan 13); data lemburnya tetap ada.

Cara mengaktifkan (sekali):
1. Pastikan project Neon ada di region yang mendukung Object Storage
   (`aws-ap-southeast-1` Singapore, `aws-us-east-1/2`, `aws-eu-central-1`).
2. Buat bucket privat `foto-spl` lewat **Neon Console**: buka project → pilih branch (production/main)
   → tab **Object storage** → **New bucket** → nama `foto-spl`, akses **private** → **Create**.
   (Tidak perlu CLI. Langkah 4 di bawah juga otomatis membuat bucket kalau belum ada.)
3. Ambil kredensial: Neon Console → **Connect** → tab **Storage** → *Copy credentials*
   (atau Settings → Credentials → *Create credential* dengan scope `storage:read` + `storage:write`).
   Secret hanya tampil sekali, simpan baik-baik.
4. Isi lima env itu di `server/.env`, lalu cek dari komputer: `cd server` → `npm run storage:cek`.
   Harus muncul `✓ Uji tulis, baca, dan hapus berhasil`.
5. Isi env yang sama di Render: `AWS_ENDPOINT_URL_S3`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`,
   `AWS_SECRET_ACCESS_KEY`, `STORAGE_BUCKET=foto-spl`. Log Render akan menulis `Foto SPL: Neon Object Storage`.

Tanpa env ini aplikasi tetap jalan dan foto disimpan di kolom database (cocok untuk uji coba).
Foto hanya bisa dibuka lewat API lemburin (admin, atau petugas yang mengunggahnya); bucket tidak publik.
Catatan: aturan *lifecycle* di Neon belum dijalankan otomatis, karena itu penghapusan foto lama
dilakukan oleh server lemburin sendiri (saat bangun dan tiap 12 jam).

### Tap lembur mandiri (portal karyawan) + hitungan PP 35/2021

Karyawan bisa tap in / tap out sendiri dari portal (menu **Tap**):

1. **Verifikasi wajah** di HP karyawan: lihat lurus → toleh ke kiri dan kanan → lurus lagi
   (pemeriksaan "wajah hidup", supaya foto diam tidak lolos). Wajah diubah jadi 128 angka di HP
   (face-api, model ±7 MB diunduh sekali); **saat tap foto tidak dikirim**, hanya angka itu.
2. **Pindai QR dinamis** di HP petugas/admin (menu **QR** di aplikasi petugas). QR ditandatangani server
   dan berganti tiap 10 detik (hanya QR yang tampil + satu sebelumnya diterima); hanya karyawan area petugas itu
   yang diterima. Di bawah QR, petugas melihat **daftar siapa saja yang tap lewat QR-nya hari ini** (diperbarui
   tiap 5 detik) — kalau ada nama yang orangnya tidak ada di depannya, QR diteruskan lewat chat: laporkan ke HRD.
3. Tap pertama = **tap in** (mulai lembur), tap kedua = **tap out**. Lembur dihitung **jam aktual**:

| Hari | Tarif (PP 35/2021 Pasal 31) |
|---|---|
| Hari kerja | jam ke-1 × 1,5, jam berikutnya × 2 · dihitung mulai **jam pulang normal** · peringatan bila > 4 jam |
| Libur, pola 5 hari kerja | jam 1–8 × 2, jam 9 × 3, jam 10–12 × 4 |
| Libur, pola 6 hari kerja | jam 1–7 × 2, jam 8 × 3, jam 9–11 × 4 |
| Pola 6, libur resmi di hari kerja terpendek | jam 1–5 × 2, jam 6 × 3, jam 7–9 × 4 |

Upah sejam tetap 1/173 upah sebulan. Jam istirahat yang diatur admin tidak dihitung, menit lembur
dibulatkan ke bawah (bawaan per 30 menit), lembur lewat tengah malam ikut tanggal tap in.
Semua diatur di **Panel admin → Tap mandiri & wajah → Aturan hitung** (pola 5/6 hari, jam pulang,
istirahat, pembulatan). Aturan yang dipakai disimpan bersama setiap lembur.

**Pendaftaran wajah (UU PDP No. 27/2022, data pribadi spesifik):** karyawan mencentang persetujuan,
merekam wajah, lalu **admin menyetujui** setelah mencocokkan foto kecilnya dengan ID card. Karyawan bisa
mencabut persetujuan (data wajah dihapus) kapan saja; admin menghapus data wajah karyawan yang keluar.

**Yang tidak berubah:** scan ID card oleh petugas dan tap manual admin tetap 1 tap = 5,5 / 14 jam hitung.
**Input lembur massal** sekarang memakai **jam mulai & jam selesai** (per baris SPL) dan dihitung jam aktual.

Catatan keamanan: verifikasi wajah berjalan di HP karyawan, jadi aplikasi yang dimodifikasi secara teori bisa
mengirim data palsu; QR dinamis + area petugas + persetujuan admin + rekap tetap diperiksa HRD.

**Tap eksklusif (tanpa petugas):** admin memberi izin per karyawan di **Tap mandiri & wajah → Tap eksklusif**
(berlaku sampai tanggal tertentu, maks. 1 tahun, wajib alasan). Karyawan berizin cukup **scan sekali**:
verifikasi wajah → **scan ID card miliknya** (kartu orang lain / kartu lama ditolak) → lembur langsung tercatat
dan **dihitung seperti scan petugas** (hari kerja 5,5 jam, Sabtu/Minggu/tanggal merah 14 jam hitung; satu lembur
per hari). Lokasi HP **dicatat** (tidak memblokir; izin lokasi ditolak tetap boleh tap). Kalau admin mengisi
**titik lokasi pabrik** + radius, jarak HP ke pabrik ikut disimpan dan tap di luar radius (setelah memperhitungkan
akurasi GPS) ditandai "di luar area". Lembur berlabel **Eksklusif** di rekap/Excel; admin pemberi izin tercatat
sebagai penanggung jawab.

### Pembaca SPL tulisan tangan (Groq) — gratis, tanpa kartu

Urutan pembaca: **Groq → Gemini → Azure → pembaca lokal di HP** (yang pertama diatur yang dipakai;
kalau gagal, aplikasi kembali ke pembaca lokal). Groq memakai model vision (bawaan `qwen/qwen3.8-27b`)
dan langsung mengembalikan isi tabel per baris; pencocokan nama ke data karyawan tetap di HP.
Yang dikirim hanya baris Hari/Tanggal + kolom NAMA s/d ALASAN, hitam-putih. Groq tidak menyimpan isi
permintaan secara bawaan.

Cara mengaktifkan:
1. Buka [console.groq.com](https://console.groq.com) → **Sign in** (Google / GitHub / email). Tidak perlu kartu.
2. Menu **API Keys** → **Create API Key** → beri nama `lemburin` → salin kuncinya (`gsk_...`, hanya tampil sekali).
3. (Disarankan) **Settings → Data Controls**: aktifkan *Zero Data Retention* kalau tersedia untuk akun Anda.
4. Cek batas gratis model di **Settings → Limits**. Isi `GROQ_BATAS_HARIAN` sedikit di bawah batas
   permintaan per hari (RPD) model itu.
5. Render → Environment: isi `GROQ_API_KEY` (opsional `GROQ_MODEL`, `GROQ_BATAS_HARIAN`) → deploy.
6. Di layar Foto SPL akan tertulis *Dibaca Groq · kuota hari ini N/100*.

Kalau model bawaan sudah tidak ada, error-nya menyebut "Ganti GROQ_MODEL": pilih model lain yang
menerima gambar di halaman **Docs → Vision** Groq.

### Pembaca SPL tulisan tangan (Gemini API, berbayar) — disarankan

Kalau `GEMINI_API_KEY` diisi, SPL dibaca **Gemini** (didahulukan dari Azure). Gemini langsung
mengembalikan isi tabel per baris (nama, bagian, jam mulai/selesai, alasan); pencocokan nama ke data
karyawan tetap dilakukan di HP. Yang dikirim sama seperti Azure: hanya baris Hari/Tanggal + kolom
NAMA s/d ALASAN, hitam-putih.

**Wajib tier berbayar.** Ketentuan Gemini API melarang data pribadi dikirim ke tier gratis, dan isi tier
gratis bisa dipakai Google untuk melatih model. Kunci dari project tanpa billing **jangan** dipakai.

Biaya kira-kira: satu SPL ±1.500 token masuk + ±1.000 token keluar. Dengan `gemini-3.8-flash`
(per Nov 2026: $0,75 / $3,75 per 1 juta token) ≈ $0,005 (±Rp80) per SPL. Harga bisa berubah;
cek halaman harga Gemini API. `GEMINI_BATAS_HARIAN` (bawaan 100) membatasi pemakaian per hari.

Cara mengaktifkan:
1. Buka [aistudio.google.com](https://aistudio.google.com) → login akun Google → **Get API key** →
   **Create API key** (buat project baru, mis. `lemburin`).
2. Aktifkan billing untuk project itu: di halaman API keys klik **Set up billing** (atau lewat
   Google Cloud Console → Billing), tambahkan kartu. Pastikan tier project tertulis **berbayar / Tier 1**,
   bukan *Free*.
3. Pasang batas anggaran: Google Cloud Console → **Billing → Budgets & alerts → Create budget**,
   mis. Rp50.000/bulan dengan peringatan email 50%, 90%, 100%.
4. Di Render → Environment: isi `GEMINI_API_KEY` (opsional `GEMINI_MODEL`, `GEMINI_BATAS_HARIAN`) → deploy.
5. Di layar Foto SPL akan tertulis *Dibaca Gemini · kuota hari ini N/100*.

Kalau Gemini gagal (kunci salah, batas tercapai, tabel tidak terdeteksi), aplikasi kembali ke pembaca lokal.
Hasil baca tetap **wajib diperiksa** di preview sebelum disimpan.

### Pembaca SPL tulisan tangan (Azure AI Vision)

SPL tulisan tangan (format SNY-FRM-HRD-006) dibaca dengan **Azure AI Vision – Read**, tier gratis
**F0: 5.000 gambar/bulan** (data tidak dipakai Microsoft untuk melatih model). Satu SPL = 1 gambar.

Yang dikirim ke Azure **hanya potongan**: baris Hari/Tanggal + kolom NAMA s/d ALASAN, hitam-putih.
Kop perusahaan, kolom No, kolom tanda tangan, dan kolom pengesahan **dipotong di HP** sebelum dikirim.
Kunci Azure hanya ada di server (Render), tidak pernah sampai ke aplikasi.

Cara mengaktifkan (sekali):
1. Masuk [portal.azure.com](https://portal.azure.com) (akun Microsoft; Azure for Students tidak perlu kartu kredit).
2. **Create a resource** → cari **Computer Vision** → **Create**.
   Region: **Southeast Asia** (atau East US / West Europe), Pricing tier: **Free F0**, nama bebas → **Review + create**.
   (Satu langganan hanya boleh punya satu resource F0 Computer Vision.)
3. Buka resource → **Keys and Endpoint** → salin **KEY 1** dan **Endpoint**.
4. Di Render → service backend → **Environment**: isi `AZURE_VISION_ENDPOINT` (mis.
   `https://nama-anda.cognitiveservices.azure.com`) dan `AZURE_VISION_KEY`. Opsional
   `AZURE_VISION_BATAS_BULANAN` (bawaan 4500, supaya tidak pernah lewat kuota gratis).
5. Deploy ulang. Di layar Foto SPL akan tertulis *Pembaca: Azure (sisa N bulan ini)*.

Pemakaian dihitung per bulan di tabel `PemakaianOcr`. Kalau batas tercapai, Azure mati atau tabel SPL
tidak terdeteksi (foto terlalu miring/terpotong), aplikasi otomatis kembali ke pembaca lokal di bawah.
Tips foto: seluruh tabel masuk bingkai, kertas rata, cahaya cukup; kemiringan sampai ±4° diluruskan otomatis.
Hasil baca tetap **wajib diperiksa** di preview sebelum disimpan.

Kalau Azure belum diatur, pembaca foto memakai **tesseract.js** yang berjalan di perangkat (foto tidak dikirim ke layanan lain).
Filenya (±16 MB, termasuk data bahasa Indonesia & Inggris) disalin otomatis ke `client/public/ocr`
saat `npm run dev`/`build` dan hanya diunduh saat fitur Foto SPL pertama kali dipakai.
Akurasi terbaik untuk SPL ketikan/cetak yang mencantumkan NIK; tulisan tangan biasanya perlu dicentang manual.

## Portal karyawan

Karyawan bisa melihat lemburnya sendiri di alamat yang sama (web, PWA, Android, iOS, desktop).
Di halaman masuk pilih tab **Karyawan**, lalu masuk dengan **NIK + sandi**.

| Fitur | Keterangan |
|---|---|
| Beranda | Status tap hari ini, total upah lembur bulan ini, jumlah tap kerja/libur, pengajuan yang menunggu |
| Riwayat | Semua tap per bulan (label *Manual* kalau ditambahkan HRD) |
| Slip lembur PDF | Rincian bulanan A4, dibuat server (`GET /api/portal/slip?bulan=YYYY-MM`) |
| Lapor tap terlewat | Karyawan mengajukan tanggal, jam, alasan → admin **Setujui** (otomatis jadi tap manual) atau **Tolak** (dengan catatan) di menu *Pengajuan tap* |
| Kartu QR cadangan | QR yang sama dengan ID card, untuk saat kartu tertinggal |
| Notifikasi | Saat lembur tercatat (scan/manual) dan saat pengajuan disetujui/ditolak |

**Akun karyawan.** Admin membuka *Data karyawan* → **Aktifkan portal** / **Reset sandi portal**.
Sandi awal 8 karakter tampil sekali (tombol *Salin untuk dikirim* untuk WhatsApp). Saat masuk pertama
karyawan wajib membuat sandi sendiri (minimal 8 karakter, huruf + angka, tidak berisi NIK).
Karyawan baru otomatis mendapat sandi awal saat ditambahkan. Reset sandi atau ganti sandi
langsung mengeluarkan karyawan dari semua perangkat lain. Token karyawan dan token petugas/admin
berbeda jenis, jadi karyawan tidak bisa membuka rute scan/rekap, dan sebaliknya.

Seed contoh: semua contoh karyawan memakai sandi awal `karyawan123` (ubah lewat `SEED_KARYAWAN_PASSWORD`).

### Mengaktifkan notifikasi

1. **Web/PWA (Chrome, Edge, Firefox, Android; iPhone iOS 16.4+ setelah *Tambah ke Layar Utama*)**
   ```bash
   cd server
   npm run vapid      # mencetak Public Key dan Private Key
   ```
   Isi `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, dan `VAPID_SUBJECT` (mis. `mailto:hrd@perusahaan.co.id`)
   di Render. Karyawan lalu menekan **Aktifkan notifikasi** di Beranda atau Akun.
2. **Aplikasi Android/iOS (opsional, lewat Firebase Cloud Messaging)**
   - Buat project di Firebase, tambahkan aplikasi Android dengan package `id.lemburin.app`.
   - Unduh `google-services.json` → simpan sebagai secret GitHub `GOOGLE_SERVICES_JSON`
     (workflow otomatis memasangnya dan mengaktifkan `VITE_FCM=true`).
     Untuk build sendiri: taruh di `client/android/app/` dan isi `VITE_FCM=true` di `client/.env.native`.
   - Firebase → Project settings → Service accounts → *Generate new private key*,
     lalu isi `FIREBASE_SERVICE_ACCOUNT` di Render (JSON-nya, atau `base64 -w0 file.json`).
   - iOS: tambahkan `GoogleService-Info.plist` dan kunci APNs di Firebase.
   Tanpa langkah ini aplikasi tetap jalan; tombol notifikasi saja yang disembunyikan.
3. Desktop (Electron) belum mendukung notifikasi push.

## Aplikasi Android, iOS, dan desktop

Ada dua cara memasang lemburin sebagai aplikasi:

1. **PWA (paling cepat, tanpa build).** Buka domain Vercel di Chrome Android, menu ⋮ >
   **Instal aplikasi**. iPhone: Safari > Bagikan > **Tambah ke Layar Utama**.
   Di laptop: Chrome/Edge > ikon instal di address bar.
2. **Aplikasi native** (APK, installer .exe/.dmg/.AppImage) dari folder `client/android`,
   `client/ios`, dan `desktop/`. Penjelasannya di bawah.

### Yang berbeda di versi native

- File aplikasi ada di dalam paket, jadi tampilan langsung terbuka tanpa menunggu Vercel.
  Data tetap dari backend Render, jadi tetap butuh internet.
- Android/iOS: **Ekspor Excel** dan **Unduh ID card** membuka lembar Bagikan
  (simpan ke Files/Drive atau kirim lewat WhatsApp), karena WebView tidak bisa mengunduh langsung.
- Android: tombol **Kembali** menutup popup/menu dulu, baru pindah halaman; di halaman awal keluar aplikasi.
- Desktop: unduhan memakai dialog Simpan biasa; kamera laptop/webcam bisa dipakai untuk scan.
- Backend otomatis menerima origin aplikasi native (`https://localhost`, `capacitor://localhost`,
  `app://lemburin`). Matikan dengan `IZINKAN_APLIKASI_NATIVE=false` kalau hanya memakai web.

### Cara termudah: build otomatis di GitHub

1. Push repo ke GitHub.
2. **Settings → Secrets and variables → Actions → Variables → New variable**:
   `LEMBURIN_API_URL` = alamat backend Render, mis. `https://lemburin-api.onrender.com`.
3. Buat tag versi lalu push:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
4. Tunggu workflow **Build aplikasi** selesai (±10–15 menit). Hasilnya ada di halaman **Releases**:
   `lemburin-android-debug.apk`, installer Windows `.exe`, macOS `.dmg` (arm64 & x64),
   Linux `.AppImage` dan `.deb`.

Workflow juga bisa dijalankan manual dari tab **Actions → Build aplikasi → Run workflow**;
hasilnya ada di bagian *Artifacts* di halaman run tersebut.

Catatan pemasangan:
- **APK debug** bisa langsung dipasang di HP (izinkan "instal dari sumber tidak dikenal").
  Untuk Play Store butuh APK/AAB rilis bertanda tangan: buat keystore sekali
  (`keytool -genkey -v -keystore lemburin.jks -alias lemburin -keyalg RSA -keysize 2048 -validity 10000`),
  lalu isi secret `ANDROID_KEYSTORE_BASE64` (`base64 -w0 lemburin.jks`), `ANDROID_KEYSTORE_PASSWORD`,
  `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Simpan keystore baik-baik: kalau hilang, update aplikasi di Play Store tidak bisa dikirim.
- **Windows**: installer belum bertanda tangan, jadi SmartScreen menampilkan peringatan.
  Klik *More info → Run anyway*.
- **macOS**: belum dinotarisasi Apple. Klik kanan aplikasi → *Open* → *Open* saat pertama kali.

### Build sendiri di komputer

Siapkan dulu alamat backend:

```bash
cd client
cp .env.native.example .env.native   # lalu ganti VITE_API_URL dengan alamat Render
npm install
```

**Android** (butuh Android Studio + JDK 21):

```bash
npm run android          # build web mode native, sync, lalu buka Android Studio
```
Di Android Studio: tombol ▶ untuk menjalankan di HP (aktifkan USB debugging),
atau *Build → Build App Bundle(s) / APK(s)*.

**iOS** (butuh Mac + Xcode, untuk App Store perlu akun Apple Developer):

```bash
npm run ios              # build, sync, lalu buka Xcode
```

**Desktop**:

```bash
cd desktop
npm install
npm start                # coba jalankan
npm run dist             # buat installer untuk OS komputer ini, hasil di desktop/release/
```

Saat mengembangkan tampilan, jalankan `npm run dev` di `client`, lalu `npm run dev` di
`desktop` supaya jendela Electron memakai Vite dev server (perubahan langsung terlihat).

Ikon & splash Android/iOS dibuat dari `client/assets/` dengan `npm run ikon:native`.
File sumbernya dibuat oleh `brand/buat-logo.py` (fungsi `build_native`).
Setiap kali kode React berubah, jalankan lagi `npm run cap:sync` sebelum build Android/iOS.

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
| GET | `/api/karyawan/:id/ringkasan-hapus` | admin | Jumlah lembur/pengajuan/data wajah yang ikut terhapus |
| DELETE | `/api/karyawan/:id` | admin | Hapus permanen. Kalau sudah punya lembur, wajib `{ konfirmasiNik }`; riwayatnya ikut terhapus (untuk karyawan resign pakai nonaktifkan) |
| GET | `/api/rekap?bulan=YYYY-MM&departemen=` | admin | Rekap bulanan |
| GET | `/api/rekap/export?bulan=YYYY-MM` | admin | Unduh rekap .xlsx |
| POST | `/api/rekap/tap` | admin | Tap manual untuk lembur yang lupa di-tap |
| DELETE | `/api/rekap/tap/:id` | admin | Hapus tap yang keliru |
| POST | `/api/karyawan/:id/sandi-portal` | admin | Aktifkan/reset akun portal, mengembalikan sandi awal (sekali) |
| GET | `/api/pengajuan?status=` | admin | Daftar pengajuan tap terlewat |
| POST | `/api/pengajuan/:id/setujui` · `/tolak` | admin | Proses pengajuan |
| POST | `/api/portal/login` | karyawan | Masuk dengan NIK + sandi |
| POST | `/api/portal/ganti-sandi` | karyawan | Ganti sandi (wajib saat masih sandi awal) |
| GET | `/api/portal/ringkasan?bulan=` | karyawan | Total, daftar tap, status hari ini |
| GET | `/api/portal/slip?bulan=` | karyawan | Slip lembur PDF |
| GET | `/api/portal/qr` | karyawan | Kartu QR cadangan |
| GET/POST/DELETE | `/api/portal/pengajuan` | karyawan | Lapor & batalkan tap terlewat |
| POST/DELETE | `/api/portal/push/langganan` | karyawan | Daftar/hapus perangkat notifikasi |
| GET | `/api/dashboard` | admin | Ringkasan dashboard |
| GET/POST/PATCH | `/api/pengguna`, `/api/pengguna/:id` | admin | Kelola akun: tambah, edit (username, nama, peran, area), aktif/nonaktif, reset sandi. Minimal satu admin aktif dijaga |
| DELETE | `/api/pengguna/:id` | admin | Hapus akun. Ditolak (409) bila akun sudah mencatat tap/SPL; nonaktifkan saja |
| GET | `/api/scan/qr-mandiri`, `/api/scan/qr-mandiri/pemakai` | admin, petugas | QR dinamis (berganti 10 detik) & daftar tap lewat QR itu hari ini |
| GET/PUT | `/api/shift/hari` | petugas, admin | Jadwal shift tanggal kerja + penanda `{ tanggal, shift1Lembur }` |
| GET/POST/DELETE | `/api/portal/tap` | karyawan | Status, tap in / tap out (wajah + QR), batal tap in |
| POST | `/api/portal/tap-eksklusif` | karyawan berizin | Sekali scan wajah + ID card sendiri `{ kartu, vektor, hidup, lokasi }`, dihitung 5,5 / 14 jam |
| GET/POST/DELETE | `/api/portal/wajah` | karyawan | Daftar / cabut data wajah |
| GET/POST/DELETE | `/api/mandiri/wajah…`, `/api/mandiri/sesi…`, GET/PUT `/api/mandiri/aturan` | admin | Persetujuan wajah, tap in berjalan, aturan hitung |
| GET `/api/mandiri/eksklusif`, PUT/DELETE `/api/mandiri/eksklusif/:karyawanId`, PUT `/api/mandiri/lokasi-pabrik` | | admin | Izin tap eksklusif, titik pabrik, daftar tap eksklusif + lokasi |
| GET | `/api/lembur-massal/batas` | admin, petugas | Batas tanggal, daftar karyawan, pembaca (Azure/lokal) |
| POST | `/api/lembur-massal/baca-spl` | admin, petugas | Baca potongan SPL lewat Groq/Gemini/Azure (kunci di server) |
| POST | `/api/lembur-massal` | admin, petugas | Simpan lembur massal (+ jam/alasan per karyawan, foto SPL) |

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
