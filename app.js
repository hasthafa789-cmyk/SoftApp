// ==========================================
// REGISTRASI PWA (SERVICE WORKER & INSTALL)
// ==========================================
let deferredPrompt;
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then((reg) => console.log('Service Worker Terdaftar!', reg.scope))
            .catch((err) => console.log('Service Worker Gagal:', err));
    });
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installBtn = document.getElementById('btn-install-pwa');
    if (installBtn) {
        installBtn.style.display = 'flex'; // Munculkan tombol
        installBtn.addEventListener('click', async () => {
            installBtn.style.display = 'none';
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`User memilih: ${outcome}`);
            deferredPrompt = null;
        });
    }
});

// ==========================================
// STATE MANAGEMENT & GLOBAL VARIABLES
// ==========================================
// ==========================================
// STATE MANAGEMENT & GLOBAL VARIABLES
// ==========================================
// Hapus memori lama yang membandel di HP Anda
localStorage.removeItem('siswa_pro');
localStorage.removeItem('absensi_pro');

// Jadikan variabel kosong saat awal buka (menunggu data dari Cloud)
let dataSiswa = [];
let dataAbsen = {};
let videoStream = null;
let scanInterval = null;
let editModeNIS = null;

let currentPage = 1;
const itemsPerPage = 10;
let searchTimeout;
let myChart = null; 
let sortCol = 'nama'; let sortAsc = true; 
const filterKelasInput = document.getElementById('filter-kelas');
let availableCameras = [];

// ==========================================
// SISTEM LOGIN & MULTI-ROLE
// ==========================================
let currentRole = null;
// Variabel High-Speed Scanner
let lastScannedNIS = '';
let lastScanTime = 0;

// Fungsi Sapaan Berdasarkan Waktu
function dapatkanSapaan() {
    const jam = new Date().getHours();
    if (jam >= 4 && jam < 11) return "Selamat Pagi";
    if (jam >= 11 && jam < 15) return "Selamat Siang";
    if (jam >= 15 && jam < 18) return "Selamat Sore";
    return "Selamat Malam";
}

document.getElementById('btn-login')?.addEventListener('click', () => {
    const pin = document.getElementById('login-pin').value;
    const loginScreen = document.getElementById('login-screen');
    const sapaan = dapatkanSapaan(); // Memanggil sapaan waktu
    
    if (pin === '0895') {
        currentRole = 'admin';
        loginScreen.style.opacity = '0';
        setTimeout(() => loginScreen.style.display = 'none', 500);
        showToast(`${sapaan}, Admin!`, 'success');
    } 
    else if (pin === '0000') {
        currentRole = 'guru';
        loginScreen.style.opacity = '0';
        setTimeout(() => loginScreen.style.display = 'none', 500);
        
        document.querySelector('[data-tab="siswa"]').style.display = 'none';
        document.querySelector('[data-tab="kartu"]').style.display = 'none';
        
        document.querySelector('[data-tab="absensi"]').click();
        showToast(`${sapaan}, Guru!`, 'info');
    } 
    else {
        playBeep(true);
        showToast('PIN Akses Salah!', 'error');
    }
});

// MASUKKAN URL GOOGLE APPS SCRIPT ANDA DI SINI
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyVMH1AfG0xRxeityWaCFI_bzxwIJ0vejP_F8-KuGWPDJfV9vuZIoR-uQ1D9q-ryQ8Ieg/exec';

// ==========================================
// SWEETALERT2 & UTILS PENDUKUNG
// ==========================================
const Toast = Swal.mixin({
    toast: true, position: 'top-end', showConfirmButton: false, timer: 3000,
    timerProgressBar: true, didOpen: (toast) => {
        toast.addEventListener('mouseenter', Swal.stopTimer); toast.addEventListener('mouseleave', Swal.resumeTimer);
    }
});
function showToast(title, icon = 'success') { Toast.fire({ icon, title }); }

function promptPIN(callback) {
    Swal.fire({
        title: 'Otorisasi Diperlukan', input: 'password', inputLabel: 'Masukkan PIN Admin', inputPlaceholder: '****',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' }, showCancelButton: true, confirmButtonText: 'Verifikasi',
        confirmButtonColor: '#171717', cancelButtonText: 'Batal',
        preConfirm: (pin) => { if (!pin) Swal.showValidationMessage('PIN tidak boleh kosong!'); return pin; }
    }).then((result) => { if (result.isConfirmed) callback(result.value); });
}

function playBeep(isError = false) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = isError ? 'sawtooth' : 'sine'; osc.frequency.setValueAtTime(isError ? 300 : 800, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        osc.start(); osc.stop(ctx.currentTime + (isError ? 0.3 : 0.1));
    } catch(e) {} 
}

function setLoading(isLoading) { document.getElementById('loading-overlay')?.classList.toggle('active', isLoading); }

// ==========================================
// INISIALISASI & DETEKSI JARINGAN LANSUNG (LIVE)
// ==========================================
const dateInput = document.getElementById('input-tanggal-absensi');
const selectSiswaManual = document.getElementById('manual-select-siswa');
const searchInput = document.getElementById('search-siswa');
const btnTheme = document.getElementById('btn-theme-toggle');

// Deteksi Online/Offline
window.addEventListener('online',  () => setNetworkStatus(true));
window.addEventListener('offline', () => setNetworkStatus(false));

function setNetworkStatus(isOnline) {
    const banner = document.getElementById('network-status');
    if(!banner) return;
    if(isOnline) {
        banner.className = 'network-status online show'; banner.innerHTML = '<i class="ph ph-wifi-high"></i> Online - Sinkronisasi Aktif';
        setTimeout(() => banner.classList.remove('show'), 3000);
        syncDataLokalDenganCloud(); // Otomatis sync saat internet kembali
    } else {
        banner.className = 'network-status offline show'; banner.innerHTML = '<i class="ph ph-wifi-slash"></i> Offline - Data Disimpan Lokal';
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    if (localStorage.getItem('theme') === 'dark') { document.body.classList.add('dark-theme'); btnTheme.innerHTML = '<i class="ph ph-sun" style="font-size: 20px;"></i>'; }
    try {
        const today = new Date();
        if (dateInput) dateInput.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        updateUI();
        if (GOOGLE_SCRIPT_URL) syncDataLokalDenganCloud();
        
        // Memuat daftar kamera
        await initCameras();
    } catch (e) { console.error("Init Error: ", e); }
});

