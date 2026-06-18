import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import { google } from "googleapis";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

import PDFDocument from "pdfkit";

const app = express();
const PORT = 3000;
const PDF_DIR = path.join(process.cwd(), "PR_PDF");
const PO_PDF_DIR = path.join(process.cwd(), "PO_PDF");

if (!fs.existsSync(PDF_DIR)) {
  fs.mkdirSync(PDF_DIR);
}
if (!fs.existsSync(PO_PDF_DIR)) {
  fs.mkdirSync(PO_PDF_DIR);
}

app.use(cors());
app.use(express.json());

// Prevent browser/client caching for API routes (critical for mobile browsers)
app.use((req: any, res: any, next) => {
  if (req.path.startsWith("/api")) {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    
    // Intercept res.json to inject Google Token Expired header if requested
    const originalJson = res.json;
    res.json = function(body: any) {
      if (req.googleTokenExpired) {
        res.setHeader("X-Google-Token-Expired", "true");
        res.setHeader("Access-Control-Expose-Headers", "X-Google-Token-Expired");
      }
      return originalJson.call(this, body);
    };
  }
  next();
});

const SPREADSHEET_ID = "1Ne5xeN2zEmScf9CVX5x9WguQZPM0Vk6dzQJ-n7xRfWU";

// Helper untuk memformat private key agar kompatibel dengan Node.js crypto
const getAuthClient = () => {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let privateKey = process.env.GOOGLE_PRIVATE_KEY;
  
  if (!email || !privateKey) {
     throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY");
  }

  // Handle JSON format if user pasted the whole secret JSON
  if (privateKey.startsWith('{')) {
    try {
        const json = JSON.parse(privateKey);
        privateKey = json.private_key || privateKey;
    } catch (e) {
        // ignore JSON parse error, use as is
    }
  }

  // Remove potential quotes and trim
  privateKey = privateKey.trim().replace(/^["']|["']$/g, '');

  // Handle literal \n strings
  let formattedKey = privateKey.replace(/\\n/g, "\n");
  
  const header = "-----BEGIN PRIVATE KEY-----";
  const footer = "-----END PRIVATE KEY-----";
  
  if (!formattedKey.includes(header)) formattedKey = header + "\n" + formattedKey;
  if (!formattedKey.includes(footer)) formattedKey = formattedKey + "\n" + footer;

  // Normalization
  const lines = formattedKey.split("\n");
  const cleanLines = lines.map(line => line.trim()).filter(line => line.length > 0);
  formattedKey = cleanLines.join("\n");

  return new google.auth.JWT({
    email: email,
    key: formattedKey,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/documents",
    ],
  });
};

// Lazy initialization untuk client Sheets & Drive & Docs
let sheetsClient: any = null;
let driveClient: any = null;
let docsClient: any = null;

function createFallbackAuth(userAuth: any, getServiceAccountAuth: () => any): any {
  const saAuth = getServiceAccountAuth();
  
  const fallbackAuth = Object.create(userAuth);
  
  function triggerFallback() {
    if (typeof userAuth.onAuthFallback === 'function') {
      try {
        userAuth.onAuthFallback();
      } catch (e) {
        console.error("Error triggering onAuthFallback:", e);
      }
    }
  }
  
  fallbackAuth.request = async function(opts: any) {
    try {
      return await userAuth.request(opts);
    } catch (err: any) {
      const msg = err.message || "";
      const status = err.code || err.response?.status || 500;
      const isAuthError = 
          status === 401 ||
          status === 403 ||
          msg.includes("Invalid Credentials") || 
          msg.includes("invalid_token") || 
          msg.includes("expired") ||
          msg.includes("auth");
          
      if (isAuthError) {
        triggerFallback();
        return await saAuth.request(opts);
      }
      throw err;
    }
  };
  
  fallbackAuth.getRequestHeaders = async function(url?: string) {
    try {
      return await userAuth.getRequestHeaders(url);
    } catch (err: any) {
      const msg = err.message || "";
      const status = err.code || err.response?.status || 500;
      const isAuthError = 
          status === 401 ||
          status === 403 ||
          msg.includes("Invalid Credentials") || 
          msg.includes("invalid_token") || 
          msg.includes("expired") ||
          msg.includes("auth");
          
      if (isAuthError) {
        triggerFallback();
        return await saAuth.getRequestHeaders(url);
      }
      throw err;
    }
  };

  fallbackAuth.getAccessToken = async function() {
    try {
      return await userAuth.getAccessToken();
    } catch (err: any) {
      triggerFallback();
      return await saAuth.getAccessToken();
    }
  };

  return fallbackAuth;
}

// Modified getters to support both service account and user tokens with transparent Service Account fallback
const getSheets = (auth: any) => {
  const finalAuth = (auth && !(auth instanceof google.auth.JWT)) ? createFallbackAuth(auth, getAuthClient) : auth;
  return google.sheets({ version: "v4", auth: finalAuth });
};

const getDrive = (auth: any) => {
  const finalAuth = (auth && !(auth instanceof google.auth.JWT)) ? createFallbackAuth(auth, getAuthClient) : auth;
  return google.drive({ version: "v3", auth: finalAuth });
};

const getDocs = (auth: any) => {
  const finalAuth = (auth && !(auth instanceof google.auth.JWT)) ? createFallbackAuth(auth, getAuthClient) : auth;
  return google.docs({ version: "v1", auth: finalAuth });
};

// Helper to handle API errors and return proper status codes
const handleApiError = (res: express.Response, error: any, context: string) => {
    const msg = error.message || "Unknown error";
    const status = error.code || error.response?.status || 500;
    
    // Only log essential info to avoid polluting logs with huge Gaxios errors
    console.error(`[${context}] Error (${status}): ${msg}`);
    
    const isAuthError = 
        status === 401 ||
        msg.includes("Invalid Credentials") || 
        msg.includes("invalid_token") || 
        msg.includes("expired") ||
        msg.includes("auth");

    if (isAuthError) {
        return res.status(401).json({ 
            success: false, 
            error: "Google Authentication failed or expired.",
            message: "Google Session Expired. Please click the Google icon in sidebar.",
            details: msg
        });
    }
    
    res.status(status >= 400 && status < 600 ? status : 500).json({ 
      success: false, 
      error: msg,
      context
    });
};

const getAuthFromRequest = (req: express.Request) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        if (token && token !== 'null' && token !== 'undefined' && token.length > 20) {
            console.log(`[AUTH] Using User OAuth2 Token (${token.substring(0, 10)}...)`);
            const oauth2Client = new google.auth.OAuth2() as any;
            oauth2Client.setCredentials({ access_token: token });
            oauth2Client.onAuthFallback = () => {
                (req as any).googleTokenExpired = true;
            };
            return oauth2Client;
        }
    }
    console.log(`[AUTH] Using Service Account (${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL})`);
    return getAuthClient();
};

