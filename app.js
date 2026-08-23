// ==========================================
// STATE MANAGEMENT & GLOBAL VARIABLES
// ==========================================
let dataSiswa = JSON.parse(localStorage.getItem('siswa_pro')) || [];
let dataAbsen = JSON.parse(localStorage.getItem('absensi_pro')) || {};
let videoStream = null;
let scanInterval = null;
let editModeNIS = null;

let currentPage = 1;
const itemsPerPage = 10;
let searchTimeout;
let myChart = null; 

// MASUKKAN URL GOOGLE APPS SCRIPT ANDA DI SINI
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxBrLwpbDpST9KpTyM2CEKbbkyjKtexA6bd7DjSPpt2LVjmimNkhigxNKrvD_otZtLscQ/exec';

// ==========================================
// INISIALISASI & API UTILS
// ==========================================
const dateInput = document.getElementById('input-tanggal-absensi');
const selectSiswaManual = document.getElementById('manual-select-siswa');
const searchInput = document.getElementById('search-siswa');

document.addEventListener('DOMContentLoaded', () => {
    try {
        const today = new Date();
        if (dateInput) {
            dateInput.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        }
        updateUI();
        if (GOOGLE_SCRIPT_URL) syncDataLokalDenganCloud();
    } catch (e) { console.error("Error Inisialisasi: ", e); }
});

function playBeep(isError = false) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = isError ? 'sawtooth' : 'sine'; 
        osc.frequency.setValueAtTime(isError ? 300 : 800, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        osc.start(); osc.stop(ctx.currentTime + (isError ? 0.3 : 0.1));
    } catch(e) {} 
}

function setLoading(isLoading) { 
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.toggle('active', isLoading); 
}

async function fetchToCloud(formData) {
    if (!GOOGLE_SCRIPT_URL) return { success: false, message: "URL Script tidak disetel." };
    try {
        setLoading(true);
        const response = await fetch(GOOGLE_SCRIPT_URL, { method: 'POST', body: formData });
        const result = await response.json();
        setLoading(false);
        return result;
    } catch (error) {
        setLoading(false);
        return { success: false, message: "Gagal terhubung ke Cloud. Pastikan Anda online." };
    }
}

async function syncDataLokalDenganCloud() {
    setLoading(true);
    try {
        const response = await fetch(GOOGLE_SCRIPT_URL);
        const dataCloud = await response.json();
        if(dataCloud && dataCloud.success) {
            dataSiswa = dataCloud.siswa || [];
            dataAbsen = dataCloud.absensi || {};
            simpanData(); updateUI();
            showToast('Data tersinkronisasi dengan Cloud!', 'success');
        }
    } catch (error) { showToast('Anda sedang Offline (Mode Lokal Aktif).', 'warning'); }
    finally { setLoading(false); }
}

function updateUI() {
    if (searchInput) renderTableSiswa(searchInput.value);
    renderKartu();
    renderAbsensi();
    updateSelectManual();
}

function simpanData() {
    localStorage.setItem('siswa_pro', JSON.stringify(dataSiswa));
    localStorage.setItem('absensi_pro', JSON.stringify(dataAbsen));
}

// ==========================================
// FITUR 1: MANAJEMEN SISWA
// ==========================================
document.getElementById('btn-tambah-siswa')?.addEventListener('click', async () => {
    const nis = document.getElementById('input-nis')?.value.trim();
    const nama = document.getElementById('input-nama')?.value.trim();
    const kelas = document.getElementById('input-kelas')?.value.trim();
    if (!nis || !nama || !kelas) return showToast('Lengkapi seluruh data!', 'warning');
    
    let formData = new URLSearchParams({ nis, nama, kelas });

    if (editModeNIS) { 
        formData.append('aksi', 'edit_siswa');
        formData.append('nis_lama', editModeNIS);
        promptPIN(async (pin) => {
            formData.append('pin', pin);
            const res = await fetchToCloud(formData);
            if (res.success) {
                const index = dataSiswa.findIndex(s => s.nis === editModeNIS);
                dataSiswa[index] = { nis, nama, kelas };
                showToast('Data siswa berhasil diedit di Server!', 'success');
                batalEdit(); simpanData(); updateUI();
            } else { showToast(res.message, 'danger'); }
        });
    } else { 
        if (dataSiswa.some(s => s.nis === nis)) return showToast('NIS sudah ada!', 'danger');
        formData.append('aksi', 'tambah_siswa');
        
        const res = await fetchToCloud(formData);
        if(res.success || !res.success) { 
            dataSiswa.push({ nis, nama, kelas });
            showToast('Siswa berhasil ditambahkan.', 'success');
            document.getElementById('input-nis').value = ''; document.getElementById('input-nama').value = ''; document.getElementById('input-kelas').value = '';
            simpanData(); updateUI();
        } 
    }
});

