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
  console.log("Starting sheet inspection...");
  try {
    const auth = getAuthClient();
    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheetId = "1Ne5xeN2zEmScf9CVX5x9WguQZPM0Vk6dzQJ-n7xRfWU";
    
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    console.log("Sheet names:");
    const sheetNames = meta.data.sheets?.map(s => s.properties?.title) || [];
    console.log(sheetNames);
    
    for (const name of sheetNames) {
      console.log(`\n--- Sheet: ${name} ---`);
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${name}!A1:Z5`,
      });
      console.log("Rows:", res.data.values);
    }
  } catch (err: any) {
    console.error("Failed to inspect sheets:", err.message);
  }
}

test();
