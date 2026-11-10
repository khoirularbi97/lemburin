// Salinan mesin hitung di client harus sama persis dengan server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as klien from '../src/lib/hitungAktual.js';
import * as server from '../../server/src/lib/lembur.js';

test('hitungLemburAktual client = server untuk banyak kombinasi', () => {
  const tanggal = ['2026-11-04', '2026-11-07', '2026-11-08'];
  const jam = ['06:45', '07:30', '12:10', '15:00', '16:00', '16:30', '17:20', '18:30', '19:05', '21:00', '23:30', '01:15'];
  const aturan = [
    {},
    { polaKerja: 6, pembulatanMenit: 1, jamPulang: '16:00' },
    { polaKerja: 5, pembulatanMenit: 15, istirahat: [{ mulai: '12:00', selesai: '13:00' }, { mulai: '18:00', selesai: '18:30' }] },
  ];
  const libur = [new Map(), new Map([['2026-11-07', 'Libur']])];
  let n = 0;
  for (const t of tanggal) for (const m of jam) for (const s of jam) for (const a of aturan) for (const l of libur) {
    const o = { upahBulanan: 5_000_000, tanggal: t, mulai: m, selesai: s, aturan: a, libur: l };
    assert.deepEqual(klien.hitungLemburAktual(o), server.hitungLemburAktual(o), JSON.stringify(o));
    n += 1;
  }
  assert.ok(n > 2000);
  assert.deepEqual(klien.ATURAN_AKTUAL_BAWAAN, server.ATURAN_AKTUAL_BAWAAN);
});

test('client = server dengan shift (jam ganti hari 07.00, jam kerja shift, rotasi grup)', () => {
  const shift = { aktif: true, gantiHari: '07:00', shift1: { masuk: '07:00', pulang: '16:00' }, shift2: { masuk: '16:00', pulang: '00:00' }, shift2Lembur: { masuk: '19:30', pulang: '03:30' }, acuanSenin: '2026-11-09', grupShift1: 'A', grup: ['A', 'B'] };
  const aturan = { pembulatanMenit: 15, istirahat: [{ mulai: '12:00', selesai: '13:00' }, { mulai: '00:00', selesai: '00:30' }], shift };
  const jam = ['00:00', '02:30', '03:30', '05:00', '06:59', '07:00', '15:00', '16:00', '19:30', '22:00', '23:45'];
  let n = 0;
  for (const t of ['2026-11-11', '2026-11-13', '2026-11-15', '2026-11-18']) for (const g of ['A', 'B', null]) for (const s1l of [false, true]) {
    const jk = klien.jadwalShift({ grup: g, tanggal: t, aturan, shift1Lembur: s1l });
    assert.deepEqual(jk, server.jadwalShift({ grup: g, tanggal: t, aturan, shift1Lembur: s1l }));
    for (const m of jam) for (const s of jam) {
      const o = { upahBulanan: 5_190_000, tanggal: t, mulai: m, selesai: s, aturan, jamKerja: jk };
      assert.deepEqual(klien.hitungLemburAktual(o), server.hitungLemburAktual(o), JSON.stringify(o));
      n += 1;
    }
    assert.equal(klien.tanggalKerja(t, '03:00', aturan), server.tanggalKerja(t, '03:00', aturan));
  }
  assert.ok(n > 2500);
});
