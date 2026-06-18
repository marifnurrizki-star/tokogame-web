require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const helmet = require('helmet');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
const port = process.env.PORT || 3000;

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_change_this';

// app.use(helmet({
//   contentSecurityPolicy: false,
// }));
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Konfigurasi koneksi PostgreSQL (Supabase / Vercel Postgres)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

pool.connect()
    .then(async () => {
        console.log('✅ KONEKSI DATABASE POSTGRESQL BERHASIL!');
        try {
            await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
        } catch(e) { console.warn("Could not alter orders table for created_at"); }
        try {
            const adminCheck = await pool.query("SELECT password FROM users WHERE email='admin@tokogame.com'");
            if (adminCheck.rows.length > 0 && adminCheck.rows[0].password === 'admin123') {
                const hashed = await bcrypt.hash('admin123', 10);
                await pool.query("UPDATE users SET password = $1 WHERE email='admin@tokogame.com'", [hashed]);
                console.log('🔒 Default admin password secured.');
            }
        } catch(e) { console.warn("Could not check/update default admin password"); }
    })
    .catch(err => console.error('❌ GAGAL KONEK DATABASE:', err));

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'tokogame_uploads',
    allowedFormats: ['jpeg', 'png', 'jpg'],
  },
});
const upload = multer({ storage: storage });

// --- MIDDLEWARE AUTENTIKASI ---
function verifyToken(req, res, next) {
    const bearerHeader = req.headers['authorization'];
    if (typeof bearerHeader !== 'undefined') {
        const bearer = bearerHeader.split(' ');
        const token = bearer[1];
        jwt.verify(token, JWT_SECRET, (err, decoded) => {
            if (err) {
                return res.status(403).json({ success: false, message: 'Sesi tidak valid / Token kedaluwarsa' });
            }
            req.user = decoded; // simpan payload user (id, role, dsb)
            next();
        });
    } else {
        res.status(401).json({ success: false, message: 'Harap login terlebih dahulu' });
    }
}

function isAdmin(req, res, next) {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ success: false, message: 'Akses ditolak. Anda bukan admin.' });
    }
}

// 1. JALUR KATALOG PRODUK (Public)
app.get('/api/products', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM products');
        res.json(result.rows);
    } catch (err) {
        res.status(500).send('Error database: ' + err.message);
    }
});

