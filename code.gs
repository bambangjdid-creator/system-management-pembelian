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
  const sheetHeader = ss.getSheetByName('PR_Header');
  const sheetDetail = ss.getSheetByName('PR_Detail');
  if (!sheetHeader || !sheetDetail) return { success: true, data: [] };
  
  const headersData = sheetHeader.getDataRange().getValues();
  const detailsData = sheetDetail.getDataRange().getValues();
  
  const headersMap = {};
  for (let i = 1; i < headersData.length; i++) {
    const prId = headersData[i][0];
    if (!prId) continue;
    headersMap[prId] = {
      rowIndex: i + 1,
      prId: prId,
      date: headersData[i][1],
      requester: headersData[i][2],
      division: headersData[i][3],
      supplier: headersData[i][4],
      notes: headersData[i][5],
      status: headersData[i][6],
      mgrApproval: headersData[i][7],
      dirApproval: headersData[i][8],
      pdfLink: headersData[i][9],
      poNo: headersData[i][10]
    };
  }
  
  const prs = [];
  for (let i = 1; i < detailsData.length; i++) {
    const prId = detailsData[i][1];
    const header = headersMap[prId];
    if (!header) continue;
    
    prs.push({
      rowIndex: i + 1,
      detailRowIndex: i + 1,
      headerRowIndex: header.rowIndex,
      detailId: detailsData[i][0],
      id: prId,
      date: header.date,
      requester: header.requester,
      division: header.division,
      supplier: header.supplier,
      itemName: detailsData[i][2],
      unit: detailsData[i][3],
      qty: detailsData[i][4],
      stockOnhand: detailsData[i][5],
      avgSales: detailsData[i][6],
      notes: header.notes,
      status: header.status,
      mgrApproval: header.mgrApproval,
      dirApproval: header.dirApproval,
      pdfLink: header.pdfLink || "",
      poNo: header.poNo,
      b1: detailsData[i][7],
      b2: detailsData[i][8],
      b3: detailsData[i][9]
    });
  }
  
  return { success: true, data: prs.reverse() };
}

function getPOs() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheetHeader = ss.getSheetByName('PO_Header');
  const sheetDetail = ss.getSheetByName('PO_Detail');
  if (!sheetHeader || !sheetDetail) return { success: true, data: [] };
  
  const headersData = sheetHeader.getDataRange().getValues();
  const detailsData = sheetDetail.getDataRange().getValues();
  
  const headersMap = {};
  for (let i = 1; i < headersData.length; i++) {
    const poNo = headersData[i][0];
    if (!poNo) continue;
    headersMap[poNo] = {
      rowIndex: i + 1,
      poNo: poNo,
      prId: headersData[i][1],
      purchaseName: headersData[i][2],
      date: headersData[i][3],
      deliveryDate: headersData[i][4],
      supplier: headersData[i][5],
      division: headersData[i][6],
      notes: headersData[i][7],
      pdfLink: headersData[i][8],
      status: headersData[i][9],
      subTotal: headersData[i][10],
      discount: headersData[i][11],
      discountPercent: headersData[i][12],
      tax: headersData[i][13],
      taxPercent: headersData[i][14],
      others: headersData[i][15],
      grandTotal: headersData[i][16]
    };
  }
  
  const pos = [];
  for (let i = 1; i < detailsData.length; i++) {
    const poNo = detailsData[i][1];
    const header = headersMap[poNo];
    if (!header) continue;
    
    pos.push({
      rowIndex: i + 1,
      detailRowIndex: i + 1,
      headerRowIndex: header.rowIndex,
      detailId: detailsData[i][0],
      prId: header.prId,
      purchaseName: header.purchaseName,
      poNo: poNo,
      date: header.date,
      deliveryDate: header.deliveryDate,
      supplier: header.supplier,
      itemName: detailsData[i][2],
      unit: detailsData[i][3],
      qty: detailsData[i][4],
      price: detailsData[i][5],
      totalPrice: detailsData[i][6],
      notes: header.notes,
      pdfLink: header.pdfLink,
      status: header.status,
      division: header.division,
      discount: header.discount,
      tax: header.tax,
      others: header.others,
      grandTotal: header.grandTotal,
      discountPercent: header.discountPercent,
      taxPercent: header.taxPercent
    });
  }
  return { success: true, data: pos.reverse() };
}

