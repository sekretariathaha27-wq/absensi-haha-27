// ============================================================
// KONFIGURASI — SAMA SEPERTI DI login.js
// ============================================================
const SUPABASE_URL      = 'https://daqouqefrwentrvzbgev.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_YYpdPRzcVjoD83qQzKfmnA_5OBbcoWA';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// CEK SESI
// ============================================================
const sesi = JSON.parse(localStorage.getItem('haflah_sesi') || 'null');
if (!sesi) { window.location.href = 'login.html'; throw new Error('No session'); }

document.getElementById('namaPanitia').textContent = sesi.nama;

document.getElementById('btnLogout').addEventListener('click', () => {
  if (confirm('Keluar dari aplikasi?')) {
    localStorage.removeItem('haflah_sesi');
    window.location.href = 'login.html';
  }
});

// ============================================================
// TAB NAVIGASI
// ============================================================
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');

    if (btn.dataset.tab === 'laporan') muatLaporan();
    if (btn.dataset.tab === 'data')    muatData();
  });
});

// ============================================================
// SCANNER QR
// ============================================================
let qrScanner = null;
let qrTerdeteksi = null;
let jumlahL = 0, jumlahP = 0;

async function mulaiScanner() {
  qrScanner = new Html5Qrcode('reader');
  try {
    await qrScanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 260, height: 260 } },
      onScanSukses,
      () => {} // error tiap frame, abaikan
    );
  } catch (err) {
    tampilPesan('error', 'Tidak bisa akses kamera: ' + err.message);
  }
}

function onScanSukses(teksQR) {
  // Format QR: HFL27.SH0042.9a3f1c7e
  // Kita ambil bagian kedua (kode_qr)
  const bagian = teksQR.split('.');
  const kodeQr = bagian.length >= 2 ? bagian[1] : teksQR;

  if (qrTerdeteksi === kodeQr) return; // hindari spam
  qrTerdeteksi = kodeQr;

  tampilkanHasilScan(kodeQr);
}

async function tampilkanHasilScan(kodeQr) {
  // Hentikan scanner sementara
  if (qrScanner) await qrScanner.pause(true);

  // Ambil data kuota
  const { data, error } = await supabase
    .from('kuota')
    .select('*, keluarga:kepala_keluarga(*)') // placeholder relasi
    .eq('kode_qr', kodeQr)
    .eq('event_id', sesi.event_id)
    .maybeSingle();

  if (error || !data) {
    tampilPesan('error', 'QR tidak dikenali: ' + kodeQr, () => lanjutScan());
    return;
  }

  if (data.hangus) {
    tampilPesan('warning', 'Kuota sudah hangus. Arahkan ke meja rekonsiliasi.', () => lanjutScan());
    return;
  }

  // Ambil nama santri (dari keluarga yang sama)
  const { data: santri } = await supabase
    .from('santri')
    .select('nama, kelas, sub_kategori')
    .eq('keluarga_id', data.pemilik_id)
    .limit(1)
    .maybeSingle();

  // Tampilkan panel hasil
  document.getElementById('hasilNama').textContent    = santri?.nama || '(Tamu Undangan)';
  document.getElementById('hasilKelas').textContent   = santri?.kelas || '';
  document.getElementById('hasilKuota').textContent   = data.kuota_dasar + data.kuota_tambahan;
  document.getElementById('hasilTerpakai').textContent= data.terpakai;
  document.getElementById('hasilSisa').textContent    = data.kuota_dasar + data.kuota_tambahan - data.terpakai;

  jumlahL = 0; jumlahP = 0;
  updateCounter();

  document.getElementById('scanHasil').hidden = false;
}

function updateCounter() {
  document.getElementById('jmlL').textContent = jumlahL;
  document.getElementById('jmlP').textContent = jumlahP;
}

// Tombol +/− counter
document.querySelectorAll('.counter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.target;
    const delta  = parseInt(btn.dataset.delta, 10);
    if (target === 'jmlL') jumlahL = Math.max(0, jumlahL + delta);
    if (target === 'jmlP') jumlahP = Math.max(0, jumlahP + delta);
    updateCounter();
  });
});

// Tombol konfirmasi
document.getElementById('btnKonfirmasi').addEventListener('click', async () => {
  if (jumlahL + jumlahP === 0) {
    alert('Isi dulu jumlah yang hadir');
    return;
  }

  const nonce = crypto.randomUUID();
  const { data, error } = await supabase.rpc('checkin', {
    p_kode_qr:  qrTerdeteksi,
    p_jumlah_l: jumlahL,
    p_jumlah_p: jumlahP,
    p_panitia:  sesi.id,
    p_jalur:    'BARAT',
    p_nonce:    nonce
  });

  if (error) {
    alert('Gagal: ' + error.message);
    return;
  }

  if (!data.ok) {
    const pesan = {
      KUOTA_HABIS:  'Kuota habis. Sisa: ' + data.sisa,
      KUOTA_HANGUS: 'Kuota sudah hangus',
      QR_INVALID:   'QR tidak valid'
    }[data.reason] || ('Gagal: ' + data.reason);
    alert(pesan);
    return;
  }

  // Sukses — tampilkan instruksi tiket
  const panggung = data.tiket_panggung ? '\n1 × EMAS (panggung) ⭐' : '';
  alert(
    `✅ BERHASIL\n\n${data.nama_santri} — ${data.kelas}\n\n` +
    `SERAHKAN ${data.tiket_reguler} TIKET REGULER${panggung}\n\n` +
    `Sisa kuota: ${data.sisa}`
  );

  lanjutScan();
});