// Modified helpers to accept auth
async function createPrPdf(prId: string, data: any, auth: any) {
  const fileName = `${prId.replace(/\//g, "_")}.pdf`;
  const filePath = path.join(PDF_DIR, fileName);
  
  if (!fs.existsSync(PDF_DIR)) {
    fs.mkdirSync(PDF_DIR, { recursive: true });
  }

  // Pre-calculate common template values
  const totalQty = data.items.reduce((sum: number, item: any) => sum + Number(item.qty || 0), 0);
  
  const estimasiText = `( Stock untuk penjualan ` + data.items.map((item: any) => {
    const avg = Number(item.avgSales || 0);
    if (!avg || avg === 0) return `0 hari (Item: ${item.itemName})`;
    const days = Math.round((Number(item.qty) * 30) / avg);
    return `${days} hari (Item: ${item.itemName})`;
  }).join(", ") + ` )`;

  console.log(`[DOCS] Starting template merge for ${prId} using provided auth...`);
  
  try {
    const drive = getDrive(auth);
    const docs = getDocs(auth);

    // 1. Copy Template
    console.log(`[DOCS] Copying template ${TEMPLATE_PR_ID}...`);
    const copyResponse = await drive.files.copy({
      fileId: TEMPLATE_PR_ID,
      requestBody: {
        name: `TEMP_${fileName}`,
        parents: [GOOGLE_DRIVE_FOLDER_ID],
      },
    });
    const copyId = copyResponse.data.id;

    if (!copyId) throw new Error("Failed to copy template");

    // 2. Replacement Data
    const requests: any[] = [
      { replaceAllText: { containsText: { text: '{{No_PR}}', matchCase: false }, replaceText: prId } },
      { replaceAllText: { containsText: { text: '{{Tanggal_Order}}', matchCase: false }, replaceText: data.date } },
      { replaceAllText: { containsText: { text: '{{Nama_Peminta}}', matchCase: false }, replaceText: data.requester } },
      { replaceAllText: { containsText: { text: '{{Divisi}}', matchCase: false }, replaceText: data.division } },
      { replaceAllText: { containsText: { text: '{{Nama Supplier}}', matchCase: false }, replaceText: data.supplier } },
      { replaceAllText: { containsText: { text: '{{Catatan}}', matchCase: false }, replaceText: data.notes || "-" } },
      { replaceAllText: { containsText: { text: 'SUM{{Qty}}', matchCase: false }, replaceText: String(totalQty) } },
      { replaceAllText: { containsText: { text: '{{Estimasi}}', matchCase: false }, replaceText: estimasiText } },
    ];

    // Map un-indexed placeholders for the first item
    if (data.items.length > 0) {
      const firstItem = data.items[0];
      requests.push(
        { replaceAllText: { containsText: { text: '{{NO}}', matchCase: false }, replaceText: "1" } },
        { replaceAllText: { containsText: { text: '{{NAMA_BARANG}}', matchCase: false }, replaceText: firstItem.itemName } },
        { replaceAllText: { containsText: { text: '{{SATUAN}}', matchCase: false }, replaceText: firstItem.unit } },
        { replaceAllText: { containsText: { text: '{{QTY}}', matchCase: false }, replaceText: String(firstItem.qty) } },
        { replaceAllText: { containsText: { text: '{{STOCK}}', matchCase: false }, replaceText: String(firstItem.stockOnhand || 0) } },
        { replaceAllText: { containsText: { text: '{{AVG}}', matchCase: false }, replaceText: String(Number(firstItem.avgSales || 0).toFixed(1)) } },
        { replaceAllText: { containsText: { text: '{{B1}}', matchCase: false }, replaceText: String(firstItem.b1 || 0) } },
        { replaceAllText: { containsText: { text: '{{B2}}', matchCase: false }, replaceText: String(firstItem.b2 || 0) } },
        { replaceAllText: { containsText: { text: '{{B3}}', matchCase: false }, replaceText: String(firstItem.b3 || 0) } }
      );
    } else {
      requests.push(
        { replaceAllText: { containsText: { text: '{{NO}}', matchCase: false }, replaceText: "" } },
        { replaceAllText: { containsText: { text: '{{NAMA_BARANG}}', matchCase: false }, replaceText: "" } },
        { replaceAllText: { containsText: { text: '{{SATUAN}}', matchCase: false }, replaceText: "" } },
        { replaceAllText: { containsText: { text: '{{QTY}}', matchCase: false }, replaceText: "" } },
        { replaceAllText: { containsText: { text: '{{STOCK}}', matchCase: false }, replaceText: "" } },
        { replaceAllText: { containsText: { text: '{{AVG}}', matchCase: false }, replaceText: "" } },
        { replaceAllText: { containsText: { text: '{{B1}}', matchCase: false }, replaceText: "" } },
        { replaceAllText: { containsText: { text: '{{B2}}', matchCase: false }, replaceText: "" } },
        { replaceAllText: { containsText: { text: '{{B3}}', matchCase: false }, replaceText: "" } }
      );
    }

    // Map items to placeholders up to 10 items.
    data.items.forEach((item: any, i: number) => {
      const idx = i + 1;
      requests.push({ replaceAllText: { containsText: { text: `{{No_${idx}}}`, matchCase: false }, replaceText: String(idx) } });
      requests.push({ replaceAllText: { containsText: { text: `{{Nama_Barang_${idx}}}`, matchCase: false }, replaceText: item.itemName } });
      requests.push({ replaceAllText: { containsText: { text: `{{Satuan_${idx}}}`, matchCase: false }, replaceText: item.unit } });
      requests.push({ replaceAllText: { containsText: { text: `{{Qty_${idx}}}`, matchCase: false }, replaceText: String(item.qty) } });
      requests.push({ replaceAllText: { containsText: { text: `{{Stock_${idx}}}`, matchCase: false }, replaceText: String(item.stockOnhand || 0) } });
      requests.push({ replaceAllText: { containsText: { text: `{{Avg_${idx}}}`, matchCase: false }, replaceText: String(Number(item.avgSales || 0).toFixed(1)) } });
      requests.push({ replaceAllText: { containsText: { text: `{{B1_${idx}}}`, matchCase: false }, replaceText: String(item.b1 || 0) } });
      requests.push({ replaceAllText: { containsText: { text: `{{B2_${idx}}}`, matchCase: false }, replaceText: String(item.b2 || 0) } });
      requests.push({ replaceAllText: { containsText: { text: `{{B3_${idx}}}`, matchCase: false }, replaceText: String(item.b3 || 0) } });
    });

    // Cleanup any empty indexed placeholders (up to 10)
    for (let i = data.items.length + 1; i <= 10; i++) {
        requests.push({ replaceAllText: { containsText: { text: `{{No_${i}}}`, matchCase: false }, replaceText: "" } });
        requests.push({ replaceAllText: { containsText: { text: `{{Nama_Barang_${i}}}`, matchCase: false }, replaceText: "" } });
        requests.push({ replaceAllText: { containsText: { text: `{{Satuan_${i}}}`, matchCase: false }, replaceText: "" } });
        requests.push({ replaceAllText: { containsText: { text: `{{Qty_${i}}}`, matchCase: false }, replaceText: "" } });
        requests.push({ replaceAllText: { containsText: { text: `{{Stock_${i}}}`, matchCase: false }, replaceText: "" } });
        requests.push({ replaceAllText: { containsText: { text: `{{Avg_${i}}}`, matchCase: false }, replaceText: "" } });
        requests.push({ replaceAllText: { containsText: { text: `{{B1_${i}}}`, matchCase: false }, replaceText: "" } });
        requests.push({ replaceAllText: { containsText: { text: `{{B2_${i}}}`, matchCase: false }, replaceText: "" } });
        requests.push({ replaceAllText: { containsText: { text: `{{B3_${i}}}`, matchCase: false }, replaceText: "" } });
    }

    console.log(`[DOCS] Running batchUpdate for ${copyId}...`);
    await docs.documents.batchUpdate({
      documentId: copyId,
      requestBody: { requests },
    });

    // 3. Export as PDF
    console.log(`[DOCS] Exporting copy to PDF...`);
    const exportResponse = await drive.files.export({
      fileId: copyId,
      mimeType: "application/pdf",
    }, { responseType: 'stream' });

    const stream = fs.createWriteStream(filePath);
    exportResponse.data.pipe(stream);

    await new Promise((resolve, reject) => {
      stream.on('finish', () => resolve(filePath));
      stream.on('error', (err) => {
        console.error(`[STREAM] Export stream error: ${err.message}`);
        reject(err);
      });
    });

    // 4. Cleanup Temp Doc
    try {
        await drive.files.delete({ fileId: copyId });
    } catch (e) {
        console.warn("[DOCS] Cleanup failed (non-critical)");
    }

    console.log(`[DOCS] PR ${prId} generated successfully from template.`);
    return filePath;

  } catch (error: any) {
    console.error(`[DOCS] Template merge error: ${error.message}. Using PDFKit fallback.`);
    
    const doc = new PDFDocument({ margin: 30, size: "A4" });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // 1. Logo Block & Company Title
    doc.rect(30, 30, 50, 40).fill("#1d4ed8"); // Royal blue box
    doc.font("Helvetica-Bold").fontSize(18).fillColor("#FFFFFF").text("sau", 30, 42, { width: 50, align: "center" });
    doc.fillColor("#000000").fontSize(18).font("Helvetica-Bold").text("CV. SUMBER ALODIE UTAMA", 90, 40);

    // 2. Right Title "FORM ORDER BARANG" in a grey-blue rounded border box
    const titleBoxWidth = 160;
    const titleBoxHeight = 30;
    doc.fillColor("#f1f5f9").roundedRect(565 - titleBoxWidth, 35, titleBoxWidth, titleBoxHeight, 5).fill();
    doc.lineWidth(0.5).strokeColor("#cbd5e1").roundedRect(565 - titleBoxWidth, 35, titleBoxWidth, titleBoxHeight, 5).stroke();
    doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(11).text("FORM ORDER BARANG", 565 - titleBoxWidth, 44, { width: titleBoxWidth, align: "center" });

    // 3. Thick divider line below logo and title
    doc.moveTo(30, 80).lineTo(565, 80).lineWidth(2).strokeColor("#000000").stroke();

    // 4. Two-column Metadata Grid
    doc.lineWidth(0.5).fillColor("#000000").font("Helvetica").fontSize(9);
    
    // Column 1
    doc.font("Helvetica-Bold").text("NAMA", 30, 95);
    doc.font("Helvetica").text(`:  ${data.requester || "-"}`, 120, 95);

    doc.font("Helvetica-Bold").text("TANGGAL ORDER", 30, 115);
    doc.font("Helvetica").text(`:  ${data.date || "-"}`, 120, 115);

    doc.font("Helvetica-Bold").text("DIVISI", 30, 135);
    doc.font("Helvetica").text(`:  ${data.division || "-"}`, 120, 135);

    doc.font("Helvetica-Bold").text("SUPPLIER", 30, 155);
    doc.font("Helvetica").text(`:  ${data.supplier || "-"}`, 120, 155);

    // Column 2
    doc.font("Helvetica-Bold").text("NO. DOKUMEN", 320, 95);
    doc.font("Helvetica").text(`:  ${prId}`, 400, 95);

    doc.font("Helvetica-Bold").text("CATATAN", 320, 115);
    
    // Catatan border box
    doc.rect(320, 127, 245, 45).lineWidth(0.5).strokeColor("#000000").stroke();
    doc.font("Helvetica").text(data.notes || "-", 325, 132, { width: 235, height: 35 });

    // 5. Divider text
    doc.font("Helvetica").fontSize(10).fillColor("#000000").text("Detail permintaan barang sebagai berikut :", 30, 185);

    // 6. Double-tier Header Table starting at Y = 205
    let curY = 205;
    
    // Headers background
    doc.rect(30, curY, 535, 30).fill("#f1c232"); // Yellow gold fill
    doc.fillColor("#000000"); // Reset fill to black for text/lines
    doc.lineWidth(0.5).strokeColor("#000000");

    // Grid lines for Header
    doc.moveTo(30, curY).lineTo(565, curY).stroke();
    doc.moveTo(425, curY + 15).lineTo(565, curY + 15).stroke();
    doc.moveTo(30, curY + 30).lineTo(565, curY + 30).stroke();
    
    doc.moveTo(30, curY).lineTo(30, curY + 30).stroke();
    doc.moveTo(60, curY).lineTo(60, curY + 30).stroke();
    doc.moveTo(245, curY).lineTo(245, curY + 30).stroke();
    doc.moveTo(290, curY).lineTo(290, curY + 30).stroke();
    doc.moveTo(330, curY).lineTo(330, curY + 30).stroke();
    doc.moveTo(375, curY).lineTo(375, curY + 30).stroke();
    doc.moveTo(425, curY).lineTo(425, curY + 30).stroke();
    doc.moveTo(471, curY + 15).lineTo(471, curY + 30).stroke();
    doc.moveTo(517, curY + 15).lineTo(517, curY + 30).stroke();
    doc.moveTo(565, curY).lineTo(565, curY + 30).stroke();

    // Header Texts
    doc.font("Helvetica-Bold").fontSize(8.5);
    doc.text("No.", 30, curY + 10, { width: 30, align: "center" });
    doc.text("Nama Barang", 60, curY + 10, { width: 185, align: "center" });
    doc.text("Satuan", 245, curY + 10, { width: 45, align: "center" });
    
    doc.fontSize(7.5);
    doc.text("Qty\nOrder", 290, curY + 6, { width: 40, align: "center" });
    doc.text("Stock\nOnHand", 330, curY + 6, { width: 45, align: "center" });
    doc.text("Rata-rata\n3 Bulan", 375, curY + 6, { width: 50, align: "center" });
    
    doc.fontSize(8);
    doc.text("Penjualan 3 Bulan Terakhir", 425, curY + 4, { width: 140, align: "center" });
    doc.text("Bulan-1", 425, curY + 18, { width: 46, align: "center" });
    doc.text("Bulan-2", 471, curY + 18, { width: 46, align: "center" });
    doc.text("Bulan-3", 517, curY + 18, { width: 48, align: "center" });

    // Table rows - Draw at least 10 rows
    curY += 30;
    doc.font("Helvetica").fontSize(8.5);
    
    const rowCount = Math.max(10, data.items.length);
    const rowHeight = 20;
    
    for (let i = 0; i < rowCount; i++) {
      const rowY = curY + i * rowHeight;
      const item = data.items[i];
      
      const itemNo = item ? String(i + 1) : "";
      const itemName = item ? String(item.itemName || "-") : "";
      const unit = item ? String(item.unit || "-") : "";
      const qty = item ? String(item.qty || "0") : "";
      const stock = item ? String(item.stockOnhand || "0") : "";
      const avg = item ? Number(item.avgSales || 0).toFixed(1) : "";
      const b1 = item ? String(item.b1 || "0") : "";
      const b2 = item ? String(item.b2 || "0") : "";
      const b3 = item ? String(item.b3 || "0") : "";
      
      doc.moveTo(30, rowY).lineTo(30, rowY + rowHeight).stroke();
      doc.moveTo(60, rowY).lineTo(60, rowY + rowHeight).stroke();
      doc.moveTo(245, rowY).lineTo(245, rowY + rowHeight).stroke();
      doc.moveTo(290, rowY).lineTo(290, rowY + rowHeight).stroke();
      doc.moveTo(330, rowY).lineTo(330, rowY + rowHeight).stroke();
      doc.moveTo(375, rowY).lineTo(375, rowY + rowHeight).stroke();
      doc.moveTo(425, rowY).lineTo(425, rowY + rowHeight).stroke();
      doc.moveTo(471, rowY).lineTo(471, rowY + rowHeight).stroke();
      doc.moveTo(517, rowY).lineTo(517, rowY + rowHeight).stroke();
      doc.moveTo(565, rowY).lineTo(565, rowY + rowHeight).stroke();
      
      doc.moveTo(30, rowY + rowHeight).lineTo(565, rowY + rowHeight).stroke();
      
      if (item) {
        doc.text(itemNo, 30, rowY + 6, { width: 30, align: "center" });
        doc.text(itemName, 65, rowY + 6, { width: 175, align: "left" });
        doc.text(unit, 245, rowY + 6, { width: 45, align: "center" });
        doc.text(qty, 290, rowY + 6, { width: 40, align: "center" });
        doc.text(stock, 330, rowY + 6, { width: 45, align: "center" });
        doc.text(avg, 375, rowY + 6, { width: 50, align: "center" });
        doc.text(b1, 425, rowY + 6, { width: 46, align: "center" });
        doc.text(b2, 471, rowY + 6, { width: 46, align: "center" });
        doc.text(b3, 517, rowY + 6, { width: 48, align: "center" });
      }
    }
    
    // 7. GRAND TOTAL Row
    const grandTotalY = curY + rowCount * rowHeight;
    doc.rect(30, grandTotalY, 260, rowHeight).fill("#f1c232");
    doc.fillColor("#000000");
    
    doc.rect(30, grandTotalY, 260, rowHeight).stroke();
    doc.rect(290, grandTotalY, 40, rowHeight).stroke();
    
    doc.font("Helvetica-Bold").fontSize(8.5);
    doc.text("GRAND TOTAL", 30, grandTotalY + 6, { width: 260, align: "center" });
    doc.text(String(totalQty), 290, grandTotalY + 6, { width: 40, align: "center" });
    
    // 8. parenthesized stock estimation note below the table
    const noteY = grandTotalY + rowHeight + 15;
    doc.font("Helvetica").fontSize(9);
    doc.text(estimasiText, 30, noteY, { width: 535 });

    doc.end();
    return new Promise((resolve, reject) => {
      stream.on("finish", () => resolve(filePath));
      stream.on("error", reject);
    });
  }
}