window.editSiswa = function(nis) {
    const siswa = dataSiswa.find(s => s.nis === nis);
    if (!siswa) return;
    document.getElementById('input-nis').value = siswa.nis;
    document.getElementById('input-nama').value = siswa.nama;
    document.getElementById('input-kelas').value = siswa.kelas;
    editModeNIS = nis;
    const btnSimpan = document.getElementById('btn-tambah-siswa');
    if (btnSimpan) { btnSimpan.innerHTML = '<i class="ph ph-floppy-disk"></i> Update Data'; btnSimpan.classList.add('warning'); }
    document.getElementById('btn-batal-edit').style.display = 'flex';
}

function batalEdit() {
    editModeNIS = null;
    document.getElementById('input-nis').value = ''; document.getElementById('input-nama').value = ''; document.getElementById('input-kelas').value = '';
    const btnSimpan = document.getElementById('btn-tambah-siswa');
    if (btnSimpan) { btnSimpan.innerHTML = '<i class="ph ph-plus"></i> Simpan'; btnSimpan.classList.remove('warning'); }
    const btnBatal = document.getElementById('btn-batal-edit');
    if(btnBatal) btnBatal.style.display = 'none';
}
document.getElementById('btn-batal-edit')?.addEventListener('click', batalEdit);

window.hapusSiswa = function(nis) {
    promptPIN(async (pin) => {
        let formData = new URLSearchParams({ aksi: 'hapus_siswa', nis, pin });
        const res = await fetchToCloud(formData);
        if (res.success) {
            dataSiswa = dataSiswa.filter(s => s.nis !== nis);
            simpanData(); updateUI(); showToast('Siswa berhasil dihapus dari Server.', 'success');
        } else { showToast(res.message, 'danger'); }
    });
}

document.getElementById('btn-hapus-semua')?.addEventListener('click', () => {
    promptPIN(async (pin) => {
        let formData = new URLSearchParams({ aksi: 'hapus_semua', pin });
        const res = await fetchToCloud(formData);
        if (res.success) {
            dataSiswa = []; simpanData(); updateUI(); showToast('Semua data di-reset.', 'success');
        } else { showToast(res.message, 'danger'); }
    });
});

searchInput?.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        currentPage = 1; 
        renderTableSiswa(e.target.value);
    }, 300);
});

