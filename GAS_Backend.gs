// =================================================================================
// GOOGLE APPS SCRIPT BACKEND (API) UNTUK PR & PO SYSTEM
// =================================================================================

const SPREADSHEET_ID = '1Ne5xeN2zEmScf9CVX5x9WguQZPM0Vk6dzQJ-n7xRfWU';
const TEMPLATE_PR_ID = '1dNTmJEUxtXHyI044udxsKE6BBg1gnuJy55i2DzyuP9A';
const TEMPLATE_PO_ID = '14vYhIYIofui-HEY7rTo7oWD_DpGVPCLfj5atDKEpRio';
const FOLDER_PR_ID = '1GjYzgLWqoCt6FzihhD6q5xsv0MYYRb0c';
const FOLDER_PO_ID = '1N6GwnHBE-RZcsTI1cbzmsWG-_zslN0qE';

// ---------------------------------------------------------------------------------
// 1. SETUP WEB APP (CORS ENABLED)
// ---------------------------------------------------------------------------------
function doPost(e) {
  return handleRequest(e, 'POST');
}

function doGet(e) {
  return handleRequest(e, 'GET');
}

function handleRequest(e, method) {
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);
  
  // Tangani preflight OPTIONS request (CORS) - Namun Apps script otomatis handle GET/POST via JSONP atau direct redirect
  
  try {
    let params;
    if (method === 'POST') {
      if (!e.postData || !e.postData.contents) {
         throw new Error("No payload data.");
      }
      params = JSON.parse(e.postData.contents);
    } else {
      params = e.parameter;
    }

    const action = params.action;
    let result = { success: false, message: "Aksi tidak ditemukan" };

    switch(action) {
      case "login":
        result = doLogin(params.username, params.password);
        break;
      case "getUsers":
        result = getUsers();
        break;
      case "getMasterStock":
        result = getMasterStock();
        break;
      case "getPRs":
        result = getPRs();
        break;
      case "getPOs":
        result = getPOs();
        break;
      case "createPR":
        result = createPR(params.payload);
        break;
      case "createPO":
        result = createPO(params.payload);
        break;
      case "approvePR":
        result = approvePR(params.payload);
        break;
      case "finishPR":
        result = finishPR(params.payload);
        break;
      default:
        result = { success: false, message: `Aksi [${action}] tidak valid.` };
    }

    output.setContent(JSON.stringify(result));
    return output;
  } catch (error) {
    output.setContent(JSON.stringify({ success: false, message: error.toString() }));
    return output;
  }
}

// ---------------------------------------------------------------------------------
// 2. LOGIC FUNCTIONS (DATABASE BACA/TULIS)
// ---------------------------------------------------------------------------------
function doLogin(username, password) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('User_Role');
  if (!sheet) throw new Error('Sheet User_Role tidak ditemukan');
  
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString().trim() === username.toString().trim() && 
        data[i][1].toString().trim() === password.toString().trim()) {
      return {
        success: true,
        user: {
          username: data[i][0],
          displayName: data[i][2],
          division: data[i][3],
          divisionCode: data[i][4],
          wa: data[i][5],
          role: data[i][6],
          access: data[i][7]
        }
      };
    }
  }
  return { success: false, message: 'Username atau Password salah' };
}

function getUsers() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('User_Role');
  if (!sheet) return { success: true, data: [] };
  
  const data = sheet.getDataRange().getValues();
  const users = [];
  for (let i = 1; i < data.length; i++) {
    users.push({
      username: data[i][0],
      password: data[i][1],
      fullName: data[i][2],
      division: data[i][3],
      divCode: data[i][4],
      wa: data[i][5],
      role: data[i][6],
      access: data[i][7]
    });
  }
  return { success: true, data: users };
}

function getMasterStock() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Master_Stock');
  if (!sheet) return { success: true, data: [] };
  
  const data = sheet.getDataRange().getValues();
  const stocks = [];
  for (let i = 1; i < data.length; i++) {
    stocks.push({
      name: data[i][0],
      category: data[i][1],
      supplier: data[i][2],
      unit: data[i][3],
      price: data[i][4]
    });
  }
  return { success: true, data: stocks };
}

