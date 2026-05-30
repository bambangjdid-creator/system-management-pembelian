import { google } from "googleapis";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const getAuthClient = () => {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let privateKey = process.env.GOOGLE_PRIVATE_KEY;
  
  if (!email || !privateKey) {
     throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY");
  }

  if (privateKey.startsWith('{')) {
    try {
        const json = JSON.parse(privateKey);
        privateKey = json.private_key || privateKey;
    } catch (e) {
    }
  }

  privateKey = privateKey.trim().replace(/^["']|["']$/g, '');
  let formattedKey = privateKey.replace(/\\n/g, "\n");
  
  const header = "-----BEGIN PRIVATE KEY-----";
  const footer = "-----END PRIVATE KEY-----";
  
  if (!formattedKey.includes(header)) formattedKey = header + "\n" + formattedKey;
  if (!formattedKey.includes(footer)) formattedKey = formattedKey + "\n" + footer;

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

const GOOGLE_DRIVE_FOLDER_ID = "1GjYzgLWqoCt6FzihhD6q5xsv0MYYRb0c";

async function testUpload() {
  const auth = getAuthClient();
  const drive = google.drive({ version: "v3", auth });
  
  const testFile = "PR_PDF/PR9558_PCL_V_2026.pdf";
  if (!fs.existsSync(testFile)) {
    console.error("Test file does not exist locally:", testFile);
    return;
  }

  console.log(`[TEST-DRIVE] Attemping upload to drive...`);
  try {
    const response = await drive.files.create({
      requestBody: {
        name: "TEST_UPLOAD_PR9558_PCL_V_2026.pdf",
        parents: [GOOGLE_DRIVE_FOLDER_ID],
      },
      media: {
        mimeType: "application/pdf",
        body: fs.createReadStream(testFile),
      },
      fields: "id, webViewLink",
    });

    console.log("[TEST-DRIVE] File created successfully on Google Drive! ID:", response.data.id);
    console.log("[TEST-DRIVE] webViewLink:", response.data.webViewLink);

    console.log("[TEST-DRIVE] Setting permissions to anyone/reader...");
    try {
      await drive.permissions.create({
        fileId: response.data.id!,
        requestBody: { role: 'reader', type: 'anyone' }
      });
      console.log("[TEST-DRIVE] Permission set successfully!");
    } catch (pe: any) {
      console.error("[TEST-DRIVE] Failed to set permissions:", pe.message);
    }
  } catch (err: any) {
    console.error("[TEST-DRIVE] Upload failed:", err);
  }
}

testUpload();
