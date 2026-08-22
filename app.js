// --- STATE MANAGEMENT ---
let dataSiswa = JSON.parse(localStorage.getItem('siswa_pro')) || [];
let dataAbsen = JSON.parse(localStorage.getItem('absensi_pro')) || {};
let videoStream = null;
let scanInterval = null;

// MASUKKAN URL GOOGLE APPS SCRIPT ANDA DI SINI
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby-GIPBRI-1jFjnc3SZ2B5ewD_i0oO-gPpY1pn6bdqzDhNu4gJd7g36x3NpSUX9pWLSIw/exec';

const beepSound = new Audio('data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU'+Array(100).join('123'));

const dateInput = document.getElementById('input-tanggal-absensi');
const selectSiswaManual = document.getElementById('manual-select-siswa');

// Tombol Toggle Tabel
const btnSudah = document.getElementById('show-sudah');
const btnBelum = document.getElementById('show-belum');
const wrapSudah = document.getElementById('attendance-table-wrap');
const wrapBelum = document.getElementById('belum-table-wrap');

// --- INISIALISASI ---
// --- INISIALISASI ---
document.addEventListener('DOMContentLoaded', () => {
    dateInput.valueAsDate = new Date();
    updateUI();
    
    // --- FITUR BARU: AUTO-SINKRONISASI DARI CLOUD ---
    if (GOOGLE_SCRIPT_URL) {
        showToast('Memuat data dari Cloud...', 'success');
        fetch(GOOGLE_SCRIPT_URL)
            .then(response => response.json())
            .then(dataCloud => {
                if(dataCloud && dataCloud.length > 0) {
                    dataSiswa = dataCloud; // Timpa data lokal dengan data Cloud
                    simpanData();
                    updateUI();
                    showToast('Data berhasil disinkronisasi!', 'success');
                }
            })
            .catch(error => {
                showToast('Mode Offline: Menggunakan data lokal.', 'warning');
            });
    }
});

// --- MANAJEMEN DATA SISWA ---
document.getElementById('btn-tambah-siswa').addEventListener('click', () => {
    const nis = document.getElementById('input-nis').value.trim();
    const nama = document.getElementById('input-nama').value.trim();
    const kelas = document.getElementById('input-kelas').value.trim();

    if (!nis || !nama || !kelas) return showToast('Harap isi NIS, Nama, dan Kelas!', 'danger');
    if (dataSiswa.some(s => s.nis === nis)) return showToast('NIS sudah terdaftar!', 'danger');

    dataSiswa.push({ nis, nama, kelas });
    simpanData();
    updateUI();
    
    document.getElementById('input-nis').value = '';
    document.getElementById('input-nama').value = '';
    document.getElementById('input-kelas').value = '';
    showToast('Siswa berhasil ditambahkan.', 'success');

    // --- FITUR BARU: KIRIM SISWA BARU KE CLOUD ---
    if (GOOGLE_SCRIPT_URL) {
        const formData = new URLSearchParams();
        formData.append('aksi', 'tambah_siswa');
        formData.append('nis', nis);
        formData.append('nama', nama);
        formData.append('kelas', kelas);
        
        fetch(GOOGLE_SCRIPT_URL, { method: 'POST', body: formData }).catch(e => console.log('Gagal backup ke cloud.'));
    }
});

function updateUI() {
    renderTableSiswa();
    renderKartu();
    renderAbsensi();
    updateSelectManual();
}

function simpanData() {
    localStorage.setItem('siswa_pro', JSON.stringify(dataSiswa));
    localStorage.setItem('absensi_pro', JSON.stringify(dataAbsen));
}

// --- NAVIGASI TAB ---
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab, .tab-panel').forEach(el => el.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
        if (tab.dataset.tab !== 'absensi') stopKamera();
    });
});

// --- TOGGLE TABEL ABSENSI ---
btnSudah.addEventListener('click', () => {
    btnSudah.classList.add('active'); btnBelum.classList.remove('active');
    wrapSudah.style.display = 'block'; wrapBelum.style.display = 'none';
});

btnBelum.addEventListener('click', () => {
    btnBelum.classList.add('active'); btnSudah.classList.remove('active');
    wrapSudah.style.display = 'none'; wrapBelum.style.display = 'block';
});

// --- MANAJEMEN DATA SISWA ---
document.getElementById('btn-tambah-siswa').addEventListener('click', () => {
    const nis = document.getElementById('input-nis').value.trim();
    const nama = document.getElementById('input-nama').value.trim();
    const kelas = document.getElementById('input-kelas').value.trim();

    if (!nis || !nama || !kelas) return showToast('Harap isi NIS, Nama, dan Kelas!', 'danger');
    if (dataSiswa.some(s => s.nis === nis)) return showToast('NIS sudah terdaftar!', 'danger');

    dataSiswa.push({ nis, nama, kelas });
    simpanData(); updateUI();
    
    document.getElementById('input-nis').value = '';
    document.getElementById('input-nama').value = '';
    document.getElementById('input-kelas').value = '';
    showToast('Siswa berhasil ditambahkan.', 'success');
});