// IDs for Drive
const GOOGLE_DRIVE_FOLDER_ID = "1GjYzgLWqoCt6FzihhD6q5xsv0MYYRb0c";
const GOOGLE_DRIVE_PO_FOLDER_ID = "1N6GwnHBE-RZcsTI1cbzmsWG-_zslN0qE";
const TEMPLATE_PR_ID = '1dNTmJEUxtXHyI044udxsKE6BBg1gnuJy55i2DzyuP9A';
const TEMPLATE_PO_ID = '14vYhIYIofui-HEY7rTo7oWD_DpGVPCLfj5atDKEpRio';

async function createPoPdf(poNo: string, data: any, auth: any) {
  const fileName = `${poNo.replace(/\//g, "_")}.pdf`;
  const filePath = path.join(PO_PDF_DIR, fileName);
  
  if (!fs.existsSync(PO_PDF_DIR)) {
    fs.mkdirSync(PO_PDF_DIR, { recursive: true });
  }

  console.log(`[PO-DOCS] Starting template merge for ${poNo}...`);
  try {
    const drive = getDrive(auth);
    const docs = getDocs(auth);

    // 1. Copy Template
    console.log(`[PO-DOCS] Copying template ${TEMPLATE_PO_ID}...`);
    const copyResponse = await drive.files.copy({
      fileId: TEMPLATE_PO_ID,
      requestBody: {
        name: `TEMP_${fileName}`,
        parents: [GOOGLE_DRIVE_PO_FOLDER_ID],
      },
    });
    const copyId = copyResponse.data.id;
    if (!copyId) throw new Error("Failed to copy template");

    // 2. Replacement Data
    const subTotal = data.items.reduce((sum: number, item: any) => sum + (Number(item.qty) * Number(item.price)), 0);
    const discount = Number(data.discount || 0);
    const tax = Number(data.tax || 0);
    const others = Number(data.others || 0);
    const discountPercent = data.discountPercent || 0;
    const taxPercent = data.taxPercent || 0;
    const grandTotal = subTotal - discount + tax + others;

    const WAREHOUSE_ADDRESSES: { [key: string]: { name: string, address: string } } = {
      'GD PONCOL': {
        name: 'GUDANG PONCOL',
        address: 'JL. RAYA PONCOL NO.17 RT/RW 003/07 KEL. CIRACAS KEC. CIRACAS, KOTA JAKARTA TIMUR, DKI JAKARTA - 13750'
      },
      'GD CIRACAS': {
        name: 'GUDANG CIRACAS',
        address: 'JL. RAYA BOGOR KM 26 NO.2 RT/RW 005/01 KEL. CIRACAS KEC. CIRACAS KOTA JAKARTA TIMUR, DKI JAKARTA - 13750'
      },
      'GD NAGOYA': {
        name: 'GUDANG NAGOYA',
        address: 'JL. SWADAYA V NO. 50 RT/RW. 002/05 KEC. CILANGKAP KEL. CIPAYUNG KOTA JAKARTA TIMUR, DKI JAKARTA - 13870'
      }
    };

    const divKey = String(data.division || '').toUpperCase().trim();
    let divisionDisplay = "GUDANG UTAMA";
    if (WAREHOUSE_ADDRESSES[divKey]) {
      const info = WAREHOUSE_ADDRESSES[divKey];
      divisionDisplay = `${info.name}\n${info.address}`;
    } else {
      const matchedKey = Object.keys(WAREHOUSE_ADDRESSES).find(k => divKey.includes(k) || k.includes(divKey));
      if (matchedKey) {
        const info = WAREHOUSE_ADDRESSES[matchedKey];
        divisionDisplay = `${info.name}\n${info.address}`;
      } else if (data.division) {
        divisionDisplay = data.division;
      }
    }

    const requests: any[] = [
      { replaceAllText: { containsText: { text: '{{PEMINTA}}', matchCase: false }, replaceText: data.purchaseName } },
      { replaceAllText: { containsText: { text: '{{NO_PO}}', matchCase: false }, replaceText: poNo } },
      { replaceAllText: { containsText: { text: '{{TANGGAL}}', matchCase: false }, replaceText: new Date().toLocaleDateString('id-ID') } },
      { replaceAllText: { containsText: { text: '{{DIVISI}}', matchCase: false }, replaceText: divisionDisplay } },
      { replaceAllText: { containsText: { text: '{{SUPPLIER}}', matchCase: false }, replaceText: data.supplier } },
      { replaceAllText: { containsText: { text: '{{CATATAN}}', matchCase: false }, replaceText: data.notes || "-" } },
      { replaceAllText: { containsText: { text: '{{SUBTOTAL}}', matchCase: false }, replaceText: `Rp ${subTotal.toLocaleString('id-ID')}` } },
      { replaceAllText: { containsText: { text: '{{DISKON}}', matchCase: false }, replaceText: `Rp ${discount.toLocaleString('id-ID')}` } },
      { replaceAllText: { containsText: { text: '{{DISKON_PERSEN}}', matchCase: false }, replaceText: `${discountPercent}%` } },
      { replaceAllText: { containsText: { text: '{{PAJAK}}', matchCase: false }, replaceText: `Rp ${tax.toLocaleString('id-ID')}` } },
      { replaceAllText: { containsText: { text: '{{PAJAK_PERSEN}}', matchCase: false }, replaceText: `${taxPercent}%` } },
      { replaceAllText: { containsText: { text: '{{OTHERS}}', matchCase: false }, replaceText: `Rp ${others.toLocaleString('id-ID')}` } },
      { replaceAllText: { containsText: { text: 'SUM{{TOTAL}}', matchCase: false }, replaceText: `Rp ${grandTotal.toLocaleString('id-ID')}` } },
    ];

    // Table rows replacement (indexed up to 10)
    data.items.forEach((item: any, i: number) => {
      const idx = i + 1;
      const totalItem = item.qty * item.price;
      requests.push({ replaceAllText: { containsText: { text: `{{NO_${idx}}}`, matchCase: false }, replaceText: String(idx) } });
      requests.push({ replaceAllText: { containsText: { text: `{{NAMA_BARANG_${idx}}}`, matchCase: false }, replaceText: item.itemName } });
      requests.push({ replaceAllText: { containsText: { text: `{{SATUAN_${idx}}}`, matchCase: false }, replaceText: item.unit || "PCS" } });
      requests.push({ replaceAllText: { containsText: { text: `{{QTY_${idx}}}`, matchCase: false }, replaceText: String(item.qty) } });
      requests.push({ replaceAllText: { containsText: { text: `{{HARGA_${idx}}}`, matchCase: false }, replaceText: `Rp ${Number(item.price).toLocaleString('id-ID')}` } });
      requests.push({ replaceAllText: { containsText: { text: `{{TOTAL_${idx}}}`, matchCase: false }, replaceText: `Rp ${totalItem.toLocaleString('id-ID')}` } });
    });

    // Cleanup extra placeholders
    for (let i = data.items.length + 1; i <= 10; i++) {
        requests.push({ replaceAllText: { containsText: { text: `{{NO_${i}}}`, matchCase: false }, replaceText: "" } });
        requests.push({ replaceAllText: { containsText: { text: `{{NAMA_BARANG_${i}}}`, matchCase: false }, replaceText: "" } });
        requests.push({ replaceAllText: { containsText: { text: `{{SATUAN_${i}}}`, matchCase: false }, replaceText: "" } });
        requests.push({ replaceAllText: { containsText: { text: `{{QTY_${i}}}`, matchCase: false }, replaceText: "" } });
        requests.push({ replaceAllText: { containsText: { text: `{{HARGA_${i}}}`, matchCase: false }, replaceText: "" } });
        requests.push({ replaceAllText: { containsText: { text: `{{TOTAL_${i}}}`, matchCase: false }, replaceText: "" } });
    }

    console.log(`[PO-DOCS] Running batchUpdate for ${copyId}...`);
    await docs.documents.batchUpdate({
      documentId: copyId,
      requestBody: { requests },
    });

    // 3. Export as PDF
    console.log(`[PO-DOCS] Exporting copy to PDF...`);
    const exportResponse = await drive.files.export({
      fileId: copyId,
      mimeType: "application/pdf",
    }, { responseType: 'stream' });

    const stream = fs.createWriteStream(filePath);
    exportResponse.data.pipe(stream);

    await new Promise((resolve, reject) => {
      stream.on('finish', () => resolve(filePath));
      stream.on('error', (err) => reject(err));
    });

    // 4. Cleanup Temp Doc
    try { await drive.files.delete({ fileId: copyId }); } catch (e) {}

    console.log(`[PO-DOCS] PO ${poNo} generated successfully.`);
    return filePath;

  } catch (error: any) {
    console.error(`[PO-DOCS] Template error: ${error.message}. Using fallback.`);
    // Fallback logic could be the PDFKit one if needed, but for now we throw
    throw error;
  }
}

async function uploadToDrive(filePath: string, fileName: string, auth: any, folderId?: string) {
  console.log(`[DRIVE] Attempting to upload ${fileName} using provided auth...`);
  try {
    const drive = getDrive(auth);
    
    const response = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId || GOOGLE_DRIVE_FOLDER_ID],
      },
      media: {
        mimeType: "application/pdf",
        body: fs.createReadStream(filePath),
      },
      fields: "id, webViewLink",
    });

    // Make public so anyone with link can view (standard for this system)
    try {
        await drive.permissions.create({
            fileId: response.data.id!,
            requestBody: { role: 'reader', type: 'anyone' }
        });
    } catch (pe) {
        console.warn("[DRIVE] Failed to set public permissions (non-critical)");
    }

    console.log(`[DRIVE] Uploaded successfully: ${response.data.id}`);
    return response.data.webViewLink;
  } catch (err: any) {
    console.error(`[DRIVE] Upload failed: ${err.message}`);
    return null;
  }
}

// --- WhatsApp Notification Integration Helpers ---
interface WaLog {
  timestamp: string;
  target: string;
  recipientName: string;
  recipientRole: string;
  messageType: string;
  message: string;
  status: "SUCCESS" | "FAILED";
  gatewayResponse: string;
}

const waLogs: WaLog[] = [];

function addWaLog(log: Omit<WaLog, "timestamp">) {
  waLogs.unshift({
    ...log,
    timestamp: new Date().toISOString()
  });
  if (waLogs.length > 50) {
    waLogs.pop();
  }
}

const isManagerOrDirector = (role: string, divisionCode?: string) => {
  const roleUp = String(role || "").toUpperCase();
  const divUp = String(divisionCode || "").toUpperCase();
  return roleUp.includes('MANAGER') || roleUp.includes('MANAJER') || roleUp.includes('MGR') || 
         roleUp.includes('KABAG') || roleUp.includes('DIREKTUR') || roleUp.includes('DIREKSI') || 
         roleUp.includes('DIR') || roleUp.includes('KADIV') ||
         divUp === 'MGR' || divUp === 'DIR';
};

