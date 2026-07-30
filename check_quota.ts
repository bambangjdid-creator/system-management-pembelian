import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

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

  try {
    console.log("Fetching Drive about/quota information...");
    const about = await drive.about.get({
      fields: "storageQuota, user",
    });
    console.log("User Info:", about.data.user);
    console.log("Storage Quota:", about.data.storageQuota);

    console.log("\nEmptying Trash for the Service Account...");
    await drive.files.emptyTrash();
    console.log("Trash emptied successfully!");

    const aboutAfter = await drive.about.get({
      fields: "storageQuota",
    });
    console.log("Storage Quota After:", aboutAfter.data.storageQuota);
  } catch (error: any) {
    console.error("Error:", error.message);
    if (error.response?.data) {
      console.error("Details:", JSON.stringify(error.response.data, null, 2));
    }
  }
}

run();
