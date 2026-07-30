import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

async function run() {
  if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) {
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
    console.log("Attempting to upload a small text file to PR Folder...");
    const res = await drive.files.create({
      requestBody: {
        name: "test_upload.txt",
        parents: [GOOGLE_DRIVE_FOLDER_ID!],
      },
      media: {
        mimeType: "text/plain",
        body: "Hello World",
      },
    });
    console.log("Success! File ID:", res.data.id);
    
    // Clean up
    await drive.files.delete({ fileId: res.data.id! });
    console.log("Cleaned up file successfully.");
  } catch (error: any) {
    console.error("Upload failed with error:", error.message);
    if (error.response?.data) {
      console.error(JSON.stringify(error.response.data, null, 2));
    }
  }
}

run();