const isAdmin = (role: string) => {
  const roleUp = String(role || "").toUpperCase();
  return roleUp.includes('ADMIN') || roleUp.includes('SUPER');
};

async function getNotificationUsers() {
  try {
    const auth = getAuthClient();
    const sheets = getSheets(auth);
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "User_Role!A2:H",
    });
    const rows = response.data.values || [];
    
    const mappedUsers = rows.map((row: any) => ({
      username: row[0],
      displayName: row[2],
      division: row[3],
      divisionCode: String(row[4] || "").toUpperCase().trim(),
      wa: row[5],
      role: String(row[6] || "").toUpperCase().trim()
    }));

    console.log(`[WHATSAPP] Mapped ${mappedUsers.length} users from User_Role table`);
    return mappedUsers;
  } catch (err: any) {
    console.error(`[WHATSAPP] Failed to fetch users for notifications: ${err.message}`);
    return [];
  }
}

function getWaToken() {
  const configPath = path.join(process.cwd(), "config_wa.json");
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      if (config && config.WA_API_TOKEN) {
        return config.WA_API_TOKEN.trim();
      }
    } catch (e: any) {
      console.warn("[WHATSAPP] Failed to load WA_API_TOKEN from config_wa.json:", e.message);
    }
  }

  let token = process.env.WA_API_TOKEN;
  if (!token && fs.existsSync(".env.example")) {
    try {
      const exampleContent = fs.readFileSync(".env.example", "utf-8");
      const match = exampleContent.match(/WA_API_TOKEN\s*=\s*(.+)/);
      if (match && match[1]) {
        token = match[1].trim();
        process.env.WA_API_TOKEN = token;
      }
    } catch (e: any) {
      console.warn("[WHATSAPP] Could not read .env.example", e.message);
    }
  }
  return token || "";
}

async function sendWhatsApp(
  target: string, 
  message: string, 
  recipientName = "Unknown", 
  recipientRole = "Unknown", 
  messageType = "TEST_DIAGNOSTIC"
) {
  const token = getWaToken();
  const isFromExample = token && token.startsWith("EAATixkW");

  if (!token) {
    const errorMsg = "WA_API_TOKEN is not configured. Skipping notification.";
    console.warn(`[WHATSAPP] ${errorMsg}`);
    addWaLog({
      target,
      recipientName,
      recipientRole,
      messageType,
      message,
      status: "FAILED",
      gatewayResponse: `Error: ${errorMsg}`
    });
    return false;
  }

  if (isFromExample) {
    const errorMsg = "Kunci Anda masih berupa token default 'EAATixkW...' dari contoh Meta Facebook. Anda wajib mengisi token Fonnte asli Anda terlebih dahulu di menu WhatsApp Diagnostics!";
    console.warn(`[WHATSAPP] ${errorMsg}`);
    addWaLog({
      target,
      recipientName,
      recipientRole,
      messageType,
      message,
      status: "FAILED",
      gatewayResponse: `Error: ${errorMsg}`
    });
    return false;
  }

  // Clean the target phone number
  let cleanedTarget = target.replace(/[^0-9]/g, "");
  if (cleanedTarget.startsWith("0")) {
    cleanedTarget = "62" + cleanedTarget.slice(1);
  }

  if (!cleanedTarget) {
    const errorMsg = `Target phone number is invalid: "${target}"`;
    console.error(`[WHATSAPP] ${errorMsg}`);
    addWaLog({
      target,
      recipientName,
      recipientRole,
      messageType,
      message,
      status: "FAILED",
      gatewayResponse: `Error: ${errorMsg}`
    });
    return false;
  }

  let gatewayResponseStr = "";
  try {
    console.log(`[WHATSAPP] Sending message to ${cleanedTarget} using token (length: ${token.length}, is_placeholder: ${isFromExample})...`);
    console.log(`[WHATSAPP] Message Preview: ${message.slice(0, 100)}...`);
    
    const response = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: {
        "Authorization": token
      },
      body: new URLSearchParams({
        target: cleanedTarget,
        message: message
      })
    });

    gatewayResponseStr = await response.text();
    console.log(`[WHATSAPP] Gateway response for ${cleanedTarget} (Status Code: ${response.status}):`, gatewayResponseStr);
    
    let isSuccess = false;
    try {
      const resJson = JSON.parse(gatewayResponseStr);
      isSuccess = resJson.status === true || resJson.status === "true";
    } catch (e) {
      isSuccess = response.status === 200;
    }

    addWaLog({
      target: cleanedTarget,
      recipientName,
      recipientRole,
      messageType,
      message,
      status: isSuccess ? "SUCCESS" : "FAILED",
      gatewayResponse: gatewayResponseStr
    });

    return isSuccess;
  } catch (err: any) {
    console.error(`[WHATSAPP] Error sending message to ${cleanedTarget}: ${err.message}`);
    addWaLog({
      target: cleanedTarget,
      recipientName,
      recipientRole,
      messageType,
      message,
      status: "FAILED",
      gatewayResponse: `Exception Error: ${err.message}`
    });
    return false;
  }
}

function getAppUrl(req?: any) {
  // Always use the Shared App URL so that any notification links, approval links, and spreadsheet link backups 
  // correctly point to the Shared/Production version of the app. This avoids sending "ais-dev-*" links 
  // (which are unauthorized and show "Page not found" to anyone except the original developer) 
  // or insecure unencrypted "http://" links.
  return "https://ais-pre-uwm77rhvr4ukp72jubhu7t-815065087537.asia-east1.run.app";
}

async function notifyNewPR(prId: string, data: any, req?: any) {
  try {
    const users = await getNotificationUsers();
    console.log(`[WHATSAPP] Total users retrieved: ${users.length}`);
    
    // Log details of all found users with WhatsApp for better debugging
    users.forEach(u => {
      console.log(`[WHATSAPP] User: "${u.username}", DisplayName: "${u.displayName}", Role: "${u.role}", DivCode: "${u.divisionCode}", HasWA: ${!!u.wa}`);
    });

    const isManagerOnly = (role: string) => {
      const r = String(role || "").toUpperCase();
      return (r.includes("MANAGER") || r.includes("MANAJER") || r.includes("MGR") || r.includes("KABAG") || r.includes("KADIV")) && 
             !(r.includes("DIREKTUR") || r.includes("DIREKSI") || r.includes("DIR"));
    };

    const prDivision = String(data.division || "").toUpperCase().trim();
    let targetManagerDivision = "";
    if (prDivision.includes("CIRACAS") || prDivision === "GDC") {
      targetManagerDivision = "TOKO";
    } else if (prDivision.includes("PONCOL") || prDivision.includes("NAGOYA") || prDivision === "GDP" || prDivision === "GDN") {
      targetManagerDivision = "GUDANG";
    }

    let recipients = users.filter(u => u.wa && isManagerOnly(u.role));
    
    if (targetManagerDivision) {
      recipients = recipients.filter(u => {
        const uDiv = String(u.division || "").toUpperCase().trim();
        const uDivCode = String(u.divisionCode || "").toUpperCase().trim();
        return uDiv.includes(targetManagerDivision) || uDivCode.includes(targetManagerDivision);
      });
    }

    if (recipients.length === 0) {
      console.log(`[WHATSAPP] No active Managers found matching target division "${targetManagerDivision}" with WA numbers for PR ${prId}`);
      return;
    }

    const firstItemAndQty = data.items && data.items.length > 0
      ? `${data.items[0].itemName} (Qty: ${data.items[0].qty})`
      : "";
    const itemsCount = data.items ? data.items.length : 0;
    const itemSummary = itemsCount > 1 
      ? `${firstItemAndQty} + ${itemsCount - 1} item lainnya`
      : firstItemAndQty;

    console.log(`[WHATSAPP] Found ${recipients.length} Manager recipients to notify for PR Division "${prDivision}":`, recipients.map(r => r.displayName));
    
    const appBaseUrl = getAppUrl(req);
    const approvalLink = `${appBaseUrl}/?tab=approvals`;

    for (const user of recipients) {
      const message = `🔔 *Notifikasi PR Baru* 🔔

Halo *${user.displayName}*, ada Purchase Request baru yang memerlukan tinjauan Anda:

*No. PR*: ${prId}
*Peminta*: ${data.requester}
*Divisi*: ${data.division}
*Supplier*: ${data.supplier}
*Detail Item*: ${itemSummary}
*Catatan*: ${data.notes || "-"}

Silakan klik tautan berikut untuk langsung membuka menu persetujuan di aplikasi:
🔗 ${approvalLink}

Terima kasih.

💡 *Tips Pengguna HP (iOS / WhatsApp):*
Jika layar menampilkan pesan "blocking a required security cookie":
1. Klik ikon *titik tiga* (⋮) atau *kompas/share* di pojok bawah webview WhatsApp.
2. Pilih **"Buka di Safari" (Open in Safari)** atau **"Buka di Chrome"**.
3. Di Safari/Chrome, ketuk tombol **"Authenticate in new window"** jika diminta.

> Sent via fonnte.com`;

      await sendWhatsApp(user.wa, message, user.displayName, user.role, "NEW_PR");
    }
  } catch (err: any) {
    console.error(`[WHATSAPP] Error in notifyNewPR: ${err.message}`);
  }
}

async function notifyDirekturPR(prId: string, prDetails: any, approverName: string, req?: any) {
  try {
    const users = await getNotificationUsers();
    
    const isDirekturOnly = (role: string) => {
      const r = String(role || "").toUpperCase();
      return r.includes("DIREKTUR") || r.includes("DIREKSI") || r.includes("DIR");
    };

    const recipients = users.filter(u => u.wa && isDirekturOnly(u.role));

    if (recipients.length === 0) {
      console.log(`[WHATSAPP] No active Directors / Direktur found with WA numbers for PR ${prId}`);
      return;
    }

    const firstItemAndQty = prDetails.items && prDetails.items.length > 0
      ? `${prDetails.items[0].itemName} (Qty: ${prDetails.items[0].qty})`
      : "";
    const itemsCount = prDetails.items ? prDetails.items.length : 0;
    const itemSummary = itemsCount > 1 
      ? `${firstItemAndQty} + ${itemsCount - 1} item lainnya`
      : firstItemAndQty;

    console.log(`[WHATSAPP] Found ${recipients.length} Director recipients to notify for PR ${prId}:`, recipients.map(r => r.displayName));

    const appBaseUrl = getAppUrl(req);
    const approvalLink = `${appBaseUrl}/?tab=approvals`;

    for (const user of recipients) {
      const message = `🔔 Notifikasi Persetujuan Direktur 🔔

Halo Bapak ${user.displayName}, ada Purchase Request yang telah disetujui oleh Manager dan sekarang memerlukan persetujuan Bapak:

No. PR: ${prId}
Peminta: ${prDetails.requester}
Divisi: ${prDetails.division}
Supplier: ${prDetails.supplier}
Detail Item: ${itemSummary}
Catatan: ${prDetails.notes || "-"}
Status PR : Sudah di setujui oleh Bapak "${approverName}"

Silakan klik tautan berikut untuk langsung membuka menu persetujuan di aplikasi:
🔗 ${approvalLink}

Terima kasih.

💡 *Tips Pengguna HP (iOS / WhatsApp):*
Jika layar menampilkan pesan "blocking a required security cookie":
1. Klik ikon *titik tiga* (⋮) atau *kompas/share* di pojok bawah webview WhatsApp.
2. Pilih **"Buka di Safari" (Open in Safari)** atau **"Buka di Chrome"**.
3. Di Safari/Chrome, ketuk tombol **"Authenticate in new window"** jika diminta.

> Sent via fonnte.com`;

      await sendWhatsApp(user.wa, message, user.displayName, user.role, "PR_TO_DIRECTOR");
    }
  } catch (err: any) {
    console.error(`[WHATSAPP] Error in notifyDirekturPR: ${err.message}`);
  }
}