function hapusSiswa(nis) {
    if (confirm('Hapus data siswa ini beserta riwayat absensinya?')) {
        dataSiswa = dataSiswa.filter(s => s.nis !== nis);
        simpanData(); updateUI();
    }
}

document.getElementById('btn-hapus-semua').addEventListener('click', () => {
    if (confirm('PERINGATAN: Yakin ingin menghapus SEMUA data siswa?')) {
        dataSiswa = []; simpanData(); updateUI();
    }
});

function renderTableSiswa() {
    const wrap = document.getElementById('siswa-table-wrap');
    if (dataSiswa.length === 0) {
        wrap.innerHTML = '<div class="empty-state"><i class="ph ph-users" style="font-size:40px; margin-bottom:10px;"></i><br>Belum ada data siswa.</div>'; return;
    }

    let html = `<table><tr><th>NIS</th><th>Nama Lengkap</th><th>Kelas</th><th style="width:80px;">Aksi</th></tr>`;
    dataSiswa.forEach(s => {
        html += `<tr><td><strong>${s.nis}</strong></td><td>${s.nama}</td><td>${s.kelas}</td>
        <td><button class="btn danger" style="padding: 6px 12px;" onclick="hapusSiswa('${s.nis}')"><i class="ph ph-trash"></i></button></td></tr>`;
    });
    wrap.innerHTML = html + '</table>';
}

function updateSelectManual() {
    selectSiswaManual.innerHTML = '<option value="">Pilih Siswa...</option>';
    const sortedSiswa = [...dataSiswa].sort((a, b) => a.nama.localeCompare(b.nama));
    sortedSiswa.forEach(s => { selectSiswaManual.innerHTML += `<option value="${s.nis}">${s.nama} (${s.kelas})</option>`; });
}

// --- IMPOR CSV ---
document.getElementById('btn-import-csv').addEventListener('click', () => document.getElementById('file-import').click());
document.getElementById('file-import').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        const lines = event.target.result.split('\n');
        let count = 0;
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',');
            if (cols.length >= 3) {
                const nis = cols[0].trim(); const nama = cols[1].trim(); const kelas = cols[2].trim();
                if (nis && !dataSiswa.some(s => s.nis === nis)) { dataSiswa.push({ nis, nama, kelas }); count++; }
            }
        }
        simpanData(); updateUI();
        showToast(`Berhasil mengimpor ${count} siswa baru.`, 'success');
        e.target.value = '';
    };
    reader.readAsText(file);
});

// --- KARTU QR ---
function renderKartu() {
    const wrap = document.getElementById('cards-grid-wrap'); wrap.innerHTML = '';
    if (dataSiswa.length === 0) { wrap.innerHTML = '<div class="empty-state">Tambahkan data siswa untuk melihat kartu.</div>'; return; }
    
    dataSiswa.forEach(s => {
        const card = document.createElement('div'); card.className = 'qr-card';
        card.innerHTML = `<div class="qr-code" id="qr-${s.nis}"></div><h3>${s.nama}</h3><p>${s.kelas} &bull; ${s.nis}</p>`;
        wrap.appendChild(card);
        new QRCode(document.getElementById(`qr-${s.nis}`), { text: s.nis, width: 140, height: 140, colorDark: "#0f172a" });
    });
}
document.getElementById('btn-print-kartu').addEventListener('click', () => window.print());

// --- ABSENSI & SCANNER ---
const video = document.getElementById('scanner-video');
const canvasElement = document.getElementById('scan-canvas');
const canvas = canvasElement.getContext('2d');

document.getElementById('btn-start-scan').addEventListener('click', mulaiKamera);
document.getElementById('btn-stop-scan').addEventListener('click', stopKamera);

function mulaiKamera() {
    document.getElementById('scanner-placeholder').style.display = 'none';
    video.style.display = 'block';
    document.getElementById('btn-start-scan').disabled = true;
    document.getElementById('btn-stop-scan').disabled = false;

    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then(stream => {
        videoStream = stream; video.srcObject = stream;
        video.setAttribute("playsinline", true); video.play();
        scanInterval = requestAnimationFrame(tick);
    }).catch(err => {
        showToast('Kamera tidak diizinkan atau tidak ditemukan.', 'danger'); stopKamera();
    });
}

