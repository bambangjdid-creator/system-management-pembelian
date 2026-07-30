import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
const TEMPLATE_PO_ID = process.env.TEMPLATE_PO_ID;

async function run() {
  if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY || !TEMPLATE_PO_ID) {
    console.error("Missing credentials");
    return;
  }

  const auth = new google.auth.JWT(
    GOOGLE_SERVICE_ACCOUNT_EMAIL,
    undefined,
    GOOGLE_PRIVATE_KEY,
    ["https://www.googleapis.com/auth/drive"]
  );

  const drive = google.drive({ version: "v3", auth });

  try {
    console.log("Fetching PO Template plain text...");
    const res = await drive.files.export({
      fileId: TEMPLATE_PO_ID,
      mimeType: "text/plain",
    });
    console.log("Template Text Contents:\n");
    console.log(res.data);
  } catch (error: any) {
    console.error("Error:", error.message);
  }
}

run();
