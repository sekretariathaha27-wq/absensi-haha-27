// ============================================================
// APP.JS — Logika Utama Aplikasi Absensi Haflah P3TQ
// Versi 1.1 — Konsisten dengan style.css v1.1
// ============================================================

// ------------------------------------------------------------
// KONFIGURASI SUPABASE (sudah diisi)
// ------------------------------------------------------------
const SUPABASE_URL      = 'https://daqouqefrwentrvzbgev.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_YYpdPRzcVjoD83qQzKfmnA_5OBbcoWA';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ------------------------------------------------------------
// CEK SESI LOGIN
// ------------------------------------------------------------
const sesi = JSON.parse(localStorage.getItem('haflah_sesi') || 'null');

if (!sesi || !sesi.id) {
  window.location.href = 'login.html';
  throw new Error('No session — redirecting');
}

document.getElementById('namaPanitia').textContent = sesi.nama || 'Panitia';

// ------------------------------------------------------------
// LOGOUT
// ------------------------------------------------------------
document.getElementById('btnLogout').addEventListener('click', () => {
  if (confirm('Keluar dari aplikasi?')) {
    localStorage.removeItem('haflah_sesi');
    window.location.href = 'login.html';
  }
});

// ------------------------------------------------------------
// NAVIGASI TAB
// ------------------------------------------------------------
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    // Ganti tombol aktif
    document.querySelectorAll('.nav-btn')
      .forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Ganti konten aktif
    document.querySelectorAll('.tab-content')
      .forEach(t => t.classList.remove('active'));
    const target = document.getElementById('tab-' + btn.dataset.tab);
    if (target) target.classList.add('active');

    // Aksi per tab
    if (btn.dataset.tab === 'laporan') muatLaporan();
    if (btn.dataset.tab === 'data')    muatData();
    if (btn.dataset.tab === 'scan')    pastikanScannerJalan();
  });
});

// ============================================================
// BAGIAN 1: SCANNER QR
// ============================================================
let qrScanner      = null;
let qrTerdeteksi   = null;   // { kode_qr, kuota }
let jumlahL        = 0;
let jumlahP        = 0;
let jumlahB        = 0;
let scannerRunning = false;

async function mulaiScanner() {
  if (scannerRunning) return;

  if (!qrScanner) {
    qrScanner = new Html5Qrcode('reader');
  }

  try {
    await qrScanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 260, height: 260 } },
      onScanSukses,
      () => {} // abaikan error tiap frame
    );
    scannerRunning = true;
  } catch (err) {
    console.error('Scanner error:', err);
    tampilPesan('error',
      'Tidak bisa akses kamera. Beri izin kamera lalu muat ulang halaman.',
      null);
  }
}

function pastikanScannerJalan() {
  if (!scannerRunning) {
    mulaiScanner();
  } else if (qrScanner && qrTerdeteksi === null) {
    qrScanner.resume().catch(() => {});
  }
}

async function onScanSukses(teksQR) {
  // Format QR dari generator: "HFL27.SH0042.9a3f1c7e"
  const bagian  = String(teksQR).split('.');
  const kodeQr  = bagian.length >= 2 ? bagian[1] : teksQR;

  // Hindari spam
  if (qrTerdeteksi && qrTerdeteksi.kode_qr === kodeQr) return;

  // Hentikan scanner sementara
  try { await qrScanner.pause(true); } catch (_) {}

  qrTerdeteksi = { kode_qr: kodeQr };
  await tampilkanHasilScan(kodeQr);
}