function stopKamera() {
    if (videoStream) { videoStream.getTracks().forEach(track => track.stop()); videoStream = null; }
    cancelAnimationFrame(scanInterval);
    video.style.display = 'none'; document.getElementById('scanner-placeholder').style.display = 'block';
    document.getElementById('btn-start-scan').disabled = false; document.getElementById('btn-stop-scan').disabled = true;
}

function tick() {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvasElement.height = video.videoHeight; canvasElement.width = video.videoWidth;
        canvas.drawImage(video, 0, 0, canvasElement.width, canvasElement.height);
        const imageData = canvas.getImageData(0, 0, canvasElement.width, canvasElement.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
        
        if (code) { catatAbsen(code.data, 'Hadir'); setTimeout(() => { requestAnimationFrame(tick); }, 2000); return; }
    }
    scanInterval = requestAnimationFrame(tick);
}

document.getElementById('btn-manual-simpan').addEventListener('click', () => {
    const nis = selectSiswaManual.value;
    const status = document.getElementById('manual-select-status').value;
    if (!nis) return showToast('Pilih siswa terlebih dahulu!', 'danger');
    catatAbsen(nis, status, true);
});

function catatAbsen(nis, status, isManual = false) {
    const siswa = dataSiswa.find(s => s.nis === nis);
    if (!siswa) return isManual ? null : showToast('QR Code tidak dikenali!', 'danger');

    const tgl = dateInput.value;
    const waktuSekarang = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    
    if (!dataAbsen[tgl]) dataAbsen[tgl] = [];
    
    dataAbsen[tgl] = dataAbsen[tgl].filter(a => a.nis !== nis);
    dataAbsen[tgl].push({ 
        nis: siswa.nis, nama: siswa.nama, kelas: siswa.kelas, 
        waktu: waktuSekarang,
        status: status 
    });
    
    simpanData();
    if (!isManual) beepSound.play().catch(e => {});
    showToast(`${siswa.nama} ditandai: ${status}`, 'success');
    
    renderAbsensi();
    selectSiswaManual.value = '';

    // --- FITUR BARU: KIRIM KE GOOGLE SPREADSHEET (BACKGROUND) ---
    if (GOOGLE_SCRIPT_URL) {
        const formData = new URLSearchParams();
        formData.append('aksi', 'absen');
        formData.append('tanggal', tgl);
        formData.append('waktu', waktuSekarang);
        formData.append('nis', siswa.nis);
        formData.append('nama', siswa.nama);
        formData.append('kelas', siswa.kelas);
        formData.append('status', status);

        // Kirim data tanpa mengganggu kecepatan web
        fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            body: formData
        }).then(response => console.log('Data terkirim ke Google Sheets'))
          .catch(error => console.error('Koneksi internet bermasalah, gagal kirim ke Sheet'));
    }
}

dateInput.addEventListener('change', renderAbsensi);

function renderAbsensi() {
    const tgl = dateInput.value; const absenHariIni = dataAbsen[tgl] || []; const totalSiswa = dataSiswa.length;

    let htmlSudah = `<table><tr><th>Waktu</th><th>Nama</th><th>Kelas</th><th>Status</th></tr>`;
    let hadir = 0, sakitIzin = 0;
    
    [...absenHariIni].reverse().forEach(a => {
        if(a.status === 'Hadir') hadir++; if(a.status === 'Sakit' || a.status === 'Izin') sakitIzin++;
        htmlSudah += `<tr><td>${a.waktu}</td><td><strong>${a.nama}</strong></td><td>${a.kelas}</td><td><span class="badge ${a.status}">${a.status}</span></td></tr>`;
    });
    wrapSudah.innerHTML = absenHariIni.length === 0 ? '<div class="empty-state">Belum ada absensi hari ini.</div>' : htmlSudah + '</table>';

    const sudahAbsenNIS = absenHariIni.map(a => a.nis);
    const siswaBelumAbsen = dataSiswa.filter(s => !sudahAbsenNIS.includes(s.nis));
    
    let htmlBelum = `<table><tr><th>NIS</th><th>Nama Lengkap</th><th>Kelas</th></tr>`;
    siswaBelumAbsen.forEach(s => { htmlBelum += `<tr><td>${s.nis}</td><td><strong>${s.nama}</strong></td><td>${s.kelas}</td></tr>`; });
    wrapBelum.innerHTML = siswaBelumAbsen.length === 0 ? '<div class="empty-state">Semua siswa sudah diabsen.</div>' : htmlBelum + '</table>';

    const absenDanAlpa = totalSiswa - hadir - sakitIzin;
    const cards = document.querySelectorAll('.stat-card h3');
    cards[0].textContent = totalSiswa; cards[1].textContent = hadir; cards[2].textContent = sakitIzin; cards[3].textContent = absenDanAlpa;
    document.getElementById('count-sudah').textContent = absenHariIni.length; document.getElementById('count-belum').textContent = siswaBelumAbsen.length;
}