btnTheme?.addEventListener('click', () => {
    document.body.classList.toggle('dark-theme'); const isDark = document.body.classList.contains('dark-theme');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    btnTheme.innerHTML = isDark ? '<i class="ph ph-sun" style="font-size: 20px;"></i>' : '<i class="ph ph-moon" style="font-size: 20px;"></i>';
    renderTrendChart(); 
});

async function fetchToCloud(formData) {
    if (!navigator.onLine) return { success: false, message: "Offline_Mode" }; // Jangan paksa nge-fetch jika jelas offline
    if (!GOOGLE_SCRIPT_URL) return { success: false, message: "URL tidak disetel." };
    try {
        setLoading(true);
        const response = await fetch(GOOGLE_SCRIPT_URL, { method: 'POST', body: formData });
        const textResult = await response.text(); 
        setLoading(false);
        try { return JSON.parse(textResult); } catch (e) { return { success: true, message: textResult }; }
    } catch (error) { setLoading(false); return { success: false, message: "Offline_Mode" }; }
}

async function syncDataLokalDenganCloud() {
    if(!navigator.onLine) {
        showToast("Anda Sedang Offline! Gagal memuat data.", "error");
        return;
    }
    setLoading(true);
    try {
        const response = await fetch(GOOGLE_SCRIPT_URL);
        const textData = await response.text();
        let dataCloud;
        try { dataCloud = JSON.parse(textData); } catch (e) { throw new Error("Respons bukan JSON"); }
        
        if (dataCloud) {
            // KUNCI: Menimpa data secara mutlak. Jika di spreadsheet dihapus, web akan ikut terhapus!
            dataSiswa = dataCloud.siswa || [];
            dataAbsen = dataCloud.absensi || {};
            updateUI();
        }
    } catch (error) { 
        console.log('Gagal menarik data dari server'); 
        showToast('Koneksi ke Spreadsheet Gagal', 'error');
    }
    finally { setLoading(false); }
}

function simpanData() { 
    // FUNGSI INI SENGAJA DIKOSONGKAN
    // Kita tidak lagi menggunakan memori lokal HP (Local Storage)
}

function updateUI() { 
    updateDropdownKelas();
    if (searchInput) renderTableSiswa(searchInput.value); 
    renderKartu(); 
    renderAbsensi(); 
    updateSelectManual(); 
    cekKalenderPintar();
    renderAnalitik(); // <--- BARIS INI PENTING DITAMBAHKAN
}

function updateDropdownKelas() {
    if (!filterKelasInput) return;

    // Ambil kelas yang sedang dipilih saat ini (agar tidak reset saat tabel merender ulang)
    const selectedValue = filterKelasInput.value;

    // Ambil semua daftar kelas unik dari data siswa
    const daftarKelasUnik = [...new Set(dataSiswa.map(s => s.kelas))].sort();

    // Render ulang opsi dropdown
    let htmlOptions = '<option value="">Semua Kelas</option>';
    daftarKelasUnik.forEach(kelas => {
        htmlOptions += `<option value="${kelas}">${kelas}</option>`;
    });

    filterKelasInput.innerHTML = htmlOptions;

    // Kembalikan nilai yang dipilih sebelumnya (jika masih ada)
    if (daftarKelasUnik.includes(selectedValue)) {
        filterKelasInput.value = selectedValue;
    }
}

// ==========================================
// FITUR 1: MANAJEMEN SISWA & SORTING
// ==========================================
document.getElementById('btn-tambah-siswa')?.addEventListener('click', async () => {
    const nis = document.getElementById('input-nis')?.value.trim(); const nama = document.getElementById('input-nama')?.value.trim(); const kelas = document.getElementById('input-kelas')?.value.trim();
    if (!nis || !nama || !kelas) return showToast('Lengkapi seluruh data!', 'warning');
    let formData = new URLSearchParams({ nis, nama, kelas });

    if (editModeNIS) { 
        formData.append('aksi', 'edit_siswa'); formData.append('nis_lama', editModeNIS);
        promptPIN(async (pin) => {
            formData.append('pin', pin); const res = await fetchToCloud(formData);
            if (res.success || res.message.includes("Berhasil")) {
                const index = dataSiswa.findIndex(s => s.nis === editModeNIS);
                if (index !== -1) { dataSiswa[index] = { nis, nama, kelas }; simpanData(); updateUI(); batalEdit(); showToast('Data diedit!', 'success'); }
            } else { showToast(res.message, 'error'); }
        });
    } else { 
        if (dataSiswa.some(s => s.nis === nis)) return showToast('NIS sudah ada!', 'error');
        formData.append('aksi', 'tambah_siswa');
        const res = await fetchToCloud(formData);
        if(res.success || res.message === "Offline_Mode") { 
            dataSiswa.push({ nis, nama, kelas }); showToast(res.success ? 'Siswa ditambahkan.' : 'Disimpan Lokal.', res.success ? 'success' : 'info');
            document.getElementById('input-nis').value = ''; document.getElementById('input-nama').value = ''; document.getElementById('input-kelas').value = '';
            simpanData(); updateUI();
        } else { showToast(res.message, 'error'); }
    }
});

window.editSiswa = function(nis) {
    const siswa = dataSiswa.find(s => s.nis === nis); if (!siswa) return;
    document.getElementById('input-nis').value = siswa.nis; document.getElementById('input-nama').value = siswa.nama; document.getElementById('input-kelas').value = siswa.kelas;
    editModeNIS = nis; const btnSimpan = document.getElementById('btn-tambah-siswa');
    if (btnSimpan) { btnSimpan.innerHTML = '<i class="ph ph-floppy-disk"></i> Update Data'; btnSimpan.classList.add('warning'); }
    document.getElementById('btn-batal-edit').style.display = 'flex';
}

