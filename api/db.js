const { Pool } = require('pg');

// Koneksi ke database pusat
const poolPusat = new Pool({
  host: process.env.DB_PUSAT_HOST || 'localhost',
  port: 5432,
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASSWORD || 'password123',
  database: 'stok_pusat',
});

// Koneksi ke database cabang Jakarta
const poolJakarta = new Pool({
  host: process.env.DB_JAKARTA_HOST || 'localhost',
  port: 5432,
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASSWORD || 'password123',
  database: 'stok_jakarta',
});

// Koneksi ke database cabang Bandung
const poolBandung = new Pool({
  host: process.env.DB_BANDUNG_HOST || 'localhost',
  port: 5432,
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASSWORD || 'password123',
  database: 'stok_bandung',
});

// Mapping nama cabang ke koneksi databasenya masing-masing
// Ini "otak" dari sistem terdistribusi kita — supaya kode lain
// tinggal panggil getPoolCabang('jakarta') tanpa perlu tahu detail koneksi
const cabangPools = {
  jakarta: poolJakarta,
  bandung: poolBandung,
};

function getPoolCabang(namaCabang) {
  const pool = cabangPools[namaCabang.toLowerCase()];
  if (!pool) {
    throw new Error(`Cabang '${namaCabang}' tidak ditemukan`);
  }
  return pool;
}

module.exports = {
  poolPusat,
  cabangPools,
  getPoolCabang,
};