function createPR(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheetHeader = ss.getSheetByName('PR_Header');
  const sheetDetail = ss.getSheetByName('PR_Detail');
  
  // 1. Generate PR Number with Year Filter
  const headersData = sheetHeader.getDataRange().getValues();
  const now = new Date();
  const yearSuffix = Utilities.formatDate(now, Session.getScriptTimeZone(), "yy");
  let maxNum = 0;
  for (let i = 1; i < headersData.length; i++) {
    const prStr = String(headersData[i][0]);
    const match = prStr.match(/^PB-(\d+)-(\d{2})$/);
    if (match) {
      const num = parseInt(match[1], 10);
      const yr = match[2];
      if (yr === yearSuffix) {
        if (num > maxNum) maxNum = num;
      }
    }
  }
  const nextNum = maxNum + 1;
  const prId = `PB-${String(nextNum).padStart(10, '0')}-${yearSuffix}`;
  
  // 2. Determine Date
  const dateStr = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd");
  
  // 3. Generate PDF and get Link
  let pdfLink = "";
  try {
     pdfLink = generatePRPdf(prId, dateStr, payload);
  } catch (e) {
     Logger.log("Error create PDF PR: " + e.message);
  }

  // 4. Save to PR_Header
  sheetHeader.appendRow([
    prId,
    dateStr,
    payload.requester,
    payload.division,
    payload.supplier,
    payload.notes || "",
    "WAITING MANAGER APPROVAL",
    "", // MGR
    "", // DIR
    pdfLink, // PDF URL
    "" // PO No
  ]);
  
  // 5. Save to PR_Detail
  const detailsData = sheetDetail.getDataRange().getValues();
  let maxDNum = 0;
  for (let i = 1; i < detailsData.length; i++) {
    const match = String(detailsData[i][0]).match(/^PRD(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxDNum) maxDNum = num;
    }
  }
  
  payload.items.forEach((item, index) => {
    const dId = `PRD${String(maxDNum + 1 + index).padStart(7, '0')}`;
    const avgSales = item.avgSales ?? ((Number(item.b1 || 0) + Number(item.b2 || 0) + Number(item.b3 || 0)) / 3);
    sheetDetail.appendRow([
      dId,
      prId,
      item.itemName,
      item.unit,
      item.qty,
      item.stockOnhand || 0,
      avgSales,
      item.b1 || 0,
      item.b2 || 0,
      item.b3 || 0
    ]);
  });
  
  return { success: true, pr: { id: prId, pdfLink: pdfLink } };
}

function approvePR(payload) {
  const { prId, role, user, action, reason } = payload;
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheetHeader = ss.getSheetByName('PR_Header');
  const data = sheetHeader.getDataRange().getValues();
  
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
      sheetHeader.getRange(i + 1, 7).setValue(newStatus); // Column G (Status)
      if (reason) sheetHeader.getRange(i + 1, 6).setValue(reason); // Column F (Notes)
      
      const roleUp = String(role || "").toUpperCase();
      if (action === "APPROVE") {
        if (roleUp === "MANAGER" || roleUp === "MGR") sheetHeader.getRange(i + 1, 8).setValue(`Approved by ${user}`); // Column H (MGR_APPROVAL)
        if (roleUp === "DIREKTUR" || roleUp === "DIR") sheetHeader.getRange(i + 1, 9).setValue(`Approved by ${user}`); // Column I (DIR_APPROVAL)
      } else if (action === "REJECT") {
        if (roleUp === "MANAGER" || roleUp === "MGR") sheetHeader.getRange(i + 1, 8).setValue(`Rejected by ${user}`);
        if (roleUp === "DIREKTUR" || roleUp === "DIR") sheetHeader.getRange(i + 1, 9).setValue(`Rejected by ${user}`);
      }
    }
  }
  
  return { success: true, newStatus };
}

