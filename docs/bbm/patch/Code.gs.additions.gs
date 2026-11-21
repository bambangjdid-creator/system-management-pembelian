/**
 * ============================================================================
 * TAMBAHAN UNTUK Code.gs — BBM Logistik Pro
 * ----------------------------------------------------------------------------
 * Semua fungsi di bawah DITAMBAHKAN ke Code.gs Anda. Lalu GANTI fungsi
 * simpanData() lama dengan versi di bagian 4 file ini.
 *
 * Yang diperbaiki:
 *   - validasi payload di server (harga/volume/odometer/plat/supir/SPBU)
 *   - harga diambil dari sheet MASTER BBM, bukan dari browser
 *   - LockService  -> tidak ada lagi baris dobel karena double-click
 *   - tanggal disimpan sebagai Date asli (bukan string) + number format
 *   - tulis eksplisit A..K agar tidak menabrak kolom formula L..R
 *   - kolom S STATUS_DATA & T CREATED_AT untuk audit + soft delete
 *   - login admin berbasis token (menggantikan PIN hardcoded di HTML)
 * ============================================================================
 */

/* ---------------------------------------------------------------------------
   0. KONFIGURASI TAMBAHAN — taruh di dekat deklarasi CONFIG yang sudah ada
   --------------------------------------------------------------------------- */

const COL = {
  TANGGAL: 1, PLAT: 2, SUPIR: 3, SPBU: 4, HARGA: 5, VOLUME: 6, TOTAL: 7,
  TIPE: 8, JENIS: 9, ODO: 10, FOTO: 11,
  STATUS_DATA: 19,   // kolom S
  CREATED_AT: 20     // kolom T
};

const BBM_MAX_VOLUME = 500;        // liter, pengaman salah ketik (mis. 51 -> 5100)
const BBM_MAX_HARGA = 100000;      // Rp/liter
const BBM_MAX_ODO_JUMP = 5000;     // km antar-pengisian
const ADMIN_PIN_PROP = 'ADMIN_PIN';
const SESSION_TTL = 8 * 60 * 60;   // 8 jam (detik)

/**
 * Siapkan PIN admin sekali saja. Jalankan manual dari editor:
 *   setupAdminPin('609215Baru')     // ganti PIN lama!
 * PIN lama 609215 sudah bocor di HTML lama — anggap tidak valid lagi.
 */
function setupAdminPin(pin) {
  if (!pin || String(pin).length < 6) throw new Error('PIN minimal 6 karakter.');
  PropertiesService.getScriptProperties().setProperty(ADMIN_PIN_PROP, String(pin));
  return 'PIN admin tersimpan di Script Properties.';
}

/* ---------------------------------------------------------------------------
   1. HELPER UMUM
   --------------------------------------------------------------------------- */

function openDb_() {
  // JANGAN getActiveSpreadsheet(): hanya hidup untuk script container-bound,
  // dan mati total kalau project dipindah/di-copy.
  return SpreadsheetApp.openById('19RBW5gyngf_f2VW98XL8eW97Jh60d0xTDQRLKNzf480');
}

function sheet_(name) {
  const sh = openDb_().getSheetByName(name);
  if (!sh) throw new Error('Sheet "' + name + '" tidak ditemukan.');
  return sh;
}

/**
 * Parser angka yang sadar format Indonesia.
 *   "Rp13.600" -> 13600      (titik = pemisah ribuan)
 *   "51,87"    -> 51.87      (koma  = desimal)
 *   "1.234,56" -> 1234.56
 *   "51.87"    -> 51.87      (titik desimal, bukan pola ribuan)
 */
function toNum_(v) {
  if (typeof v === 'number') return v;
  if (v === null || v === undefined || v === '') return NaN;

  let s = String(v).replace(/[^\d.,-]/g, '');        // buang "Rp", spasi, NBSP
  if (!s) return NaN;

  const hasDot = s.indexOf('.') > -1;
  const hasComma = s.indexOf(',') > -1;

  if (hasDot && hasComma) {
    s = s.replace(/\./g, '').replace(',', '.');       // 1.234,56 -> 1234.56
  } else if (hasComma) {
    s = s.replace(',', '.');                          // 51,87 -> 51.87
  } else if (hasDot) {
    // Hanya titik: bila polanya ribuan (1.234 / 13.600 / 1.234.567) -> buang titik.
    if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  }

  const n = parseFloat(s);
  return isFinite(n) ? n : NaN;
}