async function notifyPRApprovalChange(
  prId: string,
  approverName: string,
  approverRole: string,
  status: string,
  isRejected: boolean = false,
  reason: string = "",
  requesterName?: string,
  req?: any
) {
  try {
    const users = await getNotificationUsers();
    
    // Find matching creator/requester for the PR (case-insensitive username or displayName match)
    const targetRequester = String(requesterName || "").toUpperCase().trim();
    const recipients = users.filter(u => u.wa && (
      String(u.displayName || "").toUpperCase().trim() === targetRequester ||
      String(u.username || "").toUpperCase().trim() === targetRequester
    ));

    if (recipients.length === 0) {
      console.log(`[WHATSAPP] No active requester found matching "${requesterName}" with WA number for approval/rejection notification of ${prId}`);
      return;
    }

    console.log(`[WHATSAPP] Found ${recipients.length} Creator recipients to notify:`, recipients.map(r => r.displayName));

    const appBaseUrl = getAppUrl(req);
    const prLink = `${appBaseUrl}/?tab=pr`;

    for (const user of recipients) {
      let message = "";
      if (isRejected) {
        message = `⚠️ *Notifikasi Penolakan PR* ⚠️

Halo *${user.displayName}*, Purchase Request Anda berikut telah *DITOLAK*:

*No. PR*: ${prId}
*Ditolak Oleh*: ${approverName} (${approverRole})
*Alasan/Catatan*: ${reason || "-"}
*Status Terbaru*: *${status}*

Silakan klik tautan berikut untuk membuka aplikasi:
🔗 ${prLink}

Terima kasih.

💡 *Tips Pengguna HP (iOS / WhatsApp):*
Jika layar menampilkan pesan "blocking a required security cookie":
1. Klik ikon *titik tiga* (⋮) atau *kompas/share* di pojok bawah webview WhatsApp.
2. Pilih **"Buka di Safari" (Open in Safari)** atau **"Buka di Chrome"**.
3. Di Safari/Chrome, ketuk tombol **"Authenticate in new window"** jika diminta.

> Sent via fonnte.com`;
      } else {
        message = `📢 *Notifikasi Persetujuan PR* 📢

Halo *${user.displayName}*, status persetujuan untuk Purchase Request Anda *${prId}* telah diperbarui:

*No. PR*: ${prId}
*Persetujuan Oleh*: ${approverName} (${approverRole})
*Status Terbaru*: *${status}*

Silakan klik tautan berikut untuk membuka aplikasi:
🔗 ${prLink}

Terima kasih.

💡 *Tips Pengguna HP (iOS / WhatsApp):*
Jika layar menampilkan pesan "blocking a required security cookie":
1. Klik ikon *titik tiga* (⋮) atau *kompas/share* di pojok bawah webview WhatsApp.
2. Pilih **"Buka di Safari" (Open in Safari)** atau **"Buka di Chrome"**.
3. Di Safari/Chrome, ketuk tombol **"Authenticate in new window"** jika diminta.

> Sent via fonnte.com`;
      }

      await sendWhatsApp(user.wa, message, user.displayName, user.role, isRejected ? "PR_REJECTED" : "PR_APPROVED");
    }
  } catch (err: any) {
    console.error(`[WHATSAPP] Error in notifyPRApprovalChange: ${err.message}`);
  }
}

async function syncPrDetailRow(prId: string, auth: any) {
  const sheets = getSheets(auth);
  
  try {
    console.log(`[SYNC] Starting sync for PR ${prId}...`);
    // 1. Fetch all Rekap_PR rows to collect details
    const prRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "Rekap_PR!A:S",
    });
    const prRows = prRes.data.values || [];
    
    const matchingPrRows = prRows.filter(row => row[0] && String(row[0]).trim() === String(prId).trim());
    
    // 2. Fetch all PR_Detail rows
    const detailRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "PR_Detail!A:N",
    });
    const detailRows = detailRes.data.values || [];
    
    const detailRowIndex = detailRows.findIndex(row => row[1] && String(row[1]).trim() === String(prId).trim());
    
    if (matchingPrRows.length === 0) {
      // If PR was deleted in Rekap_PR, delete it from PR_Detail if it exists
      if (detailRowIndex !== -1) {
        const sheetId = await getSheetId("PR_Detail", auth);
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          requestBody: {
            requests: [
              {
                deleteDimension: {
                  range: {
                    sheetId: sheetId,
                    dimension: "ROWS",
                    startIndex: detailRowIndex,
                    endIndex: detailRowIndex + 1
                  }
                }
              }
            ]
          }
        });
        console.log(`[SYNC] Deleted PR ${prId} from PR_Detail since it has 0 items in Rekap_PR`);
      }
      return;
    }
    
    // 3. Compile summary data
    const firstRow = matchingPrRows[0];
    const date = firstRow[1] || "";
    const requester = firstRow[2] || "";
    const division = firstRow[3] || "";
    const supplier = firstRow[4] || "";
    const notes = firstRow[10] || "";
    const status = firstRow[11] || "";
    const mgrApp = firstRow[12] || "";
    const dirApp = firstRow[13] || "";
    const pdfLink = firstRow[14] || "";
    const poNo = firstRow[15] || "";
    
    const jumlahItem = matchingPrRows.length;
    const totalQty = matchingPrRows.reduce((sum, row) => sum + (Number(row[7]) || 0), 0);
    
    // 4. Update or Append
    if (detailRowIndex !== -1) {
      // Update existing row (retain its existing ID PR in column A)
      const existingId = detailRows[detailRowIndex][0] || `PRD${String(detailRowIndex).padStart(7, '0')}`;
      const updatedValues = [
        existingId,
        prId,
        date,
        requester,
        division,
        supplier,
        String(jumlahItem),
        String(totalQty),
        notes,
        status,
        mgrApp,
        dirApp,
        pdfLink,
        poNo
      ];
      
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `PR_Detail!A${detailRowIndex + 1}:N${detailRowIndex + 1}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [updatedValues] }
      });
      console.log(`[SYNC] Updated PR ${prId} in PR_Detail at row ${detailRowIndex + 1}`);
    } else {
      // Determine next ID PR
      let nextIdNum = 1;
      if (detailRows.length > 1) {
        // Look at all ID PRs to find the max ID
        const ids = detailRows.slice(1).map(row => {
          const match = String(row[0]).match(/^PRD(\d+)/);
          return match ? parseInt(match[1]) : 0;
        });
        nextIdNum = Math.max(...ids) + 1;
      }
      const newId = `PRD${String(nextIdNum).padStart(7, '0')}`;
      
      const newRow = [
        newId,
        prId,
        date,
        requester,
        division,
        supplier,
        String(jumlahItem),
        String(totalQty),
        notes,
        status,
        mgrApp,
        dirApp,
        pdfLink,
        poNo
      ];
      
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: "PR_Detail!A:N",
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [newRow] }
      });
      console.log(`[SYNC] Appended new PR ${prId} to PR_Detail as ${newId}`);
    }
  } catch (err: any) {
    console.error(`[SYNC] Error syncing PR ${prId} to PR_Detail: ${err.message}`);
  }
}

// API: Login (Real-time from Spreadsheet)
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  const inputUser = String(username || "").trim().toUpperCase();
  const inputPass = String(password || "").trim();

  console.log(`[LOGIN] Mencoba login: ${inputUser}`);
  
  try {
    const auth = getAuthClient(); // Always use Service Account for login master list
    const sheets = getSheets(auth);
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "User_Role!A2:H",
    });
    const rows = response.data.values;

    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: "Data users tidak ditemukan di Spreadsheet." });
    }

    const userRow = rows.find(row => {
      const dbUser = String(row[0] || "").trim().toUpperCase();
      const dbPass = String(row[1] || "").trim();
      return dbUser === inputUser && dbPass === inputPass;
    });

    if (userRow) {
      return res.json({
        success: true,
        user: {
          username: userRow[0] || "",
          displayName: userRow[2] || userRow[0] || "", // Fallback to username if FULL_NAME is empty
          division: userRow[3] || "CS",                // Default division
          divisionCode: userRow[4] || "CS",            // Default division code
          wa: userRow[5] || "",
          role: userRow[6] || "USER",                  // Default role
          access: userRow[7] || ""
        }
      });
    }

    res.status(401).json({ success: false, message: "Username atau Password salah." });
  } catch (error: any) {
    handleApiError(res, error, "LOGIN");
  }
});

// API: List Items from Master Stock
app.get("/api/stock", async (req, res) => {
  try {
    const auth = getAuthFromRequest(req);
    const sheets = getSheets(auth);
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "Master_Stock!A2:E",
    });
    const rows = response.data.values || [];
    const stock = rows.map(row => ({
      name: row[0],
      category: row[1],
      supplier: row[2],
      unit: row[3],
      price: row[4]
    }));
    res.json(stock);
  } catch (error) {
    handleApiError(res, error, "STOCK_LIST");
  }
});

// Cache for PRs and POs (in preview server - for presentation)
let prList: any[] = [];
let poList: any[] = [];
let auditTrail: any[] = [];

app.get("/api/stats", async (req, res) => {
  try {
    const auth = getAuthFromRequest(req);
    const sheets = getSheets(auth);
    
    // Fetch Rekap_PR
    const prRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "Rekap_PR!A2:S", // Adjust range if needed
    });
    const prRows = prRes.data.values || [];

    // Fetch Rekap_PO
    const poRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "Rekap_PO!A2:O", // Updated range to include O (Division)
    });
    const poRows = poRes.data.values || [];

    // Unique PRs
    const uniquePrs = [...new Set(prRows.map(row => row[0]))];
    
    // Group rows by PR ID to check status for each PR
    const prGroups = {};
    prRows.forEach(row => {
      const id = row[0];
      if (!prGroups[id]) prGroups[id] = [];
      prGroups[id].push(row);
    });

    const getUniqueCountByStatus = (statuses) => {
        const upperStatuses = statuses.map(s => String(s || "").trim().toUpperCase());
        return Object.values(prGroups).filter((rows: any) => {
            const rowStatus = String(rows[0][11] || "").trim().toUpperCase();
            return upperStatuses.includes(rowStatus);
        }).length;
    };

    // Count unique PO numbers for "WAITING RECEIVE"
    const uniquePosWaitingReceive = new Set(
      prRows
        .filter(row => String(row[11] || "").trim().toUpperCase() === "WAITING RECEIVE")
        .map(row => row[15]) // Column P is index 15
        .filter(Boolean)
    ).size;

    // Calculate real chart data based on months
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const currentYear = new Date().getFullYear();
    const monthlyData = {};
    monthNames.forEach(m => monthlyData[m] = { prCount: 0, totalQty: 0 });

    prRows.forEach(row => {
        const dateStr = row[1]; // Column B
        if (!dateStr) return;
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return;
        
        // We only care about current or recent months
        const month = monthNames[date.getMonth()];
        const qty = Number(row[7]) || 0; // Column H (QTY)
        
        if (monthlyData[month]) {
            // Count unique PRs per month for volume
            // But usually charts show total transactions or total items
            // Let's count items for PR Count and sum QTY
            monthlyData[month].prCount += 1;
            monthlyData[month].totalQty += qty;
        }
    });

    // Get last 5-6 months
    const lastSixMonths = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        lastSixMonths.push(monthNames[d.getMonth()]);
    }

    const prCounts = lastSixMonths.map(m => monthlyData[m].prCount);
    const totalQtys = lastSixMonths.map(m => monthlyData[m].totalQty);

    const stats = {
      totalPR: uniquePrs.length,
      waitingManager: getUniqueCountByStatus(["WAITING MANAGER APPROVAL"]),
      waitingDirector: getUniqueCountByStatus(["WAITING DIREKTUR APPROVAL"]),
      waitingPO: getUniqueCountByStatus(["WAITING CREATED PO"]),
      waitingReceive: uniquePosWaitingReceive,
      finish: getUniqueCountByStatus(["FINISH"]),
      chartData: {
        labels: lastSixMonths,
        datasets: [
          { 
            type: 'line' as const,
            label: "PR Count", 
            data: prCounts, 
            borderColor: "rgb(236, 72, 153)", // Pink-500
            backgroundColor: "rgba(236, 72, 153, 0.1)",
            fill: true,
            tension: 0.4,
            yAxisID: 'y',
          },
          {
            type: 'bar' as const,
            label: "Total Qty",
            data: totalQtys,
            backgroundColor: "rgba(79, 70, 229, 0.6)", // Indigo-500
            borderColor: "rgb(79, 70, 229)",
            borderRadius: 8,
            borderWidth: 1,
            yAxisID: 'y1',
          }
        ]
      },
      topSuppliers: [],
      topDivisions: [],
      topItems: []
    };

    // Helper calculate counts with unique PR numbers and total quantities
    const getTop = (rows, index, limit = 5) => {
      const counts = {}; // key -> { prIds: Set, totalQty: number }
      rows.forEach(row => {
        const val = row[index];
        const prId = row[0]; // nomor pr is Column A (index 0)
        const qty = Number(row[7]) || 0; // Column H (QTY REQUEST)
        if (val) {
          if (!counts[val]) {
            counts[val] = { prIds: new Set(), totalQty: 0 };
          }
          if (prId) {
            counts[val].prIds.add(String(prId).trim());
          }
          counts[val].totalQty += qty;
        }
      });
      return Object.entries(counts)
        .map(([name, data]: [string, any]) => ({ 
          name, 
          count: data.prIds.size, 
          totalQty: data.totalQty 
        }))
        .sort((a: any, b: any) => b.count - a.count)
        .slice(0, limit);
    };

    stats.topSuppliers = getTop(prRows, 4); // Column E (Supplier)
    stats.topDivisions = getTop(prRows, 3);  // Column D (Divisi)
    stats.topItems = getTop(prRows, 5, 10); // Column F (Item Name) - Top 10

    res.json(stats);
  } catch (error) {
    handleApiError(res, error, "STATS");
  }
});

app.post(["/api/pr", "/api/pr/create"], async (req, res) => {
  try {
    const auth = getAuthFromRequest(req);
    const sheets = getSheets(auth);
    
    // 1. Get current PRs to determine the next sequential number
    const prData = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "Rekap_PR!A:A",
    });
    const prRows = prData.data.values || [];
    let nextNum = 1;
    if (prRows.length > 1) { // Skip header
      // Collect all PR numbers to find the max
      const nums = prRows.slice(1).map(row => {
        const match = String(row[0]).match(/^PR(\d+)/);
        return match ? parseInt(match[1]) : 0;
      });
      nextNum = Math.max(...nums) + 1;
    }
    
    const prId = `PR${String(nextNum).padStart(4, '0')}/${req.body.divCode}/V/2026`;
    const date = new Date().toISOString().split('T')[0];
    const pdfUrl = `/api/pdf/pr/${prId.replace(/\//g, '_')}.pdf`;
    
    const rowsToAppend = req.body.items.map(item => [
      prId, 
      date, 
      req.body.requester, 
      req.body.division,  // Column D (index 3)
      req.body.supplier,  // Column E (index 4)
      item.itemName,      // Column F (index 5)
      item.unit,          // Column G (index 6)
      item.qty,           // Column H (index 7)
      item.stockOnhand,   // Column I (index 8)
      item.avgSales,      // Column J (index 9)
      req.body.notes || "", // Column K (index 10) - Overall Notes
      "WAITING MANAGER APPROVAL",   // Status - Column L (index 11)
      "",                 // Column M (index 12) - MGR APPROVAL
      "",                 // Column N (index 13) - DIREKTUR APPROVAL
      pdfUrl,             // Column O (index 14) - LINK_PDF
      "",                 // PO Number - Column P (index 15)
      item.b1,            // Column Q (index 16)
      item.b2,            // Column R (index 17)
      item.b3,            // Column S (index 18)
    ]);

    // Append to Rekap_PR
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "Rekap_PR!A:Q",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: rowsToAppend
      }
    });

    // Synchronize to PR_Detail summary sheet
    await syncPrDetailRow(prId, auth);
    
    // Create real PDF
    await createPrPdf(prId, {
      date,
      requester: req.body.requester,
      division: req.body.division,
      supplier: req.body.supplier,
      notes: req.body.notes || "",
      items: req.body.items.map(item => ({
        ...item,
        avgSales: (Number(item.b1||0)+Number(item.b2||0)+Number(item.b3||0))/3
      }))
    }, auth);

    // Upload to Google Drive as background / backup process
    const fileName = `${prId.replace(/\//g, "_")}.pdf`;
    const filePath = path.join(PDF_DIR, fileName);
    console.log(`[PR] Attempting backup Drive upload for ${fileName}`);
    uploadToDrive(filePath, fileName, auth).then(async (driveLink) => {
        console.log(`[PR] Drive Backup upload result for ${prId}: ${driveLink || 'FAILED'}`);
        if (driveLink) {
            try {
                const currentData = await sheets.spreadsheets.values.get({
                    spreadsheetId: SPREADSHEET_ID,
                    range: "Rekap_PR!A:A"
                });
                const rows = currentData.data.values || [];
                for (let i = 0; i < rows.length; i++) {
                    if (rows[i][0] === prId) {
                        await sheets.spreadsheets.values.update({
                            spreadsheetId: SPREADSHEET_ID,
                            range: `Rekap_PR!O${i + 1}`,
                            valueInputOption: "USER_ENTERED",
                            requestBody: { values: [[driveLink]] }
                        });
                        console.log(`[PR] Updated link for ${prId} on row ${i + 1} with Drive link: ${driveLink}`);
                    }
                }
                // Sync to PR_Detail after updating PDF link
                await syncPrDetailRow(prId, auth);
            } catch (sheetErr: any) {
                console.error(`[PR] Failed to update Sheets with Google Drive link:`, sheetErr.message);
            }
        } else {
            const absolutePdfUrl = `${getAppUrl(req)}/api/pdf/pr/${prId.replace(/\//g, '_')}.pdf`;
            try {
                const currentData = await sheets.spreadsheets.values.get({
                    spreadsheetId: SPREADSHEET_ID,
                    range: "Rekap_PR!A:A"
                });
                const rows = currentData.data.values || [];
                for (let i = 0; i < rows.length; i++) {
                    if (rows[i][0] === prId) {
                        await sheets.spreadsheets.values.update({
                            spreadsheetId: SPREADSHEET_ID,
                            range: `Rekap_PR!O${i + 1}`,
                            valueInputOption: "USER_ENTERED",
                            requestBody: { values: [[absolutePdfUrl]] }
                        });
                        console.log(`[PR] Updated link for ${prId} on row ${i + 1} with local absolute fallback URL`);
                    }
                }
                // Sync to PR_Detail after updating PDF link
                await syncPrDetailRow(prId, auth);
            } catch (sheetErr: any) {
                console.error(`[PR] Failed to update Sheets with fallback absolute link:`, sheetErr.message);
            }
        }
    }).catch(err => {
        console.warn(`[PR] Drive Backup upload failed: ${err.message}`);
    });

    // Send WhatsApp notifications to Manager/Director in background
    notifyNewPR(prId, req.body, req).catch(err => {
      console.error("[WHATSAPP] New PR notification failed:", err.message);
    });

    res.json({ success: true, pr: { id: prId, pdfLink: pdfUrl } });
  } catch (error: any) {
    handleApiError(res, error, "PR_CREATE");
  }
});