// 2. JALUR CHECKOUT SUPER MAXIMAL
app.post('/api/checkout', verifyToken, upload.single('bukti_transfer'), async (req, res) => {
    try {
        const { alamat, metode_bayar, catatan, no_hp, metode_pengiriman } = req.body;
        const buktiPath = req.file ? req.file.path : null;

        const userIdInt = parseInt(req.user.id);

        const cartReq = await pool.query('SELECT c.jumlah, p.harga, p.stok, p.nama_produk, p.id as product_id FROM cart c JOIN products p ON c.product_id = p.id WHERE c.user_id = $1', [userIdInt]);
        const cartItems = cartReq.rows;

        if (cartItems.length === 0) return res.status(400).json({ success: false, message: 'Keranjang kosong!' });

        for (let item of cartItems) {
            if (item.jumlah > item.stok) {
                return res.status(400).json({ success: false, message: `Stok ${item.nama_produk} tidak mencukupi! (Tersisa: ${item.stok})` });
            }
        }

        let total_harga = 0;
        cartItems.forEach(item => total_harga += (item.harga * item.jumlah));
        
        let finalAlamat = alamat || '';
        if (metode_pengiriman === 'Ambil Langsung') {
            finalAlamat = 'Pesanan ambil langsung di toko';
        }

        const orderResult = await pool.query(`
            INSERT INTO orders (user_id, total_harga, status, metode_bayar, bukti_transfer, alamat_kirim, catatan, no_hp) 
            VALUES ($1, $2, 'Menunggu Pembayaran', $3, $4, $5, $6, $7)
            RETURNING id
        `, [userIdInt, total_harga, metode_bayar, buktiPath, finalAlamat, catatan || '', no_hp || '']);
        const newOrderId = orderResult.rows[0].id;

        for (let item of cartItems) {
            await pool.query('INSERT INTO order_items (order_id, product_id, jumlah, harga_satuan) VALUES ($1, $2, $3, $4)', [newOrderId, item.product_id, item.jumlah, item.harga]);
            await pool.query('UPDATE products SET stok = stok - $1 WHERE id = $2', [item.jumlah, item.product_id]);
        }

        await pool.query('DELETE FROM cart WHERE user_id = $1', [userIdInt]);

        res.json({ success: true, message: 'Checkout berhasil!', order_id: newOrderId });
    } catch (err) {
        console.error('Checkout error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// 3. JALUR HALAMAN ADMIN
app.get('/api/orders', verifyToken, isAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM orders ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).send('Error: ' + err.message);
    }
});

// 3.5 JALUR LAPORAN PENJUALAN
app.get('/api/reports/sales', verifyToken, isAdmin, async (req, res) => {
    const { startDate, endDate } = req.query;
    try {
        let query = `
            SELECT o.id, o.total_harga, o.status, o.created_at, u.nama as pembeli 
            FROM orders o
            JOIN users u ON o.user_id = u.id
            WHERE o.status != 'Dibatalkan' AND o.status != 'Ditolak'
        `;
        let params = [];
        
        if (startDate && endDate) {
            query += ` AND DATE(o.created_at) >= $1 AND DATE(o.created_at) <= $2`;
            params.push(startDate, endDate);
        }
        
        query += ` ORDER BY o.created_at DESC`;
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error: ' + err.message });
    }
});

// 4. JALUR UPDATE STATUS PESANAN (Bisa admin atau user)
app.put('/api/orders/:id', verifyToken, async (req, res) => {
    const idPesanan = parseInt(req.params.id);
    const { status } = req.body || {};
    try {
        if (req.user.role === 'admin') {
            if (status) {
                await pool.query('UPDATE orders SET status = $1 WHERE id = $2', [status, idPesanan]);
                res.json({ message: `Pesanan berhasil diupdate jadi ${status}!` });
            } else {
                await pool.query("UPDATE orders SET status = 'Dikirim' WHERE id = $1", [idPesanan]);
                res.json({ message: 'Pesanan berhasil diupdate jadi Dikirim!' });
            }
        } else {
            const orderReq = await pool.query('SELECT status, user_id FROM orders WHERE id = $1', [idPesanan]);
            if (orderReq.rows.length === 0) return res.status(404).json({ message: 'Pesanan tidak ditemukan' });

            const order = orderReq.rows[0];
            if (order.user_id !== parseInt(req.user.id)) return res.status(403).json({ message: 'Bukan pesanan Anda' });

            if (status === 'Dibatalkan' && order.status === 'Menunggu Pembayaran') {
                await pool.query("UPDATE orders SET status = 'Dibatalkan' WHERE id = $1", [idPesanan]);

                // Kembalikan stok
                const items = await pool.query('SELECT product_id, jumlah FROM order_items WHERE order_id = $1', [idPesanan]);
                for (let item of items.rows) {
                    await pool.query('UPDATE products SET stok = stok + $1 WHERE id = $2', [item.jumlah, item.product_id]);
                }

                res.json({ message: 'Pesanan berhasil dibatalkan!' });
            } else if (status === 'Selesai' && order.status.startsWith('Dikirim')) {
                await pool.query("UPDATE orders SET status = 'Selesai' WHERE id = $1", [idPesanan]);
                res.json({ message: 'Pesanan telah selesai!' });
            } else {
                res.status(400).json({ message: 'Tidak bisa mengubah status tersebut.' });
            }
        }
    } catch (err) {
        console.error('❌ Error update pesanan:', err);
        res.status(500).json({ message: 'Gagal mengubah status' });
    }
});

// 5. JALUR TAMBAH GAME BARU
app.post('/api/products', verifyToken, isAdmin, upload.single('gambarGame'), async (req, res) => {
    const { nama_produk, harga, stok, deskripsi, kategori, kondisi } = req.body;
    const linkGambar = req.file ? req.file.path : '';
    const kondisiVal = kondisi || 'Baru';

    try {
        await pool.query(`
            INSERT INTO products (nama_produk, harga, stok, deskripsi, gambar, kategori, kondisi)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [nama_produk, harga, stok, deskripsi, linkGambar, kategori, kondisiVal]);
        res.json({ success: true, message: 'Game baru ditambahkan!' });
    } catch (err) {
        console.error('❌ Error tambah produk:', err);
        res.status(500).json({ success: false, message: 'Gagal menambahkan game baru' });
    }
});

// 5.5 JALUR EDIT PRODUK
app.put('/api/products/:id', verifyToken, isAdmin, upload.single('gambarGame'), async (req, res) => {
    const idGame = parseInt(req.params.id);
    const { nama_produk, harga, stok, deskripsi, kategori, kondisi } = req.body;
    const kondisiVal = kondisi || 'Baru';

    try {
        if (req.file) {
            const linkGambarBaru = req.file.path;
            await pool.query('UPDATE products SET nama_produk = $1, harga = $2, stok = $3, deskripsi = $4, gambar = $5, kategori = $6, kondisi = $7 WHERE id = $8', [nama_produk, harga, stok, deskripsi, linkGambarBaru, kategori, kondisiVal, idGame]);
        } else {
            await pool.query('UPDATE products SET nama_produk = $1, harga = $2, stok = $3, deskripsi = $4, kategori = $5, kondisi = $6 WHERE id = $7', [nama_produk, harga, stok, deskripsi, kategori, kondisiVal, idGame]);
        }
        res.json({ success: true, message: 'Software data updated!' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Gagal mengedit game' });
    }
});

// 6. JALUR HAPUS PRODUK (Delete)
app.delete('/api/products/:id', verifyToken, isAdmin, async (req, res) => {
    const idGame = parseInt(req.params.id);
    try {
        // Hapus paksa semua referensi ke game ini dari tabel lain (cart, wishlist, order_items)
        try { await pool.query('DELETE FROM cart WHERE product_id = $1', [idGame]); } catch (e) { }
        try { await pool.query('DELETE FROM wishlist WHERE product_id = $1', [idGame]); } catch (e) { }
        try { await pool.query('DELETE FROM order_items WHERE product_id = $1', [idGame]); } catch (e) { }
        
        // Baru hapus produk utamanya
        await pool.query('DELETE FROM products WHERE id = $1', [idGame]);
        res.json({ message: 'Game dan semua data terkait berhasil dihapus paksa!' });
    } catch (err) {
        res.status(500).json({ message: 'Gagal menghapus game: ' + err.message });
    }
});

// 9. JALUR TAMBAH KE KERANJANG
app.post('/api/cart', verifyToken, async (req, res) => {
    const { product_id } = req.body;
    const user_id = parseInt(req.user.id);
    const prod_id = parseInt(product_id);
    try {
        const cekKeranjang = await pool.query('SELECT * FROM cart WHERE user_id = $1 AND product_id = $2', [user_id, prod_id]);
        if (cekKeranjang.rows.length > 0) {
            await pool.query('UPDATE cart SET jumlah = jumlah + 1 WHERE user_id = $1 AND product_id = $2', [user_id, prod_id]);
        } else {
            await pool.query('INSERT INTO cart (user_id, product_id, jumlah) VALUES ($1, $2, 1)', [user_id, prod_id]);
        }
        res.json({ success: true, message: 'Game berhasil masuk keranjang!' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Gagal memasukkan ke keranjang' });
    }
});

// 10. JALUR BACA ISI KERANJANG
app.get('/api/cart/:user_id', verifyToken, async (req, res) => {
    const userId = parseInt(req.params.user_id);
    if (userId !== parseInt(req.user.id)) return res.status(403).json([]);
    try {
        const result = await pool.query(`
            SELECT c.id as cart_id, c.jumlah, p.id as product_id, p.nama_produk, p.harga, p.gambar, p.kategori
            FROM cart c
            JOIN products p ON c.product_id = p.id
            WHERE c.user_id = $1
        `, [userId]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).send('Error database: ' + err.message);
    }
});

app.delete('/api/cart/:user_id/:product_id', verifyToken, async (req, res) => {
    const user_id = parseInt(req.params.user_id);
    const product_id = parseInt(req.params.product_id);
    if (user_id !== parseInt(req.user.id)) return res.status(403).json({});
    try {
        await pool.query('DELETE FROM cart WHERE user_id = $1 AND product_id = $2', [user_id, product_id]);
        res.json({ success: true, message: 'Item dihapus dari keranjang' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Gagal menghapus item' });
    }
});

app.put('/api/cart/:user_id/:product_id', verifyToken, async (req, res) => {
    const user_id = parseInt(req.params.user_id);
    const product_id = parseInt(req.params.product_id);
    const perubahan = parseInt(req.body.perubahan);
    if (user_id !== parseInt(req.user.id)) return res.status(403).json({});

    try {
        const cek = await pool.query('SELECT jumlah FROM cart WHERE user_id = $1 AND product_id = $2', [user_id, product_id]);
        if (cek.rows.length === 0) return res.status(404).json({ success: false, message: 'Item tidak ditemukan' });

        const jumlahBaru = cek.rows[0].jumlah + perubahan;
        if (jumlahBaru <= 0) {
            await pool.query('DELETE FROM cart WHERE user_id = $1 AND product_id = $2', [user_id, product_id]);
        } else {
            await pool.query('UPDATE cart SET jumlah = $1 WHERE user_id = $2 AND product_id = $3', [jumlahBaru, user_id, product_id]);
        }
        res.json({ success: true, message: 'Jumlah item diperbarui' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Gagal mengubah jumlah' });
    }
});

app.delete('/api/cart/:user_id', verifyToken, async (req, res) => {
    const user_id = parseInt(req.params.user_id);
    if (user_id !== parseInt(req.user.id)) return res.status(403).json({});
    try {
        await pool.query('DELETE FROM cart WHERE user_id = $1', [user_id]);
        res.json({ success: true, message: 'Keranjang dikosongkan' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Gagal kosongkan keranjang' });
    }
});

// 12. JALUR RIWAYAT PESANAN
app.get('/api/orders/user/:user_id', verifyToken, async (req, res) => {
    const user_id = parseInt(req.params.user_id);
    if (user_id !== parseInt(req.user.id)) return res.status(403).json([]);
    try {
        const result = await pool.query(`
            SELECT id, total_harga, status, metode_bayar, bukti_transfer, alamat_kirim, catatan 
            FROM orders 
            WHERE user_id = $1 
            ORDER BY id DESC
        `, [user_id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error database' });
    }
});

app.get('/api/orders/info/:id', verifyToken, async (req, res) => {
    const order_id = parseInt(req.params.id);
    try {
        const result = await pool.query(`
            SELECT o.*, u.nama as pembeli
            FROM orders o
            JOIN users u ON o.user_id = u.id
            WHERE o.id = $1
        `, [order_id]);
        if (result.rows.length > 0) {
            if (req.user.role !== 'admin' && result.rows[0].user_id !== parseInt(req.user.id)) {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }
            res.json(result.rows[0]);
        }
        else res.status(404).json({ success: false, message: 'Not found' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error database' });
    }
});

app.get('/api/orders/detail/:order_id', verifyToken, async (req, res) => {
    const order_id = parseInt(req.params.order_id);
    try {
        const orderCek = await pool.query('SELECT user_id FROM orders WHERE id = $1', [order_id]);
        if (orderCek.rows.length === 0) return res.status(404).json([]);
        if (req.user.role !== 'admin' && orderCek.rows[0].user_id !== parseInt(req.user.id)) {
            return res.status(403).json([]);
        }

        const result = await pool.query(`
            SELECT oi.jumlah, oi.harga_satuan, p.nama_produk, p.gambar
            FROM order_items oi
            JOIN products p ON oi.product_id = p.id
            WHERE oi.order_id = $1
        `, [order_id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error database' });
    }
});

// --- WISHLIST API ---
app.get('/api/wishlist', verifyToken, async (req, res) => {
    const user_id = parseInt(req.user.id);
    try {
        const result = await pool.query('SELECT product_id FROM wishlist WHERE user_id = $1', [user_id]);
        res.json(result.rows.map(w => w.product_id));
    } catch (err) {
        res.status(500).json([]);
    }
});

app.post('/api/wishlist', verifyToken, async (req, res) => {
    const user_id = parseInt(req.user.id);
    const { product_id } = req.body;
    const prod_id = parseInt(product_id);
    try {
        const cek = await pool.query('SELECT id FROM wishlist WHERE user_id = $1 AND product_id = $2', [user_id, prod_id]);
        if (cek.rows.length > 0) {
            await pool.query('DELETE FROM wishlist WHERE id = $1', [cek.rows[0].id]);
            res.json({ success: true, message: 'Dihapus dari wishlist', isWishlisted: false });
        } else {
            await pool.query('INSERT INTO wishlist (user_id, product_id) VALUES ($1, $2)', [user_id, prod_id]);
            res.json({ success: true, message: 'Ditambahkan ke wishlist', isWishlisted: true });
        }
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// --- JALUR REGISTER ---
app.post('/api/register', async (req, res) => {
    try {
        const { nama, email, password, no_hp } = req.body;
        const cek = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (cek.rows.length > 0) {
            return res.json({ success: false, message: 'Email sudah terdaftar!' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query('INSERT INTO users (nama, email, password, role, no_hp) VALUES ($1, $2, $3, $4, $5)', [nama, email, hashedPassword, 'user', no_hp || null]);
        res.json({ success: true, message: 'Register berhasil! Silakan login.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error server' });
    }
});

// --- JALUR LOGIN ---
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await pool.query('SELECT id, nama, email, role, password as hash FROM users WHERE email = $1', [email]);
        if (result.rows.length > 0) {
            const user = result.rows[0];
            const isMatch = await bcrypt.compare(password, user.hash);
            if (isMatch || password === user.hash) {
                if (password === user.hash) {
                    const newHash = await bcrypt.hash(password, 10);
                    await pool.query('UPDATE users SET password = $1 WHERE id = $2', [newHash, user.id]);
                }
                const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
                res.json({ success: true, message: 'Login berhasil!', data: { id: user.id, nama: user.nama, email: user.email, role: user.role }, token: token });
                return;
            }
        }
        res.json({ success: false, message: 'Email atau password salah!' });
    } catch (err) {
        console.error('Error login:', err);
        res.status(500).json({ success: false, message: 'Error server' });
    }
});

// --- JALUR LUPA KATA SANDI ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

app.post('/api/forgot-password', async (req, res) => {
    const { email } = req.body;
    try {
        const cek = await pool.query('SELECT id, nama FROM users WHERE email = $1', [email]);
        if (cek.rows.length === 0) {
            return res.json({ success: false, message: 'Email tidak terdaftar!' });
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expires = Date.now() + 15 * 60 * 1000; // 15 menit dari sekarang

        await pool.query('UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE email = $3', [token, expires, email]);

        const host = req.headers.host;
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const baseUrl = process.env.BASE_URL || `${protocol}://${host}`;
        const resetLink = `${baseUrl}/reset-password.html?token=${token}`;

        const mailOptions = {
            from: '"TokoGame Support" <marifnurrizki@gmail.com>',
            to: email,
            subject: 'Permintaan Reset Kata Sandi - TokoGame',
            html: `
                <h3>Halo ${cek.rows[0].nama},</h3>
                <p>Anda telah meminta untuk mereset kata sandi Anda. Klik tautan di bawah ini untuk mereset kata sandi Anda:</p>
                <p><a href="${resetLink}" style="display:inline-block; padding:10px 20px; background-color:#3b82f6; color:white; text-decoration:none; border-radius:5px; margin-top:10px;">Reset Kata Sandi</a></p>
                <br/>
                <p>Atau copy & paste tautan ini di browser Anda:</p>
                <p><a href="${resetLink}">${resetLink}</a></p>
                <p>Tautan ini akan kadaluwarsa dalam 15 menit.</p>
                <p>Jika Anda tidak meminta ini, abaikan saja email ini.</p>
            `
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error('Error send email:', error);
                return res.json({ success: false, message: 'Gagal mengirim email reset! ' + error.message });
            }
            
            console.log('✅ Email reset password berhasil dikirim ke:', email);
            res.json({ success: true, message: 'Tautan reset kata sandi telah dikirim ke email Anda!' });
        });
    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ success: false, message: 'Error server' });
    }
});