function getPRs() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Rekap_PR');
  if (!sheet) return { success: true, data: [] };
  
  const data = sheet.getDataRange().getValues();
  const prs = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    prs.push({
      id: data[i][0],
      date: data[i][1],
      requester: data[i][2],
      division: data[i][3],
      supplier: data[i][4],
      itemName: data[i][5],
      unit: data[i][6],
      qty: data[i][7],
      stockOnhand: data[i][8],
      avgSales: data[i][9],
      notes: data[i][10],
      status: data[i][11],
      mgrApproval: data[i][12],
      dirApproval: data[i][13],
      pdfLink: data[i][14],
      poNo: data[i][15],
      b1: data[i][16],
      b2: data[i][17],
      b3: data[i][18]
    });
  }
  
  // Reverse to make newest on top
  return { success: true, data: prs.reverse() };
}

function getPOs() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Rekap_PO');
  if (!sheet) return { success: true, data: [] };
  
  const data = sheet.getDataRange().getValues();
  const pos = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][2]) continue;
    pos.push({
      prId: data[i][0],
      purchaseName: data[i][1],
      poNo: data[i][2],
      date: data[i][3],
      deliveryDate: data[i][4],
      supplier: data[i][5],
      itemName: data[i][6],
      unit: data[i][7],
      qty: data[i][8],
      price: data[i][9],
      totalPrice: data[i][10],
      notes: data[i][11],
      pdfLink: data[i][12],
      status: data[i][13],
      divisi: data[i][14],
      subTotal: data[i][15],
      discount: data[i][16],
      tax: data[i][17],
      others: data[i][18],
      grandTotal: data[i][19],
      discountPercent: data[i][20],
      taxPercent: data[i][21]
    });
  }
  return { success: true, data: pos.reverse() };
}

// ---------------------------------------------------------------------------------
// 3. TRANSACTION LOGIC (CREATE PR & PO + PDF GENERATION)
// ---------------------------------------------------------------------------------
function createPR(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Rekap_PR');
  
  // 1. Generate PR Number
  const data = sheet.getDataRange().getValues();
  let maxNum = 0;
  for (let i = 1; i < data.length; i++) {
    const prStr = String(data[i][0]);
    const match = prStr.match(/^PR(\d+)/);
    if (match) {
      const num = parseInt(match[1]);
      if (num > maxNum) maxNum = num;
    }
  }
  const nextNum = maxNum + 1;
  const prId = `PR${String(nextNum).padStart(4, '0')}/${payload.divCode}/V/2026`;
  
  // 2. Determine Date
  const dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  
  // 3. Generate PDF and get Link
  let pdfLink = "";
  try {
     pdfLink = generatePRPdf(prId, dateStr, payload);
  } catch (e) {
     Logger.log("Error create PDF PR: " + e.message);
  }

  // 4. Save to Sheets
  const rowsToAppend = payload.items.map(item => [
    prId,
    dateStr,
    payload.requester,
    payload.division,
    payload.supplier,
    item.itemName,
    item.unit,
    item.qty,
    item.stockOnhand,
    item.avgSales,
    payload.notes || "",
    "WAITING MANAGER APPROVAL",
    "", // MGR
    "", // DIR
    pdfLink, // PDF URL
    "", // PO No
    item.b1 || 0,
    item.b2 || 0,
    item.b3 || 0
  ]);
  
  // Append PR Detail to Rekap_PR
  if (rowsToAppend.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAppend.length, rowsToAppend[0].length).setValues(rowsToAppend);
  }
  
  return { success: true, pr: { id: prId, pdfLink: pdfLink } };
}