/** Nomor baris terakhir yang benar-benar berisi data di kolom A. */
function lastDataRow_(sheet, colIndex) {
  const n = sheet.getLastRow();
  if (n < 2) return 1;
  const vals = sheet.getRange(1, colIndex || 1, n, 1).getValues();
  for (let i = vals.length - 1; i >= 0; i--) {
    if (String(vals[i][0]).trim() !== '') return i + 1;
  }
  return 1;
}

/* ---------------------------------------------------------------------------
   2. LOCK — mencegah dua request menulis bersamaan
   --------------------------------------------------------------------------- */

function withLock_(fn, timeoutMs) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(timeoutMs || 20000)) {
    return { status: 'error', message: 'Server sedang sibuk, coba lagi beberapa detik.' };
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/* ---------------------------------------------------------------------------
   3. VALIDASI + LOOKUP HARGA
   --------------------------------------------------------------------------- */

function findRowBy_(sheetName, key, colIndex) {
  const sh = sheet_(sheetName);
  const last = lastDataRow_(sh, 1);
  if (last < 2) return 0;
  const col = colIndex || 1;
  const vals = sh.getRange(2, col, last - 1, 1).getValues();
  const needle = String(key).trim().toUpperCase();
  for (let i = 0; i < vals.length; i++) {
    if (String(vals[i][0]).trim().toUpperCase() === needle) return i + 2;
  }
  return 0;
}

/** Harga per liter dari MASTER BBM (kolom A jenis, B tipe, C harga). */
function lookupHarga_(jenisBBM) {
  const sh = sheet_('MASTER BBM');
  const last = lastDataRow_(sh, 1);
  if (last < 2) return NaN;
  const rows = sh.getRange(2, 1, last - 1, 3).getValues();
  const needle = String(jenisBBM).trim().toUpperCase();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toUpperCase() === needle) {
      const h = toNum_(rows[i][2]);
      return isFinite(h) ? h : NaN;
    }
  }
  return NaN;
}

/** Odometer terakhir yang tercatat untuk plat tertentu. */
function lastOdo_(plat, excludeRow) {
  const sh = sheet_('BBM');
  const last = lastDataRow_(sh, 1);
  if (last < 2) return 0;
  const rows = sh.getRange(2, 1, last - 1, 10).getValues();
  const needle = String(plat).trim().toUpperCase();
  let max = 0;
  for (let i = 0; i < rows.length; i++) {
    if (excludeRow && i + 2 === excludeRow) continue;
    if (String(rows[i][1]).trim().toUpperCase() !== needle) continue;
    const odo = toNum_(rows[i][9]);
    if (isFinite(odo) && odo > max) max = odo;
  }
  return max;
}

/**
 * Memvalidasi payload dari browser. Mengembalikan objek bersih atau
 * melempar Error dengan pesan yang ramah dibaca user.
 */
