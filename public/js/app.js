function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return; // Mencegah error kalau toast-container nggak ada di halaman
    const toast = document.createElement('div');
    const color = type === 'success' ? 'border-primary' : 'border-error';
    const textColor = type === 'success' ? 'text-primary' : 'text-error';
    toast.className = `glass-panel px-6 py-4 rounded-lg border ${color} flex items-center gap-md transition-all duration-300 shadow-lg`;
    toast.innerHTML = `<span class="material-symbols-outlined ${textColor}">${type === 'success' ? 'check_circle' : 'error'}</span><span class="text-on-surface font-label-md">${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

let editModeId = null; // Buat nanda-in kita lagi nambah baru atau ngedit lama

// --- AUTH & NAV ---
function bukaRegister() { document.getElementById('view-login')?.classList.add('hidden'); document.getElementById('view-register')?.classList.remove('hidden'); }
function bukaLogin() { document.getElementById('view-register')?.classList.add('hidden'); document.getElementById('view-login')?.classList.remove('hidden'); }
function lihatPassword(idInput, idIkon) { const inputan = document.getElementById(idInput); const ikon = document.getElementById(idIkon); if (!inputan || !ikon) return; if (inputan.type === 'password') { inputan.type = 'text'; ikon.innerText = 'visibility_off'; } else { inputan.type = 'password'; ikon.innerText = 'visibility'; } }
function bukaKeranjang() { document.getElementById('main-storefront')?.classList.add('hidden'); document.getElementById('main-cart')?.classList.remove('hidden'); muatKeranjang(); }
function bukaToko() { document.getElementById('main-cart')?.classList.add('hidden'); document.getElementById('main-storefront')?.classList.remove('hidden'); }
function bukaRiwayat() { document.getElementById('modal-riwayat')?.classList.remove('hidden'); document.getElementById('modal-riwayat')?.classList.add('flex'); const user = JSON.parse(localStorage.getItem('userTokoGame')); fetch(`/api/orders/user/${user.id}`).then(res => res.json()).then(data => { const tempat = document.getElementById('tempat-riwayat'); if(!tempat) return; tempat.innerHTML = ''; if(data.length === 0) { tempat.innerHTML = '<tr><td colspan="4" class="py-4 text-center text-on-surface-variant">No transaction records found.</td></tr>'; return; } data.forEach(o => { const hrg = new Intl.NumberFormat('id-ID', {style:'currency', currency:'IDR'}).format(o.total_harga); tempat.innerHTML += `<tr class="border-b border-white/10 hover:bg-white/5"><td class="py-3 px-2">#${o.id}</td><td class="py-3 px-2 text-secondary">${hrg}</td><td class="py-3 px-2 text-xs">${o.metode_bayar || '-'}</td><td class="py-3 px-2"><span class="${o.status === 'Dikirim' ? 'text-primary border-primary' : 'text-error border-error'} border px-2 py-1 rounded text-[10px] font-bold">${o.status}</span></td></tr>`; }); }); }
function tutupRiwayat() { document.getElementById('modal-riwayat')?.classList.add('hidden'); document.getElementById('modal-riwayat')?.classList.remove('flex'); }

function cekLogin() {
    const user = JSON.parse(localStorage.getItem('userTokoGame'));
    document.getElementById('view-login')?.classList.add('hidden'); document.getElementById('view-register')?.classList.add('hidden');
    document.getElementById('view-user')?.classList.add('hidden'); document.getElementById('view-user')?.classList.remove('flex');
    document.getElementById('view-admin')?.classList.add('hidden'); document.getElementById('view-admin')?.classList.remove('flex');

    if (!user) { 
        document.getElementById('view-login')?.classList.remove('hidden'); 
    } 
    else if (user.role === 'admin') { 
        document.getElementById('view-admin')?.classList.remove('hidden'); 
        document.getElementById('view-admin')?.classList.add('flex'); 
        if(document.getElementById('nama-admin')) document.getElementById('nama-admin').innerText = user.nama; 
        tutupHalamanTambah(); 
        muatAdmin(); 
    } 
    else { 
        document.getElementById('view-user')?.classList.remove('hidden'); 
        document.getElementById('view-user')?.classList.add('flex'); 
        if(document.getElementById('nama-user')) document.getElementById('nama-user').innerText = "User: " + user.nama; 
        bukaToko(); 
        muatPembeli(); 
    }
}
function logout() { localStorage.removeItem('userTokoGame'); cekLogin(); }

