// Tap manual dipakai di dua tempat: admin menambah langsung dari Rekap, dan
// admin menyetujui pengajuan karyawan. Aturannya harus sama persis.
import { cekTanggalManual, hitungLembur, jamWIB, keTanggalDb } from './lembur.js';
import { HttpError } from './util.js';

export async function liburPada(db, tanggal) {
  const h = await db.hariLibur.findUnique({ where: { tanggal: keTanggalDb(tanggal) } });
  return h ? new Map([[tanggal, h.keterangan]]) : new Map();
}

/** Lempar HttpError kalau tanggal di luar batas tap manual. */
export function wajibTanggalManual(tanggal) {
  const cek = cekTanggalManual(tanggal);
  if (!cek.ok) throw new HttpError(400, cek.pesan);
}

/** Tap yang sudah ada untuk karyawan di tanggal itu, atau null. */
export async function tapPada(db, karyawanId, tanggal) {
  return db.lembur.findUnique({
    where: { karyawanId_tanggal: { karyawanId, tanggal: keTanggalDb(tanggal) } },
    include: { petugas: { select: { username: true } } },
  });
}

export function pesanSudahTap(nama, tap) {
  return `${nama} sudah punya tap di tanggal itu (${jamWIB(tap.waktuTap)} WIB, ${tap.manual ? 'manual' : 'scan'} oleh ${tap.petugas.username}).`;
}

/**
 * Buat tap manual. `db` boleh prisma atau transaksi.
 * @returns {{tap: object, hasil: ReturnType<typeof hitungLembur>}}
 */
export async function buatTapManual(db, { karyawan, tanggal, jam, alasan, adminId, splId = null }) {
  wajibTanggalManual(tanggal);
  if (!karyawan.aktif) throw new HttpError(403, `${karyawan.nama} sedang nonaktif.`);
  const sudah = await tapPada(db, karyawan.id, tanggal);
  if (sudah) throw new HttpError(409, pesanSudahTap(karyawan.nama, sudah), { kode: 'SUDAH_TAP' });

  const hasil = hitungLembur({ upahBulanan: karyawan.upahBulanan, tanggal, libur: await liburPada(db, tanggal) });
  const tap = await db.lembur.create({
    data: {
      karyawanId: karyawan.id,
      tanggal: keTanggalDb(tanggal),
      waktuTap: new Date(`${tanggal}T${jam}:00+07:00`),
      jenisHari: hasil.jenisHari,
      jamHitung: hasil.jamHitung,
      upahSejam: hasil.upahSejam,
      nominal: hasil.nominal,
      petugasId: adminId,
      manual: true,
      alasan,
      ...(splId ? { splId } : {}),
    },
  });
  return { tap, hasil };
}