// --- EKSPOR KE EXCEL (FORMAT RAPI DENGAN GARIS & WARNA) ---
document.getElementById('btn-export-csv').addEventListener('click', () => {
    if (dataSiswa.length === 0) return showToast('Belum ada data siswa untuk diekspor.', 'danger');

    const selectedDate = new Date(dateInput.value);
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const namaBulan = selectedDate.toLocaleString('id-ID', { month: 'long' });

    // 1. Membangun Struktur HTML untuk dibaca sebagai Excel
    let htmlContent = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
            <meta charset="utf-8">
            <style>
                table { border-collapse: collapse; font-family: Arial, sans-serif; }
                th, td { border: 1px solid #000000; padding: 6px 8px; white-space: nowrap; }
                th { background-color: #e2e8f0; font-weight: bold; text-align: center; vertical-align: middle; }
                .center { text-align: center; }
                .left { text-align: left; }
                .bg-hadir { background-color: #d1fae5; } /* Hijau muda */
                .bg-izin { background-color: #fef3c7; } /* Kuning muda */
                .bg-alpa { background-color: #fee2e2; } /* Merah muda */
            </style>
        </head>
        <body>
            <table>
                <tr>
                    <th colspan="${daysInMonth + 8}" style="font-size: 18px; padding: 15px; background-color: #ffffff; border: none; text-align: left;">
                        Rekapitulasi Kehadiran Siswa - Bulan ${namaBulan} ${year}
                    </th>
                </tr>
                <tr>
                    <th rowspan="2">No</th>
                    <th rowspan="2">NIS</th>
                    <th rowspan="2">Nama Lengkap</th>
                    <th rowspan="2">Kelas</th>
                    <th colspan="${daysInMonth}">Tanggal</th>
                    <th colspan="4">Total Kehadiran</th>
                </tr>
                <tr>
    `;

    // Header Tanggal
    for (let i = 1; i <= daysInMonth; i++) {
        htmlContent += `<th>${i}</th>`;
    }
    
    htmlContent += `
                    <th>H</th>
                    <th>S</th>
                    <th>I</th>
                    <th>A</th>
                </tr>
    `;

    // 2. Isi Data per Siswa
    const sortedSiswa = [...dataSiswa].sort((a, b) => a.nama.localeCompare(b.nama));
    
    sortedSiswa.forEach((siswa, index) => {
        htmlContent += `<tr>
            <td class="center">${index + 1}</td>
            <td class="center" style="mso-number-format:'\\@';">${siswa.nis}</td>
            <td class="left">${siswa.nama}</td>
            <td class="center">${siswa.kelas}</td>`;
            
        let total = { H: 0, S: 0, I: 0, A: 0 };

        for (let d = 1; d <= daysInMonth; d++) {
            const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const absenHariIni = dataAbsen[dateKey] || [];
            const record = absenHariIni.find(a => a.nis === siswa.nis);
            
            let mark = '';
            let colorClass = '';

            if (record) {
                const s = record.status;
                if (s === 'Hadir') { mark = 'H'; total.H++; colorClass = 'bg-hadir'; }
                else if (s === 'Sakit') { mark = 'S'; total.S++; colorClass = 'bg-izin'; }
                else if (s === 'Izin') { mark = 'I'; total.I++; colorClass = 'bg-izin'; }
                else if (s === 'Alpa') { mark = 'A'; total.A++; colorClass = 'bg-alpa'; }
            }
            
            htmlContent += `<td class="center ${colorClass}">${mark}</td>`;
        }
        
        // Rekap Akhir Baris
        htmlContent += `
            <td class="center bg-hadir" style="font-weight:bold;">${total.H}</td>
            <td class="center bg-izin" style="font-weight:bold;">${total.S}</td>
            <td class="center bg-izin" style="font-weight:bold;">${total.I}</td>
            <td class="center bg-alpa" style="font-weight:bold;">${total.A}</td>
        </tr>`;
    });

    htmlContent += `
            </table>
        </body>
        </html>
    `;

    // 3. Ekspor Menjadi File .xls (Excel Document)
    const blob = new Blob([htmlContent], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Rekap_Absensi_${namaBulan}_${year}.xls`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

// --- TOAST UTILS ---
function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    const icon = type === 'success' ? '<i class="ph ph-check-circle"></i>' : '<i class="ph ph-warning"></i>';
    toast.innerHTML = `${icon} ${msg}`;
    toast.className = `show ${type}`;
    setTimeout(() => toast.className = '', 3500);
}