const express = require('express');
const router = express.Router();
const { cabangPools } = require('../db');

// GET /api/laporan/stok-konsolidasi
// Menggabungkan data stok dari SEMUA cabang menjadi satu laporan (REQ-13)
router.get('/stok-konsolidasi', async (req, res) => {
  const waktuPengambilan = new Date().toISOString(); // REQ-14: log waktu pengambilan data
  const daftarCabang = Object.keys(cabangPools);
  const semuaData = [];
  const ringkasanPerCabang = [];

  for (const namaCabang of daftarCabang) {
    try {
      const pool = cabangPools[namaCabang];
      const result = await pool.query(`
        SELECT p.sku, p.nama_barang, p.kategori, s.saldo, s.last_update
        FROM stok s
        JOIN produk p ON s.id_produk = p.id_produk
        ORDER BY p.nama_barang
      `);

      const dataCabang = result.rows.map(row => ({
        cabang: namaCabang,
        ...row,
      }));

      semuaData.push(...dataCabang);

      ringkasanPerCabang.push({
        cabang: namaCabang,
        status: 'berhasil diambil',
        total_item: result.rows.length,
        total_unit: result.rows.reduce((sum, r) => sum + r.saldo, 0),
      });
    } catch (err) {
      // Cabang offline tidak menggagalkan laporan, hanya dicatat sebagai tidak lengkap
      ringkasanPerCabang.push({
        cabang: namaCabang,
        status: 'gagal diambil (cabang tidak dapat dijangkau)',
      });
    }
  }

  // Rekap total saldo per produk (digabung lintas cabang)
  const rekapPerProduk = {};
  for (const item of semuaData) {
    if (!rekapPerProduk[item.sku]) {
      rekapPerProduk[item.sku] = {
        sku: item.sku,
        nama_barang: item.nama_barang,
        kategori: item.kategori,
        total_saldo_nasional: 0,
        rincian_per_cabang: [],
      };
    }
    rekapPerProduk[item.sku].total_saldo_nasional += item.saldo;
    rekapPerProduk[item.sku].rincian_per_cabang.push({
      cabang: item.cabang,
      saldo: item.saldo,
    });
  }

  res.json({
    waktu_pengambilan_laporan: waktuPengambilan, // REQ-14
    ringkasan_per_cabang: ringkasanPerCabang,
    laporan_per_produk: Object.values(rekapPerProduk),
  });
});

module.exports = router;