// Wishlist feature removed — functions deleted to simplify frontend

document.getElementById('form-register')?.addEventListener('submit', function(e) { e.preventDefault(); fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nama: document.getElementById('reg-nama').value, email: document.getElementById('reg-email').value, password: document.getElementById('reg-password').value }) }).then(res => res.json()).then(data => { if (data.success) { showToast(data.message); document.getElementById('form-register').reset(); bukaLogin(); } else showToast(data.message, 'error'); }); });
document.getElementById('form-login')?.addEventListener('submit', function(e) { 
    e.preventDefault(); 
    const email = document.getElementById('email').value; 
    const password = document.getElementById('password').value; 
    fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                localStorage.setItem('userTokoGame', JSON.stringify(data.data));
                if (data.data.role === 'admin') {
                    window.location.href = '/admin.html';
                } else {
                    showNotif('Login sukses!', 'success');
                    location.reload();
                }
            } else {
                showNotif(data.message, 'error');
            }
        })
        .catch(err => { console.error(err); showNotif('Server mati atau ada error!', 'error'); });
});

// --- ADMIN FUNCTIONS ---
function bukaHalamanTambah() {
    editModeId = null; 
    document.getElementById('form-tambah-game')?.reset();
    hapusPreviewGambar(); 
    document.getElementById('admin-dashboard')?.classList.add('hidden'); document.getElementById('admin-dashboard')?.classList.remove('flex'); 
    document.getElementById('admin-tambah-form')?.classList.remove('hidden'); document.getElementById('admin-tambah-form')?.classList.add('flex'); 
}

function tutupHalamanTambah() {
    editModeId = null;
    document.getElementById('admin-tambah-form')?.classList.add('hidden'); document.getElementById('admin-tambah-form')?.classList.remove('flex'); 
    document.getElementById('admin-dashboard')?.classList.remove('hidden'); document.getElementById('admin-dashboard')?.classList.add('flex'); 
    document.getElementById('form-tambah-game')?.reset(); 
    hapusPreviewGambar();
}