function renderTableSiswa(filter = '') {
    const wrap = document.getElementById('siswa-table-wrap');
    const pageControls = document.getElementById('pagination-controls');
    if (!wrap) return;
    
    if (dataSiswa.length === 0) {
        wrap.innerHTML = '<div class="empty-state"><i class="ph ph-users" style="font-size:40px;"></i><br>Belum ada data siswa.</div>'; 
        if (pageControls) pageControls.innerHTML = ''; return;
    }

    const keyword = filter.toLowerCase();
    const filteredSiswa = dataSiswa.filter(s => s.nama.toLowerCase().includes(keyword) || s.nis.toLowerCase().includes(keyword));

    if (filteredSiswa.length === 0) { wrap.innerHTML = '<div class="empty-state">Siswa tidak ditemukan.</div>'; if (pageControls) pageControls.innerHTML = ''; return; }

    const totalPages = Math.ceil(filteredSiswa.length / itemsPerPage);
    const startIdx = (currentPage - 1) * itemsPerPage;
    const paginatedData = filteredSiswa.slice(startIdx, startIdx + itemsPerPage);

    let html = `<table><tr><th>NIS</th><th>Nama Lengkap</th><th>Kelas</th><th style="width:120px;">Aksi</th></tr>`;
    paginatedData.forEach(s => {
        html += `<tr><td><strong>${s.nis}</strong></td><td>${s.nama}</td><td>${s.kelas}</td>
        <td><div style="display:flex; gap:8px;">
            <button class="btn warning" style="padding:6px 10px;" onclick="editSiswa('${s.nis}')"><i class="ph ph-pencil-simple"></i></button>
            <button class="btn danger" style="padding:6px 10px;" onclick="hapusSiswa('${s.nis}')"><i class="ph ph-trash"></i></button>
        </div></td></tr>`;
    });
    wrap.innerHTML = html + '</table>';

    let pageHtml = '';
    for(let p=1; p<=totalPages; p++) {
        pageHtml += `<button class="btn ${p === currentPage ? '' : 'secondary'}" style="padding: 5px 12px; font-size: 13px;" onclick="goToPage(${p})">${p}</button>`;
    }
    if (pageControls) pageControls.innerHTML = pageHtml;
}

window.goToPage = function(pageNumber) {
    currentPage = pageNumber;
    if (searchInput) renderTableSiswa(searchInput.value);
};

// ==========================================
// FITUR 2: SCANNER & CHART HISTORIS 
// ==========================================
const video = document.getElementById('scanner-video');
const canvasElement = document.getElementById('scan-canvas');
const canvas = canvasElement ? canvasElement.getContext('2d', { willReadFrequently: true }) : null;

document.getElementById('btn-start-scan')?.addEventListener('click', mulaiKamera);
document.getElementById('btn-stop-scan')?.addEventListener('click', stopKamera);

function mulaiKamera() {
    if(!video) return;
    document.getElementById('scanner-placeholder').style.display = 'none';
    video.style.display = 'block'; 
    document.getElementById('btn-start-scan').disabled = true; document.getElementById('btn-stop-scan').disabled = false;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then(stream => {
        videoStream = stream; video.srcObject = stream; video.setAttribute("playsinline", true); video.play();
        scanInterval = requestAnimationFrame(tick);
    }).catch(err => { showToast('Kamera tidak diizinkan/ditemukan.', 'danger'); stopKamera(); });
}

function stopKamera() {
    if (videoStream) { videoStream.getTracks().forEach(track => track.stop()); videoStream = null; }
    cancelAnimationFrame(scanInterval); 
    if(video) video.style.display = 'none'; 
    const p = document.getElementById('scanner-placeholder'); if(p) p.style.display = 'block';
    const btnStart = document.getElementById('btn-start-scan'); if(btnStart) btnStart.disabled = false; 
    const btnStop = document.getElementById('btn-stop-scan'); if(btnStop) btnStop.disabled = true;
}

function tick() {
    if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvasElement.height = video.videoHeight; canvasElement.width = video.videoWidth;
        canvas.drawImage(video, 0, 0, canvasElement.width, canvasElement.height);
        const imageData = canvas.getImageData(0, 0, canvasElement.width, canvasElement.height);
        
        if (typeof jsQR !== 'undefined') {
            const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
            
            if (code) { 
                if (code.data.startsWith("SOFTAPP-QR:")) {
                    const actualNis = code.data.replace("SOFTAPP-QR:", "");
                    catatAbsen(actualNis, 'Hadir'); 
                } else {
                    playBeep(true); 
                    showToast('QR Code Ditolak! Bukan kartu dari sistem ini.', 'danger');
                }
                setTimeout(() => { requestAnimationFrame(tick); }, 2500); 
                return; 
            }
        }
    }
    scanInterval = requestAnimationFrame(tick);
}

