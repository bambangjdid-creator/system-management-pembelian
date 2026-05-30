import { google } from "googleapis";
import dotenv from "dotenv";

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

async function test() {
  console.log("Starting authentication test...");
  console.log("Email:", process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  try {
    const auth = getAuthClient();
    console.log("Auth client created, requesting access token...");
    const token = await auth.getAccessToken();
    console.log("Success! Access token retrieved.");
    
    // Attempt a simple call to the spreadsheet
    const sheets = google.sheets({ version: "v4", auth });
    console.log("Testing Spreadsheet access for ID: 1Ne5xeN2zEmScf9CVX5x9WguQZPM0Vk6dzQJ-n7xRfWU...");
    const response = await sheets.spreadsheets.get({
      spreadsheetId: "1Ne5xeN2zEmScf9CVX5x9WguQZPM0Vk6dzQJ-n7xRfWU",
    });
    console.log("Successfully connected to Spreadsheet! Title:", response.data.properties?.title);
  } catch (err: any) {
    console.error("Test failed!");
    console.error("Error Message:", err.message);
    console.error("Error Code / Status:", err.code || err.response?.status);
    console.error("Full Error object:", JSON.stringify(err, null, 2));
  }
}

test();