// --- JALUR RESET KATA SANDI ---
app.post('/api/reset-password', async (req, res) => {
    const { token, new_password } = req.body;
    try {
        const cek = await pool.query('SELECT id, reset_token_expires FROM users WHERE reset_token = $1', [token]);
        if (cek.rows.length === 0) {
            return res.json({ success: false, message: 'Token reset kata sandi tidak valid atau tidak ditemukan!' });
        }

        const user = cek.rows[0];
        if (Date.now() > user.reset_token_expires) {
            return res.json({ success: false, message: 'Token reset kata sandi telah kadaluwarsa!' });
        }

        const hashedPassword = await bcrypt.hash(new_password, 10);
        await pool.query('UPDATE users SET password = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2', [hashedPassword, user.id]);
        res.json({ success: true, message: 'Kata sandi Anda berhasil diubah! Silakan login.' });
    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ success: false, message: 'Error server' });
    }
});

// --- JALUR PROFIL USER ---
app.get('/api/user/profile', verifyToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, nama, email, no_hp FROM users WHERE id = $1', [parseInt(req.user.id)]);
        if (result.rows.length > 0) {
            res.json({ success: true, data: result.rows[0] });
        } else {
            res.status(404).json({ success: false, message: 'User tidak ditemukan' });
        }
    } catch (err) {
        console.error('Error get profile:', err);
        res.status(500).json({ success: false, message: 'Error server' });
    }
});

