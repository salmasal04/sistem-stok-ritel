const express = require('express');
const router = express.Router();
const { cabangPools } = require('../db');

// GET /api/pencarian/stok?sku=SKU-001
// Cek stok satu produk di SEMUA cabang sekaligus (REQ-6: cross-database query)
router.get('/stok', async (req, res) => {
  const { sku } = req.query;

  if (!sku) {
    return res.status(400).json({ error: 'Parameter sku wajib diisi. Contoh: /api/pencarian/stok?sku=SKU-001' });
  }

  const daftarCabang = Object.keys(cabangPools); // ['jakarta', 'bandung']
  const hasil = [];

  // Query ke setiap cabang satu per satu, dengan penanganan jika satu
  // cabang tidak bisa dijangkau (REQ-9: cabang offline tetap ditampilkan
  // statusnya, tidak membuat seluruh request gagal)
  for (const namaCabang of daftarCabang) {
    try {
      const pool = cabangPools[namaCabang];
      const result = await pool.query(
        `SELECT p.sku, p.nama_barang, s.saldo, s.last_update
         FROM stok s
         JOIN produk p ON s.id_produk = p.id_produk
         WHERE p.sku = $1`,
        [sku]
      );

      if (result.rows.length > 0) {
        hasil.push({
          cabang: namaCabang,
          status: 'online',
          sku: result.rows[0].sku,
          nama_barang: result.rows[0].nama_barang,
          saldo: result.rows[0].saldo,
          last_sync: result.rows[0].last_update, // REQ-7: waktu sinkronisasi terakhir
        });
      } else {
        hasil.push({
          cabang: namaCabang,
          status: 'online',
          saldo: 0,
          pesan: 'Produk tidak memiliki catatan stok di cabang ini',
        });
      }
    } catch (err) {
      // REQ-9: jika cabang tidak dapat dijangkau, beri peringatan,
      // tapi jangan gagalkan seluruh request
      hasil.push({
        cabang: namaCabang,
        status: 'offline',
        pesan: 'Cabang tidak dapat dijangkau saat ini',
      });
    }
  }

  res.json({
    sku_dicari: sku,
    catatan: 'Data ini bersifat read-only (REQ-8)',
    hasil,
  });
});

module.exports = router;