function batalEdit() {
    editModeNIS = null; document.getElementById('input-nis').value = ''; document.getElementById('input-nama').value = ''; document.getElementById('input-kelas').value = '';
    const btnSimpan = document.getElementById('btn-tambah-siswa');
    if (btnSimpan) { btnSimpan.innerHTML = '<i class="ph ph-plus"></i> Simpan'; btnSimpan.classList.remove('warning'); }
    document.getElementById('btn-batal-edit').style.display = 'none';
}
document.getElementById('btn-batal-edit')?.addEventListener('click', batalEdit);

window.hapusSiswa = function(nis) {
    Swal.fire({ title: 'Yakin Hapus?', text: "Data tidak bisa dikembalikan!", icon: 'warning', showCancelButton: true, confirmButtonColor: '#171717', cancelButtonColor: '#737373', confirmButtonText: 'Ya, Hapus!'
    }).then((result) => {
        if (result.isConfirmed) {
            promptPIN(async (pin) => {
                let formData = new URLSearchParams({ aksi: 'hapus_siswa', nis, pin });
                const res = await fetchToCloud(formData);
                if (res.success || res.message.includes("Berhasil")) {
                    dataSiswa = dataSiswa.filter(s => s.nis !== nis); simpanData(); updateUI(); showToast('Siswa dihapus.', 'success');
                } else { showToast(res.message, 'error'); }
            });
        }
    })
}

document.getElementById('btn-hapus-semua')?.addEventListener('click', () => {
    Swal.fire({ title: 'Hapus SEMUA Data?', text: "Sistem akan di-reset total!", icon: 'error', showCancelButton: true, confirmButtonColor: '#171717', cancelButtonColor: '#737373', confirmButtonText: 'RESET SISTEM'
    }).then((result) => {
        if (result.isConfirmed) {
            promptPIN(async (pin) => {
                let formData = new URLSearchParams({ aksi: 'hapus_semua', pin });
                const res = await fetchToCloud(formData);
                if (res.success || res.message.includes("Dihapus")) {
                    dataSiswa = []; simpanData(); updateUI(); showToast('Sistem di-reset.', 'success');
                } else { showToast(res.message, 'error'); }
            });
        }
    })
});

searchInput?.addEventListener('input', (e) => { clearTimeout(searchTimeout); searchTimeout = setTimeout(() => { currentPage = 1; renderTableSiswa(e.target.value); }, 300); });
window.handleSort = function(column) { if (sortCol === column) sortAsc = !sortAsc; else { sortCol = column; sortAsc = true; } renderTableSiswa(searchInput?.value || ''); }

filterKelasInput?.addEventListener('change', () => { 
    currentPage = 1; // Kembali ke halaman 1 saat filter diganti
    renderTableSiswa(searchInput?.value || ''); 
});

function renderTableSiswa(filter = '') {
    const wrap = document.getElementById('siswa-table-wrap'); const pageControls = document.getElementById('pagination-controls');
    if (!wrap) return;
    if (dataSiswa.length === 0) { wrap.innerHTML = '<div class="empty-state"><i class="ph ph-users" style="font-size:40px;"></i><br>Belum ada data.</div>'; if (pageControls) pageControls.innerHTML = ''; return; }

    // (Ganti bagian let filteredSiswa lama dengan yang ini)
const keyword = filter.toLowerCase();
const filterKelasValue = filterKelasInput?.value || '';

// Filter GANDA: Berdasarkan Nama/NIS (Pencarian) DAN Berdasarkan Kelas (Dropdown)
let filteredSiswa = dataSiswa.filter(s => {
    const cocokKataKunci = s.nama.toLowerCase().includes(keyword) || s.nis.toLowerCase().includes(keyword);
    const cocokKelas = filterKelasValue === '' ? true : (s.kelas === filterKelasValue);
    return cocokKataKunci && cocokKelas;
});

    filteredSiswa.sort((a, b) => {
        let valA = a[sortCol].toLowerCase(); let valB = b[sortCol].toLowerCase();
        if(!isNaN(valA) && !isNaN(valB)) { valA = Number(valA); valB = Number(valB); } 
        if (valA < valB) return sortAsc ? -1 : 1; if (valA > valB) return sortAsc ? 1 : -1; return 0;
    });

    if (filteredSiswa.length === 0) { wrap.innerHTML = '<div class="empty-state">Siswa tidak ditemukan.</div>'; if (pageControls) pageControls.innerHTML = ''; return; }

    const totalPages = Math.ceil(filteredSiswa.length / itemsPerPage); const startIdx = (currentPage - 1) * itemsPerPage;
    const paginatedData = filteredSiswa.slice(startIdx, startIdx + itemsPerPage);

    const getIcon = (col) => sortCol === col ? (sortAsc ? ' <i class="ph ph-caret-up"></i>' : ' <i class="ph ph-caret-down"></i>') : ' <i class="ph ph-caret-up-down" style="opacity:0.3"></i>';
    let html = `<table><tr>
        <th class="sortable" onclick="handleSort('nis')">NIS${getIcon('nis')}</th>
        <th class="sortable" onclick="handleSort('nama')">Nama Lengkap${getIcon('nama')}</th>
        <th class="sortable" onclick="handleSort('kelas')">Kelas${getIcon('kelas')}</th>
        <th style="width:120px;">Aksi</th></tr>`;
        
    paginatedData.forEach(s => {
        html += `<tr><td><strong>${s.nis}</strong></td><td>${s.nama}</td><td>${s.kelas}</td>
        <td><div style="display:flex; gap:8px;">
            <button class="btn warning" style="padding:6px 10px;" onclick="editSiswa('${s.nis}')" title="Edit"><i class="ph ph-pencil-simple"></i></button>
            <button class="btn danger" style="padding:6px 10px;" onclick="hapusSiswa('${s.nis}')" title="Hapus"><i class="ph ph-trash"></i></button>
        </div></td></tr>`;
    });
    wrap.innerHTML = html + '</table>';

    let pageHtml = '';
    for(let p=1; p<=totalPages; p++) { pageHtml += `<button class="btn ${p === currentPage ? '' : 'secondary'}" style="padding: 5px 12px; font-size: 13px;" onclick="goToPage(${p})">${p}</button>`; }
    if (pageControls) pageControls.innerHTML = pageHtml;
}
window.goToPage = function(pageNumber) { currentPage = pageNumber; if (searchInput) renderTableSiswa(searchInput.value); };