function approvePR(payload) {
  const { prId, role, user, action, reason } = payload;
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Rekap_PR');
  const data = sheet.getDataRange().getValues();
  
  let newStatus = "";
  if (action === "REJECT") newStatus = "Rejected";
  else if (action === "PENDING") {
    const roleUp = String(role || "").toUpperCase();
    newStatus = roleUp === "MANAGER" || roleUp === "MGR" ? "WAITING MANAGER APPROVAL" : "WAITING DIREKTUR APPROVAL";
  } else {
    const roleUp = String(role || "").toUpperCase();
    if (roleUp === "MANAGER" || roleUp === "MGR") newStatus = "WAITING DIREKTUR APPROVAL";
    else if (roleUp === "DIREKTUR" || roleUp === "DIR") newStatus = "APPROVED";
    else newStatus = "APPROVED";
  }
  
  const cleanPrId = String(prId || "").trim().toUpperCase();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toUpperCase() === cleanPrId) {
      sheet.getRange(i + 1, 12).setValue(newStatus); // L
      if (reason) sheet.getRange(i + 1, 11).setValue(reason); // K
      
      const roleUp = String(role || "").toUpperCase();
      if (action === "APPROVE") {
        if (roleUp === "MANAGER" || roleUp === "MGR") sheet.getRange(i + 1, 13).setValue(`Approved by ${user}`); // M
        if (roleUp === "DIREKTUR" || roleUp === "DIR") sheet.getRange(i + 1, 14).setValue(`Approved by ${user}`); // N
      } else if (action === "REJECT") {
        if (roleUp === "MANAGER" || roleUp === "MGR") sheet.getRange(i + 1, 13).setValue(`Rejected by ${user}`);
        if (roleUp === "DIREKTUR" || roleUp === "DIR") sheet.getRange(i + 1, 14).setValue(`Rejected by ${user}`);
      }
    }
  }
  
  return { success: true, newStatus };
}

function createPO(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheetPO = ss.getSheetByName('Rekap_PO');
  const sheetPR = ss.getSheetByName('Rekap_PR');
  
  // 1. Generate PO Number
  const data = sheetPO.getDataRange().getValues();
  let maxNum = 0;
  for (let i = 1; i < data.length; i++) {
    const match = String(data[i][2]).match(/(\d+)$/);
    if (match) {
      const num = parseInt(match[1]);
      if (num > maxNum) maxNum = num;
    }
  }
  const poNo = `PO/SAU/05/2026/${String(maxNum + 1).padStart(4, '0')}`;
  
  // 2. Generate PDF
  const dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  let pdfLink = "";
  try {
     pdfLink = generatePOPdf(poNo, dateStr, payload);
  } catch (e) {
     Logger.log("Error create PDF PO: " + e.message);
  }
  
  // 3. Save to Sheets
  const rowsToAppend = payload.items.map(item => [
    payload.prId,
    payload.purchaseName,
    poNo,
    dateStr,
    payload.deliveryDate,
    payload.supplier,
    item.itemName,
    item.unit,
    item.qty,
    item.price,
    item.qty * item.price,
    payload.notes || "",
    pdfLink, // PDF PO
    "PROCESSED",
    payload.division,
    payload.subTotal || 0,
    payload.discount || 0,
    payload.tax || 0,
    payload.others || 0,
    payload.grandTotal || 0,
    payload.discountPercent || 0,
    payload.taxPercent || 0
  ]);
  
  if (rowsToAppend.length > 0) {
    sheetPO.getRange(sheetPO.getLastRow() + 1, 1, rowsToAppend.length, rowsToAppend[0].length).setValues(rowsToAppend);
  }
  
  // 4. Update Status PR to PROCESSED
  const prData = sheetPR.getDataRange().getValues();
  const cleanPrId = String(payload.prId || "").trim().toUpperCase();
  for (let i = 1; i < prData.length; i++) {
    if (String(prData[i][0]).trim().toUpperCase() === cleanPrId) {
      sheetPR.getRange(i + 1, 12).setValue("PROCESSED");
      sheetPR.getRange(i + 1, 16).setValue(poNo);
    }
  }
  
  return { success: true, po: { id: poNo, pdfLink: pdfLink } };
}

function finishPR(payload) {
  const { prId } = payload;
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Rekap_PR');
  const data = sheet.getDataRange().getValues();
  
  const cleanPrId = String(prId || "").trim().toUpperCase();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toUpperCase() === cleanPrId) {
      sheet.getRange(i + 1, 12).setValue("FINISH");
    }
  }
  return { success: true };
}

// ---------------------------------------------------------------------------------
// 4. PDF GENERATION LOGIC
// ---------------------------------------------------------------------------------

function replaceTextInDoc(doc, body, searchText, replacement) {
  // Hanya melakukan replace jika teks pencarian ditemukan
  try {
    body.replaceText(searchText, replacement);
  } catch(e) {}
}

