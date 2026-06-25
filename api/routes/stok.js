const express = require('express');
const router = express.Router();
const { getPoolCabang } = require('../db');

// GET /api/cabang/:nama/stok
// Lihat semua stok yang ada di satu cabang (REQ-1: Read)
router.get('/:nama/stok', async (req, res) => {
  const { nama } = req.params;
  try {
    const pool = getPoolCabang(nama);
    const result = await pool.query(`
      SELECT s.id_stok, p.sku, p.nama_barang, p.kategori, s.saldo, s.last_update
      FROM stok s
      JOIN produk p ON s.id_produk = p.id_produk
      ORDER BY p.nama_barang
    `);
    res.json({ cabang: nama, data: result.rows });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/cabang/:nama/mutasi
// Input mutasi stok masuk/keluar (REQ-1: Create, REQ-4: validasi saldo negatif)
// Body: { id_produk, tipe_mutasi: "Masuk"/"Keluar", jumlah, keterangan }
router.post('/:nama/mutasi', async (req, res) => {
  const { nama } = req.params;
  const { id_produk, tipe_mutasi, jumlah, keterangan } = req.body;

  // Validasi input dasar
  if (!id_produk || !tipe_mutasi || !jumlah) {
    return res.status(400).json({ error: 'id_produk, tipe_mutasi, dan jumlah wajib diisi' });
  }
  if (!['Masuk', 'Keluar'].includes(tipe_mutasi)) {
    return res.status(400).json({ error: 'tipe_mutasi harus "Masuk" atau "Keluar"' });
  }
  if (jumlah <= 0) {
    return res.status(400).json({ error: 'jumlah harus lebih dari 0' });
  }

  const pool = getPoolCabang(nama);
  const client = await pool.connect();

  try {
    await client.query('BEGIN'); // mulai transaksi (Step 7: Integritas Data)

    // Cek stok saat ini
    const cekStok = await client.query(
      'SELECT saldo FROM stok WHERE id_produk = $1',
      [id_produk]
    );

    if (cekStok.rows.length === 0) {
      throw new Error('Produk tidak ditemukan di stok cabang ini');
    }

    const saldoSekarang = cekStok.rows[0].saldo;

    // REQ-4: Validasi mencegah saldo negatif
    if (tipe_mutasi === 'Keluar' && saldoSekarang < jumlah) {
      throw new Error(`Stok tidak cukup. Saldo saat ini: ${saldoSekarang}`);
    }

    // Hitung saldo baru
    const saldoBaru = tipe_mutasi === 'Masuk'
      ? saldoSekarang + jumlah
      : saldoSekarang - jumlah;

    // Update saldo stok
    await client.query(
      'UPDATE stok SET saldo = $1, last_update = NOW() WHERE id_produk = $2',
      [saldoBaru, id_produk]
    );

    // Catat log mutasi (REQ-2: log audit, sync_status awalnya false)
    const insertMutasi = await client.query(
      `INSERT INTO mutasi_stok (id_produk, tipe_mutasi, jumlah, keterangan, sync_status)
       VALUES ($1, $2, $3, $4, false) RETURNING *`,
      [id_produk, tipe_mutasi, jumlah, keterangan || null]
    );

    await client.query('COMMIT'); // simpan permanen

    res.json({
      message: 'Mutasi berhasil dicatat',
      saldo_baru: saldoBaru,
      mutasi: insertMutasi.rows[0],
    });
  } catch (err) {
    await client.query('ROLLBACK'); // batalkan semua jika ada error
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// GET /api/cabang/:nama/mutasi
// Lihat riwayat mutasi di satu cabang
router.get('/:nama/mutasi', async (req, res) => {
  const { nama } = req.params;
  try {
    const pool = getPoolCabang(nama);
    const result = await pool.query(`
      SELECT m.id_mutasi, p.nama_barang, m.tipe_mutasi, m.jumlah, 
             m.waktu_transaksi, m.keterangan, m.sync_status
      FROM mutasi_stok m
      JOIN produk p ON m.id_produk = p.id_produk
      ORDER BY m.waktu_transaksi DESC
    `);
    res.json({ cabang: nama, data: result.rows });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;