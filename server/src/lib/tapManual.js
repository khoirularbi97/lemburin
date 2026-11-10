// Tap manual dipakai di dua tempat: admin menambah langsung dari Rekap, dan
// admin menyetujui pengajuan karyawan. Aturannya harus sama persis.
import { cekTanggalManual, hitungLembur, hitungLemburAktual, jamWIB, keTanggalDb, menitGantiHari } from './lembur.js';
import { jamKerjaKaryawan } from './shift.js';
import { ambilAturan, jejakAturan } from './aturanLembur.js';
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
/**
 * `mulai` (HH:mm) diisi → jam aktual mulai–`jam` dihitung sesuai PP 35/2021 (metode AKTUAL).
 * Kosong → jam hitung tetap 5,5 / 14 seperti sebelumnya.
 */
export async function buatTapManual(db, { karyawan, tanggal, jam, mulai = null, alasan, adminId, splId = null, sumber = 'MANUAL' }) {
  wajibTanggalManual(tanggal);
  if (!karyawan.aktif) throw new HttpError(403, `${karyawan.nama} sedang nonaktif.`);
  const sudah = await tapPada(db, karyawan.id, tanggal);
  if (sudah) throw new HttpError(409, pesanSudahTap(karyawan.nama, sudah), { kode: 'SUDAH_TAP' });

  const libur = await liburPada(db, tanggal);
  const aturan = await ambilAturan(db);
  let aktual = {};
  let hasil;
  const menit = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  // Fitur shift: jam sebelum jam ganti hari (mis. 02.00) adalah dini hari setelah tanggal kerja
  const ganti = menitGantiHari(aturan);
  const waktuPada = (hhmm) => {
    const t = new Date(`${tanggal}T${hhmm}:00+07:00`);
    return ganti && menit(hhmm) < ganti ? new Date(t.getTime() + 86400000) : t;
  };
  if (mulai) {
    const jamKerja = await jamKerjaKaryawan(db, karyawan, tanggal, aturan);
    hasil = hitungLemburAktual({ upahBulanan: karyawan.upahBulanan, tanggal, libur, mulai, selesai: jam, aturan, jamKerja });
    if (hasil.menitLembur <= 0) {
      const sebab = hasil.jenisHari !== 'KERJA' ? '' : jamKerja ? ` (masih jam kerja ${jamKerja.nama} ${jamKerja.masuk}–${jamKerja.pulang})` : ` (lembur hari kerja dihitung mulai ${hasil.mulaiDihitung})`;
      throw new HttpError(400, `${karyawan.nama}: tidak ada jam lembur dari ${mulai} sampai ${jam}${sebab}.`, { kode: 'NOL_JAM' });
    }
    // Selesai lebih kecil dari mulai = lewat tengah malam (hari berikutnya)
    const durasi = ((menit(jam) - menit(mulai) + 1440) % 1440) || 1440;
    const t0 = waktuPada(mulai);
    const t1 = new Date(t0.getTime() + durasi * 60000);
    aktual = {
      metode: 'AKTUAL', mulai: t0, selesai: t1, menitLembur: hasil.menitLembur,
      rincianHitung: {
        rincian: hasil.rincian, mulaiDihitung: hasil.mulaiDihitung, menitKotor: hasil.menitKotor,
        menitIstirahat: hasil.menitIstirahat, peringatan: hasil.peringatan, aturan: jejakAturan(aturan),
        ...(jamKerja ? { shift: { kode: jamKerja.kode, nama: jamKerja.nama, grup: jamKerja.grup, masuk: jamKerja.masuk, pulang: jamKerja.pulang } } : {}),
      },
    };
  } else {
    hasil = hitungLembur({ upahBulanan: karyawan.upahBulanan, tanggal, libur, aturan });
  }
  const tap = await db.lembur.create({
    data: {
      karyawanId: karyawan.id,
      tanggal: keTanggalDb(tanggal),
      waktuTap: aktual.selesai || waktuPada(jam),
      jenisHari: hasil.jenisHari,
      jamHitung: hasil.jamHitung,
      upahSejam: hasil.upahSejam,
      nominal: hasil.nominal,
      petugasId: adminId,
      manual: true,
      alasan,
      sumber,
      ...aktual,
      ...(splId ? { splId } : {}),
    },
  });
  return { tap, hasil };
}