// ==========================================
// FITUR 2: MULTI-CAMERA & FULLSCREEN KIOSK
// ==========================================
const video = document.getElementById('scanner-video'); const canvasElement = document.getElementById('scan-canvas');
const canvas = canvasElement ? canvasElement.getContext('2d', { willReadFrequently: true }) : null;
const cameraSelect = document.getElementById('camera-select');
const btnFullscreen = document.getElementById('btn-fullscreen');

// Mendapatkan daftar kamera TANPA menyalakan kamera secara otomatis
async function initCameras() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        cameraSelect.innerHTML = '<option value="">Kamera tidak didukung</option>'; return;
    }
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        availableCameras = devices.filter(device => device.kind === 'videoinput');
        
        cameraSelect.innerHTML = '';
        if (availableCameras.length === 0) { cameraSelect.innerHTML = '<option value="">Kamera tidak ditemukan</option>'; return; }
        
        availableCameras.forEach((cam, index) => {
            const option = document.createElement('option');
            option.value = cam.deviceId;
            
            let labelName = cam.label || `Kamera ${index + 1}`;
            if(labelName.toLowerCase().includes('back') || labelName.toLowerCase().includes('environment')) labelName += " (Belakang)";
            
            option.text = labelName;
            cameraSelect.appendChild(option);
        });
    } catch (e) { cameraSelect.innerHTML = '<option value="">Izin Kamera Ditolak</option>'; }
}

document.getElementById('btn-start-scan')?.addEventListener('click', mulaiKamera);
document.getElementById('btn-stop-scan')?.addEventListener('click', stopKamera);

function mulaiKamera() {
    if(!video) return; 
    
    const selectedDeviceId = cameraSelect.value;
    const constraints = { video: { facingMode: "environment" } };
    if (selectedDeviceId) constraints.video = { deviceId: { exact: selectedDeviceId } };

    document.getElementById('scanner-placeholder').style.display = 'none'; video.style.display = 'block'; 
    document.getElementById('btn-start-scan').disabled = true; document.getElementById('btn-stop-scan').disabled = false;
    btnFullscreen.style.display = 'block';

    navigator.mediaDevices.getUserMedia(constraints).then(stream => {
        videoStream = stream; video.srcObject = stream; video.setAttribute("playsinline", true); video.play(); 
        scanInterval = requestAnimationFrame(tick);
        
        initCameras();
    }).catch(err => { showToast('Kamera gagal diakses atau belum diberi izin.', 'error'); stopKamera(); });
}


function stopKamera() {
    if (videoStream) { videoStream.getTracks().forEach(track => track.stop()); videoStream = null; }
    cancelAnimationFrame(scanInterval); if(video) video.style.display = 'none'; 
    const p = document.getElementById('scanner-placeholder'); if(p) p.style.display = 'block';
    const btnStart = document.getElementById('btn-start-scan'); if(btnStart) btnStart.disabled = false; 
    const btnStop = document.getElementById('btn-stop-scan'); if(btnStop) btnStop.disabled = true;
    
    btnFullscreen.style.display = 'none';
    keluarFullscreen(); // Keluar mode kiosk otomatis
}

// Logika Fullscreen Kiosk Mode
btnFullscreen?.addEventListener('click', () => {
    const box = document.getElementById('scanner-box');
    if (box.classList.contains('fullscreen')) keluarFullscreen();
    else {
        box.classList.add('fullscreen');
        btnFullscreen.innerHTML = '<i class="ph ph-corners-in"></i>';
        if (box.requestFullscreen) box.requestFullscreen();
        else if (box.webkitRequestFullscreen) box.webkitRequestFullscreen();
    }
});

function keluarFullscreen() {
    const box = document.getElementById('scanner-box');
    box.classList.remove('fullscreen');
    btnFullscreen.innerHTML = '<i class="ph ph-corners-out"></i>';
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
}

function tick() {
    if (!videoStream || video.readyState !== video.HAVE_ENOUGH_DATA) {
        scanInterval = requestAnimationFrame(tick);
        return;
    }
    
    if (canvasElement) {
        canvasElement.height = video.videoHeight;
        canvasElement.width = video.videoWidth;
        canvas.drawImage(video, 0, 0, canvasElement.width, canvasElement.height);
        
        const imageData = canvas.getImageData(0, 0, canvasElement.width, canvasElement.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
        });

        if (code) {
            const nis = code.data;
            const now = Date.now();
            
            // HIGH-SPEED ALGORITHM
            if (nis === lastScannedNIS && (now - lastScanTime) < 3000) {
                // Abaikan jika QR yang sama ditahan di depan kamera (Anti-Spam 3 detik)
            } else {
                lastScannedNIS = nis;
                lastScanTime = now;
                catatAbsen(nis, 'Hadir'); 
            }
        }
    }
    scanInterval = requestAnimationFrame(tick);
}

document.getElementById('btn-manual-simpan')?.addEventListener('click', () => {
    const nis = selectSiswaManual?.value; const status = document.getElementById('manual-select-status')?.value;
    if (!nis) return showToast('Pilih siswa terlebih dahulu!', 'warning');
    catatAbsen(nis, status, true);
});