function createPO(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheetHeader = ss.getSheetByName('PO_Header');
  const sheetDetail = ss.getSheetByName('PO_Detail');
  const sheetPR = ss.getSheetByName('PR_Header');
  
  // 1. Generate PO Number with Year Filter
  const headersData = sheetHeader.getDataRange().getValues();
  const now = new Date();
  const yearSuffix = Utilities.formatDate(now, Session.getScriptTimeZone(), "yy");
  let maxNum = 0;
  for (let i = 1; i < headersData.length; i++) {
    const poNoStr = String(headersData[i][0]);
    const match = poNoStr.match(/^BL-(\d+)-(\d{2})$/);
    if (match) {
      const num = parseInt(match[1], 10);
      const yr = match[2];
      if (yr === yearSuffix) {
        if (num > maxNum) maxNum = num;
      }
    }
  }
  const nextNum = maxNum + 1;
  const poNo = `BL-${String(nextNum).padStart(9, '0')}-${yearSuffix}`;
  
  // 2. Generate PDF
  const dateStr = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd");
  let pdfLink = "";
  try {
     pdfLink = generatePOPdf(poNo, dateStr, payload);
  } catch (e) {
     Logger.log("Error create PDF PO: " + e.message);
  }
  
  // 3. Save to PO_Header (Spreadsheet order)
  sheetHeader.appendRow([
    poNo,
    payload.prId,
    payload.purchaseName,
    dateStr,
    payload.deliveryDate,
    payload.supplier,
    payload.division || "",
    payload.notes || "",
    pdfLink,
    "PROCESSED",
    payload.subTotal || 0,
    payload.discount || 0,
    payload.discountPercent || 0,
    payload.tax || 0,
    payload.taxPercent || 0,
    payload.others || 0,
    payload.grandTotal || 0
  ]);
  
  // 4. Save to PO_Detail (Spreadsheet order: POD ID, PO No, Item Name, Unit, Qty, Price, Total Price)
  const detailsData = sheetDetail.getDataRange().getValues();
  let maxDNum = 0;
  for (let i = 1; i < detailsData.length; i++) {
    const match = String(detailsData[i][0]).match(/^POD(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxDNum) maxDNum = num;
    }
  }
  
  payload.items.forEach((item, index) => {
    const dId = `POD${String(maxDNum + 1 + index).padStart(7, '0')}`;
    sheetDetail.appendRow([
      dId,
      poNo,
      item.itemName,
      item.unit || "PCS",
      item.qty,
      item.price,
      item.qty * item.price
    ]);
  });
  
  // 5. Update Status PR to PROCESSED
  const prData = sheetPR.getDataRange().getValues();
  const cleanPrId = String(payload.prId || "").trim().toUpperCase();
  for (let i = 1; i < prData.length; i++) {
    if (String(prData[i][0]).trim().toUpperCase() === cleanPrId) {
      sheetPR.getRange(i + 1, 7).setValue("PROCESSED"); // Column G (Status)
      sheetPR.getRange(i + 1, 11).setValue(poNo); // Column K (PO No)
    }
  }
  
  return { success: true, po: { id: poNo, pdfLink: pdfLink } };
}

function finishPR(payload) {
  const { prId } = payload;
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheetHeader = ss.getSheetByName('PR_Header');
  const data = sheetHeader.getDataRange().getValues();
  
  const cleanPrId = String(prId || "").trim().toUpperCase();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toUpperCase() === cleanPrId) {
      sheetHeader.getRange(i + 1, 7).setValue("FINISH"); // Column G (Status)
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
