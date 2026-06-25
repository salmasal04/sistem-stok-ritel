-- Tabel produk (replikasi dari pusat, read-only di cabang)
CREATE TABLE IF NOT EXISTS produk (
    id_produk SERIAL PRIMARY KEY,
    sku VARCHAR(50) UNIQUE NOT NULL,
    nama_barang VARCHAR(100) NOT NULL,
    kategori VARCHAR(50),
    harga_beli DECIMAL(15,2)
);

-- Tabel stok cabang ini saja (fragmentasi horizontal)
CREATE TABLE IF NOT EXISTS stok (
    id_stok SERIAL PRIMARY KEY,
    id_produk INT REFERENCES produk(id_produk),
    saldo INT NOT NULL DEFAULT 0,
    last_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabel mutasi cabang ini saja
CREATE TABLE IF NOT EXISTS mutasi_stok (
    id_mutasi SERIAL PRIMARY KEY,
    id_produk INT REFERENCES produk(id_produk),
    tipe_mutasi VARCHAR(10) CHECK (tipe_mutasi IN ('Masuk', 'Keluar')),
    jumlah INT NOT NULL,
    waktu_transaksi TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    keterangan TEXT,
    sync_status BOOLEAN DEFAULT FALSE  -- sudah dikirim ke pusat atau belum?
);

-- Data awal produk (hasil replikasi dari pusat)
INSERT INTO produk (sku, nama_barang, kategori, harga_beli) VALUES
('SKU-001', 'Beras 5kg', 'Sembako', 60000),
('SKU-002', 'Minyak Goreng 1L', 'Sembako', 20000),
('SKU-003', 'Sabun Mandi', 'Kebersihan', 5000);

-- Stok awal cabang
INSERT INTO stok (id_produk, saldo) VALUES (1, 100), (2, 50), (3, 200);