async function catatAbsen(nis, status, isManual = false) {
    const siswa = dataSiswa.find(s => s.nis === nis);
    if (!siswa) { if (!isManual) { playBeep(true); showToast('QR Code tidak dikenali!', 'error'); } return; }

    const tgl = dateInput?.value || new Date().toISOString().split('T')[0];
    if (!isManual && dataAbsen[tgl]) {
        const riwayat = dataAbsen[tgl].find(a => a.nis === nis);
        if (riwayat && (riwayat.status === 'Hadir' || riwayat.status === 'Terlambat')) { playBeep(true); showToast(`${siswa.nama} sudah absen!`, 'info'); return; }
    }

    // Gunakan format standar Internasional (HH:mm) agar valid di semua HP
    const waktuSekarang = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const batasJam = document.getElementById('input-batas-jam')?.value || '07:15';
    
    // KECERDASAN BUATAN: Auto-Deteksi Terlambat
    let finalStatus = status;
    if (status === 'Hadir' && waktuSekarang > batasJam) {
        finalStatus = 'Terlambat';
    }

    // KUNCI PERBAIKAN: Gunakan 'await' agar data masuk satu per satu (Antrean)
    let formData = new URLSearchParams({ aksi: 'absen', tanggal: tgl, waktu: waktuSekarang, nis: siswa.nis, nama: siswa.nama, kelas: siswa.kelas, status: finalStatus });
    await fetch(GOOGLE_SCRIPT_URL, { method: 'POST', body: formData }).catch(e => console.log('Sinkronisasi terputus'));

    if (!dataAbsen[tgl]) dataAbsen[tgl] = []; dataAbsen[tgl] = dataAbsen[tgl].filter(a => a.nis !== nis);
    dataAbsen[tgl].push({ nis: siswa.nis, nama: siswa.nama, kelas: siswa.kelas, waktu: waktuSekarang, status: finalStatus });
    
    renderAbsensi(); if(selectSiswaManual) selectSiswaManual.value = '';
    if (!isManual) { playBeep(false); showToast(`${siswa.nama} ditandai: ${finalStatus}`, finalStatus === 'Terlambat' ? 'warning' : 'success'); }
}

dateInput?.addEventListener('change', renderAbsensi);

function renderAbsensi() {
    if (!dateInput) return;
    const tgl = dateInput.value; const absenHariIni = dataAbsen[tgl] || []; const totalSiswa = dataSiswa.length;
    let hadir = 0, sakitIzin = 0;
    
    let htmlSudah = `<table><tr><th>Waktu</th><th>Nama</th><th>Kelas</th><th>Status</th></tr>`;
    [...absenHariIni].reverse().forEach(a => {
        if(a.status === 'Hadir') hadir++; if(a.status === 'Sakit' || a.status === 'Izin') sakitIzin++;
        htmlSudah += `<tr><td>${a.waktu}</td><td><strong>${a.nama}</strong></td><td>${a.kelas}</td><td><span class="badge ${a.status}">${a.status}</span></td></tr>`;
    });
    const wrapSudah = document.getElementById('attendance-table-wrap');
    if(wrapSudah) wrapSudah.innerHTML = absenHariIni.length === 0 ? '<div class="empty-state">Belum ada absensi hari ini.</div>' : htmlSudah + '</table>';

    const sudahAbsenNIS = absenHariIni.map(a => a.nis);
    const siswaBelumAbsen = dataSiswa.filter(s => !sudahAbsenNIS.includes(s.nis));
    
    // TABEL BELUM ABSEN (DENGAN FITUR BULK ACTION / AKSI MASSAL)
    let htmlBelum = `
    <div id="bulk-panel" style="display:none; padding:15px; background:var(--bg-card); border-radius:8px; border:1px solid var(--border); margin-bottom:15px; gap:10px; align-items:center; flex-wrap:wrap;">
        <span style="font-size:13px; font-weight:600;">Tandai Massal:</span>
        <button class="btn warning" style="padding:6px 12px; font-size:12px;" onclick="prosesBulk('Hadir')">Hadir</button>
        <button class="btn warning" style="padding:6px 12px; font-size:12px;" onclick="prosesBulk('Sakit')">Sakit</button>
        <button class="btn warning" style="padding:6px 12px; font-size:12px;" onclick="prosesBulk('Izin')">Izin</button>
        <button class="btn warning" style="padding:6px 12px; font-size:12px;" onclick="prosesBulk('Alpa')">Alpa</button>
    </div>
    <table><tr><th style="width:40px;"><input type="checkbox" id="check-all" onchange="toggleSemua(this)"></th><th>NIS</th><th>Nama Lengkap</th><th>Kelas</th></tr>`;
    
    siswaBelumAbsen.forEach(s => { 
        htmlBelum += `<tr>
            <td><input type="checkbox" class="check-siswa" value="${s.nis}" onchange="cekBulkAction()"></td>
            <td>${s.nis}</td><td><strong>${s.nama}</strong></td><td>${s.kelas}</td>
        </tr>`; 
    });
    
    const wrapBelum = document.getElementById('belum-table-wrap');
    if(wrapBelum) wrapBelum.innerHTML = siswaBelumAbsen.length === 0 ? '<div class="empty-state">Semua siswa sudah diabsen.</div>' : htmlBelum + '</table>';

    const absenDanAlpa = totalSiswa - hadir - sakitIzin;
    const cards = document.querySelectorAll('.stat-card h3');
    if(cards.length === 4) { 
        cards[0].textContent = totalSiswa; cards[1].textContent = (totalSiswa ? Math.round((hadir/totalSiswa)*100) : 0) + '%'; 
        cards[2].textContent = (totalSiswa ? Math.round((sakitIzin/totalSiswa)*100) : 0) + '%'; cards[3].textContent = (totalSiswa ? Math.round((absenDanAlpa/totalSiswa)*100) : 0) + '%'; 
    }
    const countSudah = document.getElementById('count-sudah'); if(countSudah) countSudah.textContent = absenHariIni.length; 
    const countBelum = document.getElementById('count-belum'); if(countBelum) countBelum.textContent = siswaBelumAbsen.length;
    renderTrendChart();
}