async function tampilkanHasilScan(kodeQr) {
  // Ambil data kuota
  const { data: kuota, error } = await supabase
    .from('kuota')
    .select('*')
    .eq('event_id', sesi.event_id)
    .eq('kode_qr', kodeQr)
    .maybeSingle();

  if (error) {
    console.error(error);
    tampilPesan('error', 'Gagal koneksi ke server. Coba lagi.', lanjutScan);
    return;
  }

  if (!kuota) {
    tampilPesan('error',
      'QR tidak dikenali: ' + kodeQr + ' (klik untuk coba lagi)',
      lanjutScan);
    return;
  }

  if (kuota.hangus) {
    tampilPesan('warning',
      'Kuota sudah hangus. Arahkan ke meja rekonsiliasi. (klik untuk lanjut)',
      lanjutScan);
    return;
  }

  // Ambil nama santri (kalau pemilik KELUARGA)
  let nama  = '(Tamu Undangan)';
  let kelas = '';

  if (kuota.pemilik_tipe === 'KELUARGA') {
    const { data: santri } = await supabase
      .from('santri')
      .select('nama, kelas, sub_kategori')
      .eq('keluarga_id', kuota.pemilik_id)
      .limit(1)
      .maybeSingle();

    if (santri) {
      nama  = santri.nama || nama;
      kelas = (santri.kelas || '') +
              (santri.sub_kategori ? ' • ' + santri.sub_kategori : '');
    }
  } else if (kuota.pemilik_tipe === 'UNDANGAN') {
    const { data: und } = await supabase
      .from('undangan')
      .select('nama, instansi, kategori')
      .eq('id', kuota.pemilik_id)
      .maybeSingle();

    if (und) {
      nama  = und.nama;
      kelas = und.kategori + (und.instansi ? ' • ' + und.instansi : '');
    }
  }

  // Simpan info ke state
  qrTerdeteksi.kuota = kuota;

  // Update UI
  document.getElementById('hasilNama').textContent  = nama;
  document.getElementById('hasilKelas').textContent = kelas;

  const totalKuota = (kuota.kuota_dasar || 0) + (kuota.kuota_tambahan || 0);
  const terpakai   = kuota.terpakai || 0;
  const sisa       = totalKuota - terpakai;

  document.getElementById('hasilKuota').textContent    = totalKuota;
  document.getElementById('hasilTerpakai').textContent = terpakai;
  document.getElementById('hasilSisa').textContent     = sisa;

  // Reset counter
  jumlahL = 0;
  jumlahP = 0;
  jumlahB = 0;
  updateCounterUI();

  // Tampilkan panel hasil
  document.getElementById('scanHasil').hidden = false;
  document.getElementById('scanPesan').hidden = true;

  // Disable tombol kalau kuota habis
  const btnKonfirmasi = document.getElementById('btnKonfirmasi');
  if (sisa <= 0) {
    btnKonfirmasi.disabled = true;
    btnKonfirmasi.textContent = 'Kuota Habis — Arahkan ke Rekonsiliasi';
  } else {
    btnKonfirmasi.disabled = false;
    btnKonfirmasi.textContent = '✓ Konfirmasi & Serahkan Tiket';
  }

  // Scroll ke panel
  setTimeout(() => {
    document.getElementById('scanHasil')
      .scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 100);
}

function updateCounterUI() {
  document.getElementById('jmlL').textContent = jumlahL;
  document.getElementById('jmlP').textContent = jumlahP;
  document.getElementById('jmlB').textContent = jumlahB;
}

// Counter tombol +/-
document.querySelectorAll('.counter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.target;
    const delta  = parseInt(btn.dataset.delta, 10);

    if (target === 'jmlL') jumlahL = Math.max(0, jumlahL + delta);
    if (target === 'jmlP') jumlahP = Math.max(0, jumlahP + delta);
    if (target === 'jmlB') jumlahB = Math.max(0, jumlahB + delta);

    updateCounterUI();
  });
});

// Tombol konfirmasi
document.getElementById('btnKonfirmasi')
  .addEventListener('click', async () => {
    if (!qrTerdeteksi || !qrTerdeteksi.kode_qr) return;
    if (jumlahL + jumlahP <= 0) {
      alert('Isi dulu jumlah laki-laki atau perempuan yang hadir');
      return;
    }

    const btn = document.getElementById('btnKonfirmasi');
    btn.disabled = true;
    btn.textContent = 'Memproses...';

    try {
      const nonce = (crypto.randomUUID && crypto.randomUUID())
                    || (Date.now() + '-' + Math.random());

      const { data, error } = await supabase.rpc('checkin', {
        p_kode_qr : qrTerdeteksi.kode_qr,
        p_jumlah_l: jumlahL,
        p_jumlah_p: jumlahP,
        p_panitia : sesi.id,
        p_jalur   : 'BARAT',
        p_nonce   : nonce,
        p_balita  : jumlahB
      });

      if (error) throw error;

      // Gagal (ditolak sistem)
      if (!data || !data.ok) {
        const pesan = {
          KUOTA_HABIS : '❌ Kuota habis. Sisa: ' + (data?.sisa ?? 0),
          KUOTA_HANGUS: '❌ Kuota sudah hangus',
          QR_INVALID  : '❌ QR tidak valid',
          JUMLAH_KOSONG: '❌ Jumlah tidak boleh 0'
        }[data?.reason] || ('❌ Gagal: ' + (data?.reason || 'unknown'));

        alert(pesan);
        btn.disabled = false;
        btn.textContent = '✓ Konfirmasi & Serahkan Tiket';
        return;
      }

      // Sukses
      const tiket = [];
      if (data.tiket_reguler > 0) tiket.push(data.tiket_reguler + ' × REGULER');
      if (data.tiket_panggung)    tiket.push('1 × EMAS (panggung) ⭐');

      alert(
        '✅ BERHASIL\n\n' +
        'Nama : ' + (data.nama_santri || '-') + '\n' +
        'Kelas: ' + (data.kelas || '-') + '\n\n' +
        'SERAHKAN TIKET:\n' + tiket.join('\n') + '\n\n' +
        'Sisa kuota: ' + data.sisa
      );

      lanjutScan();

    } catch (err) {
      console.error(err);
      alert('Gagal: ' + (err.message || err.toString()));
      btn.disabled = false;
      btn.textContent = '✓ Konfirmasi & Serahkan Tiket';
    }
  });

