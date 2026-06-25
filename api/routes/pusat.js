const express = require('express');
const router = express.Router();
const { poolPusat } = require('../db');

// GET /api/pusat/stok
// Lihat semua data stok yang ada di server pusat (dari semua cabang)
router.get('/stok', async (req, res) => {
  try {
    const result = await poolPusat.query(`
      SELECT s.id_stok, p.sku, p.nama_barang, s.id_cabang, s.nama_cabang, 
             s.saldo, s.last_update
      FROM stok s
      JOIN produk p ON s.id_produk = p.id_produk
      ORDER BY p.nama_barang, s.nama_cabang
    `);
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pusat/mutasi
// Lihat semua riwayat mutasi yang sudah tersinkron ke pusat
router.get('/mutasi', async (req, res) => {
  try {
    const result = await poolPusat.query(`
      SELECT m.id_mutasi, p.nama_barang, m.nama_cabang, m.tipe_mutasi, 
             m.jumlah, m.waktu_transaksi, m.keterangan
      FROM mutasi_stok m
      JOIN produk p ON m.id_produk = p.id_produk
      ORDER BY m.waktu_transaksi DESC
    `);
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;