function muatAdmin() {
    fetch('/api/orders').then(res => res.json()).then(data => { const tempat = document.getElementById('tempat-pesanan'); if(!tempat) return; tempat.innerHTML = ''; data.forEach(o => { const linkBukti = o.bukti_transfer ? `<a href="${o.bukti_transfer}" target="_blank" class="text-primary underline hover:text-primary-container text-xs">View Proof</a>` : '-'; const btn = o.status !== 'Dikirim' ? `<button onclick="kirim(${o.id})" class="bg-primary text-on-primary px-3 py-1 rounded text-xs font-bold hover:shadow-[0_0_10px_rgba(168,232,255,0.5)]">Deploy</button>` : '<span class="text-[10px] text-on-surface-variant">Deployed</span>'; tempat.innerHTML += `<tr class="table-row-hover transition-all duration-200"><td class="py-3 px-4">#${o.id}</td><td class="py-3 px-4 font-bold text-primary">${o.user_id}</td><td class="py-3 px-4 text-secondary">${new Intl.NumberFormat('id-ID', {style:'currency', currency:'IDR'}).format(o.total_harga)}</td><td class="py-3 px-4 text-[11px]">${o.metode_bayar || '-'}</td><td class="py-3 px-4">${linkBukti}</td><td class="py-3 px-4"><span class="border px-2 py-1 rounded text-[10px] ${o.status === 'Dikirim' ? 'text-primary border-primary' : 'text-error border-error'} font-bold">${o.status}</span></td><td class="py-3 px-4 text-center">${btn}</td></tr>`; }); });
    fetch('/api/products').then(res => res.json()).then(data => {
        const tempat = document.getElementById('admin-tempat-produk'); if(!tempat) return; tempat.innerHTML = '';
        data.forEach(g => {
            const hrg = new Intl.NumberFormat('id-ID', {style:'currency', currency:'IDR'}).format(g.harga);
            const linkCover = g.gambar ? g.gambar : 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=400&auto=format&fit=crop';
            const filterWarna = g.gambar ? '' : `filter: hue-rotate(${g.id * 40}deg) saturate(1.5);`;
            const statusStok = g.stok > 0 ? `<span class="font-body-lg text-primary">${g.stok}</span><span class="ml-2 text-label-sm text-outline">Units</span>` : `<div class="inline-flex items-center px-sm py-xs bg-error-container/20 border border-error/30 rounded-full"><span class="text-label-sm font-bold text-error tracking-tighter">STOK HABIS</span></div>`;
            tempat.innerHTML += `<tr class="table-row-hover transition-all duration-200 group"><td class="px-md py-md"><div class="w-20 h-24 bg-surface-container-highest rounded-lg overflow-hidden border border-white/10 group-hover:border-primary/50 transition-colors"><img class="w-full h-full object-cover" src="${linkCover}" style="${filterWarna}"></div></td><td class="px-md py-md"><div class="flex flex-col"><span class="font-headline-md text-on-surface">${g.nama_produk}</span><span class="text-label-sm text-outline truncate w-48">${g.deskripsi}</span></div></td><td class="px-md py-md">${statusStok}</td><td class="px-md py-md text-right"><span class="font-headline-sm text-on-surface">${hrg}</span></td><td class="px-md py-md"><div class="flex justify-center gap-sm"><button onclick="bukaEditProduk(${g.id}, '${g.nama_produk.replace(/'/g, "\\'")}', ${g.harga}, ${g.stok}, '${g.deskripsi.replace(/'/g, "\\'")}', '${g.gambar || ''}', '${g.kategori || ''}')" class="p-2 hover:bg-primary/20 hover:text-primary rounded-lg transition-colors text-outline"><span class="material-symbols-outlined">edit</span></button><button onclick="showToast('Fitur Delete segera hadir!', 'error')" class="p-2 hover:bg-error/20 hover:text-error rounded-lg transition-colors text-outline"><span class="material-symbols-outlined">delete</span></button></div></td></tr>`;
        });
    });
}
function bukaEditProduk(id, nama, harga, stok, deskripsi, gambar, kategori) {
    bukaHalamanTambah(); 
    editModeId = id; 
    
    document.getElementById('namaGame').value = nama;
    document.getElementById('hargaGame').value = harga;
    document.getElementById('stokGame').value = stok;
    document.getElementById('deskripsiGame').value = deskripsi;
    
    document.querySelectorAll('input[name="platform"]').forEach(cb => cb.checked = false);
    if(kategori && kategori !== 'null') {
        const arrKategori = kategori.split(', ');
        arrKategori.forEach(kat => {
            const cb = document.querySelector(`input[name="platform"][value="${kat}"]`);
            if(cb) cb.checked = true;
        });
    }
    
    if (gambar && gambar !== 'null' && gambar !== '') {
        const preview = document.getElementById('preview-gambar');
        preview.src = gambar;
        preview.classList.remove('grayscale', 'opacity-50');
        document.getElementById('ikon-gambar-default')?.classList.add('opacity-0');
        document.getElementById('btn-hapus-gambar')?.classList.remove('hidden');
        document.getElementById('btn-hapus-gambar')?.classList.add('flex');
    }
}

function kirim(id) { fetch(`/api/orders/${id}`, { method: 'PUT' }).then(() => muatAdmin()); }

