import { api } from '../../api.js';
import { simpanFile } from '../../platform.js';

/** Unduh slip lembur PDF satu bulan. */
export async function unduhSlip(bulan, nik) {
  const res = await api(`/api/portal/slip?bulan=${bulan}`, { raw: true });
  return simpanFile(await res.blob(), `slip-lembur-${nik}-${bulan}.pdf`);
}

/** Kalau server bilang sandi awal belum diganti, arahkan ke halaman ganti sandi. */
export function tanganiError(err, { toast, nav }) {
  if (err?.data?.kode === 'WAJIB_GANTI_SANDI') { nav('/portal/sandi', { replace: true }); return; }
  toast(err.message, true);
}

export const STATUS_PENGAJUAN = {
  MENUNGGU: ['Menunggu HRD', 'b-warn'],
  DISETUJUI: ['Disetujui', 'b-ok'],
  DITOLAK: ['Ditolak', 'b-err'],
  DIBATALKAN: ['Dibatalkan', 'b-mute'],
};
