require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
    try {
        // 1. Cek password admin saat ini
        const res = await pool.query("SELECT id, email, password FROM users WHERE email = 'admin@tokogame.com'");
        if (res.rows.length === 0) {
            console.log('❌ User admin@tokogame.com tidak ditemukan di database!');
        } else {
            console.log('📋 Data admin saat ini:');
            console.log('   Email:', res.rows[0].email);
            console.log('   Password tersimpan:', JSON.stringify(res.rows[0].password));
            console.log('   Panjang password:', res.rows[0].password.length);
        }

        // 2. Reset password ke admin123
        await pool.query("UPDATE users SET password = 'admin123' WHERE role = 'admin'");
        console.log('\n✅ Password SEMUA akun admin berhasil direset ke: admin123');
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await pool.end();
    }
})();