function validatePayload_(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Data tidak valid.');

  const plat = String(payload.plat || '').trim().toUpperCase();
  const supir = String(payload.supir || '').trim().toUpperCase();
  const spbu = String(payload.spbu || '').trim();
  const jenis = String(payload.jenisBBM || '').trim().toUpperCase();

  if (!plat) throw new Error('Nomor plat wajib diisi.');
  if (!findRowBy_('DATA ARMADA', plat, 1)) throw new Error('Plat "' + plat + '" tidak ada di DATA ARMADA.');
  if (!supir) throw new Error('Nama supir wajib diisi.');
  if (!findRowBy_('DATA SUPIR', supir, 2)) throw new Error('Supir "' + supir + '" tidak ada di DATA SUPIR.');
  if (!spbu) throw new Error('Lokasi SPBU wajib diisi.');
  if (!jenis) throw new Error('Jenis BBM wajib dipilih.');

  const hargaMaster = lookupHarga_(jenis);
  if (!isFinite(hargaMaster) || hargaMaster <= 0) {
    throw new Error('Harga "' + jenis + '" tidak ditemukan di MASTER BBM.');
  }
  if (hargaMaster > BBM_MAX_HARGA) {
    throw new Error('Harga di MASTER BBM tidak wajar: ' + hargaMaster);
  }

  // Harga dari browser hanya dipakai untuk mendeteksi konflik, bukan sebagai sumber.
  const hargaKirim = toNum_(payload.harga);
  if (isFinite(hargaKirim) && hargaKirim > 0 &&
      Math.abs(hargaKirim - hargaMaster) > 1) {
    throw new Error('Harga di form (Rp' + hargaKirim + ') beda dengan MASTER BBM (Rp' +
      hargaMaster + '). Refresh halaman lalu ulangi.');
  }

  const volume = toNum_(payload.volume);
  if (!isFinite(volume) || volume <= 0) throw new Error('Volume harus angka > 0.');
  if (volume > BBM_MAX_VOLUME) throw new Error('Volume ' + volume + ' L tidak wajar (maks ' + BBM_MAX_VOLUME + ' L).');

  const odo = toNum_(payload.odometer);
  if (!isFinite(odo) || odo <= 0) throw new Error('Odometer harus angka > 0.');
  const odoLalu = lastOdo_(plat);
  if (odoLalu > 0 && odo < odoLalu) {
    throw new Error('Odometer (' + odo + ') lebih kecil dari pengisian terakhir plat ini (' +
      odoLalu + '). Perbaiki angka, atau gunakan menu "Cek Odometer" bila memang reset.');
  }
  if (odoLalu > 0 && odo - odoLalu > BBM_MAX_ODO_JUMP) {
    throw new Error('Lompatan odometer ' + (odo - odoLalu) + ' km tidak wajar (maks ' + BBM_MAX_ODO_JUMP + ').');
  }

  let waktu = new Date();
  if (payload.tanggal) {
    const t = new Date(payload.tanggal);
    if (!isNaN(t.getTime())) waktu = t;
  }
  if (waktu.getTime() > Date.now() + 6 * 3600 * 1000) {
    throw new Error('Tanggal pengisian tidak boleh di masa depan.');
  }

  const img = String(payload.imageString || '');
  if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(img)) {
    throw new Error('Foto struk wajib dilampirkan (JPG/PNG).');
  }
  if (img.length > 6 * 1024 * 1024) {
    throw new Error('Ukuran foto terlalu besar. Kompres dulu sebelum kirim.');
  }

  return {
    plat: plat,
    supir: supir,
    spbu: spbu,
    jenis: jenis,
    tipe: String(payload.tipeBBM || '').trim().toUpperCase(),
    harga: Math.round(hargaMaster),
    volume: Math.round(volume * 100) / 100,
    odometer: Math.round(odo),
    waktu: waktu,
    imageString: img
  };
}

/** Cegah baris identik terkirim dua kali dalam 5 menit. */
function isDuplicate_(v) {
  const sh = sheet_('BBM');
  const last = lastDataRow_(sh, 1);
  if (last < 2) return false;
  const from = Math.max(2, last - 20);
  const rows = sh.getRange(from, 1, last - from + 1, 10).getValues();
  const now = Date.now();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const tgl = r[0] instanceof Date ? r[0].getTime() : NaN;
    if (!isFinite(tgl) || now - tgl > 5 * 60 * 1000) continue;
    if (String(r[1]).trim().toUpperCase() !== v.plat) continue;
    if (Math.abs((toNum_(r[5]) || 0) - v.volume) > 0.001) continue;
    if (Math.abs((toNum_(r[9]) || 0) - v.odometer) > 0.5) continue;
    return true;
  }
  return false;
}

/* ---------------------------------------------------------------------------
   4. GANTI simpanData() LAMA DENGAN VERSI INI
   --------------------------------------------------------------------------- */

function simpanData(payload) {
  return withLock_(function () {
    try {
      const v = validatePayload_(payload);
      if (isDuplicate_(v)) {
        return { status: 'error', message: 'Transaksi yang sama baru saja tersimpan. Cek History.' };
      }

      /* --- upload struk: privat, hanya link yang bisa dibagikan --- */
      let fileUrl = '';
      const folder = getFolderStruk();
      const base = v.plat.replace(/\s+/g, '_') + '_' + v.supir.replace(/\s+/g, '_') + '_' +
                   Utilities.formatDate(v.waktu, getTz_(), 'yyyyMMdd-HHmmss');
      const mime = v.imageString.split(':')[1].split(';')[0];
      const ext = mime.indexOf('png') > -1 ? 'png' : 'jpg';
      const bytes = Utilities.base64Decode(v.imageString.split(',')[1]);
      const file = folder.createFile(Utilities.newBlob(bytes, mime, base + '.' + ext));
      fileUrl = file.getUrl();

      /* --- tulis A..K secara eksplisit, JANGAN appendRow melebihi 11 kolom --- */
      const sh = sheet_('BBM');
      const row = Math.max(lastDataRow_(sh, 1) + 1, 2);
      sh.getRange(row, COL.TANGGAL, 1, 11).setValues([[
        v.waktu,                              // A  Date asli (bukan string!)
        v.plat,                               // B
        v.supir,                              // C
        v.spbu,                               // D
        v.harga,                              // E  dari MASTER BBM
        v.volume,                             // F
        Math.round(v.harga * v.volume),       // G
        v.tipe,                               // H
        v.jenis,                              // I
        v.odometer,                           // J
        fileUrl                               // K
      ]]);

      sh.getRange(row, COL.TANGGAL).setNumberFormat('dd/MM/yyyy HH:mm');
      sh.getRange(row, COL.STATUS_DATA).setValue('AKTIF');
      sh.getRange(row, COL.CREATED_AT).setValue(new Date());

      /* --- invalidasi cache dashboard --- */
      try { CacheService.getScriptCache().remove('dash'); } catch (e) {}

      return {
        status: 'success',
        message: 'Transaksi berhasil disimpan!',
        rowId: row,
        total: Math.round(v.harga * v.volume)
      };
    } catch (error) {
      return { status: 'error', message: error.message || String(error) };
    }
  });
}