// Tombol batal
document.getElementById('btnBatalScan')
  .addEventListener('click', lanjutScan);

function lanjutScan() {
  qrTerdeteksi = null;
  jumlahL = 0; jumlahP = 0; jumlahB = 0;
  updateCounterUI();

  document.getElementById('scanHasil').hidden = true;
  document.getElementById('scanPesan').hidden = true;

  if (qrScanner && scannerRunning) {
    qrScanner.resume().catch(() => {});
  }
}

function tampilPesan(tipe, teks, onTutup) {
  const box = document.getElementById('scanPesan');
  box.className = 'scan-pesan ' + tipe;
  box.textContent = teks;
  box.hidden = false;

  if (onTutup) {
    box.onclick = () => {
      box.hidden = true;
      box.onclick = null;
      onTutup();
    };
  }
}

// ============================================================
// BAGIAN 2: TAB DATA (Daftar Santri)
// ============================================================
async function muatData() {
  const el = document.getElementById('daftarData');
  el.innerHTML = '<p class="muted">Memuat data...</p>';

  const { data, error } = await supabase
    .from('keluarga')
    .select(`
      id, kode, nama_wali, no_hp,
      santri (nama, kelas, sub_kategori)
    `)
    .eq('event_id', sesi.event_id)
    .order('kode')
    .limit(300);

  if (error) {
    console.error(error);
    el.innerHTML =
      '<p class="muted" style="color:var(--danger)">' +
      'Gagal memuat: ' + error.message +
      '</p>';
    return;
  }

  if (!data || data.length === 0) {
    el.innerHTML =
      '<p class="muted">Belum ada data. Klik <strong>+ Keluarga</strong> ' +
      'untuk menambah.</p>';
    return;
  }

  el.innerHTML = data.map(k => {
    const s = (k.santri && k.santri[0]) || {};
    return `
      <div class="data-item">
        <div class="data-kode">${escapeHtml(k.kode || '-')}</div>
        <div class="data-utama">${escapeHtml(s.nama || '—')}</div>
        <div class="data-sub">
          ${escapeHtml(k.nama_wali || '-')}
          ${k.no_hp ? ' · ' + escapeHtml(k.no_hp) : ''}
          ${s.kelas ? ' · ' + escapeHtml(s.kelas) : ''}
        </div>
      </div>
    `;
  }).join('');
}

// Pencarian realtime
document.getElementById('cariData')
  .addEventListener('input', (e) => {
    const q = (e.target.value || '').toLowerCase();
    document.querySelectorAll('#daftarData .data-item').forEach(item => {
      const cocok = item.textContent.toLowerCase().includes(q);
      item.style.display = cocok ? '' : 'none';
    });
  });

// ============================================================
// BAGIAN 3: MODAL TAMBAH KELUARGA
// ============================================================
const modalKeluarga = document.getElementById('modalKeluarga');

function bukaModal()  { modalKeluarga.classList.add('modal-open'); }
function tutupModal() { modalKeluarga.classList.remove('modal-open'); }

document.getElementById('btnTambahKeluarga')
  .addEventListener('click', bukaModal);

document.getElementById('btnModalBatal')
  .addEventListener('click', tutupModal);

// Tutup modal kalau klik background gelap
modalKeluarga.addEventListener('click', (e) => {
  if (e.target === modalKeluarga) tutupModal();
});

