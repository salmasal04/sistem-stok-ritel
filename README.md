# Sistem Manajemen Stok Toko Ritel
> Tugas UAS — Mata Kuliah Pemrosesan Data Terdistribusi  
> Sekolah Tinggi Teknologi Cipasung  
> Disusun oleh: Salma Salsabila (10223084)

---

## Deskripsi Proyek

Sistem backend untuk mengelola stok barang pada jaringan toko ritel multi-cabang dengan arsitektur **basis data terdistribusi**. Sistem ini mengimplementasikan konsep fragmentasi horizontal, replikasi data master, dan sinkronisasi antar node (cabang ↔ pusat) sesuai dengan SRS yang telah disusun pada UTS.

Setiap cabang memiliki database lokal yang **otonom** (tetap bisa beroperasi meskipun koneksi ke pusat terputus), namun tetap terhubung secara asinkron dengan server pusat untuk konsolidasi data nasional.

---

## Arsitektur Sistem

```
┌─────────────────┐     ┌─────────────────┐
│  DB Cabang      │     │  DB Cabang      │
│  Jakarta        │     │  Bandung        │
│  (PostgreSQL)   │     │  (PostgreSQL)   │
│  Port: 5433     │     │  Port: 5434     │
└────────┬────────┘     └────────┬────────┘
         │  sinkronisasi          │  sinkronisasi
         └──────────┬─────────────┘
                    ▼
         ┌─────────────────┐
         │  DB Pusat       │
         │  (PostgreSQL)   │
         │  Port: 5432     │
         └────────┬────────┘
                  │
         ┌────────▼────────┐
         │  API Backend    │
         │  Node.js/Express│
         │  Port: 3000     │
         └─────────────────┘
                  │
         ┌────────▼────────┐
         │  Client         │
         │  (Postman /     │
         │   Browser)      │
         └─────────────────┘
```

### Konsep Terdistribusi yang Diimplementasikan

| Konsep | Implementasi |
|---|---|
| **Fragmentasi Horizontal** | Tabel `stok` dan `mutasi_stok` dipecah per cabang (Jakarta hanya simpan data Jakarta, Bandung hanya simpan data Bandung) |
| **Replikasi Data Master** | Tabel `produk` (SKU, nama, kategori) disimpan identik di semua node via `init-db/cabang.sql` |
| **Otonomi Lokal** | Setiap database cabang bisa CRUD stok tanpa perlu koneksi ke pusat |
| **Sinkronisasi Asinkron** | Data mutasi dikirim ke pusat hanya saat endpoint `/sync` dipanggil, dengan flag `sync_status` |
| **Transaksi Terdistribusi** | Menggunakan `BEGIN/COMMIT/ROLLBACK` untuk menjaga integritas data saat sinkronisasi |

---

## Teknologi yang Digunakan

| Komponen | Teknologi |
|---|---|
| Backend API | Node.js + Express.js |
| Database | PostgreSQL 15 |
| Containerisasi | Docker + Docker Compose |
| Testing API | Postman |

---

## Struktur Folder

```
sistem-stok-ritel/
├── api/
│   ├── routes/
│   │   ├── stok.js          # CRUD stok + mutasi per cabang
│   │   ├── sync.js          # Sinkronisasi cabang → pusat
│   │   ├── pencarian.js     # Cek stok lintas cabang (read-only)
│   │   └── laporan.js       # Laporan stok terkonsolidasi
│   ├── db.js                # Konfigurasi koneksi ke 3 database
│   ├── server.js            # Entry point API
│   ├── Dockerfile
│   └── package.json
├── init-db/
│   ├── pusat.sql            # Schema + data awal database pusat
│   └── cabang.sql           # Schema + data awal database cabang (Jakarta & Bandung)
└── docker-compose.yml       # Orkestrasi semua container
```

---

## Cara Menjalankan Sistem