document.getElementById('btnBatalScan').addEventListener('click', lanjutScan);

function lanjutScan() {
  qrTerdeteksi = null;
  document.getElementById('scanHasil').hidden = true;
  document.getElementById('scanPesan').hidden = true;
  if (qrScanner) qrScanner.resume();
}

function tampilPesan(tipe, teks, onTutup) {
  const box = document.getElementById('scanPesan');
  box.className = 'scan-pesan ' + tipe;
  box.textContent = teks;
  box.hidden = false;
  if (onTutup) {
    box.onclick = () => { box.hidden = true; onTutup(); };
  }
}

// ============================================================
// TAB DATA
// ============================================================
async function muatData() {
  const el = document.getElementById('daftarData');
  el.innerHTML = '<p class="muted">Memuat...</p>';

  const { data, error } = await supabase
    .from('keluarga')
    .select('id, kode, nama_wali, no_hp, santri(nama, kelas, sub_kategori)')
    .eq('event_id', sesi.event_id)
    .order('kode')
    .limit(200);

  if (error) {
    el.innerHTML = '<p class="error-box">Gagal memuat: ' + error.message + '</p>';
    return;
  }

  el.innerHTML = data.map(k => `
    <div class="data-item">
      <div class="data-kode">${k.kode}</div>
      <div class="data-utama">${k.santri?.[0]?.nama || '—'}</div>
      <div class="data-sub">${k.nama_wali} · ${k.no_hp || '-'}</div>
    </div>
  `).join('') || '<p class="muted">Belum ada data</p>';
}

document.getElementById('cariData').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  document.querySelectorAll('.data-item').forEach(item => {
    item.style.display = item.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
});

// Modal tambah keluarga
document.getElementById('btnTambahKeluarga').addEventListener('click', () => {
  document.getElementById('modalKeluarga').hidden = false;
});
document.getElementById('btnModalBatal').addEventListener('click', () => {
  document.getElementById('modalKeluarga').hidden = true;
});

document.getElementById('formKeluarga').addEventListener('submit', async (e) => {
  e.preventDefault();

  // 1. Tambah keluarga
  const { data: kel, error: err1 } = await supabase.rpc('tambah_keluarga', {
    p_event:     sesi.event_id,
    p_kode:      document.getElementById('fKode').value.trim(),
    p_nama_wali: document.getElementById('fNamaWali').value.trim(),
    p_no_hp:     document.getElementById('fHp').value.trim(),
    p_alamat:    ''
  });

  if (err1 || !kel?.ok) {
    alert('Gagal tambah keluarga: ' + (err1?.message || kel?.reason));
    return;
  }

  // 2. Tambah santri
  const { data: san, error: err2 } = await supabase.rpc('tambah_santri', {
    p_event:           sesi.event_id,
    p_keluarga:        kel.id,
    p_nis:             document.getElementById('fNis').value.trim(),
    p_nama:            document.getElementById('fNamaSantri').value.trim(),
    p_unit:            'P3TQ',
    p_kelas:           document.getElementById('fKelas').value.trim(),
    p_kategori_utama:  document.getElementById('fKategori').value,
    p_sub_kategori:    document.getElementById('fSubKategori').value.trim()
  });

  if (err2 || !san?.ok) {
    alert('Gagal tambah santri: ' + (err2?.message || san?.reason));
    return;
  }

  alert('✅ Berhasil ditambahkan');
  document.getElementById('modalKeluarga').hidden = true;
  document.getElementById('formKeluarga').reset();
  muatData();
});

// ============================================================
// TAB LAPORAN
// ============================================================
async function muatLaporan() {
  const { data, error } = await supabase
    .from('v_dashboard_realtime')
    .select('*')
    .eq('event_id', sesi.event_id)
    .maybeSingle();

  if (error || !data) {
    console.warn(error);
    return;
  }

  document.getElementById('statKuota').textContent = data.total_kuota || 0;
  document.getElementById('statHadir').textContent = data.total_hadir || 0;
  document.getElementById('statL').textContent     = data.total_putra || 0;
  document.getElementById('statP').textContent     = data.total_putri || 0;

  // Rekap per kategori
  const { data: rekap } = await supabase
    .from('v_rekap_sohibul_hajat')
    .select('*')
    .order('no');

  const el = document.getElementById('rekapKategori');
  el.innerHTML = (rekap || []).map(r => `
    <div class="rekap-row">
      <span class="rekap-nama">${r.kategori}</span>
      <span class="rekap-angka">${r.total} / ${r.total_kuota}</span>
    </div>
  `).join('') || '<p class="muted">Belum ada data</p>';
}

document.getElementById('btnMuatUlang').addEventListener('click', muatLaporan);

// ============================================================
// MULAI
// ============================================================
mulaiScanner();