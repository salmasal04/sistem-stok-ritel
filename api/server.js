require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { poolPusat, getPoolCabang } = require('./db');
const stokRoutes = require('./routes/stok');
const syncRoutes = require('./routes/sync');
const pusatRoutes = require('./routes/pusat');
const pencarianRoutes = require('./routes/pencarian');
const laporanRoutes = require('./routes/laporan'); 

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'API Sistem Stok Ritel berjalan' });
});

app.get('/test-koneksi', async (req, res) => {
  try {
    const pusat = await poolPusat.query('SELECT NOW()');
    const jakarta = await getPoolCabang('jakarta').query('SELECT NOW()');
    const bandung = await getPoolCabang('bandung').query('SELECT NOW()');

    res.json({
      status: 'sukses',
      pusat: pusat.rows[0],
      jakarta: jakarta.rows[0],
      bandung: bandung.rows[0],
    });
  } catch (err) {
    res.status(500).json({ status: 'gagal', error: err.message });
  }
});

app.use('/api/cabang', stokRoutes);
app.use('/api/cabang', syncRoutes);
app.use('/api/pusat', pusatRoutes);
app.use('/api/pencarian', pencarianRoutes);
app.use('/api/laporan', laporanRoutes); 

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server berjalan di port ${PORT}`);
});