### Prasyarat
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) sudah terinstall dan berjalan
- [Node.js](https://nodejs.org/) versi 18+
- [Postman](https://www.postman.com/) untuk testing API

### Langkah Menjalankan

**1. Clone repository ini**
```bash
git clone <url-repo-ini>
cd sistem-stok-ritel
```

**2. Jalankan semua container sekaligus**
```bash
docker-compose up --build
```

Tunggu hingga terminal menampilkan:
```
api-stok    | Server berjalan di port 3000
db-pusat    | database system is ready to accept connections
db-jakarta  | database system is ready to accept connections
db-bandung  | database system is ready to accept connections
```

**3. Verifikasi sistem berjalan**

Buka browser, akses:
```
http://localhost:3000/test-koneksi
```

Response yang diharapkan:
```json
{
  "status": "sukses",
  "pusat": { "now": "..." },
  "jakarta": { "now": "..." },
  "bandung": { "now": "..." }
}
```

**4. Menghentikan sistem**
```bash
docker-compose down
```

---

## Use Case & Endpoint API

### Use Case 1 — Melihat Stok di Satu Cabang
> *Admin Gudang Cabang mengecek ketersediaan barang di lokasinya*

**Request:**
```
GET /api/cabang/{nama_cabang}/stok
```

**Contoh:**
```
GET http://localhost:3000/api/cabang/jakarta/stok
GET http://localhost:3000/api/cabang/bandung/stok
```

**Response:**
```json
{
  "cabang": "jakarta",
  "data": [
    {
      "id_stok": 1,
      "sku": "SKU-001",
      "nama_barang": "Beras 5kg",
      "kategori": "Sembako",
      "saldo": 120,
      "last_update": "2026-06-21T10:11:08.463Z"
    }
  ]
}
```
> Data diambil langsung dari database cabang Jakarta yang terpisah secara fisik dari pusat dan Bandung.

---

### Use Case 2 — Input Mutasi Stok (Masuk / Keluar)
> *Admin Gudang Cabang mencatat penerimaan barang dari supplier atau pengeluaran barang*

**Request:**
```
POST /api/cabang/{nama_cabang}/mutasi
Content-Type: application/json
```

**Body:**
```json
{
  "id_produk": 1,
  "tipe_mutasi": "Masuk",
  "jumlah": 20,
  "keterangan": "Restock dari supplier"
}
```

**Response sukses:**
```json
{
  "message": "Mutasi berhasil dicatat",
  "saldo_baru": 120,
  "mutasi": {
    "id_mutasi": 1,
    "tipe_mutasi": "Masuk",
    "jumlah": 20,
    "sync_status": false
  }
}
```

**Response gagal — validasi stok tidak cukup (REQ-4):**
```json
{
  "error": "Stok tidak cukup. Saldo saat ini: 120"
}
```

> Sistem menggunakan transaksi BEGIN/COMMIT/ROLLBACK untuk memastikan integritas data. `sync_status: false` menandakan data belum dikirim ke pusat.

---

### Use Case 3 — Sinkronisasi Data ke Server Pusat
> *Middleware mengirimkan semua mutasi yang belum tersinkron dari cabang ke database pusat*

**Request:**
```
POST /api/cabang/{nama_cabang}/sync
```

**Response:**
```json
{
  "message": "Sinkronisasi berhasil",
  "jumlah_terkirim": 1,
  "id_mutasi_terkirim": [1]
}
```

> Setelah sinkronisasi berhasil, `sync_status` di database cabang otomatis berubah menjadi `true`. Jika pusat tidak dapat dijangkau, data tetap aman di cabang (`sync_status` tetap `false`) dan akan dicoba ulang saat endpoint ini dipanggil lagi — mengimplementasikan konsep retry queue (REQ-3).

---

### Use Case 4 — Cek Stok Lintas Cabang (Real-time)
> *Manajer Toko atau Admin melihat ketersediaan satu produk di semua cabang sekaligus*

**Request:**
```
GET /api/pencarian/stok?sku={kode_sku}
```

**Contoh:**
```
GET http://localhost:3000/api/pencarian/stok?sku=SKU-001
```

**Response (semua cabang online):**
```json
{
  "sku_dicari": "SKU-001",
  "catatan": "Data ini bersifat read-only (REQ-8)",
  "hasil": [
    {
      "cabang": "jakarta",
      "status": "online",
      "nama_barang": "Beras 5kg",
      "saldo": 120,
      "last_sync": "2026-06-21T10:11:08.463Z"
    },
    {
      "cabang": "bandung",
      "status": "online",
      "nama_barang": "Beras 5kg",
      "saldo": 100,
      "last_sync": "2026-06-21T07:35:41.732Z"
    }
  ]
}
```

**Response (satu cabang offline — REQ-9):**
```json
{
  "hasil": [
    { "cabang": "jakarta", "status": "online", "saldo": 120 },
    { "cabang": "bandung", "status": "offline", "pesan": "Cabang tidak dapat dijangkau saat ini" }
  ]
}
```

> Endpoint ini bersifat read-only (hanya GET). Jika satu cabang mati, sistem tetap mengembalikan data dari cabang lain tanpa error keseluruhan — mengimplementasikan fault tolerance (REQ-9).

---

### Use Case 5 — Laporan Stok Terkonsolidasi
> *Admin Pusat menarik laporan gabungan stok nasional dari semua cabang untuk keperluan audit*

**Request:**
```
GET /api/laporan/stok-konsolidasi
```

**Response:**
```json
{
  "waktu_pengambilan_laporan": "2026-06-21T11:56:04.098Z",
  "ringkasan_per_cabang": [
    { "cabang": "jakarta", "status": "berhasil diambil", "total_item": 3, "total_unit": 370 },
    { "cabang": "bandung", "status": "berhasil diambil", "total_item": 3, "total_unit": 350 }
  ],
  "laporan_per_produk": [
    {
      "sku": "SKU-001",
      "nama_barang": "Beras 5kg",
      "total_saldo_nasional": 220,
      "rincian_per_cabang": [
        { "cabang": "jakarta", "saldo": 120 },
        { "cabang": "bandung", "saldo": 100 }
      ]
    }
  ]
}
```

> `waktu_pengambilan_laporan` dicatat untuk transparansi audit (REQ-14). Data dikumpulkan langsung dari setiap database cabang untuk akurasi real-time (REQ-13).

---

### Use Case 6 — Verifikasi Data di Server Pusat
> *Admin Pusat memverifikasi data stok dan mutasi yang sudah tersinkron dari seluruh cabang*

**Request:**
```
GET http://localhost:3000/api/pusat/stok
GET http://localhost:3000/api/pusat/mutasi
```

---

## Pemetaan Requirement SRS

| Kode REQ | Deskripsi | Diimplementasikan di |
|---|---|---|
| REQ-1 | CRUD pada tabel stok terfragmentasi | `routes/stok.js` |
| REQ-2 | Log transaksi mutasi untuk audit backend | Tabel `mutasi_stok` di setiap cabang |
| REQ-3 | Antrean retry jika koneksi terputus | `sync_status = false` + endpoint `/sync` |
| REQ-4 | Validasi stok sebelum transaksi (anti negatif) | `routes/stok.js` — cek saldo sebelum COMMIT |
| REQ-6 | Cross-database query lintas cabang | `routes/pencarian.js` |
| REQ-7 | Tampilkan waktu sinkronisasi terakhir | Field `last_sync` di response pencarian |
| REQ-8 | Fitur cek stok antar cabang hanya read-only | Endpoint pencarian hanya GET |
| REQ-9 | Peringatan jika cabang tidak aktif | `try-catch` per cabang di pencarian |
| REQ-11 | Distribusi data master ke seluruh cabang | `init-db/cabang.sql` di semua node |
| REQ-13 | Join data lintas server tanpa timeout | Loop per cabang dengan error handling |
| REQ-14 | Log waktu pengambilan laporan | Field `waktu_pengambilan_laporan` |
| REQ-NF-7 | Otonomi lokal saat pusat terputus | Cabang tetap bisa CRUD meski pusat mati |

---

## Data Produk Awal (Seed Data)

| SKU | Nama Barang | Kategori | Stok Jakarta | Stok Bandung |
|---|---|---|---|---|
| SKU-001 | Beras 5kg | Sembako | 100 | 100 |
| SKU-002 | Minyak Goreng 1L | Sembako | 50 | 50 |
| SKU-003 | Sabun Mandi | Kebersihan | 200 | 200 |

---

## Referensi

- Özsu, M. T., & Valduriez, P. (2020). *Principles of Distributed Database Systems*. Springer Nature.
- Pressman, R. S., & Maxim, B. R. (2020). *Software Engineering: A Practitioner's Approach*. McGraw-Hill Education.
- Dokumentasi resmi PostgreSQL 15: https://www.postgresql.org/docs/15/
- Dokumentasi resmi Docker: https://docs.docker.com/
