const { google } = require("googleapis");
const dotenv = require("dotenv");
const path = require("path");

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
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/documents",
    ],
  });
};

async function test() {
  console.log("Starting doc template inspection...");
  try {
    const auth = getAuthClient();
    const docs = google.docs({ version: "v1", auth });
    const drive = google.drive({ version: "v3", auth });
    const TEMPLATE_PR_ID = '17zKJBclKn8tjTQcUJy52zPnXc7mPTZ61';
    
    // Check file metadata
    const fileMeta = await drive.files.get({ fileId: TEMPLATE_PR_ID, fields: "name, mimeType" });
    console.log("File Name:", fileMeta.data.name);
    console.log("MimeType:", fileMeta.data.mimeType);

    const doc = await docs.documents.get({ documentId: TEMPLATE_PR_ID });
    
    // Helper to print content
    const textElements = [];
    function extractText(element) {
      if (element.textRun) {
        textElements.push(element.textRun.content);
      }
    }
    
    if (doc.data.body && doc.data.body.content) {
      for (const item of doc.data.body.content) {
        if (item.paragraph) {
          for (const el of item.paragraph.elements) {
            extractText(el);
          }
        } else if (item.table) {
          for (const row of item.table.tableRows) {
            for (const cell of row.tableCells) {
              for (const p of cell.content) {
                if (p.paragraph) {
                  for (const el of p.paragraph.elements) {
                    extractText(el);
                  }
                }
              }
            }
          }
        }
      }
    }
    
    const fullText = textElements.join("");
    console.log("\n--- Full Document Text Content ---");
    console.log(fullText);
    console.log("----------------------------------");
    
  } catch (err) {
    console.error("Failed to inspect document:", err.message);
  }
}

test();
