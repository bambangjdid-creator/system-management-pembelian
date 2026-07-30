import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
const GOOGLE_DRIVE_PO_FOLDER_ID = process.env.GOOGLE_DRIVE_PO_FOLDER_ID;
const TEMPLATE_PR_ID = process.env.TEMPLATE_PR_ID;
const TEMPLATE_PO_ID = process.env.TEMPLATE_PO_ID;

async function run() {
  if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) {
    console.error("Missing Google credentials in env");
    return;
  }

  const auth = new google.auth.JWT(
    GOOGLE_SERVICE_ACCOUNT_EMAIL,
    undefined,
    GOOGLE_PRIVATE_KEY,
    ["https://www.googleapis.com/auth/drive"]
  );

  const drive = google.drive({ version: "v3", auth });

  const targets = [
    { name: "Spreadsheet", id: SPREADSHEET_ID },
    { name: "PR Folder", id: GOOGLE_DRIVE_FOLDER_ID },
    { name: "PO Folder", id: GOOGLE_DRIVE_PO_FOLDER_ID },
    { name: "PR Template", id: TEMPLATE_PR_ID },
    { name: "PO Template", id: TEMPLATE_PO_ID }
  ];

  for (const target of targets) {
    console.log(`\nChecking ${target.name} (ID: ${target.id})...`);
    if (!target.id) {
      console.log("-> ID is missing or empty in .env");
      continue;
    }
    try {
      const file = await drive.files.get({
        fileId: target.id,
        fields: "id, name, owners, capabilities, shared, permissions"
      });
      console.log(`-> Success! Name: "${file.data.name}"`);
      console.log(`-> Owners:`, file.data.owners?.map(o => o.emailAddress).join(", "));
      console.log(`-> Permissions count:`, file.data.permissions?.length);
    } catch (err: any) {
      console.error(`-> Failed: ${err.message}`);
    }
  }
}

run();