app.get("/api/pr", async (req, res) => {
  try {
    const auth = getAuthFromRequest(req);
    const sheets = getSheets(auth);
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "Rekap_PR!A2:S",
    });
    const rows = response.data.values || [];
    const prs = rows.map((row, i) => ({
      rowIndex: i + 2,
      id: row[0],
      date: row[1],
      requester: row[2],
      division: row[3],
      supplier: row[4],
      itemName: row[5],
      unit: row[6],
      qty: row[7],
      stockOnhand: row[8],
      avgSales: row[9],
      notes: row[10],
      status: row[11],
      mgrApp: row[12],
      dirApp: row[13],
      pdfLink: row[14] ? String(row[14]).trim() : `/api/pdf/pr/${String(row[0] || "").trim().replace(/\//g, '_')}.pdf`,
      poNumber: row[15],
      b1: row[16],
      b2: row[17],
      b3: row[18],
    }));
    res.json(prs.reverse()); // Newest first
  } catch (error) {
    handleApiError(res, error, "PR_LIST");
  }
});

app.get("/api/wa-diagnostics", async (req, res) => {
  try {
    const token = getWaToken();
    const isDefaultToken = !token || token.startsWith("EAATixkW");

    const tokenPreview = token 
      ? (token.length > 15 ? `${token.slice(0, 8)}...${token.slice(-8)} (Length: ${token.length})` : `Short Token (${token.length})`)
      : "Not Configured";

    const users = await getNotificationUsers();
    const systemUsers = users.map(u => ({
      username: u.username,
      displayName: u.displayName,
      role: u.role,
      divisionCode: u.divisionCode,
      wa: u.wa,
      isManagerOrDirector: isManagerOrDirector(u.role, u.divisionCode),
      isAdmin: isAdmin(u.role)
    }));

    res.json({
      success: true,
      tokenSet: !!token && !isDefaultToken,
      tokenPreview,
      isDefaultToken,
      rawToken: token,
      diagnostics: {
        totalUsersInDatabase: users.length,
        managersAndDirectorsCount: systemUsers.filter(u => u.isManagerOrDirector).length,
        adminsCount: systemUsers.filter(u => u.isAdmin).length,
        usersWithWhatsAppCount: systemUsers.filter(u => !!u.wa).length
      },
      systemUsers,
      logs: waLogs
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/api/wa-save-token", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token || !token.trim()) {
      return res.status(400).json({ success: false, message: "Token tidak boleh kosong." });
    }

    const configPath = path.join(process.cwd(), "config_wa.json");
    fs.writeFileSync(configPath, JSON.stringify({ WA_API_TOKEN: token.trim() }, null, 2), "utf-8");
    
    // Also update current process env
    process.env.WA_API_TOKEN = token.trim();

    res.json({ success: true, message: "Token WhatsApp berhasil disimpan dan diaktifkan secara instan!" });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/api/wa-test-send", async (req, res) => {
  const { target, message } = req.body;
  
  if (!target || !message) {
    return res.status(400).json({ success: false, message: "Nomor WA target dan isi pesan wajib diisi." });
  }

  try {
    const success = await sendWhatsApp(target, message, "Manual Diagnostics", "ADMIN", "TEST_DIAGNOSTIC");
    const latestLog = waLogs[0];
    res.json({ 
      success, 
      log: latestLog 
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/api/po", async (req, res) => {
  try {
    const auth = getAuthFromRequest(req);
    const sheets = getSheets(auth);
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "Rekap_PO!A2:U", // Expanded range
    });
    const rows = response.data.values || [];
    const pos = rows.map((row, i) => ({
      rowIndex: i + 2,
      prId: row[0],
      purchaseName: row[1],
      poNo: row[2],
      date: row[3],
      deliveryDate: row[4],
      supplier: row[5],
      itemName: row[6],
      unit: row[7],
      qty: row[8],
      price: row[9],
      total: row[10],
      notes: row[11],
      pdfLink: row[12] ? String(row[12]).trim() : `/api/pdf/po/${String(row[2] || "").trim().replace(/\//g, '_')}.pdf`,
      status: row[13],
      division: row[14], 
      discount: row[15], 
      tax: row[16],      
      others: row[17],   
      grandTotal: row[18],
      discountPercent: row[19], // T
      taxPercent: row[20]       // U
    }));
    res.json(pos.reverse()); // Newest first
  } catch (error) {
    handleApiError(res, error, "PO_LIST");
  }
});

app.post("/api/pr/approve", async (req, res) => {
  try {
    const { prId, role, user, action, reason } = req.body;
    console.log(`[APPROVE] Request: prId=${prId}, role=${role}, user=${user}, action=${action}`);
    
    const auth = getAuthFromRequest(req);
    const sheets = getSheets(auth);
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "Rekap_PR!A:S",
    });
    const rows = response.data.values || [];
    
    let newStatus = "";
    if (action === "REJECT") newStatus = "Rejected";
    else if (action === "PENDING") {
      const roleUp = String(role || "").toUpperCase();
      newStatus = roleUp === "MANAGER" || roleUp === "MGR" ? "WAITING MANAGER APPROVAL" : "WAITING DIREKTUR APPROVAL";
    }
    else {
      const firstMatch = rows.find(row => row[0] && String(row[0]).trim() === String(prId).trim());
      const currentStatus = firstMatch ? firstMatch[11] : "";
      const roleUp = String(role || "").toUpperCase();

      if (roleUp === "MANAGER" || roleUp === "MGR") {
        newStatus = "WAITING DIREKTUR APPROVAL";
      } else if (roleUp === "DIREKTUR" || roleUp === "DIR") {
        newStatus = "WAITING CREATED PO";
      } else if (roleUp === "ADMIN") {
        if (currentStatus === "WAITING MANAGER APPROVAL") newStatus = "WAITING DIREKTUR APPROVAL";
        else newStatus = "WAITING CREATED PO";
      }
    }

    const matchingIndices = rows
      .map((row, index) => (row[0] && String(row[0]).trim() === String(prId).trim() ? index : -1))
      .filter(index => index !== -1);

    console.log(`[APPROVE] Found ${matchingIndices.length} matching rows for PR ${prId}`);

    for (const rowIndex of matchingIndices) {
      const currentRow = rows[rowIndex];
      const currentStatus = currentRow[11];

      // Update Status (Column L = 11)
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `Rekap_PR!L${rowIndex + 1}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[newStatus]] }
      });

      // Update Approver details
      if (action === "APPROVE") {
        let approverCol = "";
        const roleUp = String(role || "").toUpperCase().trim();
        const firstMatch = rows.find(row => row[0] && String(row[0]).trim() === String(prId).trim());
        const rowStatus = currentRow[11] || (firstMatch ? firstMatch[11] : "");
        const statusUp = String(rowStatus || "").toUpperCase().trim();
        
        console.log(`[APPROVE] Evaluating role: ${roleUp}, status: ${statusUp}`);

        if (roleUp === 'MANAGER' || roleUp === 'MGR' || (roleUp === 'ADMIN' && statusUp === 'WAITING MANAGER APPROVAL')) {
          approverCol = 'M';
        } else if (roleUp === 'DIREKTUR' || roleUp === 'DIR' || (roleUp === 'ADMIN' && statusUp === 'WAITING DIREKTUR APPROVAL')) {
          approverCol = 'N';
        }

        if (approverCol) {
          const approvalText = `${user} (APPROVE)`;
          console.log(`[APPROVE] Updating column ${approverCol} for row ${rowIndex + 1} with ${approvalText}`);
          await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `Rekap_PR!${approverCol}${rowIndex + 1}`,
            valueInputOption: "USER_ENTERED",
            requestBody: { values: [[approvalText]] }
          });
        }
      }

      if (action === "REJECT" && reason) {
        const currentNote = currentRow[10] || "";
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `Rekap_PR!K${rowIndex + 1}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [[currentNote + " | REJECTED: " + reason]] }
        });
      }
    }

    if (newStatus === "WAITING DIREKTUR APPROVAL") {
      const matchingRows = rows.filter(row => row[0] && String(row[0]).trim() === String(prId).trim());
      if (matchingRows.length > 0) {
        const firstRow = matchingRows[0];
        const prDetails = {
          requester: firstRow[2],
          division: firstRow[3],
          supplier: firstRow[4],
          notes: firstRow[10],
          items: matchingRows.map(row => ({
            itemName: row[5],
            qty: row[7]
          }))
        };
        // Notify Direktur in background (pass user who approved it)
        notifyDirekturPR(prId, prDetails, user, req).catch(err => {
          console.error("[WHATSAPP] Direktur approval notification failed:", err.message);
        });
      }
    }

    // Extract requester name to notify them
    let prRequester = "";
    const creatorRows = rows.filter(row => row[0] && String(row[0]).trim() === String(prId).trim());
    if (creatorRows.length > 0) {
      prRequester = creatorRows[0][2];
    }

    // Notify the creator of the PR (requester) about the status change
    notifyPRApprovalChange(
      prId,
      user,
      role,
      newStatus,
      action === "REJECT",
      reason,
      prRequester,
      req
    ).catch(err => {
      console.error("[WHATSAPP] Approval notification failed:", err.message);
    });

    // Sync with PR_Detail summary sheet
    await syncPrDetailRow(prId, auth);

    res.json({ success: true });
  } catch (error: any) {
    handleApiError(res, error, "APPROVE");
  }
});