function cekKalenderPintar() {
    const tglInput = document.getElementById('input-tanggal-absensi').value;
    const tgl = tglInput ? new Date(tglInput) : new Date();
    const hari = tgl.getDay(); // 0 = Minggu, 6 = Sabtu
    const isLibur = (hari === 0 || hari === 6);

    const btnScan = document.getElementById('btn-start-scan');
    const ph = document.getElementById('scanner-placeholder');
    
    if (isLibur) {
        if(btnScan) btnScan.disabled = true;
        if(ph) ph.innerHTML = '<i class="ph ph-calendar-x" style="font-size: 40px; color: var(--danger); margin-bottom: 10px;"></i><br><span style="color:var(--danger); font-weight:bold;">Hari Libur!</span><br>Absensi Dinonaktifkan.';
    } else {
        if(btnScan) btnScan.disabled = false;
        if(ph) ph.innerHTML = '<i class="ph ph-camera-slash" style="font-size: 40px; margin-bottom: 10px;"></i><br>Kamera tidak aktif';
    }
}

function renderTrendChart() {
    const ctx = document.getElementById('attendanceChart');
    if(!ctx || typeof Chart === 'undefined') return;
    
    const isDark = document.body.classList.contains('dark-theme');
    const gridColor = isDark ? '#262626' : '#e5e5e5'; 
    const textColor = isDark ? '#a3a3a3' : '#737373';
    
    // Warna garis grafik menyesuaikan tema (Hitam di Terang, Putih di Gelap)
    const lineColor = isDark ? '#ffffff' : '#171717';
    const bgFill = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(23, 23, 23, 0.05)';

    let availableDates = Object.keys(dataAbsen).sort(); 
    let last7Dates = availableDates.slice(-7);
    if (last7Dates.length === 0 && dateInput) last7Dates = [dateInput.value];

    const labels = []; const dataHadir = [];
    last7Dates.forEach(tgl => {
        const d = new Date(tgl); labels.push(`${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`);
        const absenHarian = dataAbsen[tgl] || []; dataHadir.push(absenHarian.filter(a => a.status === 'Hadir').length);
    });
    
    if (myChart) { myChart.destroy(); } 
    myChart = new Chart(ctx.getContext('2d'), {
        type: 'line', 
        data: { 
            labels: labels, 
            datasets: [{ 
                label: 'Hadir', 
                data: dataHadir, 
                borderColor: lineColor, 
                backgroundColor: bgFill, 
                borderWidth: 3, 
                fill: true, 
                tension: 0.4, 
                pointBackgroundColor: lineColor, 
                pointRadius: 5 
            }] 
        },
        options: { 
            responsive: true, maintainAspectRatio: false, 
            plugins: { legend: { display: false } }, 
            scales: { 
                y: { beginAtZero: true, suggestedMax: dataSiswa.length || 10, ticks: { stepSize: 1, color: textColor }, grid: { color: gridColor } }, 
                x: { ticks: { color: textColor }, grid: { display: false } } 
            } 
        }
    });
}

document.getElementById('btn-export-pdf')?.addEventListener('click', () => {
    if (typeof window.jspdf === 'undefined') return showToast("Sistem PDF masih dimuat...", "warning");
    if (!dateInput || !dataAbsen[dateInput.value] || dataAbsen[dateInput.value].length === 0) return showToast("Tidak ada data", "error");
    
    const { jsPDF } = window.jspdf; 
    
    // PERBAIKAN 1: Ubah kertas menjadi 'l' (Landscape / Mendatar)
    const doc = new jsPDF('l', 'mm', 'a4');
    
    doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.text("Laporan Kehadiran Harian", 14, 20);
    doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.text(`Tanggal: ${dateInput.value}`, 14, 28);
    
    const tableData = []; 
    dataAbsen[dateInput.value].forEach((a, index) => { 
        tableData.push([index + 1, a.waktu, a.nis, a.nama, a.kelas, a.status]); 
    });
    
    doc.autoTable({ 
        startY: 35, 
        head: [['No', 'Waktu', 'NIS', 'Nama Lengkap', 'Kelas', 'Status']], 
        body: tableData, 
        
        // PERBAIKAN 2: Desain Monokrom & Teks Anti-Potong
        headStyles: { fillColor: [23, 23, 23] }, // Warna Hitam Pekat
        styles: { 
            fontSize: 10, 
            cellPadding: 4, 
            overflow: 'linebreak' // Memaksa teks panjang turun ke bawah
        },
        columnStyles: {
            0: { cellWidth: 15, halign: 'center' }, // No
            1: { cellWidth: 25, halign: 'center' }, // Waktu
            2: { cellWidth: 40 },                   // NIS
            3: { cellWidth: 'auto' },               // Nama Lengkap (Otomatis mengisi ruang kosong)
            4: { cellWidth: 35, halign: 'center' }, // Kelas
            5: { cellWidth: 35, halign: 'center' }  // Status
        },
        theme: 'grid' 
    });
    
    doc.save(`Laporan_Harian_${dateInput.value}.pdf`); 
    showToast("Berhasil mengunduh PDF!", "success");
});

