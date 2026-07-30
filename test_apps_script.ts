import dotenv from "dotenv";
dotenv.config();

const GOOGLE_SCRIPT_WEB_APP_URL = process.env.GOOGLE_SCRIPT_WEB_APP_URL || "";
const TEMPLATE_PO_ID = process.env.TEMPLATE_PO_ID || "";
const GOOGLE_DRIVE_PO_FOLDER_ID = process.env.GOOGLE_DRIVE_PO_FOLDER_ID || "";

async function run() {
  console.log("Web App URL:", GOOGLE_SCRIPT_WEB_APP_URL);
  console.log("Template PO ID:", TEMPLATE_PO_ID);
  console.log("Folder PO ID:", GOOGLE_DRIVE_PO_FOLDER_ID);

  if (!GOOGLE_SCRIPT_WEB_APP_URL) {
    console.error("Missing GOOGLE_SCRIPT_WEB_APP_URL");
    return;
  }

  try {
    const response = await fetch(GOOGLE_SCRIPT_WEB_APP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId: TEMPLATE_PO_ID,
        folderId: GOOGLE_DRIVE_PO_FOLDER_ID,
        fileName: "TEST_RUN_FROM_BACKEND.pdf",
        replacements: { "{{PEMINTA}}": "TEST USER" }
      })
    });
    console.log("Status:", response.status);
    const text = await response.text();
    console.log("Raw Response:", text);
  } catch (error: any) {
    console.error("Fetch error:", error.message);
  }
}

run();