app.post(["/api/po", "/api/po/create"], async (req, res) => {
  try {
    const { prId, purchaseName, supplier, deliveryDate, items, notes, discount, tax, others, subTotal, grandTotal, discountPercent, taxPercent, division } = req.body;
    const auth = getAuthFromRequest(req);
    const sheets = getSheets(auth);
    
    // Generate Sequential PO Number: PO/SAU/05/2026/XXXX
    const poData = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "Rekap_PO!C:C",
    });
    const poRows = poData.data.values || [];
    let nextPoNum = 1;
    if (poRows.length > 1) {
      const nums = poRows.slice(1).map(row => {
        const match = String(row[0]).match(/(\d+)$/);
        return match ? parseInt(match[1]) : 0;
      });
      nextPoNum = Math.max(...nums, 0) + 1;
    }
    const poNo = `PO/SAU/05/2026/${String(nextPoNum).padStart(4, '0')}`;
    const date = new Date().toISOString().split('T')[0];

    // Create PO PDF from Template
    await createPoPdf(poNo, {
      prId, 
      purchaseName, 
      supplier, 
      deliveryDate, 
      items,
      notes,
      discount,
      tax,
      others,
      subTotal,
      grandTotal,
      discountPercent,
      taxPercent,
      division
    }, auth);

    const poPdfUrl = `/api/pdf/po/${poNo.replace(/\//g, '_')}.pdf`;

    // Upload to PO Drive folder in the background as backup
    const poFileName = `${poNo.replace(/\//g, "_")}.pdf`;
    const poFilePath = path.join(PO_PDF_DIR, poFileName);
    uploadToDrive(poFilePath, poFileName, auth, GOOGLE_DRIVE_PO_FOLDER_ID).then(async (driveLink) => {
      console.log(`[PO] Drive Backup upload result for ${poNo}: ${driveLink || 'FAILED'}`);
      if (driveLink) {
        try {
          const currentPoData = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "Rekap_PO!C:C"
          });
          const poRows = currentPoData.data.values || [];
          for (let i = 0; i < poRows.length; i++) {
            if (poRows[i][0] === poNo) {
              await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `Rekap_PO!M${i + 1}`,
                valueInputOption: "USER_ENTERED",
                requestBody: { values: [[driveLink]] }
              });
              console.log(`[PO] Updated Rekap_PO row ${i + 1} with Drive Link: ${driveLink}`);
            }
          }
        } catch (sheetErr: any) {
          console.error(`[PO] Failed to update Sheets with Google Drive link:`, sheetErr.message);
        }
      } else {
        const absolutePoPdfUrl = `${getAppUrl(req)}/api/pdf/po/${poNo.replace(/\//g, '_')}.pdf`;
        try {
          const currentPoData = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "Rekap_PO!C:C"
          });
          const poRows = currentPoData.data.values || [];
          for (let i = 0; i < poRows.length; i++) {
            if (poRows[i][0] === poNo) {
              await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `Rekap_PO!M${i + 1}`,
                valueInputOption: "USER_ENTERED",
                requestBody: { values: [[absolutePoPdfUrl]] }
              });
              console.log(`[PO] Updated Rekap_PO row ${i + 1} with absolute local fallback URL`);
            }
          }
        } catch (sheetErr: any) {
          console.error(`[PO] Failed to update Sheets with absolute local link fallback:`, sheetErr.message);
        }
      }
    }).catch(err => {
      console.warn(`[PO] Drive Backup upload failed: ${err.message}`);
    });

    // Get PR data once for status updates
    const prData = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "Rekap_PR!A:F",
    });
    const prTable = prData.data.values || [];

    // Process all items
    const rowsToAppend: any[][] = [];
    const cleanPrId = String(prId || "").trim().toUpperCase();

    for (const item of items) {
      const cleanItemName = String(item.itemName || "").trim().toUpperCase();
      // Find row in Rekap_PR to update status
      const rowIndex = prTable.findIndex(row => 
        row[0] && String(row[0]).trim().toUpperCase() === cleanPrId && 
        row[5] && String(row[5]).trim().toUpperCase() === cleanItemName
      );
      
      if (rowIndex !== -1) {
        // Update Rekap_PR: Status is index 11 (L), PO is index 15 (P)
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `Rekap_PR!L${rowIndex + 1}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [["WAITING RECEIVE"]] }
        });

        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `Rekap_PR!P${rowIndex + 1}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [[poNo]] }
        });
      }

      // Find division from PR table
      const prMatch = prTable.find(row => row[0] && String(row[0]).trim().toUpperCase() === cleanPrId);
      const prDivision = prMatch ? prMatch[3] : "";
      const selectedDev = division || prDivision || "";

      // Prepare row for Rekap_PO
      rowsToAppend.push([
        prId,            // A: NO PR
        purchaseName,    // B: NAMA PURCHASE
        poNo,            // C: NO PO
        date,            // D: TANGGAL PO
        deliveryDate,    // E: TANGGAL KIRIM
        supplier,        // F: SUPPLIER
        item.itemName,   // G: NAMA BARANG
        item.unit || "", // H: SATUAN
        item.qty,        // I: QTY
        item.price,      // J: HARGA SATUAN
        item.qty * item.price, // K: HARGA TOTAL
        notes || "",     // L: CATATAN
        poPdfUrl,        // M: LINK PDF PO
        "PO CREATED",    // N: STATUS PO
        selectedDev,     // O: DIVISION
        discount || 0,   // P: DISCOUNT
        tax || 0,        // Q: TAX
        others || 0,     // R: OTHERS
        grandTotal || 0, // S: GRAND TOTAL
        discountPercent || 0, // T: DISCOUNT %
        taxPercent || 0      // U: TAX %
      ]);
    }

    // Append all rows to Rekap_PO
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "Rekap_PO!A:U",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: rowsToAppend
      }
    });

    // Sync with PR_Detail summary sheet
    await syncPrDetailRow(prId, auth);

    res.json({ success: true, poNo, pdfLink: poPdfUrl });
  } catch (error: any) {
    handleApiError(res, error, "PO_CREATE");
  }
});

