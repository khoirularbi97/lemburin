// Admin memproses pengajuan tap terlewat dari portal karyawan.
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ah, HttpError, ringkasKaryawan } from '../lib/util.js';
import { cekTanggalManual, dariTanggalDb, hitungLembur, jamWIB } from '../lib/lembur.js';
import { buatTapManual, liburPada, tapPada } from '../lib/tapManual.js';
import { kabariPengajuanDitolak, kabariTapTercatat } from '../lib/notifikasi.js';

const router = Router();
const STATUS = ['MENUNGGU', 'DISETUJUI', 'DITOLAK', 'DIBATALKAN'];

router.get('/jumlah', ah(async (req, res) => {
  res.json({ menunggu: await prisma.pengajuanTap.count({ where: { status: 'MENUNGGU' } }) });
}));

router.get('/', ah(async (req, res) => {
  const status = STATUS.includes(req.query.status) ? req.query.status : 'MENUNGGU';
  const list = await prisma.pengajuanTap.findMany({
    where: { status },
    include: {
      karyawan: true,
      diprosesOleh: { select: { username: true } },
      lembur: { select: { nominal: true } },
    },
    orderBy: status === 'MENUNGGU' ? { createdAt: 'asc' } : { diprosesPada: 'desc' },
    take: 200,
  });

  // Untuk yang menunggu: tunjukkan perkiraan nominal dan apakah masih bisa disetujui
  const hasil = await Promise.all(list.map(async (p) => {
    const tanggal = dariTanggalDb(p.tanggal);
    let perkiraan = null;
    let kendala = null;
    if (p.status === 'MENUNGGU') {
      const h = hitungLembur({ upahBulanan: p.karyawan.upahBulanan, tanggal, libur: await liburPada(prisma, tanggal) });
      perkiraan = { label: h.label + (h.keterangan ? ` · ${h.keterangan}` : ''), jamHitung: h.jamHitung, upahSejam: h.upahSejam, nominal: h.nominal };
      const cek = cekTanggalManual(tanggal);
      const ada = await tapPada(prisma, p.karyawanId, tanggal);
      if (!cek.ok) kendala = cek.pesan;
      else if (ada) kendala = `Sudah ada tap ${jamWIB(ada.waktuTap)} WIB (${ada.manual ? 'manual' : 'scan'} oleh ${ada.petugas.username}).`;
      else if (!p.karyawan.aktif) kendala = 'Karyawan sedang nonaktif.';
    }
    return {
      id: p.id,
      karyawan: ringkasKaryawan(p.karyawan),
      tanggal,
      jam: p.jam,
      alasan: p.alasan,
      status: p.status,
      catatanAdmin: p.catatanAdmin,
      diprosesOleh: p.diprosesOleh?.username || null,
      diprosesPada: p.diprosesPada,
      dibuat: p.createdAt,
      nominal: p.lembur?.nominal ?? null,
      perkiraan,
      kendala,
    };
  }));
  res.json(hasil);
}));

async function ambilMenunggu(id) {
  const p = await prisma.pengajuanTap.findUnique({ where: { id }, include: { karyawan: true } });
  if (!p) throw new HttpError(404, 'Pengajuan tidak ditemukan.');
  if (p.status !== 'MENUNGGU') throw new HttpError(409, 'Pengajuan ini sudah diproses atau dibatalkan karyawan.');
  return p;
}

router.post('/:id/setujui', ah(async (req, res) => {
  const { jam, catatan } = z.object({
    jam: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
    catatan: z.string().trim().max(200).optional(),
  }).parse(req.body || {});
  const p = await ambilMenunggu(Number(req.params.id));
  const tanggal = dariTanggalDb(p.tanggal);

  const { tap } = await prisma.$transaction(async (tx) => {
    const r = await buatTapManual(tx, {
      karyawan: p.karyawan,
      tanggal,
      jam: jam || p.jam,
      alasan: `Pengajuan karyawan: ${p.alasan}`.slice(0, 300),
      adminId: req.user.id,
    });
    // updateMany + status MENUNGGU mencegah dua admin menyetujui bersamaan
    const u = await tx.pengajuanTap.updateMany({
      where: { id: p.id, status: 'MENUNGGU' },
      data: { status: 'DISETUJUI', lemburId: r.tap.id, diprosesOlehId: req.user.id, diprosesPada: new Date(), catatanAdmin: catatan || null },
    });
    if (u.count !== 1) throw new HttpError(409, 'Pengajuan ini baru saja diproses admin lain.');
    return r;
  });

  kabariTapTercatat(p.karyawan, tap, { dariPengajuan: true });
  res.json({ ok: true, tap: { id: tap.id, tanggal, jam: jamWIB(tap.waktuTap), jamHitung: tap.jamHitung, nominal: tap.nominal } });
}));

router.post('/:id/tolak', ah(async (req, res) => {
  const { catatan } = z.object({ catatan: z.string().trim().min(3, 'Tulis alasan penolakan, minimal 3 huruf').max(200) }).parse(req.body || {});
  const p = await ambilMenunggu(Number(req.params.id));
  const u = await prisma.pengajuanTap.updateMany({
    where: { id: p.id, status: 'MENUNGGU' },
    data: { status: 'DITOLAK', catatanAdmin: catatan, diprosesOlehId: req.user.id, diprosesPada: new Date() },
  });
  if (u.count !== 1) throw new HttpError(409, 'Pengajuan ini baru saja diproses admin lain.');
  kabariPengajuanDitolak({ ...p, catatanAdmin: catatan });
  res.json({ ok: true });
}));

export default router;