document.getElementById('btn-manual-simpan')?.addEventListener('click', () => {
    const nis = selectSiswaManual?.value; const status = document.getElementById('manual-select-status')?.value;
    if (!nis) return showToast('Pilih siswa terlebih dahulu!', 'danger');
    catatAbsen(nis, status, true);
});

async function catatAbsen(nis, status, isManual = false) {
    const siswa = dataSiswa.find(s => s.nis === nis);
    if (!siswa) {
        if (!isManual) { playBeep(true); showToast('QR Code tidak dikenali!', 'danger'); }
        return;
    }

    const tgl = dateInput?.value || new Date().toISOString().split('T')[0];
    
    // --- LOGIKA PENCEGAH DOUBLE SCAN ---
    if (!isManual && dataAbsen[tgl]) {
        const riwayat = dataAbsen[tgl].find(a => a.nis === nis);
        // Jika scan kamera dan sebelumnya sudah tercatat 'Hadir', tolak prosesnya
        if (riwayat && riwayat.status === 'Hadir') {
            playBeep(true); // Nada error (rendah)
            showToast(`Gagal: ${siswa.nama} sudah absen Hadir hari ini!`, 'warning');
            return; // Hentikan fungsi di sini
        }
    }

    const waktuSekarang = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    
    if (!dataAbsen[tgl]) dataAbsen[tgl] = [];
    dataAbsen[tgl] = dataAbsen[tgl].filter(a => a.nis !== nis);
    dataAbsen[tgl].push({ nis: siswa.nis, nama: siswa.nama, kelas: siswa.kelas, waktu: waktuSekarang, status: status });
    
    simpanData(); renderAbsensi(); if(selectSiswaManual) selectSiswaManual.value = '';
    
    if (!isManual) playBeep(false); // Bunyi sukses
    showToast(`${siswa.nama} ditandai: ${status}`, 'success');

    let formData = new URLSearchParams({ aksi: 'absen', tanggal: tgl, waktu: waktuSekarang, nis: siswa.nis, nama: siswa.nama, kelas: siswa.kelas, status: status });
    fetch(GOOGLE_SCRIPT_URL, { method: 'POST', body: formData }).catch(e => console.log('Sinkronisasi absen offline'));
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
    
    let htmlBelum = `<table><tr><th>NIS</th><th>Nama Lengkap</th><th>Kelas</th></tr>`;
    siswaBelumAbsen.forEach(s => { htmlBelum += `<tr><td>${s.nis}</td><td><strong>${s.nama}</strong></td><td>${s.kelas}</td></tr>`; });
    const wrapBelum = document.getElementById('belum-table-wrap');
    if(wrapBelum) wrapBelum.innerHTML = siswaBelumAbsen.length === 0 ? '<div class="empty-state">Semua siswa sudah diabsen.</div>' : htmlBelum + '</table>';

    const absenDanAlpa = totalSiswa - hadir - sakitIzin;

    const pcnHadir = totalSiswa ? Math.round((hadir / totalSiswa) * 100) : 0;
    const pcnSakit = totalSiswa ? Math.round((sakitIzin / totalSiswa) * 100) : 0;
    const pcnAlpa = totalSiswa ? Math.round((absenDanAlpa / totalSiswa) * 100) : 0;

    const cards = document.querySelectorAll('.stat-card h3');
    if(cards.length === 4) { 
        cards[0].textContent = totalSiswa; 
        cards[1].textContent = pcnHadir + '%'; 
        cards[2].textContent = pcnSakit + '%'; 
        cards[3].textContent = pcnAlpa + '%'; 
    }
    
    const countSudah = document.getElementById('count-sudah'); if(countSudah) countSudah.textContent = absenHariIni.length; 
    const countBelum = document.getElementById('count-belum'); if(countBelum) countBelum.textContent = siswaBelumAbsen.length;

    renderTrendChart();
}

