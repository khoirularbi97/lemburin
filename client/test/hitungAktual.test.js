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