// BARU: Ekspor menggunakan ExcelJS (Standar Enterprise dengan Warna & Styling Rapi)
document.getElementById('btn-export-excel')?.addEventListener('click', async () => {
    if (typeof ExcelJS === 'undefined') return showToast("Sistem Excel masih dimuat, tunggu sebentar.", "warning");
    if (dataSiswa.length === 0) return showToast('Belum ada data siswa.', 'error');
    if (!dateInput) return;
    
    setLoading(true); // Munculkan layar loading sebentar
    
    try {
        const sd = new Date(dateInput.value); 
        const year = sd.getFullYear(); 
        const month = sd.getMonth(); 
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const namaBulan = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"][month];

        // Buat File Excel Kosong
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(`Rekap ${namaBulan} ${year}`, {
            views: [{ state: 'frozen', xSplit: 4, ySplit: 1 }] // KUNCI: Freeze baris pertama & 4 kolom pertama
        });

        // 1. Buat Baris Header
        let header = ["No", "NIS", "Nama Lengkap", "Kelas"];
        for (let i = 1; i <= daysInMonth; i++) header.push(i);
        header.push("H", "S", "I", "A");
        const headerRow = worksheet.addRow(header);

        // Styling Baris Header (Tebal, Tengah, Warna Abu-abu)
        headerRow.eachCell((cell) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCBD5E1' } }; 
            cell.font = { bold: true, color: { argb: 'FF0F172A' } };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
        });

        // Sesuaikan Lebar Kolom Biar Sangat Rapi
        worksheet.getColumn(1).width = 5;  
        worksheet.getColumn(2).width = 15; 
        worksheet.getColumn(3).width = 30; 
        worksheet.getColumn(4).width = 10; 
        for(let i=1; i<=daysInMonth; i++) worksheet.getColumn(4+i).width = 4;
        worksheet.getColumn(4+daysInMonth+1).width = 5; 
        worksheet.getColumn(4+daysInMonth+2).width = 5; 
        worksheet.getColumn(4+daysInMonth+3).width = 5; 
        worksheet.getColumn(4+daysInMonth+4).width = 5; 

        // 2. Isi Data Murid
        [...dataSiswa].sort((a,b)=>a.nama.localeCompare(b.nama)).forEach((siswa, idx) => {
            let rowData = [idx + 1, siswa.nis, siswa.nama, siswa.kelas];
            let total = { H: 0, S: 0, I: 0, A: 0 };
            
            for (let d = 1; d <= daysInMonth; d++) {
                const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const rec = (dataAbsen[dateKey] || []).find(a => a.nis === siswa.nis);
                let mark = ''; 
                if (rec) { 
                    if(rec.status === 'Hadir') { mark = 'H'; total.H++; }
                    else if(rec.status === 'Sakit') { mark = 'S'; total.S++; }
                    else if(rec.status === 'Izin') { mark = 'I'; total.I++; }
                    else { mark = 'A'; total.A++; }
                }
                rowData.push(mark);
            }
            rowData.push(total.H, total.S, total.I, total.A);
            
            const addedRow = worksheet.addRow(rowData);

            // Styling Baris Data & Warna Cell Berdasarkan Status
            addedRow.eachCell((cell, colNum) => {
                cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
                cell.alignment = { vertical: 'middle' };
                
                if(colNum > 4) { // Pengecekan Khusus Area Tanggal & Total
                    cell.alignment = { vertical: 'middle', horizontal: 'center' };
                    // Warnai kotak kehadiran sesuai hurufnya
                    if (cell.value === 'H') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } }; 
                    if (cell.value === 'S' || cell.value === 'I') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }; 
                    if (cell.value === 'A') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }; 
                }
            });

            // Warnai tebal pada kolom Rekap Total di ujung kanan
            addedRow.getCell(4+daysInMonth+1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
            addedRow.getCell(4+daysInMonth+1).font = { bold: true };
            addedRow.getCell(4+daysInMonth+2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
            addedRow.getCell(4+daysInMonth+2).font = { bold: true };
            addedRow.getCell(4+daysInMonth+3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
            addedRow.getCell(4+daysInMonth+3).font = { bold: true };
            addedRow.getCell(4+daysInMonth+4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
            addedRow.getCell(4+daysInMonth+4).font = { bold: true };
        });

        // 3. Render Simpan ke Format File Excel Asli (.xlsx)
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        saveAs(blob, `Rekap_Absensi_${namaBulan}_${year}.xlsx`);
        showToast("File Excel Asli Berhasil Diunduh!", "success");
        
    } catch (e) {
        console.error("Gagal export Excel:", e);
        showToast("Gagal memproses file Excel", "error");
    } finally {
        setLoading(false);
    }
});

// ==========================================
// TABS & UTILS
// ==========================================
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab, .tab-panel').forEach(el => el.classList.remove('active'));
        tab.classList.add('active'); const p = document.getElementById(`tab-${tab.dataset.tab}`); if(p) p.classList.add('active');
        if (tab.dataset.tab !== 'absensi') stopKamera();
        if (tab.dataset.tab === 'kartu') renderKartu();
    });
});
document.getElementById('show-sudah')?.addEventListener('click', (e) => { e.target.classList.add('active'); document.getElementById('show-belum')?.classList.remove('active'); document.getElementById('attendance-table-wrap').style.display = 'block'; document.getElementById('belum-table-wrap').style.display = 'none'; });
document.getElementById('show-belum')?.addEventListener('click', (e) => { e.target.classList.add('active'); document.getElementById('show-sudah')?.classList.remove('active'); document.getElementById('attendance-table-wrap').style.display = 'none'; document.getElementById('belum-table-wrap').style.display = 'block'; });

function updateSelectManual() {
    if (!selectSiswaManual) return; selectSiswaManual.innerHTML = '<option value="">Pilih Siswa...</option>';
    [...dataSiswa].sort((a,b)=>a.nama.localeCompare(b.nama)).forEach(s => selectSiswaManual.innerHTML += `<option value="${s.nis}">${s.nama} (${s.kelas})</option>`);
}

window.renderKartu = function() {
    const wrap = document.getElementById('cards-grid-wrap');
    if (!wrap) return;
    if (dataSiswa.length === 0) {
        wrap.innerHTML = '<div class="empty-state" style="grid-column: 1/-1;">Belum ada data siswa untuk dicetak.</div>';
        return;
    }

    const namaSekolah = document.getElementById('input-sekolah')?.value || 'NAMA INSTANSI';
    const slogan = document.getElementById('input-slogan')?.value || 'Kartu Identitas Resmi';

    let html = '';
    dataSiswa.forEach(s => {
        html += `
        <div class="id-card-pvc">
            <div class="id-header">
                <h4>${namaSekolah}</h4>
                <p>${slogan}</p>
            </div>
            <div class="id-body">
                <div id="qr-${s.nis}" class="qr-code"></div>
                <div class="id-name">${s.nama}</div>
                <div class="id-nis">NIS: ${s.nis} &nbsp;|&nbsp; KELAS: ${s.kelas}</div>
            </div>
        </div>`;
    });
    wrap.innerHTML = html;

    dataSiswa.forEach(s => {
        new QRCode(document.getElementById(`qr-${s.nis}`), { text: s.nis, width: 120, height: 120, colorDark: "#171717", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.H });
    });
}

document.getElementById('btn-print-kartu')?.addEventListener('click', () => window.print());