document.getElementById('form-tambah-game')?.addEventListener('submit', function(e) { 
    e.preventDefault(); 
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin">refresh</span> TRANSMITTING...';
    btn.classList.add('opacity-70');

    try {
        const fileInput = document.getElementById('gambarGame');
        const formData = new FormData(); 
        formData.append('nama_produk', document.getElementById('namaGame').value); 
        formData.append('harga', document.getElementById('hargaGame').value); 
        formData.append('stok', document.getElementById('stokGame').value); 
        formData.append('deskripsi', document.getElementById('deskripsiGame').value); 

        const checkedPlatforms = Array.from(document.querySelectorAll('input[name="platform"]:checked')).map(cb => cb.value).join(', ');
        formData.append('kategori', checkedPlatforms);

        if (fileInput && fileInput.files.length > 0) {
            formData.append('gambarGame', fileInput.files[0]);
        }

        const idTarget = typeof editModeId !== 'undefined' ? editModeId : null;
        const urlFetch = idTarget ? `/api/products/${idTarget}` : '/api/products';
        const methodFetch = idTarget ? 'PUT' : 'POST';

        fetch(urlFetch, { method: methodFetch, body: formData })
        .then(res => {
            if (!res.ok) throw new Error('Respon server gagal');
            return res.json();
        })
        .then(data => { 
            if (data.success) { 
                btn.innerHTML = '<span class="material-symbols-outlined">check_circle</span> SUCCESS';
                btn.classList.remove('bg-primary-container', 'text-on-primary-container');
                btn.classList.add('bg-green-500', 'text-white');
                
                setTimeout(() => {
                    btn.innerHTML = originalText;
                    btn.classList.remove('bg-green-500', 'text-white', 'opacity-70');
                    btn.classList.add('bg-primary-container', 'text-on-primary-container');
                    showToast(idTarget ? 'Software updated!' : 'Software successfully injected!'); 
                    tutupHalamanTambah(); 
                    muatAdmin(); 
                }, 1500);
            } else {
                btn.innerHTML = originalText; btn.classList.remove('opacity-70');
                showToast(data.message || 'Failed to deploy software', 'error'); 
            } 
        })
        .catch(err => {
            console.error('Fetch Error:', err);
            btn.innerHTML = originalText; 
            btn.classList.remove('opacity-70');
            showToast('Gagal terhubung ke Server!', 'error'); 
        });

    } catch (errorLokal) {
        console.error('JS Error Lokal:', errorLokal);
        btn.innerHTML = originalText; 
        btn.classList.remove('opacity-70');
        showToast('Ada error di sistem web', 'error'); 
    }
});