// Submit form
document.getElementById('formKeluarga')
  .addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn = document.getElementById('btnModalSimpan');
    btn.disabled = true;
    btn.textContent = 'Menyimpan...';

    try {
      const kode         = document.getElementById('fKode').value.trim().toUpperCase();
      const namaWali     = document.getElementById('fNamaWali').value.trim();
      const hp           = document.getElementById('fHp').value.trim();
      const namaSantri   = document.getElementById('fNamaSantri').value.trim();
      const nis          = document.getElementById('fNis').value.trim();
      const kelas        = document.getElementById('fKelas').value.trim();
      const kategori     = document.getElementById('fKategori').value;
      const subKategori  = document.getElementById('fSubKategori').value.trim();

      // Panggil RPC tambah_keluarga
      const { data: kel, error: err1 } = await supabase.rpc(
        'tambah_keluarga',
        {
          p_event    : sesi.event_id,
          p_kode     : kode,
          p_nama_wali: namaWali,
          p_no_hp    : hp,
          p_alamat   : ''
        }
      );

      if (err1) throw err1;
      if (!kel || !kel.ok) {
        throw new Error('Gagal tambah keluarga: ' +
                        (kel?.reason || 'unknown'));
      }

      // Panggil RPC tambah_santri
      const { data: san, error: err2 } = await supabase.rpc(
        'tambah_santri',
        {
          p_event          : sesi.event_id,
          p_keluarga       : kel.id,
          p_nis            : nis,
          p_nama           : namaSantri,
          p_unit           : 'P3TQ',
          p_kelas          : kelas || subKategori,
          p_kategori_utama : kategori,
          p_sub_kategori   : subKategori
        }
      );

      if (err2) throw err2;
      if (!san || !san.ok) {
        throw new Error('Gagal tambah santri: ' +
                        (san?.reason || 'unknown'));
      }

      alert('✅ Berhasil ditambahkan\n\n' +
            'Kode: ' + kode + '\n' +
            'Santri: ' + namaSantri);

      document.getElementById('formKeluarga').reset();
      tutupModal();
      muatData();

    } catch (err) {
      console.error(err);
      alert('❌ Gagal:\n' + (err.message || err.toString()));
    } finally {
      btn.disabled = false;
      btn.textContent = 'Simpan';
    }
  });

// ============================================================
// BAGIAN 4: TAB LAPORAN
// ============================================================
async function muatLaporan() {
  // 4.1 Statistik utama
  const { data: dash, error: errDash } = await supabase
    .from('v_dashboard_realtime')
    .select('*')
    .eq('event_id', sesi.event_id)
    .maybeSingle();

  if (!errDash && dash) {
    document.getElementById('statKuota').textContent = dash.total_kuota || 0;
    document.getElementById('statHadir').textContent = dash.total_hadir || 0;
    document.getElementById('statL').textContent     = dash.total_putra || 0;
    document.getElementById('statP').textContent     = dash.total_putri || 0;
  }

  // 4.2 Rekap per kategori
  const rekapEl = document.getElementById('rekapKategori');
  const { data: rekap, error: errRekap } = await supabase
    .from('v_rekap_sohibul_hajat')
    .select('*')
    .order('no');

  if (errRekap) {
    console.error(errRekap);
    rekapEl.innerHTML =
      '<p class="muted" style="color:var(--danger)">' +
      'Gagal memuat rekap: ' + errRekap.message +
      '</p>';
    return;
  }

  if (!rekap || rekap.length === 0) {
    rekapEl.innerHTML = '<p class="muted">Belum ada data</p>';
    return;
  }

  rekapEl.innerHTML = rekap.map(r => `
    <div class="rekap-row">
      <span class="rekap-nama">${escapeHtml(r.kategori || '-')}</span>
      <span class="rekap-angka">
        ${r.total || 0} / ${r.total_kuota || 0}
        <small style="color:var(--gray-500);font-weight:400">
          (${r.prosentase || 0}%)
        </small>
      </span>
    </div>
  `).join('');
}

document.getElementById('btnMuatUlang')
  .addEventListener('click', muatLaporan);

// ============================================================
// UTILITAS
// ============================================================
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]);
}

// ============================================================
// INISIALISASI
// ============================================================
(async function init() {
  // Pastikan modal tertutup di awal (defensive)
  modalKeluarga.classList.remove('modal-open');

  // Pre-load data supaya tab langsung ada isinya
  muatData().catch(() => {});
  muatLaporan().catch(() => {});

  // Nyalakan scanner (default tab = scan)
  mulaiScanner();
})();