app.put('/api/user/profile', verifyToken, async (req, res) => {
    try {
        const { nama, no_hp, password_lama, password_baru } = req.body;
        const user_id = parseInt(req.user.id);

        const userCek = await pool.query('SELECT password FROM users WHERE id = $1', [user_id]);
        if (userCek.rows.length === 0) return res.status(404).json({ success: false, message: 'User tidak ditemukan' });

        let targetPassword = userCek.rows[0].password;

        if (password_lama && password_baru) {
            const isMatch = await bcrypt.compare(password_lama, targetPassword);
            if (!isMatch && password_lama !== targetPassword) {
                return res.json({ success: false, message: 'Password lama salah!' });
            }
            targetPassword = await bcrypt.hash(password_baru, 10);
        }

        await pool.query(`
            UPDATE users 
            SET nama = $1, no_hp = $2, password = $3 
            WHERE id = $4
        `, [nama, no_hp || '', targetPassword, user_id]);

        res.json({ success: true, message: 'Profil berhasil diperbarui!', data: { nama, no_hp } });
    } catch (err) {
        console.error('Error update profile:', err);
        res.status(500).json({ success: false, message: 'Error server' });
    }
});

// --- JALUR PENGATURAN BANK & ADMIN ---
app.get('/api/settings', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM settings WHERE id = 1');
        if (result.rows.length > 0) {
            const s = result.rows[0];
            res.json({ bankName: s.bank_name, accountNumber: s.account_number, accountHolder: s.account_holder, waAdmin: s.wa_admin, qrisImage: s.qris_image });
        } else {
            res.json({ bankName: 'BCA', accountNumber: '1234567890', accountHolder: 'NEO STORE OFFICIAL', waAdmin: '6281234567890' });
        }
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post('/api/settings', verifyToken, isAdmin, upload.single('qrisImage'), async (req, res) => {
    try {
        const { bankName, accountNumber, accountHolder, waAdmin } = req.body;
        
        let qrisImage = undefined;
        if (req.file) {
            qrisImage = req.file.path;
        }

        const ex = await pool.query('SELECT * FROM settings WHERE id = 1');
        if (ex.rows.length === 0) {
             await pool.query('INSERT INTO settings (id, bank_name, account_number, account_holder, wa_admin, qris_image) VALUES (1, $1, $2, $3, $4, $5)', 
             [bankName || 'BCA', accountNumber || '', accountHolder || '', waAdmin || '', qrisImage || '']);
        } else {
             if (qrisImage) {
                 await pool.query('UPDATE settings SET bank_name = $1, account_number = $2, account_holder = $3, wa_admin = $4, qris_image = $5 WHERE id = 1', 
                 [bankName || ex.rows[0].bank_name, accountNumber || ex.rows[0].account_number, accountHolder || ex.rows[0].account_holder, waAdmin || ex.rows[0].wa_admin, qrisImage]);
             } else {
                 await pool.query('UPDATE settings SET bank_name = $1, account_number = $2, account_holder = $3, wa_admin = $4 WHERE id = 1', 
                 [bankName || ex.rows[0].bank_name, accountNumber || ex.rows[0].account_number, accountHolder || ex.rows[0].account_holder, waAdmin || ex.rows[0].wa_admin]);
             }
        }

        const updated = await pool.query('SELECT * FROM settings WHERE id = 1');
        const s = updated.rows[0];
        res.json({ success: true, message: 'Konfigurasi berhasil diupdate!', data: { bankName: s.bank_name, accountNumber: s.account_number, accountHolder: s.account_holder, waAdmin: s.wa_admin, qrisImage: s.qris_image } });
    } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Gagal nyimpen konfigurasi' }); }
});

// --- JALUR UBAH PASSWORD ADMIN ---
app.post('/api/admin/password', verifyToken, async (req, res) => {
    const { password_lama, password_baru } = req.body;
    const user_id = parseInt(req.user.id);
    try {
        const cek = await pool.query('SELECT * FROM users WHERE id = $1', [user_id]);
        if (cek.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
        
        const isMatch = await bcrypt.compare(password_lama, cek.rows[0].password);
        if (!isMatch && password_lama !== cek.rows[0].password) {
            return res.json({ success: false, message: 'Password lama salah bosku!' });
        }

        const hashedBaru = await bcrypt.hash(password_baru, 10);
        await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashedBaru, user_id]);
        res.json({ success: true, message: 'Kunci keamanan berhasil diperbarui!' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// --- JALUR MANAJEMEN USER (ADMIN ONLY) ---
app.get('/api/users', verifyToken, isAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, email, nama, no_hp, role FROM users ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error fetching users: ' + err.message });
    }
});

app.delete('/api/users/:id', verifyToken, isAdmin, async (req, res) => {
    const targetId = parseInt(req.params.id);
    if (targetId === parseInt(req.user.id)) {
        return res.status(400).json({ success: false, message: 'Anda tidak dapat menghapus akun Anda sendiri saat sedang login!' });
    }

    try {
        // Cascade Delete secara manual
        try { await pool.query('DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id = $1)', [targetId]); } catch (e) { }
        await pool.query('DELETE FROM orders WHERE user_id = $1', [targetId]);
        await pool.query('DELETE FROM cart WHERE user_id = $1', [targetId]);
        try { await pool.query('DELETE FROM wishlist WHERE user_id = $1', [targetId]); } catch (e) { }

        await pool.query('DELETE FROM users WHERE id = $1', [targetId]);

        res.json({ success: true, message: 'User berhasil dihapus secara permanen.' });
    } catch (err) {
        console.error('Delete user error:', err);
        res.status(500).json({ success: false, message: 'Gagal menghapus user: ' + err.message });
    }
});

app.put('/api/users/:id/role', verifyToken, isAdmin, async (req, res) => {
    const targetId = parseInt(req.params.id);
    const { role } = req.body;

    if (targetId === parseInt(req.user.id)) {
        return res.status(400).json({ success: false, message: 'Tidak bisa mengubah role akun Anda sendiri!' });
    }

    if (role !== 'user' && role !== 'admin') {
        return res.status(400).json({ success: false, message: 'Role tidak valid!' });
    }

    try {
        await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, targetId]);
        res.json({ success: true, message: 'Role user berhasil diperbarui menjadi ' + role });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Gagal mengubah role user: ' + err.message });
    }
});

// Agar bisa berjalan di lokal, kita cek NODE_ENV dan environment Vercel
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    app.listen(port, () => {
        console.log(`🚀 Server jalan! Buka browser: http://localhost:${port}`);
    });
}

// Ekspor app untuk Vercel Serverless
module.exports = app;