app.post("/api/pr/finish", async (req, res) => {
  try {
    const { prId } = req.body;
    const auth = getAuthFromRequest(req);
    const sheets = getSheets(auth);
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "Rekap_PR!A:A",
    });
    const rows = response.data.values || [];
    const cleanPrId = String(prId || "").trim().toUpperCase();
    const matchingIndices = rows
      .map((row, index) => (row[0] && String(row[0]).trim().toUpperCase() === cleanPrId ? index : -1))
      .filter(index => index !== -1);

    for (const rowIndex of matchingIndices) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `Rekap_PR!L${rowIndex + 1}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [["FINISH"]] }
      });
    }
    // Sync with PR_Detail summary sheet
    await syncPrDetailRow(prId, auth);

    res.json({ success: true });
  } catch (error: any) {
    handleApiError(res, error, "PR_FINISH");
  }
});

// --- ADMIN SETTINGS APIs ---

app.put("/api/pr/:index", async (req, res) => {
  try {
    const auth = getAuthFromRequest(req);
    const sheets = getSheets(auth);
    const editIndex = parseInt(req.params.index); // 1-indexed from frontend
    const { id: prId, date, requester, division, supplier, itemName, unit, qty, stockOnhand, avgSales, notes, status, pdfLink, poNumber, b1, b2, b3 } = req.body;
    
    console.log(`[EDIT] Request for row ${editIndex}, PR ID ${prId}`);

    // Get all rows to find matching PR IDs
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "Rekap_PR!A:S",
    });
    const rows = response.data.values || [];
    
    // Find all rows with the same PR ID
    const matchingIndices = rows
      .map((row, index) => (row[0] && String(row[0]).trim() === String(prId).trim() ? index : -1))
      .filter(index => index !== -1);

    console.log(`[EDIT] Updating ${matchingIndices.length} rows for PR ${prId}`);

    // Update shared header fields for all rows of this PR
    for (const rowIndex of matchingIndices) {
      // Columns: A(0):ID, B(1):Date, C(2):Req, D(3):Div, E(4):Sup, L(11):Status, O(14):PDF, P(15):PO
      // We update these shared fields for every row in the PR
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `Rekap_PR!A${rowIndex + 1}:E${rowIndex + 1}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[prId, date, requester, division, supplier]] }
      });
      
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `Rekap_PR!L${rowIndex + 1}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[status]] }
      });

      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `Rekap_PR!O${rowIndex + 1}:P${rowIndex + 1}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[pdfLink, poNumber]] }
      });
    }

    // Update the specific row's item details (using the absolute index passed)
    // Row index in sheet = editIndex (since frontend passed rowIndex which is 1-indexed absolute)
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Rekap_PR!F${editIndex}:K${editIndex}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[itemName, unit, qty, stockOnhand, avgSales, notes]] }
    });
    
    // Update B1, B2, B3 (Columns Q, R, S) for the specific row
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Rekap_PR!Q${editIndex}:S${editIndex}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[b1, b2, b3]] }
    });

    // Sync with PR_Detail summary sheet
    await syncPrDetailRow(prId, auth);

    res.json({ success: true });
  } catch (error: any) { 
    handleApiError(res, error, "EDIT_PR");
  }
});

// 1. Users Management
app.get("/api/admin/users", async (req, res) => {
  try {
    const auth = getAuthFromRequest(req);
    const sheets = getSheets(auth);
    const response = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: "User_Role!A2:H" });
    const rows = response.data.values || [];
    res.json(rows.map((r, i) => ({ id: i + 2, username: r[0], password: r[1], fullName: r[2], division: r[3], divCode: r[4], wa: r[5], role: r[6], access: r[7] })));
  } catch (error: any) {
    handleApiError(res, error, "ADMIN_USERS_GET");
  }
});

app.post("/api/admin/users", async (req, res) => {
  try {
    const auth = getAuthFromRequest(req);
    const sheets = getSheets(auth);
    const { username, password, fullName, division, divCode, wa, role, access } = req.body;
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "User_Role!A:H",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[username, password, fullName, division, divCode, wa, role, access]] }
    });
    res.json({ success: true });
  } catch (error: any) {
    handleApiError(res, error, "ADMIN_USERS_POST");
  }
});

app.delete("/api/admin/users/:index", async (req, res) => {
   try {
     const auth = getAuthFromRequest(req);
     const sheets = getSheets(auth);
     const index = parseInt(req.params.index);
     await sheets.spreadsheets.batchUpdate({
       spreadsheetId: SPREADSHEET_ID,
       requestBody: {
         requests: [{ deleteDimension: { range: { sheetId: (await getSheetId("User_Role", auth)), dimension: "ROWS", startIndex: index - 1, endIndex: index } } }]
       }
     });
     res.json({ success: true });
   } catch (error: any) {
     handleApiError(res, error, "ADMIN_USERS_DELETE");
   }
});

app.put("/api/admin/users/:index", async (req, res) => {
  try {
    const auth = getAuthFromRequest(req);
    const sheets = getSheets(auth);
    const index = parseInt(req.params.index);
    const { username, password, fullName, division, divCode, wa, role, access } = req.body;
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `User_Role!A${index}:H${index}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[username, password, fullName, division, divCode, wa, role, access]] }
    });
    res.json({ success: true });
  } catch (error: any) {
    handleApiError(res, error, "ADMIN_USERS_PUT");
  }
});

// 2. Master Stock Management
app.get("/api/admin/stock", async (req, res) => {
  try {
    const auth = getAuthFromRequest(req);
    const sheets = getSheets(auth);
    const response = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: "Master_Stock!A2:E" });
    const rows = response.data.values || [];
     res.json(rows.map((r, i) => ({ id: i + 2, name: r[0], category: r[1], supplier: r[2], unit: r[3], price: r[4] })));
  } catch (error: any) {
    handleApiError(res, error, "ADMIN_STOCK_GET");
  }
});

app.post("/api/admin/stock", async (req, res) => {
  try {
    const auth = getAuthFromRequest(req);
    const sheets = getSheets(auth);
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "Master_Stock!A:E",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[req.body.name, req.body.category, req.body.supplier, req.body.unit, req.body.price]] }
    });
    res.json({ success: true });
  } catch (error: any) {
    handleApiError(res, error, "ADMIN_STOCK_POST");
  }
});

app.put("/api/admin/stock/:index", async (req, res) => {
  try {
    const auth = getAuthFromRequest(req);
    const sheets = getSheets(auth);
    const index = parseInt(req.params.index);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Master_Stock!A${index}:E${index}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[req.body.name, req.body.category, req.body.supplier, req.body.unit, req.body.price]] }
    });
    res.json({ success: true });
  } catch (error: any) {
    handleApiError(res, error, "ADMIN_STOCK_PUT");
  }
});

app.delete("/api/admin/stock/:index", async (req, res) => {
  try {
    const auth = getAuthFromRequest(req);
    const sheets = getSheets(auth);
    const index = parseInt(req.params.index);
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{ deleteDimension: { range: { sheetId: (await getSheetId("Master_Stock", auth)), dimension: "ROWS", startIndex: index - 1, endIndex: index } } }]
      }
    });
    res.json({ success: true });
  } catch (error: any) {
    handleApiError(res, error, "ADMIN_STOCK_DELETE");
  }
});

app.delete("/api/admin/pr/:index", async (req, res) => {
  try {
    const auth = getAuthFromRequest(req);
    const sheets = getSheets(auth);
    const index = parseInt(req.params.index);

    // Fetch the PR ID of the row before we delete it
    const rowRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `Rekap_PR!A${index}:A${index}`,
    });
    const prId = rowRes.data.values?.[0]?.[0];

    // Delete the row from Rekap_PR
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{ deleteDimension: { range: { sheetId: (await getSheetId("Rekap_PR", auth)), dimension: "ROWS", startIndex: index - 1, endIndex: index } } }]
      }
    });

    // Sync with PR_Detail summary sheet
    if (prId) {
      await syncPrDetailRow(prId, auth);
    }

    res.json({ success: true });
  } catch (error: any) {
    handleApiError(res, error, "ADMIN_PR_DELETE");
  }
});

// Helper to get SheetId by Title
async function getSheetId(title: string, auth: any) {
  const sheets = getSheets(auth);
  const res = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheet = res.data.sheets?.find(s => s.properties?.title === title);
  return sheet ? sheet.properties?.sheetId : 0;
}

app.get("/api/pdf/pr/:id", async (req, res) => {
  let fileName = req.params.id;
  if (!fileName.toLowerCase().endsWith('.pdf')) fileName += '.pdf';
  
  const filePath = path.join(PDF_DIR, fileName);
  console.log(`[PDF-PR] Request for ${fileName}. Searching in ${PDF_DIR}`);
  
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Content-Disposition', 'inline; filename="' + fileName + '"');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self' *;");
    res.removeHeader('X-Frame-Options');
    
    console.log(`[PDF-PR] Serving local ${fileName} (${stats.size} bytes)`);
    return fs.createReadStream(filePath).pipe(res);
  }

  // Fallback: Try to find on Google Drive
  console.log(`[PDF-PR] Local ${fileName} not found. Attempting to fetch from Google Drive...`);
  try {
    const auth = getAuthFromRequest(req);
    const drive = getDrive(auth);
    
    // Search for file in the designated folder
    const searchRes = await drive.files.list({
      q: `name = '${fileName}' and parents in '${GOOGLE_DRIVE_FOLDER_ID}'`,
      fields: 'files(id, name)',
      pageSize: 1
    });

    const files = searchRes.data.files;
    if (files && files.length > 0) {
      const fileId = files[0].id!;
      console.log(`[PDF-PR] Found ${fileName} on Drive (ID: ${fileId}). Streaming to client...`);
      
      const driveStream = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'stream' }
      );

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="' + fileName + '"');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Security-Policy', "frame-ancestors 'self' *;");
      res.removeHeader('X-Frame-Options');

      // pipe to response and also save locally for future requests
      const localStream = fs.createWriteStream(filePath);
      driveStream.data.pipe(localStream);
      
      return driveStream.data.pipe(res);
    }
  } catch (err: any) {
    console.error(`[PDF-PR] Drive fallback failed for ${fileName}:`, err.message);
  }
  
  console.warn(`[PDF-PR] File not found anywhere: ${filePath}`);
  res.status(404).send("File not found");
});

app.get("/api/pdf/po/:id", async (req, res) => {
  let fileName = req.params.id;
  if (!fileName.toLowerCase().endsWith('.pdf')) fileName += '.pdf';
  
  const filePath = path.join(PO_PDF_DIR, fileName);
  console.log(`[PDF-PO] Request for ${fileName}. Searching in ${PO_PDF_DIR}`);
  
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Content-Disposition', 'inline; filename="' + fileName + '"');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self' *;");
    res.removeHeader('X-Frame-Options');
    
    console.log(`[PDF-PO] Serving local ${fileName} (${stats.size} bytes)`);
    return fs.createReadStream(filePath).pipe(res);
  }

  // Fallback: Try to find on Google Drive
  console.log(`[PDF-PO] Local ${fileName} not found. Attempting to fetch from Google Drive...`);
  try {
    const auth = getAuthFromRequest(req);
    const drive = getDrive(auth);
    
    // Search for file in the designated folder
    const searchRes = await drive.files.list({
      q: `name = '${fileName}' and parents in '${GOOGLE_DRIVE_PO_FOLDER_ID}'`,
      fields: 'files(id, name)',
      pageSize: 1
    });

    const files = searchRes.data.files;
    if (files && files.length > 0) {
      const fileId = files[0].id!;
      console.log(`[PDF-PO] Found ${fileName} on Drive (ID: ${fileId}). Streaming to client...`);
      
      const driveStream = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'stream' }
      );

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="' + fileName + '"');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Security-Policy', "frame-ancestors 'self' *;");
      res.removeHeader('X-Frame-Options');

      // pipe to response and also save locally for future requests
      const localStream = fs.createWriteStream(filePath);
      driveStream.data.pipe(localStream);
      
      return driveStream.data.pipe(res);
    }
  } catch (err: any) {
    console.error(`[PDF-PO] Drive fallback failed for ${fileName}:`, err.message);
  }
  
  console.warn(`[PDF-PO] File not found anywhere: ${filePath}`);
  res.status(404).send("File not found");
});

app.get("/api/po", (req, res) => res.json(poList));

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }
  app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));
}
startServer();
