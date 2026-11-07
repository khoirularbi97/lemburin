// Lokasi HP untuk tap eksklusif (scan ID card sendiri). Hanya dicatat, tidak memblokir tap.

/**
 * Lokasi HP untuk tap eksklusif. Tidak pernah memblokir tap: kalau ditolak / mati / terlalu lama,
 * yang dikirim hanya alasannya, dan HRD yang menilai.
 */
export function ambilLokasi(batasMs = 12_000) {
  return new Promise((selesai) => {
    if (!('geolocation' in navigator)) { selesai({ gagal: 'Perangkat tidak mendukung lokasi' }); return; }
    const t = setTimeout(() => selesai({ gagal: 'Lokasi terlalu lama didapat' }), batasMs + 1000);
    navigator.geolocation.getCurrentPosition(
      (p) => { clearTimeout(t); selesai({ lat: p.coords.latitude, lng: p.coords.longitude, akurasi: p.coords.accuracy }); },
      (e) => { clearTimeout(t); selesai({ gagal: e.code === 1 ? 'Izin lokasi ditolak' : e.code === 3 ? 'Lokasi terlalu lama didapat' : 'Lokasi tidak tersedia' }); },
      { enableHighAccuracy: true, timeout: batasMs, maximumAge: 60_000 },
    );
  });
}

export function teksLokasi(l) {
  if (!l) return 'tidak ada';
  if (l.gagal) return `tidak tercatat (${l.gagal.toLowerCase()})`;
  if (l.jarakM != null) return `${l.jarakM < 1000 ? `${l.jarakM} m` : `${(l.jarakM / 1000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} km`} dari pabrik${l.jauh ? ' (di luar area)' : ''}`;
  return 'tercatat';
}