/* ---------------------------------------------------------------------------
   5. LOGIN ADMIN BERBASIS TOKEN (menggantikan PIN di HTML)
   --------------------------------------------------------------------------- */

function loginAdmin_(pin) {
  const stored = PropertiesService.getScriptProperties().getProperty(ADMIN_PIN_PROP);
  if (!stored) {
    return { status: 'error', message: 'PIN admin belum diset. Jalankan setupAdminPin().' };
  }
  if (String(pin || '').trim() !== stored) {
    Utilities.sleep(400);                                  // perlambat brute force
    return { status: 'error', message: 'PIN salah.' };
  }
  const token = Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('sess:' + token, 'admin', SESSION_TTL);
  return { status: 'success', token: token, ttl: SESSION_TTL };
}

function requireToken_(token) {
  const key = 'sess:' + String(token || '');
  if (!CacheService.getScriptCache().get(key)) {
    throw new Error('Sesi tidak valid atau kedaluwarsa. Silakan login ulang.');
  }
  CacheService.getScriptCache().put(key, 'admin', SESSION_TTL);  // sliding
  return true;
}

/**
 * Contoh penerapan pada fungsi master data:
 *
 *   function editMasterData(sheetName, rowId, colDataArray, token) {
 *     try { requireToken_(token); } catch (e) { return { status: 'error', message: e.message }; }
 *     ... isi lama ...
 *   }
 *
 * Terapkan requireToken_ pada: editMasterData, deleteMasterDataAction,
 * saveMasterRow, addMasterRow, dan addMasterData.
 * getDashboardData / getHistoryData / getDropdownData / simpanData TIDAK
 * perlu token kalau form input memang untuk publik.
 * --------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------
   6. FILTER DATA YANG DIHAPUS (pakai kolom STATUS_DATA)
   --------------------------------------------------------------------------- */

/** true bila baris masih aktif (atau kolom S belum ada sama sekali). */
function isActiveRow_(row) {
  const s = row[COL.STATUS_DATA - 1];
  if (s === '' || s === null || s === undefined) return true;   // data lama
  return String(s).trim().toUpperCase() !== 'DELETED';
}

/*
  Lalu di getDashboardData() dan getHistoryData(), tambahkan filter:
      .filter(isActiveRow_)
  setelah getValues(). Ini menyamakan angka History dan Dashboard
  (sebelumnya History memfilter, Dashboard tidak).
*/

/* ---------------------------------------------------------------------------
   7. PERBAIKAN RUMUS EFISIENSI (bias KM/L)
   --------------------------------------------------------------------------- */

/**
 * Ganti blok:
 *     const aktualGlobalKML = calcKML(totalJarakGlobal, stats.globalVol);
 * dengan pembagi yang hanya memuat volume dari baris ber-odometer:
 */
function hitungKMLGlobal_(totalJarakGlobal, carsOdoData) {
  let volBerOdo = 0;
  Object.keys(carsOdoData).forEach(function (plat) {
    carsOdoData[plat].forEach(function (r) { volBerOdo += (Number(r.vol) || 0); });
  });
  return volBerOdo > 0 ? totalJarakGlobal / volBerOdo : 0;
}

/* ---------------------------------------------------------------------------
   8. SCRIPT PROPERTIES YANG DISARANKAN
   ---------------------------------------------------------------------------
   ADMIN_PIN          -> lewat setupAdminPin()
   SPREADSHEET_ID     -> pindahkan ID hardcoded ke sini setelah stabil
   ADMIN_EMAILS       -> daftar email yang boleh membuka deployment admin

   Contoh pembacaan:
     PropertiesService.getScriptProperties().getProperty('ADMIN_EMAILS')
   --------------------------------------------------------------------------- */