// --- USER FUNCTIONS ---
function muatPembeli() { fetch('/api/products').then(res => res.json()).then(data => { const tempat = document.getElementById('tempat-produk'); if(!tempat) return; tempat.innerHTML = ''; data.forEach((p) => { const hargaRp = new Intl.NumberFormat('id-ID', {style:'currency', currency:'IDR'}).format(p.harga); const linkGambar = p.gambar ? p.gambar : 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=100&auto=format&fit=crop'; tempat.innerHTML += `
                        <div class="cyber-card rounded-xl overflow-hidden flex flex-col relative">
                            <a href="/detailP.html?id=${p.id}" class="block group cursor-pointer">
                                <div class="overflow-hidden">
                                    <img src="${linkGambar}" class="w-full h-48 object-cover border-b border-gray-800 transition-transform duration-500 group-hover:scale-110" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=100&auto=format&fit=crop'">
                                </div>
                                <div class="p-5 flex flex-col flex-grow">
                                    <span class="text-xs text-[#00d4ff] font-bold tracking-widest uppercase mb-1">${p.kategori || 'GAME'}</span>
                                    <h3 class="text-lg font-bold text-white leading-tight mb-2 group-hover:text-[#00d4ff] transition-colors">${p.nama_produk}</h3>
                                    <p class="text-xl text-white font-bold mb-4 mt-auto">${hargaRp}</p>
                                </div>
                            </a>
                            <div class="px-5 pb-5 mt-auto grid grid-cols-1 gap-3">
                                <button onclick="tambahKeKeranjang(${p.id})" class="w-full py-2 bg-white/5 hover:bg-[#00d4ff] hover:text-black text-[#00d4ff] border border-[#00d4ff]/30 rounded transition-colors font-bold text-sm uppercase flex items-center justify-center gap-2 z-10 relative">
                                    <span class="material-symbols-outlined text-[18px]">add_shopping_cart</span> Add to Cart
                                </button>
                                <!-- wishlist button removed -->
                            </div>
                        </div>
                    `; }); }); }
function tambahKeKeranjang(product_id) { const user = JSON.parse(localStorage.getItem('userTokoGame')); fetch('/api/cart', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: user.id, product_id: product_id }) }).then(res => res.json()).then(data => { if(data.success) showToast('Item Injected to Cart!'); }); }

    
function muatKeranjang() { const user = JSON.parse(localStorage.getItem('userTokoGame')); fetch(`/api/cart/${user.id}`).then(res => res.json()).then(data => { const tempat = document.getElementById('tempat-keranjang'); const totalSub = document.getElementById('total-subtotal'); const totalMain = document.getElementById('total-main'); const cartCount = document.getElementById('cart-count'); if(!tempat) return; tempat.innerHTML = ''; let totalHarga = 0; cartCount.innerText = `(${data.length} item)`; if(data.length === 0) { tempat.innerHTML = '<div class="glass-panel p-md rounded-lg text-center text-on-surface-variant">Keranjang kosong bro. Lanjut hunting game dulu!</div>'; totalSub.innerText = 'Rp 0'; totalMain.innerText = 'Rp 0'; return; } data.forEach(item => { const subTotal = item.harga * item.jumlah; totalHarga += subTotal; const linkCover = item.gambar ? item.gambar : 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=400&auto=format&fit=crop'; const filterWarna = item.gambar ? '' : `filter: hue-rotate(${item.product_id * 40}deg) saturate(1.5);`; tempat.innerHTML += `<div class="glass-panel p-md rounded-lg flex flex-col sm:flex-row gap-md items-center"><div class="w-32 h-32 rounded bg-surface-container overflow-hidden border border-white/5 flex-shrink-0"><img src="${linkCover}" style="${filterWarna}" class="w-full h-full object-cover"></div><div class="flex-grow space-y-xs w-full text-center sm:text-left"><div class="flex flex-col sm:flex-row sm:justify-between sm:items-start"><div><h3 class="font-headline-md text-on-surface">${item.nama_produk}</h3><p class="text-on-surface-variant font-label-md">Katalog Digital</p></div><span class="font-headline-sm text-primary">${new Intl.NumberFormat('id-ID', {style:'currency', currency:'IDR'}).format(subTotal)}</span></div><div class="flex items-center justify-center sm:justify-start gap-md mt-base"><div class="border border-outline-variant rounded px-4 py-1 bg-white/5"><span class="text-on-surface font-medium text-sm">Qty: ${item.jumlah}</span></div><button onclick="hapusItemCart(${item.product_id})" class="text-on-surface-variant hover:text-error transition-colors"><span class="material-symbols-outlined text-md">delete</span></button></div></div></div>`; }); const formatted = new Intl.NumberFormat('id-ID', {style:'currency', currency:'IDR'}).format(totalHarga); totalSub.innerText = formatted; totalMain.innerText = formatted; }); }
function hapusItemCart(product_id) { const user = JSON.parse(localStorage.getItem('userTokoGame')); fetch(`/api/cart/${user.id}/${product_id}`, { method: 'DELETE' }).then(res => res.json()).then(data => { if(data.success) muatKeranjang(); }); }
function lanjutCheckout() { 
    const totalText = document.getElementById('total-main').innerText;
    if (totalText === 'Rp 0' || totalText === 'Rp 0,00') { 
        showToast('Cart is empty!', 'error'); 
        return; 
    } 
    window.location.href = '/shipping.html';
}
function tutupCheckout() { document.getElementById('modal-checkout')?.classList.add('hidden'); document.getElementById('modal-checkout')?.classList.remove('flex'); }

document.getElementById('form-checkout')?.addEventListener('submit', function(e) { 
    e.preventDefault(); 
    const user = JSON.parse(localStorage.getItem('userTokoGame')); 
    
    // Ambil elemen
    const fileInput = document.getElementById('co-bukti'); 
    const alamatInput = document.getElementById('co-alamat');
    const bankInput = document.getElementById('co-bank');

    // Jurus aman kalau alamat gak ada di halaman ini
    const alamatFix = alamatInput ? alamatInput.value : 'Sesuai Data Profil Pengguna';
    const bankFix = bankInput ? bankInput.value : 'Transfer Bank';

    const formData = new FormData(); 
    formData.append('user_id', user.id); 
    formData.append('alamat', alamatFix); 
    formData.append('metode_bayar', bankFix); 
    
    if (fileInput && fileInput.files.length > 0) {
        formData.append('bukti_transfer', fileInput.files[0]); 
    }

    // Ubah tombol jadi loading biar keren
    const btnSubmit = e.target.querySelector('button[type="submit"]');
    const oriText = btnSubmit.innerHTML;
    btnSubmit.innerHTML = 'MEMPROSES...';
    btnSubmit.disabled = true;

    fetch('/api/checkout', { method: 'POST', body: formData })
    .then(res => res.json())
    .then(data => { 
        btnSubmit.innerHTML = oriText;
        btnSubmit.disabled = false;
        
        if (data.success) { 
            showToast('Transaksi Sukses! Menunggu verifikasi admin.'); 
            tutupCheckout(); 
            document.getElementById('form-checkout').reset(); 
            
            // Langsung lempar ke halaman riwayat biar lu bisa cek detailnya
            setTimeout(() => {
                window.location.href = '/riwayat.html';
            }, 1000);
        } else { 
            showNotif('Gagal Checkout: ' + data.message, 'error'); 
        } 
    })
    .catch(err => {
        console.error(err);
        btnSubmit.innerHTML = oriText;
        btnSubmit.disabled = false;
        showNotif('Server mati atau ada error sistem!', 'error');
    }); 
});

// Micro-interactions untuk input form admin
document.querySelectorAll('input, select, textarea').forEach(input => {
    input.addEventListener('focus', () => { if(input.parentElement.classList.contains('relative') || input.parentElement.classList.contains('flex')) { input.parentElement.classList.add('neon-glow'); } else { input.classList.add('neon-glow'); } });
    input.addEventListener('blur', () => { if(input.parentElement.classList.contains('relative') || input.parentElement.classList.contains('flex')) { input.parentElement.classList.remove('neon-glow'); } else { input.classList.remove('neon-glow'); } });
});

// Fitur Preview Gambar & Hapus
document.getElementById('gambarGame')?.addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.getElementById('preview-gambar');
            if(preview) {
                preview.src = e.target.result; 
                preview.classList.remove('grayscale', 'opacity-50'); 
            }
            document.getElementById('ikon-gambar-default')?.classList.add('opacity-0');
            document.getElementById('btn-hapus-gambar')?.classList.remove('hidden');
            document.getElementById('btn-hapus-gambar')?.classList.add('flex');
        }
        reader.readAsDataURL(file);
    }
});

function hapusPreviewGambar() {
    if(document.getElementById('gambarGame')) document.getElementById('gambarGame').value = ''; 
    const preview = document.getElementById('preview-gambar');
    if(preview) {
        preview.src = 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=400&auto=format&fit=crop'; 
        preview.classList.add('grayscale', 'opacity-50');
    }
    document.getElementById('ikon-gambar-default')?.classList.remove('opacity-0');
    document.getElementById('btn-hapus-gambar')?.classList.add('hidden');
    document.getElementById('btn-hapus-gambar')?.classList.remove('flex');
}

cekLogin();