function generatePRPdf(prId, dateStr, payload) {
  // 1. Copy Template
  const templateFile = DriveApp.getFileById(TEMPLATE_PR_ID);
  const prFolder = DriveApp.getFolderById(FOLDER_PR_ID);
  
  const cleanFileName = prId.replace(/\//g, '_');
  const tempFile = templateFile.makeCopy(`TEMP_${cleanFileName}`, prFolder);
  const tempDocId = tempFile.getId();
  
  // 2. Manipulate Docs
  const doc = DocumentApp.openById(tempDocId);
  const body = doc.getBody();
  
  const totalQty = payload.items.reduce((sum, item) => sum + Number(item.qty || 0), 0);
  const estimasiText = `( Stock untuk penjualan ` + payload.items.map((item) => {
    const avg = Number(item.avgSales || 0);
    if (!avg || avg === 0) return `0 hari (Item: ${item.itemName})`;
    const days = Math.round((Number(item.qty) * 30) / avg);
    return `${days} hari (Item: ${item.itemName})`;
  }).join(", ") + ` )`;
  
  // General Variables
  replaceTextInDoc(doc, body, '{{No_PR}}', prId);
  replaceTextInDoc(doc, body, '{{Tanggal_Order}}', dateStr);
  replaceTextInDoc(doc, body, '{{Nama_Peminta}}', payload.requester);
  replaceTextInDoc(doc, body, '{{Divisi}}', payload.division);
  replaceTextInDoc(doc, body, '{{Nama Supplier}}', payload.supplier);
  replaceTextInDoc(doc, body, '{{Catatan}}', payload.notes || "-");
  replaceTextInDoc(doc, body, 'SUM{{Qty}}', String(totalQty));
  replaceTextInDoc(doc, body, '{{Estimasi}}', estimasiText);
  
  // Mapping Items to Table Placeholder (Maks 10 item)
  for (let i = 0; i < 10; i++) {
    const idx = i + 1;
    if (i < payload.items.length) {
      const item = payload.items[i];
      replaceTextInDoc(doc, body, `{{No_${idx}}}`, String(idx));
      replaceTextInDoc(doc, body, `{{Nama_Barang_${idx}}}`, item.itemName);
      replaceTextInDoc(doc, body, `{{Satuan_${idx}}}`, item.unit);
      replaceTextInDoc(doc, body, `{{Qty_${idx}}}`, String(item.qty));
      replaceTextInDoc(doc, body, `{{Stock_${idx}}}`, String(item.stockOnhand || 0));
      replaceTextInDoc(doc, body, `{{Avg_${idx}}}`, String(Number(item.avgSales || 0).toFixed(1)));
      replaceTextInDoc(doc, body, `{{B1_${idx}}}`, String(item.b1 || 0));
      replaceTextInDoc(doc, body, `{{B2_${idx}}}`, String(item.b2 || 0));
      replaceTextInDoc(doc, body, `{{B3_${idx}}}`, String(item.b3 || 0));
    } else {
      replaceTextInDoc(doc, body, `{{No_${idx}}}`, "");
      replaceTextInDoc(doc, body, `{{Nama_Barang_${idx}}}`, "");
      replaceTextInDoc(doc, body, `{{Satuan_${idx}}}`, "");
      replaceTextInDoc(doc, body, `{{Qty_${idx}}}`, "");
      replaceTextInDoc(doc, body, `{{Stock_${idx}}}`, "");
      replaceTextInDoc(doc, body, `{{Avg_${idx}}}`, "");
      replaceTextInDoc(doc, body, `{{B1_${idx}}}`, "");
      replaceTextInDoc(doc, body, `{{B2_${idx}}}`, "");
      replaceTextInDoc(doc, body, `{{B3_${idx}}}`, "");
    }
  }
  
  // Simpan dan Tutup Document
  doc.saveAndClose();
  
  // 3. Export to PDF
  const pdfBlob = tempFile.getAs('application/pdf');
  pdfBlob.setName(`${cleanFileName}.pdf`);
  
  // 4. Save PDF to Folder & set Permission
  const finalPdfFile = prFolder.createFile(pdfBlob);
  finalPdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  
  // 5. Cleanup Temp Doc
  try {
     tempFile.setTrashed(true);
  } catch(e) {}
  
  return finalPdfFile.getUrl();
}

function generatePOPdf(poNo, dateStr, payload) {
  // 1. Copy Template
  const templateFile = DriveApp.getFileById(TEMPLATE_PO_ID);
  const poFolder = DriveApp.getFolderById(FOLDER_PO_ID);
  
  const cleanFileName = poNo.replace(/\//g, '_');
  const tempFile = templateFile.makeCopy(`TEMP_${cleanFileName}`, poFolder);
  const tempDocId = tempFile.getId();
  
  // 2. Manipulate Docs
  const doc = DocumentApp.openById(tempDocId);
  const body = doc.getBody();
  
  // Format mata uang Rupiah
  const formatRp = (num) => "Rp " + Number(num).toLocaleString('id-ID');
  
  // General Variables
  replaceTextInDoc(doc, body, '{{PEMINTA}}', payload.purchaseName);
  replaceTextInDoc(doc, body, '{{NO_PO}}', poNo);
  replaceTextInDoc(doc, body, '{{TANGGAL}}', dateStr);
  replaceTextInDoc(doc, body, '{{DIVISI}}', payload.division || "-");
  replaceTextInDoc(doc, body, '{{SUPPLIER}}', payload.supplier);
  replaceTextInDoc(doc, body, '{{CATATAN}}', payload.notes || "-");
  
  replaceTextInDoc(doc, body, '{{SUBTOTAL}}', formatRp(payload.subTotal || 0));
  replaceTextInDoc(doc, body, '{{DISKON}}', formatRp(payload.discount || 0));
  replaceTextInDoc(doc, body, '{{DISKON_PERSEN}}', `${payload.discountPercent || 0}%`);
  replaceTextInDoc(doc, body, '{{PAJAK}}', formatRp(payload.tax || 0));
  replaceTextInDoc(doc, body, '{{PAJAK_PERSEN}}', `${payload.taxPercent || 0}%`);
  replaceTextInDoc(doc, body, '{{OTHERS}}', formatRp(payload.others || 0));
  replaceTextInDoc(doc, body, 'SUM{{TOTAL}}', formatRp(payload.grandTotal || 0));
  
  // Mapping Items to Table Placeholder (Maks 10 item)
  for (let i = 0; i < 10; i++) {
    const idx = i + 1;
    if (i < payload.items.length) {
      const item = payload.items[i];
      const totalItem = item.qty * item.price;
      replaceTextInDoc(doc, body, `{{NO_${idx}}}`, String(idx));
      replaceTextInDoc(doc, body, `{{NAMA_BARANG_${idx}}}`, item.itemName);
      replaceTextInDoc(doc, body, `{{SATUAN_${idx}}}`, item.unit || "PCS");
      replaceTextInDoc(doc, body, `{{QTY_${idx}}}`, String(item.qty));
      replaceTextInDoc(doc, body, `{{HARGA_${idx}}}`, formatRp(item.price));
      replaceTextInDoc(doc, body, `{{TOTAL_${idx}}}`, formatRp(totalItem));
    } else {
      replaceTextInDoc(doc, body, `{{NO_${idx}}}`, "");
      replaceTextInDoc(doc, body, `{{NAMA_BARANG_${idx}}}`, "");
      replaceTextInDoc(doc, body, `{{SATUAN_${idx}}}`, "");
      replaceTextInDoc(doc, body, `{{QTY_${idx}}}`, "");
      replaceTextInDoc(doc, body, `{{HARGA_${idx}}}`, "");
      replaceTextInDoc(doc, body, `{{TOTAL_${idx}}}`, "");
    }
  }
  
  doc.saveAndClose();
  
  // 3. Export to PDF
  const pdfBlob = tempFile.getAs('application/pdf');
  pdfBlob.setName(`${cleanFileName}.pdf`);
  
  // 4. Save PDF to Folder & set Permission
  const finalPdfFile = poFolder.createFile(pdfBlob);
  finalPdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  
  // 5. Cleanup
  try {
     tempFile.setTrashed(true);
  } catch(e) {}
  
  return finalPdfFile.getUrl();
}