function renderTrendChart() {
    const ctx = document.getElementById('attendanceChart');
    if(!ctx || typeof Chart === 'undefined') return;
    
    let availableDates = Object.keys(dataAbsen).sort();
    let last7Dates = availableDates.slice(-7);
    if (last7Dates.length === 0 && dateInput) last7Dates = [dateInput.value];

    const labels = [];
    const dataHadir = [];

    last7Dates.forEach(tgl => {
        const d = new Date(tgl);
        labels.push(`${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`);
        const absenHarian = dataAbsen[tgl] || [];
        const jumlahHadir = absenHarian.filter(a => a.status === 'Hadir').length;
        dataHadir.push(jumlahHadir);
    });
    
    if (myChart) {
        myChart.data.labels = labels;
        myChart.data.datasets[0].data = dataHadir;
        myChart.update();
    } else {
        myChart = new Chart(ctx.getContext('2d'), {
            type: 'line', 
            data: {
                labels: labels,
                datasets: [{
                    label: 'Kehadiran Siswa',
                    data: dataHadir,
                    borderColor: '#4f46e5', 
                    backgroundColor: 'rgba(79, 70, 229, 0.1)', 
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4, 
                    pointBackgroundColor: '#4f46e5',
                    pointRadius: 5,
                    pointHoverRadius: 7
                }]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                plugins: { 
                    legend: { display: false },
                    tooltip: { mode: 'index', intersect: false } 
                }, 
                scales: { 
                    y: { beginAtZero: true, suggestedMax: dataSiswa.length > 0 ? dataSiswa.length : 10, ticks: { stepSize: 1 } },
                    x: { grid: { display: false } }
                } 
            }
        });
    }
}

// ==========================================
// FITUR 3: EXPORT
// ==========================================
document.getElementById('btn-export-pdf')?.addEventListener('click', () => {
    if (typeof window.jspdf === 'undefined') return showToast("Sistem PDF masih dimuat, mohon tunggu sebentar.", "warning");
    if (!dateInput || !dataAbsen[dateInput.value] || dataAbsen[dateInput.value].length === 0) return showToast("Tidak ada data absen untuk diekspor", "danger");
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.text("Laporan Kehadiran Harian", 14, 20);
    doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.text(`Tanggal: ${dateInput.value}`, 14, 28);
    
    const tableData = [];
    dataAbsen[dateInput.value].forEach((a, index) => { tableData.push([index + 1, a.waktu, a.nis, a.nama, a.kelas, a.status]); });
    
    doc.autoTable({
        startY: 35, head: [['No', 'Waktu', 'NIS', 'Nama Lengkap', 'Kelas', 'Status']],
        body: tableData, headStyles: { fillColor: [79, 70, 229] }, theme: 'grid'
    });
    
    doc.save(`Laporan_Harian_${dateInput.value}.pdf`);
    showToast("Berhasil mengunduh PDF!", "success");
});

document.getElementById('btn-export-csv')?.addEventListener('click', () => {
    if (dataSiswa.length === 0) return showToast('Belum ada data siswa.', 'danger');
    if (!dateInput) return;
    const selectedDate = new Date(dateInput.value); const year = selectedDate.getFullYear(); const month = selectedDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let csvContent = `Rekapitulasi Kehadiran Siswa\n`;
    let header = `No;NIS;Nama Lengkap;Kelas`;
    for (let i = 1; i <= daysInMonth; i++) header += `;${i}`;
    header += `;Hadir;Sakit;Izin;Alpa\n`; csvContent += header;

    const sorted = [...dataSiswa].sort((a, b) => a.nama.localeCompare(b.nama));
    sorted.forEach((siswa, idx) => {
        let row = `${idx + 1};="${siswa.nis}";"${siswa.nama}";"${siswa.kelas}"`;
        let total = { H: 0, S: 0, I: 0, A: 0 };
        for (let d = 1; d <= daysInMonth; d++) {
            const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const rec = (dataAbsen[dateKey] || []).find(a => a.nis === siswa.nis);
            let mark = '';
            if (rec) { mark = rec.status === 'Hadir' ? 'H' : (rec.status === 'Sakit' ? 'S' : (rec.status === 'Izin' ? 'I' : 'A')); total[mark]++; }
            row += `;${mark}`;
        }
        row += `;${total.H};${total.S};${total.I};${total.A}\n`; csvContent += row;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob);
    link.download = `Rekap_Absensi_${year}_${month+1}.csv`; document.body.appendChild(link); link.click(); document.body.removeChild(link);
});

// ==========================================
// TABS & UTILS
// ==========================================
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab, .tab-panel').forEach(el => el.classList.remove('active'));
        tab.classList.add('active'); 
        const p = document.getElementById(`tab-${tab.dataset.tab}`); if(p) p.classList.add('active');
        if (tab.dataset.tab !== 'absensi') stopKamera();
    });
});

