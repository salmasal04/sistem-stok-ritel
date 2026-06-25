const express = require('express');
const router = express.Router();
const { poolPusat, getPoolCabang } = require('../db');

// POST /api/cabang/:nama/sync
// Mengirim semua mutasi yang belum tersinkron ke server pusat
router.post('/:nama/sync', async (req, res) => {
  const { nama } = req.params;
  const poolCabang = getPoolCabang(nama);

  try {
    // 1. Ambil semua mutasi yang belum dikirim ke pusat
    const mutasiBelumSync = await poolCabang.query(
      `SELECT m.id_mutasi, m.id_produk, p.sku, m.tipe_mutasi, m.jumlah, 
              m.waktu_transaksi, m.keterangan
       FROM mutasi_stok m
       JOIN produk p ON m.id_produk = p.id_produk
       WHERE m.sync_status = false
       ORDER BY m.waktu_transaksi ASC`
    );

    if (mutasiBelumSync.rows.length === 0) {
      return res.json({ message: 'Tidak ada data baru untuk disinkronkan', jumlah_terkirim: 0 });
    }

    const clientPusat = await poolPusat.connect();
    let berhasilTerkirim = [];

    try {
      await clientPusat.query('BEGIN');

      for (const mutasi of mutasiBelumSync.rows) {
        // Cari id_produk yang sesuai di database pusat (berdasarkan SKU,
        // karena id_produk antar database bisa berbeda urutannya)
        const produkPusat = await clientPusat.query(
          'SELECT id_produk FROM produk WHERE sku = $1',
          [mutasi.sku]
        );

        if (produkPusat.rows.length === 0) {
          throw new Error(`Produk dengan SKU ${mutasi.sku} tidak ditemukan di pusat`);
        }

        const idProdukPusat = produkPusat.rows[0].id_produk;

        // Catat log mutasi di pusat (REQ-2: audit terpusat)
        await clientPusat.query(
          `INSERT INTO mutasi_stok (id_produk, id_cabang, nama_cabang, tipe_mutasi, jumlah, waktu_transaksi, keterangan)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [idProdukPusat, nama === 'jakarta' ? 1 : 2, nama, mutasi.tipe_mutasi, mutasi.jumlah, mutasi.waktu_transaksi, mutasi.keterangan]
        );

        // Update / insert saldo stok di tabel pusat untuk cabang ini
        const cekStokPusat = await clientPusat.query(
          'SELECT saldo FROM stok WHERE id_produk = $1 AND id_cabang = $2',
          [idProdukPusat, nama === 'jakarta' ? 1 : 2]
        );

        const perubahan = mutasi.tipe_mutasi === 'Masuk' ? mutasi.jumlah : -mutasi.jumlah;

        if (cekStokPusat.rows.length === 0) {
          // belum ada record stok cabang ini di pusat -> buat baru
          await clientPusat.query(
            `INSERT INTO stok (id_produk, id_cabang, nama_cabang, saldo)
             VALUES ($1, $2, $3, $4)`,
            [idProdukPusat, nama === 'jakarta' ? 1 : 2, nama, perubahan]
          );
        } else {
          // sudah ada -> update saldo
          await clientPusat.query(
            `UPDATE stok SET saldo = saldo + $1, last_update = NOW()
             WHERE id_produk = $2 AND id_cabang = $3`,
            [perubahan, idProdukPusat, nama === 'jakarta' ? 1 : 2]
          );
        }

        berhasilTerkirim.push(mutasi.id_mutasi);
      }

      await clientPusat.query('COMMIT');
    } catch (err) {
      await clientPusat.query('ROLLBACK');
      throw err;
    } finally {
      clientPusat.release();
    }

    // 2. Tandai mutasi yang berhasil terkirim sebagai sync_status = true
    await poolCabang.query(
      `UPDATE mutasi_stok SET sync_status = true WHERE id_mutasi = ANY($1::int[])`,
      [berhasilTerkirim]
    );

    res.json({
      message: 'Sinkronisasi berhasil',
      jumlah_terkirim: berhasilTerkirim.length,
      id_mutasi_terkirim: berhasilTerkirim,
    });
  } catch (err) {
    // REQ-3: kalau gagal (misal pusat unreachable), data di cabang TETAP
    // sync_status = false sehingga bisa dicoba lagi nanti (antrean retry)
    res.status(500).json({
      error: 'Sinkronisasi gagal, data tetap aman di cabang dan akan dicoba ulang',
      detail: err.message,
    });
  }
});

module.exports = router;