document.getElementById('btn-import-csv')?.addEventListener('click', () => document.getElementById('file-import')?.click());
document.getElementById('file-import')?.addEventListener('change', (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
        const lines = event.target.result.split('\n'); let count = 0; setLoading(true);
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(/[,;]/); 
            if (cols.length >= 3) {
                const nis = cols[0].replace(/["']/g, '').trim(); const nama = cols[1].replace(/["']/g, '').trim(); const kelas = cols[2].replace(/["']/g, '').trim();
                if (nis && !dataSiswa.some(s => s.nis === nis)) {
                    dataSiswa.push({ nis, nama, kelas }); count++; await fetchToCloud(new URLSearchParams({ aksi: 'tambah_siswa', nis, nama, kelas }));
                }
            }
        }
        setLoading(false); simpanData(); updateUI(); showToast(`Berhasil mengimpor ${count} siswa.`, 'success'); e.target.value = '';
    };
    reader.readAsText(file);
});

// ==========================================
// FUNGSI AKSI MASSAL (BULK ACTIONS)
// ==========================================
window.toggleSemua = function(source) {
    const checkboxes = document.querySelectorAll('.check-siswa');
    checkboxes.forEach(cb => cb.checked = source.checked);
    cekBulkAction();
}

window.cekBulkAction = function() {
    const adaYangDicentang = document.querySelectorAll('.check-siswa:checked').length > 0;
    document.getElementById('bulk-panel').style.display = adaYangDicentang ? 'flex' : 'none';
}

window.prosesBulk = function(statusTarget) {
    const checked = document.querySelectorAll('.check-siswa:checked');
    if(checked.length === 0) return;
    
    Swal.fire({
        title: 'Sinkronisasi Cloud', 
        text: `Sistem akan menyetorkan ${checked.length} data secara berurutan ke Spreadsheet agar tidak ditolak oleh Google.`,
        icon: 'info', 
        showCancelButton: true, 
        confirmButtonText: 'Mulai Proses',
        confirmButtonColor: '#171717', 
        cancelButtonColor: '#737373'
    }).then(async (result) => {
        if (result.isConfirmed) {
            setLoading(true);
            
            // Eksekusi absen BERURUTAN dengan Indikator Loading
            const textLoading = document.querySelector('.loading-overlay p');
            
            for(let i = 0; i < checked.length; i++) {
                if(textLoading) textLoading.innerText = `Menyimpan ${i + 1} dari ${checked.length} siswa...`;
                // Panggil fungsi catatAbsen secara bergantian
                await catatAbsen(checked[i].value, statusTarget, true); 
            }
            
            // Kembalikan teks loading ke semula
            if(textLoading) textLoading.innerText = 'Memproses Data...';
            
            // Tarik kembali data terbaru dari Spreadsheet untuk memastikan akurasi
            await syncDataLokalDenganCloud();
            
            setLoading(false);
            showToast(`${checked.length} siswa berhasil disetorkan!`, 'success');
        }
    });
}

// ==========================================
// SHORTCUT KEYBOARD (ENTER UNTUK EKSEKUSI)
// ==========================================

// 1. Tekan Enter untuk Login
document.getElementById('login-pin')?.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        e.preventDefault(); // Mencegah browser me-reload halaman
        document.getElementById('btn-login')?.click(); // Menekan tombol login secara gaib
    }
});

// 2. Tekan Enter untuk Menyimpan Data Siswa
const formSiswaInputs = ['input-nis', 'input-nama', 'input-kelas'];
formSiswaInputs.forEach(id => {
    document.getElementById(id)?.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('btn-tambah-siswa')?.click(); // Menekan tombol simpan secara gaib
        }
    });
});

window.renderAnalitik = function() {
    const dashboard = document.getElementById('insight-dashboard');
    if(!dashboard || dataSiswa.length === 0) return;
    
    // Aktifkan Dashboard jika sedang di Mode Admin
    dashboard.style.display = currentRole === 'guru' ? 'none' : 'flex';

    let rekap = dataSiswa.map(s => ({ nis: s.nis, nama: s.nama, kelas: s.kelas, hadir: 0, masalah: 0 }));

    // Hitung seluruh riwayat database
    Object.values(dataAbsen).forEach(absensiHarian => {
        absensiHarian.forEach(absen => {
            let siswa = rekap.find(r => r.nis === absen.nis);
            if(siswa) {
                if(absen.status === 'Hadir') siswa.hadir++;
                else if(absen.status === 'Sakit' || absen.status === 'Izin' || absen.status === 'Alpa' || absen.status === 'Terlambat') siswa.masalah++;
            }
        });
    });

    // 🏆 Top 5 Rajin (Hadir terbanyak, Masalah terkecil)
    let rajin = [...rekap].sort((a,b) => b.hadir - a.hadir || a.masalah - b.masalah).slice(0, 5);
    let htmlRajin = '';
    rajin.forEach(r => htmlRajin += `<li class="insight-item"><div><strong>${r.nama}</strong><br><span style="font-size:11px; color:var(--text-muted);">${r.kelas}</span></div> <span class="badge Hadir">${r.hadir} Hadir</span></li>`);
    document.getElementById('list-leaderboard').innerHTML = htmlRajin || '<li class="insight-item">Belum ada data.</li>';

    // ⚠️ Zona Merah (Masalah terbanyak >= 3)
    let rawan = [...rekap].filter(r => r.masalah >= 3).sort((a,b) => b.masalah - a.masalah).slice(0, 5);
    let htmlRawan = '';
    rawan.forEach(r => htmlRawan += `<li class="insight-item"><div><strong>${r.nama}</strong><br><span style="font-size:11px; color:var(--text-muted);">${r.kelas}</span></div> <span class="badge Alpa" style="background:var(--danger); color:white;">${r.masalah} Peringatan</span></li>`);
    document.getElementById('list-redzone').innerHTML = htmlRawan || '<li class="insight-item" style="color:var(--success);">Aman. Tidak ada siswa bermasalah.</li>';
}

// Tambahkan pemanggilan fungsi ini di dalam fungsi updateUI()
// renderAnalitik();