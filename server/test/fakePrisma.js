// Prisma tiruan di memori untuk menguji rute tanpa database.
// Hanya mendukung operasi yang dipakai rute portal, pengajuan, rekap manual, dan scan.

const RELASI = {
  lembur: { petugas: ['user', 'petugasId'], karyawan: ['karyawan', 'karyawanId'], spl: ['spl', 'splId'] },
  pengajuanTap: { karyawan: ['karyawan', 'karyawanId'], diprosesOleh: ['user', 'diprosesOlehId'], lembur: ['lembur', 'lemburId'] },
  sesiLembur: { karyawan: ['karyawan', 'karyawanId'], petugas: ['user', 'petugasId'] },
  wajahKaryawan: { karyawan: ['karyawan', 'karyawanId'] },
};

function cocokNilai(v, syarat) {
  if (syarat && typeof syarat === 'object' && !(syarat instanceof Date)) {
    if ('in' in syarat) return syarat.in.includes(v);
    if ('not' in syarat) return syarat.not === null ? v != null : v !== syarat.not;
    if ('notIn' in syarat) return !syarat.notIn.includes(v);
    if ('gte' in syarat || 'lt' in syarat) {
      const t = v?.getTime?.() ?? v;
      return (!('gte' in syarat) || t >= syarat.gte.getTime()) && (!('lt' in syarat) || t < syarat.lt.getTime());
    }
  }
  if (v instanceof Date && syarat instanceof Date) return v.getTime() === syarat.getTime();
  if (syarat === null) return v == null; // kolom opsional yang belum diisi
  return v === syarat;
}

function cocok(baris, where = {}) {
  return Object.entries(where).every(([k, s]) => {
    if (k === 'karyawanId_tanggal') return cocok(baris, s);
    if (k === 'NOT') return !cocok(baris, s);
    return cocokNilai(baris[k], s);
  });
}

function terapkan(r, data) {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && 'increment' in v) r[k] = (r[k] || 0) + v.increment;
    else r[k] = v;
  }
}