document.getElementById('show-sudah')?.addEventListener('click', (e) => { e.target.classList.add('active'); document.getElementById('show-belum')?.classList.remove('active'); document.getElementById('attendance-table-wrap').style.display = 'block'; document.getElementById('belum-table-wrap').style.display = 'none'; });
document.getElementById('show-belum')?.addEventListener('click', (e) => { e.target.classList.add('active'); document.getElementById('show-sudah')?.classList.remove('active'); document.getElementById('attendance-table-wrap').style.display = 'none'; document.getElementById('belum-table-wrap').style.display = 'block'; });

function updateSelectManual() {
    if (!selectSiswaManual) return;
    selectSiswaManual.innerHTML = '<option value="">Pilih Siswa...</option>';
    [...dataSiswa].sort((a,b)=>a.nama.localeCompare(b.nama)).forEach(s => selectSiswaManual.innerHTML += `<option value="${s.nis}">${s.nama} (${s.kelas})</option>`);
}

function renderKartu() {
    const wrap = document.getElementById('cards-grid-wrap'); 
    if(!wrap) return;
    wrap.innerHTML = '';
    if (dataSiswa.length === 0) return wrap.innerHTML = '<div class="empty-state">Belum ada siswa.</div>';
    
    dataSiswa.forEach(s => {
        const card = document.createElement('div'); card.className = 'qr-card';
        card.innerHTML = `<div class="qr-code" id="qr-${s.nis}"></div><h3>${s.nama}</h3><p>${s.kelas} &bull; ${s.nis}</p>`;
        wrap.appendChild(card); 
        
        if(typeof QRCode !== 'undefined') {
            new QRCode(document.getElementById(`qr-${s.nis}`), { 
                text: "SOFTAPP-QR:" + s.nis, 
                width: 140, 
                height: 140, 
                colorDark: "#0f172a" 
            });
        }
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
                    dataSiswa.push({ nis, nama, kelas }); count++;
                    await fetchToCloud(new URLSearchParams({ aksi: 'tambah_siswa', nis, nama, kelas }));
                }
            }
        }
        setLoading(false); simpanData(); updateUI(); showToast(`Berhasil mengimpor ${count} siswa.`, 'success'); e.target.value = '';
    };
    reader.readAsText(file);
});

// SISTEM PIN ASINKRON
let pendingAction = null;
const modalPin = document.getElementById('pin-modal');
const inputPin = document.getElementById('input-pin');

function promptPIN(callback) { pendingAction = callback; if(inputPin) inputPin.value = ''; if(modalPin) modalPin.classList.add('active'); if(inputPin) inputPin.focus(); }
document.getElementById('btn-cancel-pin')?.addEventListener('click', () => { if(modalPin) modalPin.classList.remove('active'); pendingAction = null; });
document.getElementById('btn-confirm-pin')?.addEventListener('click', () => {
    if(!inputPin || !inputPin.value) return showToast("Masukkan PIN!", "warning");
    if(modalPin) modalPin.classList.remove('active');
    if (pendingAction) pendingAction(inputPin.value);
    pendingAction = null;
});
inputPin?.addEventListener('keypress', (e) => { if (e.key === 'Enter') document.getElementById('btn-confirm-pin')?.click(); });

function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    if(!toast) return;
    toast.innerHTML = (type === 'success' ? '<i class="ph ph-check-circle"></i>' : '<i class="ph ph-warning"></i>') + ` ${msg}`;
    toast.className = `show ${type}`; setTimeout(() => toast.className = '', 3500);
}