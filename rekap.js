// Fungsi server Vercel: rekap skor siswa (satu file).
// Butuh: Upstash Redis (Vercel Storage) dan variabel GURU_PIN.
const crypto = require('crypto');
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = 'lgj:siswa';

async function cmd(a) {
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOK, 'Content-Type': 'application/json' },
    body: JSON.stringify(a),
  });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error || 'kv');
  return j.result;
}
const same = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ err: 'metode' });
  if (!URL_ || !TOK) return res.status(503).json({ err: 'belum disetel' });
  let b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  try {
    if (b.aksi === 'kirim') {
      const n = String(b.n || '').trim().slice(0, 30), c = String(b.c || '').trim().slice(0, 12);
      if (n.length < 2) return res.status(400).json({ err: 'nama' });
      const p = {};
      for (const k of ['0', '1', '2', '3', '4']) {
        const q = b.p && b.p[k];
        if (Array.isArray(q)) p[k] = [
          Math.max(0, Math.min(500, Math.round(+q[0] || 0))),
          Math.max(1, Math.min(5, Math.round(+q[1] || 1))),
          Math.max(0, Math.min(3, Math.round(+q[2] || 0))),
        ];
      }
      const key = n.toLowerCase() + '|' + c.toLowerCase();
      let old = null;
      try { const r = await cmd(['HGET', KEY, key]); if (r) old = JSON.parse(r); } catch (e) {}
      const m = old && old.p ? old.p : {};
      for (const k in p) {
        if (!m[k] || p[k][0] > m[k][0]) m[k] = p[k];
        else m[k][1] = Math.max(m[k][1], p[k][1]);
      }
      await cmd(['HSET', KEY, key, JSON.stringify({ n, c, p: m, t: new Date().toISOString().slice(0, 10) })]);
      return res.status(200).json({ ok: true });
    }
    const pin = process.env.GURU_PIN;
    if (!pin) return res.status(503).json({ err: 'belum disetel' });
    if (!same(b.pin || '', pin)) {
      await new Promise((r) => setTimeout(r, 500));
      return res.status(401).json({ err: 'pin' });
    }
    if (b.aksi === 'hapus') { await cmd(['DEL', KEY]); return res.status(200).json({ ok: true, rows: [] }); }
    if (b.aksi === 'ambil') {
      const r = (await cmd(['HGETALL', KEY])) || [];
      const rows = [];
      for (let i = 0; i < r.length; i += 2) { try { rows.push(JSON.parse(r[i + 1])); } catch (e) {} }
      return res.status(200).json({ ok: true, rows });
    }
    return res.status(400).json({ err: 'aksi' });
  } catch (e) {
    return res.status(500).json({ err: 'server' });
  }
};
