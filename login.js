// ============================================================
// KONFIGURASI — GANTI DENGAN PUNYA ANDA
// Ambil di: Supabase Dashboard → Project Settings → API
// ============================================================
const SUPABASE_URL      = 'https://daqouqefrwentrvzbgev.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_YYpdPRzcVjoD83qQzKfmnA_5OBbcoWA';

// Inisialisasi client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// HANDLER FORM LOGIN
// ============================================================
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const btn   = document.getElementById('btnLogin');
  const err   = document.getElementById('loginError');
  const nama  = document.getElementById('nama').value.trim();
  const pin   = document.getElementById('pin').value.trim();

  err.hidden = true;

  // Validasi sederhana
  if (!nama || !pin) {
    return tampilkanError('Nama dan PIN wajib diisi');
  }

  // Ubah tombol jadi loading
  btn.disabled = true;
  btn.querySelector('.btn-text').textContent = 'Memeriksa...';

  try {
    // Panggil RPC login_panitia di Supabase
    const { data, error } = await supabase.rpc('login_panitia', {
      p_nama: nama,
      p_pin:  pin
    });

    if (error) throw error;

    if (!data.ok) {
      const pesan = {
        NAMA_TIDAK_DITEMUKAN: 'Nama panitia tidak terdaftar',
        PIN_SALAH:            'PIN salah, coba lagi'
      }[data.reason] || 'Login gagal';
      return tampilkanError(pesan);
    }

    // Simpan sesi ke localStorage
    const sesi = {
      id:       data.id,
      nama:     data.nama,
      peran:    data.peran,
      event_id: data.event_id,
      login_at: Date.now()
    };
    localStorage.setItem('haflah_sesi', JSON.stringify(sesi));

    // Redirect ke dashboard
    window.location.href = 'index.html';

  } catch (e) {
    console.error(e);
    tampilkanError('Koneksi gagal. Cek internet Anda.');
  } finally {
    btn.disabled = false;
    btn.querySelector('.btn-text').textContent = 'Masuk';
  }
});

function tampilkanError(pesan) {
  const err = document.getElementById('loginError');
  err.textContent = pesan;
  err.hidden = false;
}

// Kalau sudah login, langsung lempar ke dashboard
if (localStorage.getItem('haflah_sesi')) {
  window.location.href = 'index.html';
}