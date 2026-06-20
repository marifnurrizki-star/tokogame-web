-- Script untuk Supabase (PostgreSQL)
-- Buka Supabase Dashboard > SQL Editor > New Query > Paste dan jalankan script ini.

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    nama VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user',
    no_hp VARCHAR(50),
    reset_token VARCHAR(255),
    reset_token_expires BIGINT,
    neo_credits INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    nama_produk VARCHAR(255) NOT NULL,
    harga INT NOT NULL,
    stok INT NOT NULL,
    deskripsi TEXT,
    gambar VARCHAR(255),
    kategori VARCHAR(100),
    kondisi VARCHAR(50) DEFAULT 'Baru',
    is_cyber_drop BOOLEAN DEFAULT false,
    discount_price INT
);

CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    total_harga INT NOT NULL,
    status VARCHAR(255) DEFAULT 'Menunggu Pembayaran',
    metode_bayar VARCHAR(100),
    bukti_transfer VARCHAR(255),
    alamat_kirim TEXT,
    catatan TEXT,
    no_hp VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INT REFERENCES orders(id) ON DELETE CASCADE,
    product_id INT REFERENCES products(id) ON DELETE CASCADE,
    jumlah INT NOT NULL,
    harga_satuan INT NOT NULL
);

CREATE TABLE IF NOT EXISTS cart (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    product_id INT REFERENCES products(id) ON DELETE CASCADE,
    jumlah INT NOT NULL
);

CREATE TABLE IF NOT EXISTS wishlist (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    product_id INT REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS promo_codes (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    discount_percent INT NOT NULL,
    is_active BOOLEAN DEFAULT true
);

-- Insert data admin default
INSERT INTO users (nama, email, password, role) 
VALUES ('Admin', 'admin@tokogame.com', 'admin123', 'admin')
ON CONFLICT (email) DO NOTHING;

CREATE TABLE IF NOT EXISTS settings (
    id SERIAL PRIMARY KEY,
    bank_name VARCHAR(100),
    account_number VARCHAR(100),
    account_holder VARCHAR(255),
    wa_admin VARCHAR(50),
    qris_image VARCHAR(255)
);

-- Insert default settings
INSERT INTO settings (id, bank_name, account_number, account_holder, wa_admin)
VALUES (1, 'BCA', '1234567890', 'NEO STORE OFFICIAL', '6281234567890');

-- Enable Row Level Security (RLS) pada semua tabel
-- Ini untuk mengamankan data jika menggunakan Data API Supabase (PostgREST)
-- Karena aplikasi kita menggunakan pg (koneksi backend/Node.js langsung), 
-- query backend akan tetap berjalan lancar dan mengabaikan RLS.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