export function buatFakePrisma() {
  const db = { user: [], karyawan: [], lembur: [], pengajuanTap: [], hariLibur: [], langgananPush: [], tapDitolak: [], notifikasi: [], spl: [], pemakaianOcr: [], sesiLembur: [], wajahKaryawan: [], pengaturan: [], qrTokenLama: [] };
  const id = { user: 0, karyawan: 0, lembur: 0, pengajuanTap: 0, langgananPush: 0, tapDitolak: 0, notifikasi: 0, spl: 0, pemakaianOcr: 0, sesiLembur: 0, wajahKaryawan: 0, pengaturan: 0, qrTokenLama: 0 };

  function sertakan(tabel, baris, include) {
    if (!baris || !include) return baris;
    const out = { ...baris };
    for (const [nama, opsi] of Object.entries(include)) {
      const [t, fk] = RELASI[tabel]?.[nama] || [];
      if (!t) continue;
      const r = db[t].find((x) => x.id === baris[fk]) || null;
      out[nama] = r && opsi.select ? Object.fromEntries(Object.keys(opsi.select).map((k) => [k, r[k]])) : r;
    }
    return out;
  }

  function model(tabel) {
    const rows = () => db[tabel];
    const now = () => new Date();
    return {
      async findUnique({ where, include }) { return sertakan(tabel, rows().find((r) => cocok(r, where)) || null, include); },
      async findFirst({ where = {}, include, orderBy } = {}) {
        let l = rows().filter((r) => cocok(r, where));
        if (orderBy?.tanggal === 'desc') l = [...l].sort((a, b) => b.tanggal - a.tanggal);
        return sertakan(tabel, l[0] || null, include);
      },
      async findMany({ where = {}, include, take, orderBy } = {}) {
        let l = rows().filter((r) => cocok(r, where));
        const urut = [orderBy].flat().filter(Boolean);
        if (urut.length) {
          l = [...l].sort((x, y) => {
            for (const o of urut) {
              const [k, arah] = Object.entries(o)[0];
              const a1 = x[k]?.getTime?.() ?? x[k]; const b1 = y[k]?.getTime?.() ?? y[k];
              if (a1 < b1) return arah === 'desc' ? 1 : -1;
              if (a1 > b1) return arah === 'desc' ? -1 : 1;
            }
            return 0;
          });
        }
        return l.slice(0, take ?? Infinity).map((r) => sertakan(tabel, r, include));
      },
      async count({ where = {} } = {}) { return rows().filter((r) => cocok(r, where)).length; },
      async create({ data }) {
        if (tabel === 'lembur' && rows().some((r) => r.karyawanId === data.karyawanId && r.tanggal.getTime() === data.tanggal.getTime())) {
          const e = new Error('Unique constraint'); e.code = 'P2002'; throw e;
        }
        if (tabel === 'sesiLembur' && rows().some((r) => r.karyawanId === data.karyawanId)) {
          const e = new Error('Unique constraint'); e.code = 'P2002'; throw e;
        }
        if (tabel === 'langgananPush' && rows().some((r) => r.endpoint === data.endpoint)) {
          const e = new Error('Unique constraint'); e.code = 'P2002'; throw e;
        }
        const baris = { id: ++id[tabel], createdAt: now(), updatedAt: now(), ...(tabel === 'lembur' ? { manual: false, metode: 'TETAP' } : {}), ...(tabel === 'pengajuanTap' ? { status: 'MENUNGGU' } : {}), ...(tabel === 'notifikasi' ? { dibaca: false } : {}), ...data };
        rows().push(baris);
        return { ...baris };
      },
      async update({ where, data }) {
        const r = rows().find((x) => cocok(x, where));
        if (!r) { const e = new Error('not found'); e.code = 'P2025'; throw e; }
        terapkan(r, data);
        r.updatedAt = now();
        return { ...r };
      },
      async updateMany({ where, data }) {
        const l = rows().filter((x) => cocok(x, where));
        l.forEach((r) => Object.assign(r, data));
        return { count: l.length };
      },
      async upsert({ where, update, create }) {
        const r = rows().find((x) => cocok(x, where));
        if (r) { terapkan(r, update); return { ...r }; }
        return this.create({ data: create });
      },
      async deleteMany({ where }) {
        const sebelum = rows().length;
        db[tabel] = rows().filter((x) => !cocok(x, where));
        return { count: sebelum - db[tabel].length };
      },
      async delete({ where }) {
        const r = rows().find((x) => cocok(x, where));
        db[tabel] = rows().filter((x) => x !== r);
        return r;
      },
    };
  }

  const prisma = {
    _db: db,
    user: model('user'),
    karyawan: model('karyawan'),
    lembur: model('lembur'),
    pengajuanTap: model('pengajuanTap'),
    hariLibur: model('hariLibur'),
    langgananPush: model('langgananPush'),
    notifikasi: model('notifikasi'),
    spl: model('spl'),
    pemakaianOcr: model('pemakaianOcr'),
    sesiLembur: model('sesiLembur'),
    wajahKaryawan: model('wajahKaryawan'),
    pengaturan: model('pengaturan'),
    qrTokenLama: model('qrTokenLama'),
    tapDitolak: model('tapDitolak'),
    async $queryRaw(strings, ...nilai) {
      const sql = strings.join('?');
      let l = db.lembur;
      if (sql.includes('"karyawanId" =')) l = l.filter((r) => r.karyawanId === nilai[0]);
      return [...new Set(l.map((r) => r.tanggal.getTime()))].map((t) => ({ tanggal: new Date(t) }));
    },
    // Transaksi sederhana: salin data, kembalikan kalau gagal
    async $transaction(fn) {
      const cadangan = JSON.parse(JSON.stringify(db), (k, v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) ? new Date(v) : v));
      try { return await fn(prisma); } catch (e) { Object.assign(db, cadangan); throw e; }
    },
  };
  return prisma;
}
