import { useCallback, useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

const jeda = (ms) => new Promise((r) => setTimeout(r, ms));

export function pesanKamera(err) {
  const s = `${err?.name || ''} ${err?.message || err || ''}`;
  if (/NotAllowed|Permission/i.test(s)) return 'Izin kamera ditolak. Ketuk ikon gembok di samping alamat situs, izinkan Kamera, lalu ketuk Coba lagi.';
  if (/NotFound|Requested device not found|no camera/i.test(s)) return 'Kamera tidak ditemukan di perangkat ini. Pakai foto QR.';
  if (/NotReadable|Could not start|TrackStart/i.test(s)) return 'Kamera sedang dipakai aplikasi atau tab lain. Tutup aplikasi kamera, WhatsApp, atau tab lemburin yang lain, lalu ketuk Coba lagi.';
  if (/secure|https/i.test(s)) return 'Kamera hanya bisa dibuka lewat HTTPS.';
  return 'Kamera tidak bisa dibuka. Ketuk Coba lagi atau pakai foto QR.';
}

/**
 * Mengelola kamera scanner dengan aman:
 * - semua start/stop dijalankan berurutan, jadi kamera tidak pernah dibuka dua kali
 *   (penyebab umum error "kamera sedang dipakai" saat pindah halaman),
 * - kalau kamera belakang default gagal, mencoba kamera lain satu per satu,
 * - kamera dilepas saat aplikasi diminimalkan (misalnya saat membuka kamera untuk
 *   foto QR) dan dinyalakan lagi saat aplikasi dibuka kembali.
 */
export function useKamera(regionId, onDecode) {
  const [status, setStatus] = useState({ status: 'memulai', pesan: '' });
  const ref = useRef({ scanner: null, antrean: Promise.resolve(), hidup: true });
  const decodeRef = useRef(onDecode);
  decodeRef.current = onDecode;

  const antre = useCallback((tugas) => {
    ref.current.antrean = ref.current.antrean.then(tugas, tugas).catch(() => {});
    return ref.current.antrean;
  }, []);

  const matikan = useCallback(() => antre(async () => {
    const s = ref.current.scanner;
    ref.current.scanner = null;
    if (!s) return;
    try { if (s.isScanning) await s.stop(); } catch { /* sudah berhenti */ }
    try { s.clear(); } catch { /* abaikan */ }
  }), [antre]);

  const nyalakan = useCallback(() => antre(async () => {
    if (!ref.current.hidup || ref.current.scanner) return;
    setStatus({ status: 'memulai', pesan: '' });

    const config = {
      fps: 10,
      qrbox: (w, h) => { const s = Math.floor(Math.min(w, h) * 0.7); return { width: s, height: s }; },
    };
    const saatTerbaca = (teks) => decodeRef.current?.(teks);

    let pilihan = [{ facingMode: 'environment' }];
    let sudahDaftar = false;
    let errAkhir = null;

    for (let i = 0; i < pilihan.length && i < 5; i += 1) {
      // Pakai pembaca barcode bawaan HP (BarcodeDetector) kalau ada: lebih cepat & lebih tahan foto buram
      const s = new Html5Qrcode(regionId, { verbose: false, experimentalFeatures: { useBarCodeDetectorIfSupported: true } });
      try {
        await s.start(pilihan[i], config, saatTerbaca, () => {});
        if (!ref.current.hidup) {
          await s.stop().catch(() => {});
          s.clear();
          return;
        }
        ref.current.scanner = s;
        setStatus({ status: 'nyala', pesan: '' });
        return;
      } catch (err) {
        errAkhir = err;
        try { s.clear(); } catch { /* abaikan */ }
        if (/NotAllowed|Permission/i.test(`${err?.name} ${err?.message || err}`)) break;
        await jeda(500);
        // Setelah cara default gagal, coba setiap kamera satu per satu (kamera belakang dulu)
        if (!sudahDaftar) {
          sudahDaftar = true;
          try {
            const kamera = await Html5Qrcode.getCameras();
            const belakang = kamera.filter((k) => /back|rear|belakang|environment/i.test(k.label));
            const lain = kamera.filter((k) => !belakang.includes(k));
            pilihan = pilihan.concat([...belakang, ...lain].map((k) => k.id));
          } catch { /* daftar kamera tidak tersedia */ }
        }
      }
    }
    setStatus({ status: 'gagal', pesan: pesanKamera(errAkhir) });
  }), [antre, regionId]);

  useEffect(() => {
    ref.current.hidup = true;
    nyalakan();
    const saatTerlihat = () => {
      if (document.visibilityState === 'hidden') matikan();
      else nyalakan();
    };
    document.addEventListener('visibilitychange', saatTerlihat);
    return () => {
      ref.current.hidup = false;
      document.removeEventListener('visibilitychange', saatTerlihat);
      matikan();
    };
  }, [nyalakan, matikan]);

  const tahan = useCallback(() => {
    try { ref.current.scanner?.pause(true); } catch { /* belum jalan */ }
  }, []);
  const lanjut = useCallback(() => {
    try { ref.current.scanner?.resume(); } catch { /* belum jalan */ }
  }, []);
  const cobaLagi = useCallback(() => { matikan(); nyalakan(); }, [matikan, nyalakan]);

  return { ...status, tahan, lanjut, cobaLagi };
}
