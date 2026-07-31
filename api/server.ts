import express from "express";
import path from "path";

import cors from "cors";
import { google } from "googleapis";
import dotenv from "dotenv";
import fs from "fs";
import crypto from "crypto";

dotenv.config();

import PDFDocument from "pdfkit";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

const isProduction = process.env.NODE_ENV === "production";
const isVercel = process.env.VERCEL === "1";
const PORT = Number(process.env.PORT || 3000);
const PDF_DIR = isVercel ? "/tmp/PR_PDF" : path.join(process.cwd(), "PR_PDF");
const PO_PDF_DIR = isVercel ? "/tmp/PO_PDF" : path.join(process.cwd(), "PO_PDF");

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value || value.toLowerCase().includes("replace-with")) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function requireSecret(name: string, minimumLength = 32): string {
  const value = requireEnv(name);
  const weakValues = new Set(["super-secret-key", "change-me", "changeme", "secret", "password"]);
  const lower = value.toLowerCase();
  if (value.length < minimumLength || weakValues.has(lower) || lower.includes("replace-with")) {
    throw new Error(`${name} is missing or too weak. Use a random value of at least ${minimumLength} characters.`);
  }
  return value;
}

const SPREADSHEET_ID = requireEnv("SPREADSHEET_ID");
const GOOGLE_DRIVE_FOLDER_ID = requireEnv("GOOGLE_DRIVE_FOLDER_ID");
const GOOGLE_DRIVE_PO_FOLDER_ID = requireEnv("GOOGLE_DRIVE_PO_FOLDER_ID");
const TEMPLATE_PR_ID = requireEnv("TEMPLATE_PR_ID");
const TEMPLATE_PO_ID = requireEnv("TEMPLATE_PO_ID");
const SESSION_SECRET = requireSecret("JWT_SECRET", 32);
const SESSION_TTL_SECONDS = Number(process.env.SESSION_TTL_SECONDS || 8 * 60 * 60);
const APP_BASE_URL = (process.env.APP_BASE_URL || "").replace(/\/+$/, "");
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_WEBHOOK_URL = process.env.TELEGRAM_WEBHOOK_URL || "";
const GOOGLE_SCRIPT_WEB_APP_URL = process.env.GOOGLE_SCRIPT_WEB_APP_URL || "";

if (!Number.isFinite(SESSION_TTL_SECONDS) || SESSION_TTL_SECONDS < 300) {
  throw new Error("SESSION_TTL_SECONDS must be a number >= 300");
}

if (!fs.existsSync(PDF_DIR)) {
  fs.mkdirSync(PDF_DIR, { recursive: true });
}
if (!fs.existsSync(PO_PDF_DIR)) {
  fs.mkdirSync(PO_PDF_DIR, { recursive: true });
}

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);

const isAllowedLocalDevOrigin = (origin: string) => !isProduction && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
const isLocalNetworkOrigin = (origin: string) => /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(origin);

app.use(cors({
  origin: true,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Session-Token"],
  exposedHeaders: ["X-Google-Token-Expired"],
  maxAge: 86400,
}));
app.use(express.json({ limit: "1mb" }));

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

function createRateLimiter(options: { windowMs: number; max: number; label: string }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const now = Date.now();
    const key = `${options.label}:${req.ip}:${req.method}:${req.path}`;
    const current = hits.get(key);
    if (!current || current.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + options.windowMs });
      return next();
    }
    current.count += 1;
    if (current.count > options.max) {
      res.setHeader("Retry-After", String(Math.ceil((current.resetAt - now) / 1000)));
      return res.status(429).json({ success: false, message: "Too many requests. Please try again later." });
    }
    next();
  };
}

const apiRateLimiter = createRateLimiter({ windowMs: 60_000, max: 300, label: "api" });
const loginRateLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 100, label: "login" });
app.use("/api", apiRateLimiter);
app.use("/api/login", loginRateLimiter);

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


function formatIsoDateToIndonesian(isoDate: string): string {
  if (!isoDate) return "-";
  const parts = isoDate.split("-");
  if (parts.length !== 3) return isoDate;
  const year = parts[0];
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  return `${day}/${month}/${year}`;
}

// Helper untuk memformat private key agar kompatibel dengan Node.js crypto
const getAuthClient = () => {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let privateKey = process.env.GOOGLE_PRIVATE_KEY;
  
  if (!email || !privateKey || email.includes("your-service-account") || privateKey.includes("REPLACE_WITH")) {
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
            console.log("[AUTH] Using User OAuth2 Token");
            const oauth2Client = new google.auth.OAuth2() as any;
            oauth2Client.setCredentials({ access_token: token });
            oauth2Client.onAuthFallback = () => {
                (req as any).googleTokenExpired = true;
            };
            return oauth2Client;
        }
    }
    console.log("[AUTH] Using Service Account");
    return getAuthClient();
};

type SessionUser = {
  username: string;
  displayName: string;
  division: string;
  divisionCode: string;
  wa: string;
  role: string;
  access: string;
  iat: number;
  exp: number;
};

const normalizeRole = (value: unknown) => String(value || "").trim().toUpperCase();
const normalizeAccess = (value: unknown) => String(value || "").toUpperCase().split(",").map(v => v.trim().replace(/^[\"']|[\"']$/g, "")).filter(Boolean);
const isAdminSession = (user?: SessionUser) => !!user && (normalizeRole(user.role).includes("ADMIN") || normalizeRole(user.divisionCode) === "ADMIN");
const isApproverSession = (user?: SessionUser) => {
  const role = normalizeRole(user?.role);
  const divCode = normalizeRole(user?.divisionCode);
  return role.includes("MANAGER") || role.includes("MANAJER") || role.includes("DIREKTUR") || role.includes("DIREKSI") ||
    role.includes("MGR") || role.includes("DIR") || role.includes("KABAG") || role.includes("KADIV") || divCode === "MGR" || divCode === "DIR";
};
const isPurchaseSession = (user?: SessionUser) => {
  const role = normalizeRole(user?.role);
  const divCode = normalizeRole(user?.divisionCode);
  return role.includes("PURCHASE") || role.includes("PURCHASING") || divCode === "PUR" || divCode === "PCH";
};
const hasSessionPermission = (user: SessionUser | undefined, permission: string) => {
  const wanted = normalizeRole(permission);
  if (!user) return false;
  if (isAdminSession(user)) return true;
  if (normalizeAccess(user.access).includes(wanted)) return true;
  if (["DASHBOARD", "PR HISTORY", "PO HISTORY", "CREATE PR"].includes(wanted)) return true;
  if (wanted === "APPROVAL") return isApproverSession(user);
  if (wanted === "PURCHASE") return isPurchaseSession(user);
  return false;
};

function signSessionPayload(payload: string) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
}

function createSessionToken(user: Omit<SessionUser, "iat" | "exp">) {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionUser & { v: number } = {
    v: 1,
    username: user.username,
    displayName: user.displayName,
    division: user.division,
    divisionCode: user.divisionCode,
    wa: user.wa,
    role: user.role,
    access: user.access,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `smp.${body}.${signSessionPayload(body)}`;
}

function timingSafeEqualString(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function verifySessionToken(token: string): SessionUser | null {
  try {
    const [prefix, body, signature] = String(token || "").split(".");
    if (prefix !== "smp" || !body || !signature) return null;
    const expected = signSessionPayload(body);
    if (!timingSafeEqualString(signature, expected)) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp < now) return null;
    return {
      username: String(payload.username || ""),
      displayName: String(payload.displayName || payload.username || ""),
      division: String(payload.division || ""),
      divisionCode: String(payload.divisionCode || ""),
      wa: String(payload.wa || ""),
      role: String(payload.role || "USER"),
      access: String(payload.access || ""),
      iat: Number(payload.iat || 0),
      exp: Number(payload.exp || 0),
    };
  } catch {
    return null;
  }
}

function getSessionToken(req: express.Request) {
  const headerToken = req.header("X-Session-Token");
  if (headerToken) return headerToken;
  const authHeader = req.header("Authorization") || "";
  if (authHeader.startsWith("Bearer smp.")) return authHeader.slice("Bearer ".length);
  return "";
}

function requireSession(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.method === "OPTIONS") return next();
  const session = verifySessionToken(getSessionToken(req));
  if (!session) {
    return res.status(401).json({ success: false, message: "Unauthorized. Please login again." });
  }
  (req as any).sessionUser = session;
  next();
}

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const session = (req as any).sessionUser as SessionUser | undefined;
  if (!isAdminSession(session)) {
    return res.status(403).json({ success: false, message: "Forbidden. Admin role required." });
  }
  next();
}

function requireRoles(roles: string[]) {
  const allowed = roles.map(normalizeRole);
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const session = (req as any).sessionUser as SessionUser | undefined;
    const role = normalizeRole(session?.role);
    if (isAdminSession(session) || allowed.includes(role)) return next();
    if (allowed.some(r => ["MANAGER", "MANAJER", "MGR", "KABAG", "DIREKTUR", "DIREKSI", "DIR", "KADIV"].includes(r)) && isApproverSession(session)) return next();
    if (allowed.some(r => ["PURCHASE", "PURCHASING"].includes(r)) && isPurchaseSession(session)) return next();
    return res.status(403).json({ success: false, message: `Forbidden. Required role: ${roles.join("/")}` });
  };
}

function requirePermission(permission: string) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const session = (req as any).sessionUser as SessionUser | undefined;
    if (hasSessionPermission(session, permission)) return next();
    return res.status(403).json({ success: false, message: `Forbidden. Missing permission: ${permission}` });
  };
}

const PASSWORD_PREFIX = "pbkdf2_sha256";
const PASSWORD_ITERATIONS = 210_000;

function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const hash = crypto.pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, 32, "sha256").toString("base64url");
  return `${PASSWORD_PREFIX}$${PASSWORD_ITERATIONS}$${salt}$${hash}`;
}

function isPasswordHash(value: string) {
  return String(value || "").startsWith(`${PASSWORD_PREFIX}$`);
}

function verifyPassword(inputPassword: string, storedPassword: string) {
  const stored = String(storedPassword || "");
  if (isPasswordHash(stored)) {
    const [, iterationsRaw, salt, expectedHash] = stored.split("$");
    const iterations = Number(iterationsRaw);
    if (!Number.isFinite(iterations) || !salt || !expectedHash) return false;
    const actualHash = crypto.pbkdf2Sync(inputPassword, salt, iterations, 32, "sha256").toString("base64url");
    return timingSafeEqualString(actualHash, expectedHash);
  }
  // Backward compatibility for legacy plaintext rows. Successful legacy logins are upgraded to a hash.
  return timingSafeEqualString(inputPassword, stored);
}

function sanitizePublicUser(row: any[], index?: number) {
  const displayName = row[2] || row[0] || "";
  return {
    id: typeof index === "number" ? index + 2 : undefined,
    username: row[0] || "",
    fullName: displayName,
    displayName,
    division: row[3] || "CS",
    divCode: row[4] || "CS",
    divisionCode: row[4] || "CS",
    wa: row[5] || "",
    role: row[6] || "USER",
    access: row[7] || "",
    telegramChatId: row[8] || "",
    hasPassword: Boolean(row[1]),
  };
}

// Require a signed app session for every API except login and public PDF links.
app.use("/api", (req, res, next) => {
  if (req.path === "/login" || req.path.startsWith("/pdf/") || req.path === "/telegram/webhook" || req.path === "/telegram/setup-webhook") return next();
  return requireSession(req, res, next);
});

app.use("/api/admin", requireAdmin);
app.use(["/api/wa-diagnostics", "/api/wa-save-token", "/api/wa-test-send"], requireAdmin);
app.use("/api/admin/telegram/diagnostics", requireAdmin);

app.post("/api/admin/telegram/send-test-message", requireAdmin, async (req, res) => {
  const { chatId, message } = req.body;

  if (!chatId || !message) {
    return res.status(400).json({ success: false, message: "chatId and message are required." });
  }

  try {
    console.log(`[TELEGRAM] Sending test message to Chat ID: ${chatId}`);
    const result = await sendTelegramRequest("sendMessage", {
      chat_id: chatId,
      text: message,
      parse_mode: "Markdown"
    });
    
    if (result && result.ok) {
      res.json({ success: true, log: result });
    } else {
      res.status(400).json({ success: false, log: result, message: "Failed to send message via Telegram API." });
    }
  } catch (error: any) {
    handleApiError(res, error, "TELEGRAM_SEND_TEST");
  }
});


// Modified helpers to accept auth
async function createPrPdf(prId: string, data: any, auth: any): Promise<{ filePath: string; driveLink?: string }> {
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

  // 1. If Google Apps Script Web App is configured, use it to avoid Service Account quota limit
  if (GOOGLE_SCRIPT_WEB_APP_URL) {
    console.log(`[DOCS-PR] Delegating PDF generation for ${prId} to Google Apps Script Web App...`);
    try {
      const replacements: Record<string, string> = {
        "{{No_PR}}": prId,
        "{{Tanggal_Order}}": data.date,
        "{{Nama_Peminta}}": data.requester,
        "{{Divisi}}": data.division,
        "{{Nama Supplier}}": data.supplier,
        "{{Catatan}}": data.notes || "-",
        "SUM{{Qty}}": String(totalQty),
        "{{Estimasi}}": estimasiText,
      };

      if (data.items.length > 0) {
        const firstItem = data.items[0];
        replacements["{{NO}}"] = "1";
        replacements["{{NAMA_BARANG}}"] = firstItem.itemName;
        replacements["{{SATUAN}}"] = firstItem.unit;
        replacements["{{QTY}}"] = String(firstItem.qty);
        replacements["{{STOCK}}"] = String(firstItem.stockOnhand || 0);
        replacements["{{AVG}}"] = String(Number(firstItem.avgSales || 0).toFixed(1));
        replacements["{{B1}}"] = String(firstItem.b1 || 0);
        replacements["{{B2}}"] = String(firstItem.b2 || 0);
        replacements["{{B3}}"] = String(firstItem.b3 || 0);
      } else {
        replacements["{{NO}}"] = "";
        replacements["{{NAMA_BARANG}}"] = "";
        replacements["{{SATUAN}}"] = "";
        replacements["{{QTY}}"] = "";
        replacements["{{STOCK}}"] = "";
        replacements["{{AVG}}"] = "";
        replacements["{{B1}}"] = "";
        replacements["{{B2}}"] = "";
        replacements["{{B3}}"] = "";
      }

      data.items.forEach((item: any, i: number) => {
        const idx = i + 1;
        replacements[`{{No_${idx}}}`] = String(idx);
        replacements[`{{Nama_Barang_${idx}}}`] = item.itemName;
        replacements[`{{Satuan_${idx}}}`] = item.unit;
        replacements[`{{Qty_${idx}}}`] = String(item.qty);
        replacements[`{{Stock_${idx}}}`] = String(item.stockOnhand || 0);
        replacements[`{{Avg_${idx}}}`] = String(Number(item.avgSales || 0).toFixed(1));
        replacements[`{{B1_${idx}}}`] = String(item.b1 || 0);
        replacements[`{{B2_${idx}}}`] = String(item.b2 || 0);
        replacements[`{{B3_${idx}}}`] = String(item.b3 || 0);
      });

      for (let i = data.items.length + 1; i <= 10; i++) {
        replacements[`{{No_${i}}}`] = "";
        replacements[`{{Nama_Barang_${i}}}`] = "";
        replacements[`{{Satuan_${i}}}`] = "";
        replacements[`{{Qty_${i}}}`] = "";
        replacements[`{{Stock_${i}}}`] = "";
        replacements[`{{Avg_${i}}}`] = "";
        replacements[`{{B1_${i}}}`] = "";
        replacements[`{{B2_${i}}}`] = "";
        replacements[`{{B3_${i}}}`] = "";
      }

      const response = await fetch(GOOGLE_SCRIPT_WEB_APP_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: TEMPLATE_PR_ID,
          folderId: GOOGLE_DRIVE_FOLDER_ID,
          fileName,
          replacements,
        }),
      });

      const result = (await response.json()) as any;
      if (!result.success) {
        throw new Error(result.error || "Unknown Apps Script error");
      }

      console.log(`[DOCS-PR] Apps Script generated PDF successfully. Downloading ID: ${result.fileId}...`);
      
      const drive = getDrive(auth);
      const driveStream = await drive.files.get(
        { fileId: result.fileId, alt: "media" },
        { responseType: "stream" }
      );
      
      const stream = fs.createWriteStream(filePath);
      driveStream.data.pipe(stream);
      await new Promise<void>((resolve, reject) => {
        stream.on("finish", () => resolve());
        stream.on("error", reject);
      });

      console.log(`[DOCS-PR] PR ${prId} downloaded locally.`);
      return { filePath, driveLink: result.webViewLink };

    } catch (err: any) {
      console.error(`[DOCS-PR] Apps Script method failed: ${err.message}. Falling back to old method...`);
    }
  }

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
      stream.on('finish', () => resolve({ filePath }));
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
    return { filePath };

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
      stream.on("finish", () => resolve({ filePath }));
      stream.on("error", reject);
    });
  }
}

async function createPoPdf(poNo: string, data: any, auth: any): Promise<{ filePath: string; driveLink?: string }> {
  const fileName = `${poNo.replace(/\//g, "_")}.pdf`;
  const filePath = path.join(PO_PDF_DIR, fileName);
  
  if (!fs.existsSync(PO_PDF_DIR)) {
    fs.mkdirSync(PO_PDF_DIR, { recursive: true });
  }

  // Pre-calculate subtotal
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

  // 1. If Google Apps Script Web App is configured, use it to avoid Service Account quota limit
  if (GOOGLE_SCRIPT_WEB_APP_URL) {
    console.log(`[DOCS-PO] Delegating PDF generation for ${poNo} to Google Apps Script Web App...`);
    try {
      const replacements: Record<string, string> = {
        "{{PEMINTA}}": data.purchaseName,
        "{{NO_PO}}": poNo,
        "{{TANGGAL}}": new Date().toLocaleDateString('id-ID'),
        "{{TANGGAL_KIRIM}}": formatIsoDateToIndonesian(data.deliveryDate),
        "{{DIVISI}}": divisionDisplay,
        "{{SUPPLIER}}": data.supplier,
        "{{CATATAN}}": data.notes || "-",
        "{{SUBTOTAL}}": `Rp ${subTotal.toLocaleString('id-ID')}`,
        "{{DISKON}}": `Rp ${discount.toLocaleString('id-ID')}`,
        "{{DISKON_PERSEN}}": `${discountPercent}%`,
        "{{PAJAK}}": `Rp ${tax.toLocaleString('id-ID')}`,
        "{{PAJAK_PERSEN}}": `${taxPercent}%`,
        "{{OTHERS}}": `Rp ${others.toLocaleString('id-ID')}`,
        "SUM{{TOTAL}}": `Rp ${grandTotal.toLocaleString('id-ID')}`,
      };

      data.items.forEach((item: any, i: number) => {
        const idx = i + 1;
        const totalItem = item.qty * item.price;
        replacements[`{{NO_${idx}}}`] = String(idx);
        replacements[`{{NAMA_BARANG_${idx}}}`] = item.itemName;
        replacements[`{{SATUAN_${idx}}}`] = item.unit || "PCS";
        replacements[`{{QTY_${idx}}}`] = String(item.qty);
        replacements[`{{HARGA_${idx}}}`] = `Rp ${Number(item.price).toLocaleString('id-ID')}`;
        replacements[`{{TOTAL_${idx}}}`] = `Rp ${totalItem.toLocaleString('id-ID')}`;
      });

      for (let i = data.items.length + 1; i <= 10; i++) {
        replacements[`{{NO_${i}}}`] = "";
        replacements[`{{NAMA_BARANG_${i}}}`] = "";
        replacements[`{{SATUAN_${i}}}`] = "";
        replacements[`{{QTY_${i}}}`] = "";
        replacements[`{{HARGA_${i}}}`] = "";
        replacements[`{{TOTAL_${i}}}`] = "";
      }

      const response = await fetch(GOOGLE_SCRIPT_WEB_APP_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: TEMPLATE_PO_ID,
          folderId: GOOGLE_DRIVE_PO_FOLDER_ID,
          fileName,
          replacements,
        }),
      });

      const result = (await response.json()) as any;
      if (!result.success) {
        throw new Error(result.error || "Unknown Apps Script error");
      }

      console.log(`[DOCS-PO] Apps Script generated PDF successfully. Downloading ID: ${result.fileId}...`);
      
      const drive = getDrive(auth);
      const driveStream = await drive.files.get(
        { fileId: result.fileId, alt: "media" },
        { responseType: "stream" }
      );
      
      const stream = fs.createWriteStream(filePath);
      driveStream.data.pipe(stream);
      await new Promise<void>((resolve, reject) => {
        stream.on("finish", () => resolve());
        stream.on("error", reject);
      });

      console.log(`[DOCS-PO] PO ${poNo} downloaded locally.`);
      return { filePath, driveLink: result.webViewLink };

    } catch (err: any) {
      console.error(`[DOCS-PO] Apps Script method failed: ${err.message}. Falling back to old method...`);
    }
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
    const requests: any[] = [
      { replaceAllText: { containsText: { text: '{{PEMINTA}}', matchCase: false }, replaceText: data.purchaseName } },
      { replaceAllText: { containsText: { text: '{{NO_PO}}', matchCase: false }, replaceText: poNo } },
      { replaceAllText: { containsText: { text: '{{TANGGAL}}', matchCase: false }, replaceText: new Date().toLocaleDateString('id-ID') } },
      { replaceAllText: { containsText: { text: '{{TANGGAL_KIRIM}}', matchCase: false }, replaceText: formatIsoDateToIndonesian(data.deliveryDate) } },
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
      stream.on('finish', () => resolve({ filePath }));
      stream.on('error', (err) => reject(err));
    });

    // 4. Cleanup Temp Doc
    try { await drive.files.delete({ fileId: copyId }); } catch (e) {}

    console.log(`[PO-DOCS] PO ${poNo} generated successfully.`);
    return { filePath };

  } catch (error: any) {
    console.error(`[PO-DOCS] Template error: ${error.message}. Using PDFKit fallback.`);
    
    const doc = new PDFDocument({ margin: 30, size: "A4" });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // 1. Logo Block & Company Title
    doc.rect(30, 30, 50, 40).fill("#16a34a"); // Green color for PO
    doc.font("Helvetica-Bold").fontSize(18).fillColor("#FFFFFF").text("sau", 30, 42, { width: 50, align: "center" });
    doc.fillColor("#000000").fontSize(18).font("Helvetica-Bold").text("CV. SUMBER ALODIE UTAMA", 90, 40);

    // 2. Right Title "PURCHASE ORDER" in a grey-green rounded border box
    const titleBoxWidth = 160;
    const titleBoxHeight = 30;
    doc.fillColor("#f0fdf4").roundedRect(565 - titleBoxWidth, 35, titleBoxWidth, titleBoxHeight, 5).fill();
    doc.lineWidth(0.5).strokeColor("#bbf7d0").roundedRect(565 - titleBoxWidth, 35, titleBoxWidth, titleBoxHeight, 5).stroke();
    doc.fillColor("#16a34a").font("Helvetica-Bold").fontSize(11).text("PURCHASE ORDER", 565 - titleBoxWidth, 44, { width: titleBoxWidth, align: "center" });

    // 3. Thick divider line below logo and title
    doc.moveTo(30, 80).lineTo(565, 80).lineWidth(2).strokeColor("#000000").stroke();

    // 4. Two-column Metadata Grid
    doc.lineWidth(0.5).fillColor("#000000").font("Helvetica").fontSize(9);
    
    // Column 1
    doc.font("Helvetica-Bold").text("PEMINTA", 30, 95);
    doc.font("Helvetica").text(`:  ${data.purchaseName || "-"}`, 120, 95);

    doc.font("Helvetica-Bold").text("TANGGAL PO", 30, 115);
    doc.font("Helvetica").text(`:  ${new Date().toLocaleDateString('id-ID')}`, 120, 115);

    doc.font("Helvetica-Bold").text("DIVISI / GUDANG", 30, 135);
    doc.font("Helvetica").text(`:  ${divisionDisplay || "-"}`, 120, 135);

    doc.font("Helvetica-Bold").text("SUPPLIER", 30, 155);
    doc.font("Helvetica").text(`:  ${data.supplier || "-"}`, 120, 155);

    // Column 2
    doc.font("Helvetica-Bold").text("NO. PO", 320, 95);
    doc.font("Helvetica").text(`:  ${poNo}`, 420, 95);

    doc.font("Helvetica-Bold").text("NO. PR REFERENSI", 320, 115);
    doc.font("Helvetica").text(`:  ${data.prId || "-"}`, 420, 115);

    doc.font("Helvetica-Bold").text("TANGGAL KIRIM", 320, 135);
    doc.font("Helvetica").text(`:  ${formatIsoDateToIndonesian(data.deliveryDate) || "-"}`, 420, 135);

    doc.font("Helvetica-Bold").text("CATATAN", 320, 155);
    
    // Catatan border box
    doc.rect(320, 167, 245, 18).lineWidth(0.5).strokeColor("#000000").stroke();
    doc.font("Helvetica").text(data.notes || "-", 325, 171, { width: 235, height: 12 });

    // 5. Divider text
    doc.font("Helvetica").fontSize(10).fillColor("#000000").text("Detail pemesanan barang sebagai berikut :", 30, 190);

    // 6. Double-tier Header Table starting at Y = 210
    let curY = 210;
    
    // Headers background
    doc.rect(30, curY, 535, 20).fill("#16a34a"); // Green fill
    doc.fillColor("#FFFFFF"); // White text for headers
    doc.lineWidth(0.5).strokeColor("#000000");

    // Grid lines for Header
    doc.moveTo(30, curY).lineTo(565, curY).stroke();
    doc.moveTo(30, curY + 20).lineTo(565, curY + 20).stroke();
    
    doc.moveTo(30, curY).lineTo(30, curY + 20).stroke();
    doc.moveTo(60, curY).lineTo(60, curY + 20).stroke();
    doc.moveTo(270, curY).lineTo(270, curY + 20).stroke();
    doc.moveTo(320, curY).lineTo(320, curY + 20).stroke();
    doc.moveTo(370, curY).lineTo(370, curY + 20).stroke();
    doc.moveTo(465, curY).lineTo(465, curY + 20).stroke();
    doc.moveTo(565, curY).lineTo(565, curY + 20).stroke();

    // Header Texts
    doc.font("Helvetica-Bold").fontSize(8.5);
    doc.text("No.", 30, curY + 6, { width: 30, align: "center" });
    doc.text("Nama Barang", 60, curY + 6, { width: 210, align: "center" });
    doc.text("Satuan", 270, curY + 6, { width: 50, align: "center" });
    doc.text("Qty", 320, curY + 6, { width: 50, align: "center" });
    doc.text("Harga Satuan", 370, curY + 6, { width: 95, align: "center" });
    doc.text("Total Harga", 465, curY + 6, { width: 100, align: "center" });

    // Table rows - Draw at least 10 rows
    curY += 20;
    doc.font("Helvetica").fontSize(8.5).fillColor("#000000");
    
    const rowCount = Math.max(10, data.items.length);
    const rowHeight = 20;
    
    for (let i = 0; i < rowCount; i++) {
      const rowY = curY + i * rowHeight;
      const item = data.items[i];
      
      const itemNo = item ? String(i + 1) : "";
      const itemName = item ? String(item.itemName || "-") : "";
      const unit = item ? String(item.unit || "PCS") : "";
      const qty = item ? String(item.qty || "0") : "";
      const price = item ? `Rp ${Number(item.price || 0).toLocaleString('id-ID')}` : "";
      const totalItem = item ? `Rp ${(Number(item.qty || 0) * Number(item.price || 0)).toLocaleString('id-ID')}` : "";
      
      doc.moveTo(30, rowY).lineTo(30, rowY + rowHeight).stroke();
      doc.moveTo(60, rowY).lineTo(60, rowY + rowHeight).stroke();
      doc.moveTo(270, rowY).lineTo(270, rowY + rowHeight).stroke();
      doc.moveTo(320, rowY).lineTo(320, rowY + rowHeight).stroke();
      doc.moveTo(370, rowY).lineTo(370, rowY + rowHeight).stroke();
      doc.moveTo(465, rowY).lineTo(465, rowY + rowHeight).stroke();
      doc.moveTo(565, rowY).lineTo(565, rowY + rowHeight).stroke();
      
      doc.moveTo(30, rowY + rowHeight).lineTo(565, rowY + rowHeight).stroke();
      
      if (item) {
        doc.text(itemNo, 30, rowY + 6, { width: 30, align: "center" });
        doc.text(itemName, 65, rowY + 6, { width: 200, align: "left" });
        doc.text(unit, 270, rowY + 6, { width: 50, align: "center" });
        doc.text(qty, 320, rowY + 6, { width: 50, align: "center" });
        doc.text(price, 370, rowY + 6, { width: 95, align: "right" });
        doc.text(totalItem, 465, rowY + 6, { width: 95, align: "right" });
      }
    }
    
    // 7. Summary rows starting at Y = curY + rowCount * rowHeight
    let summaryY = curY + rowCount * rowHeight;
    
    // Subtotal Row
    doc.rect(30, summaryY, 435, rowHeight).stroke();
    doc.rect(465, summaryY, 100, rowHeight).stroke();
    doc.font("Helvetica-Bold").text("SUBTOTAL", 30, summaryY + 6, { width: 425, align: "right" });
    doc.font("Helvetica").text(`Rp ${subTotal.toLocaleString('id-ID')}`, 465, summaryY + 6, { width: 95, align: "right" });
    summaryY += rowHeight;

    // Diskon Row
    doc.rect(30, summaryY, 435, rowHeight).stroke();
    doc.rect(465, summaryY, 100, rowHeight).stroke();
    doc.font("Helvetica-Bold").text(`DISKON (${discountPercent}%)`, 30, summaryY + 6, { width: 425, align: "right" });
    doc.font("Helvetica").text(`Rp ${discount.toLocaleString('id-ID')}`, 465, summaryY + 6, { width: 95, align: "right" });
    summaryY += rowHeight;

    // Pajak Row
    doc.rect(30, summaryY, 435, rowHeight).stroke();
    doc.rect(465, summaryY, 100, rowHeight).stroke();
    doc.font("Helvetica-Bold").text(`PAJAK (${taxPercent}%)`, 30, summaryY + 6, { width: 425, align: "right" });
    doc.font("Helvetica").text(`Rp ${tax.toLocaleString('id-ID')}`, 465, summaryY + 6, { width: 95, align: "right" });
    summaryY += rowHeight;

    // Lain-lain Row
    doc.rect(30, summaryY, 435, rowHeight).stroke();
    doc.rect(465, summaryY, 100, rowHeight).stroke();
    doc.font("Helvetica-Bold").text("LAIN-LAIN", 30, summaryY + 6, { width: 425, align: "right" });
    doc.font("Helvetica").text(`Rp ${others.toLocaleString('id-ID')}`, 465, summaryY + 6, { width: 95, align: "right" });
    summaryY += rowHeight;

    // GRAND TOTAL Row
    doc.rect(30, summaryY, 435, rowHeight).fill("#16a34a");
    doc.rect(465, summaryY, 100, rowHeight).fill("#16a34a");
    doc.fillColor("#FFFFFF").font("Helvetica-Bold");
    doc.rect(30, summaryY, 435, rowHeight).stroke();
    doc.rect(465, summaryY, 100, rowHeight).stroke();
    doc.text("GRAND TOTAL", 30, summaryY + 6, { width: 425, align: "right" });
    doc.text(`Rp ${grandTotal.toLocaleString('id-ID')}`, 465, summaryY + 6, { width: 95, align: "right" });
    doc.fillColor("#000000");

    doc.end();
    return new Promise((resolve, reject) => {
      stream.on("finish", () => resolve({ filePath }));
      stream.on("error", reject);
    });
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
      range: "User_Role!A2:I",
    });
    const rows = response.data.values || [];
    
    const mappedUsers = rows.map((row: any) => ({
      username: row[0],
      displayName: row[2],
      division: row[3],
      divisionCode: String(row[4] || "").toUpperCase().trim(),
      wa: row[5],
      role: String(row[6] || "").toUpperCase().trim(),
      telegramChatId: row[8] || ""
    }));

    console.log(`[WHATSAPP/TELEGRAM] Mapped ${mappedUsers.length} users from User_Role table`);
    return mappedUsers;
  } catch (err: any) {
    console.error(`[WHATSAPP/TELEGRAM] Failed to fetch users for notifications: ${err.message}`);
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

  // Never read secrets from .env.example. It is a public template only.
  return process.env.WA_API_TOKEN?.trim() || "";
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
  if (APP_BASE_URL) return APP_BASE_URL;

  const forwardedProto = String(req?.headers?.["x-forwarded-proto"] || "").split(",")[0].trim();
  const forwardedHost = String(req?.headers?.["x-forwarded-host"] || "").split(",")[0].trim();
  const host = forwardedHost || req?.headers?.host || "";
  
  const isVercelEnv = process.env.VERCEL === "1" || !!process.env.NOW_REGION || host.includes("vercel.app");
  const proto = isVercelEnv ? "https" : (forwardedProto || req?.protocol || (isProduction ? "https" : "http"));

  if (host) return `${proto}://${host}`;
  return `http://localhost:${PORT}`;
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
    let recipients = users.filter(u => u.wa && isManagerOnly(u.role));
    
    recipients = recipients.filter(u => {
      const uDivRaw = String(u.division || "").trim().toUpperCase();
      if (uDivRaw === "" || uDivRaw === "*" || uDivRaw === "ALL") return true;

      const uDivs = uDivRaw.split(',').map(s => s.trim());
      const uCodes = String(u.divisionCode || "").toUpperCase().split(',').map(s => s.trim());
      
      return uDivs.some(div => prDivision.includes(div) || div.includes(prDivision)) ||
             uCodes.some(code => prDivision.includes(code) || code.includes(prDivision));
    });

    if (recipients.length === 0) {
      console.log(`[WHATSAPP] No active Managers found matching target division "${prDivision}" with WA numbers for PR ${prId}`);
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

async function sendTelegramRequest(methodName: string, payload: any) {
  if (!TELEGRAM_BOT_TOKEN) return null;
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${methodName}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result: any = await res.json();
    if (!result.ok) {
      console.error(`[TELEGRAM] API Error:`, result);
    }
    return result;
  } catch (err: any) {
    console.error(`[TELEGRAM] Request failed for ${methodName}:`, err.message);
    return null;
  }
}

let lastUpdateId = 0;
async function startTelegramPolling() {
  if (!TELEGRAM_BOT_TOKEN) return;
  
  try {
    // Delete any active webhook to allow polling
    await sendTelegramRequest("deleteWebhook", {});
    console.log("[TELEGRAM] Active webhook deleted. Starting Telegram long polling loop...");
  } catch (e: any) {
    console.error("[TELEGRAM] Failed to delete webhook:", e.message);
  }

  // Poll in a background loop
  (async () => {
    while (true) {
      try {
        const response = await sendTelegramRequest("getUpdates", {
          offset: lastUpdateId + 1,
          timeout: 20
        });

        if (response && response.ok && response.result && response.result.length > 0) {
          for (const update of response.result) {
            lastUpdateId = update.update_id;
            await processTelegramUpdate(update);
          }
        }
      } catch (err: any) {
        console.error("[TELEGRAM] Polling loop error:", err.message);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  })();
}

async function processTelegramUpdate(update: any) {
  // Log message updates to console so they can verify their Chat ID
  if (update.message) {
    const chat = update.message.chat;
    const from = update.message.from;
    console.log(`[TELEGRAM] DITERIMA PESAN DARI CHAT ID: ${chat.id} (@${from?.username || "tidak_ada_username"}) | Teks: "${update.message.text}"`);
    return;
  }

  const { callback_query } = update;
  if (!callback_query) return;

  const chat = callback_query.message.chat;
  const chatId = String(chat.id);
  const callbackData = callback_query.data || "";
  const messageId = callback_query.message.message_id;
  const currentText = callback_query.message.text || "";
  
  // 1. Identify User by Telegram Chat ID
  const users = await getNotificationUsers();
  const user = users.find(u => String(u.telegramChatId) === chatId);
  if (!user) {
    await sendTelegramRequest("answerCallbackQuery", {
      callback_query_id: callback_query.id,
      text: "Akun Telegram Anda belum terdaftar di User_Role spreadsheet.",
      show_alert: true
    });
    return;
  }
  
  // 2. Parse Action and PR ID (format: "approve_pr:PB-0000000001-26")
  const parts = callbackData.split(":");
  if (parts.length < 2) return;
  const actionType = parts[0]; // "approve_pr" or "reject_pr"
  const prId = parts[1];
  
  try {
    const auth = getAuthClient();
    const { headers, details } = await loadPrHeaderDetail(auth);
    const header = headers.find(h => h.prId === prId);
    
    if (!header) {
      await sendTelegramRequest("answerCallbackQuery", {
        callback_query_id: callback_query.id,
        text: "PR tidak ditemukan.",
        show_alert: true
      });
      return;
    }
    
    const roleUp = String(user.role).toUpperCase();
    const statusUp = String(header.status).toUpperCase();
    
    const isManager = roleUp.includes("MANAGER") || roleUp.includes("MGR");
    const isDirector = roleUp.includes("DIREKTUR") || roleUp.includes("DIR");
    
    if (actionType === "approve_pr") {
      let isValid = false;
      let newStatus = "";
      let approverCol = "";
      
      if (isManager && statusUp === "WAITING MANAGER APPROVAL") {
        isValid = true;
        newStatus = "WAITING DIREKTUR APPROVAL";
        approverCol = "H";
      } else if (isDirector && statusUp === "WAITING DIREKTUR APPROVAL") {
        isValid = true;
        newStatus = "WAITING CREATED PO";
        approverCol = "I";
      } else if (roleUp.includes("ADMIN")) {
        isValid = true;
        if (statusUp === "WAITING MANAGER APPROVAL") {
          newStatus = "WAITING DIREKTUR APPROVAL";
          approverCol = "H";
        } else {
          newStatus = "WAITING CREATED PO";
          approverCol = "I";
        }
      }
      
      if (!isValid) {
        await sendTelegramRequest("answerCallbackQuery", {
          callback_query_id: callback_query.id,
          text: `Gagal: Status PR saat ini adalah "${header.status}".`,
          show_alert: true
        });
        return;
      }
      
      // Update Sheet Status & Approver Name
      await updateSheetValues(auth, `${NORMALIZED_SHEETS.PR_HEADER}!G${header.rowIndex}`, [[newStatus]]);
      await updateSheetValues(auth, `${NORMALIZED_SHEETS.PR_HEADER}!${approverCol}${header.rowIndex}`, [[`${user.displayName} (Telegram)`]]);
      
      // Answer Callback Query
      await sendTelegramRequest("answerCallbackQuery", {
        callback_query_id: callback_query.id,
        text: `PR ${prId} berhasil disetujui!`
      });
      
      // Update Telegram Message
      const updatedText = `${currentText}\n\n✅ *Status: Disetujui oleh ${user.displayName}*`;
      await sendTelegramRequest("editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: updatedText,
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [] }
      });
      
      // Trigger next notifications if WAITING DIREKTUR APPROVAL
      const matchingDetails = details.filter(d => d.prId === prId);
      if (newStatus === "WAITING DIREKTUR APPROVAL") {
        const prData = {
          requester: header.requester,
          division: header.division,
          supplier: header.supplier,
          notes: header.notes,
          items: matchingDetails.map(d => ({ itemName: d.itemName, qty: d.qty })),
        };
        
        notifyDirekturPR(prId, prData, user.displayName).catch(err => 
          console.error("[WHATSAPP] Director notification failed:", err.message)
        );
        
        notifyDirekturPRTelegram(prId, prData, user.displayName).catch(err => 
          console.error("[TELEGRAM] Director notification failed:", err.message)
        );
      }
      
    } else if (actionType === "reject_pr") {
      const isValid = isManager || isDirector || roleUp.includes("ADMIN");
      if (!isValid) {
        await sendTelegramRequest("answerCallbackQuery", {
          callback_query_id: callback_query.id,
          text: "Anda tidak memiliki wewenang untuk menolak PR ini.",
          show_alert: true
        });
        return;
      }
      
      // Update Status to Rejected
      await updateSheetValues(auth, `${NORMALIZED_SHEETS.PR_HEADER}!G${header.rowIndex}`, [["Rejected"]]);
      await updateSheetValues(auth, `${NORMALIZED_SHEETS.PR_HEADER}!F${header.rowIndex}`, [[`${header.notes || ""} | REJECTED via Telegram oleh ${user.displayName}`]]);
      
      // Answer Callback Query
      await sendTelegramRequest("answerCallbackQuery", {
        callback_query_id: callback_query.id,
        text: `PR ${prId} ditolak!`
      });
      
      // Update Telegram Message
      const updatedText = `${currentText}\n\n❌ *Status: Ditolak oleh ${user.displayName}*`;
      await sendTelegramRequest("editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: updatedText,
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [] }
      });
    }
    
  } catch (err: any) {
    console.error("[TELEGRAM] Callback processing error:", err.message);
  }
}

async function setupTelegram() {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log("[TELEGRAM] Webhook setup skipped (TELEGRAM_BOT_TOKEN not configured).");
    return;
  }
  if (!TELEGRAM_WEBHOOK_URL) {
    console.log("[TELEGRAM] Webhook URL not configured. Starting Telegram Bot Polling...");
    startTelegramPolling().catch(err => console.error("[TELEGRAM] Polling failed to start:", err.message));
    return;
  }

  try {
    const targetUrl = `${TELEGRAM_WEBHOOK_URL}/api/telegram/webhook`;
    console.log(`[TELEGRAM] Registering webhook to: ${targetUrl}`);
    const response = await sendTelegramRequest("setWebhook", { url: targetUrl });
    if (response && response.ok) {
      console.log(`[TELEGRAM] Webhook registered successfully.`);
    } else {
      console.error(`[TELEGRAM] Failed to register webhook.`, response);
    }
  } catch (e: any) {
    console.error(`[TELEGRAM] Exception during webhook setup:`, e.message);
  }
}

async function notifyNewPRTelegram(prId: string, data: any) {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    const users = await getNotificationUsers();
    
    const isManagerOnly = (role: string) => {
      const r = String(role || "").toUpperCase();
      return (r.includes("MANAGER") || r.includes("MANAJER") || r.includes("MGR") || r.includes("KABAG") || r.includes("KADIV")) && 
             !(r.includes("DIREKTUR") || r.includes("DIREKSI") || r.includes("DIR"));
    };

    const prDivision = String(data.division || "").toUpperCase().trim();
    let recipients = users.filter(u => u.telegramChatId && isManagerOnly(u.role));
    
    recipients = recipients.filter(u => {
      const uDivRaw = String(u.division || "").trim().toUpperCase();
      if (uDivRaw === "" || uDivRaw === "*" || uDivRaw === "ALL") return true;

      const uDivs = uDivRaw.split(',').map(s => s.trim());
      const uCodes = String(u.divisionCode || "").toUpperCase().split(',').map(s => s.trim());
      
      return uDivs.some(div => prDivision.includes(div) || div.includes(prDivision)) ||
             uCodes.some(code => prDivision.includes(code) || code.includes(prDivision));
    });

    if (recipients.length === 0) {
      console.log(`[TELEGRAM] No active Managers with Telegram Chat ID found for PR ${prId}`);
      return;
    }

    const firstItemAndQty = data.items && data.items.length > 0
      ? `${data.items[0].itemName} (Qty: ${data.items[0].qty})`
      : "";
    const itemsCount = data.items ? data.items.length : 0;
    const itemSummary = itemsCount > 1 
      ? `${firstItemAndQty} + ${itemsCount - 1} item lainnya`
      : firstItemAndQty;

    console.log(`[TELEGRAM] Found ${recipients.length} Manager recipients to notify for PR ${prId}`);
    
    for (const user of recipients) {
      const message = `🔔 *Notifikasi PR Baru* 🔔\n\nHalo *${user.displayName}*, ada Purchase Request baru yang memerlukan tinjauan Anda:\n\n*No. PR*: ${prId}\n*Peminta*: ${data.requester}\n*Divisi*: ${data.division}\n*Supplier*: ${data.supplier}\n*Detail Item*: ${itemSummary}\n*Catatan*: ${data.notes || "-"}\n\nSilakan klik tombol di bawah untuk menyetujui atau menolak langsung dari Telegram:`;
      
      await sendTelegramRequest("sendMessage", {
        chat_id: user.telegramChatId,
        text: message,
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Setujui (Approve)", callback_data: `approve_pr:${prId}` },
              { text: "❌ Tolak (Reject)", callback_data: `reject_pr:${prId}` }
            ]
          ]
        }
      });
    }
  } catch (err: any) {
    console.error(`[TELEGRAM] Error in notifyNewPRTelegram: ${err.message}`);
  }
}

async function notifyDirekturPRTelegram(prId: string, prDetails: any, approverName: string) {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    const users = await getNotificationUsers();
    
    const isDirekturOnly = (role: string) => {
      const r = String(role || "").toUpperCase();
      return r.includes("DIREKTUR") || r.includes("DIREKSI") || r.includes("DIR");
    };

    const recipients = users.filter(u => u.telegramChatId && isDirekturOnly(u.role));

    if (recipients.length === 0) {
      console.log(`[TELEGRAM] No active Directors with Telegram Chat ID found for PR ${prId}`);
      return;
    }

    const firstItemAndQty = prDetails.items && prDetails.items.length > 0
      ? `${prDetails.items[0].itemName} (Qty: ${prDetails.items[0].qty})`
      : "";
    const itemsCount = prDetails.items ? prDetails.items.length : 0;
    const itemSummary = itemsCount > 1 
      ? `${firstItemAndQty} + ${itemsCount - 1} item lainnya`
      : firstItemAndQty;

    console.log(`[TELEGRAM] Found ${recipients.length} Director recipients to notify for PR ${prId}`);
    
    for (const user of recipients) {
      const message = `🔔 *Notifikasi Persetujuan Direktur* 🔔\n\nHalo Bapak *${user.displayName}*, ada Purchase Request yang telah disetujui oleh Manager (*${approverName}*) dan sekarang memerlukan persetujuan Bapak:\n\n*No. PR*: ${prId}\n*Peminta*: ${prDetails.requester}\n*Divisi*: ${prDetails.division}\n*Supplier*: ${prDetails.supplier}\n*Detail Item*: ${itemSummary}\n*Catatan*: ${prDetails.notes || "-"}\n\nSilakan klik tombol di bawah untuk menyetujui atau menolak langsung dari Telegram:`;
      
      await sendTelegramRequest("sendMessage", {
        chat_id: user.telegramChatId,
        text: message,
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Setujui (Approve)", callback_data: `approve_pr:${prId}` },
              { text: "❌ Tolak (Reject)", callback_data: `reject_pr:${prId}` }
            ]
          ]
        }
      });
    }
  } catch (err: any) {
    console.error(`[TELEGRAM] Error in notifyDirekturPRTelegram: ${err.message}`);
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

// API: Login (Real-time from Spreadsheet)
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  const inputUser = String(username || "").trim().toUpperCase();
  const inputPass = String(password || "");

  if (!inputUser || !inputPass) {
    return res.status(400).json({ success: false, message: "Username dan password wajib diisi." });
  }

  console.log(`[LOGIN] Attempt: ${inputUser}`);
  
  try {
    const auth = getAuthClient(); // Always use Service Account for login master list
    const sheets = getSheets(auth);
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "User_Role!A2:I",
    });
    const rows = response.data.values || [];

    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: "Data users tidak ditemukan di Spreadsheet." });
    }

    let userRow: any[] | null = null;
    let rowNumber = -1;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const dbUser = String(row[0] || "").trim().toUpperCase();
      const dbPass = String(row[1] || "");
      if (dbUser === inputUser && verifyPassword(inputPass, dbPass)) {
        userRow = row;
        rowNumber = i + 2;
        break;
      }
    }

    if (userRow) {
      /*
      // Opportunistic migration: legacy plaintext passwords are upgraded on successful login.
      const storedPassword = String(userRow[1] || "");
      if (storedPassword && !isPasswordHash(storedPassword) && rowNumber > 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `User_Role!B${rowNumber}`,
          valueInputOption: "RAW",
          requestBody: { values: [[hashPassword(inputPass)]] }
        });
      }
      */

      const publicUser = sanitizePublicUser(userRow);
      return res.json({
        success: true,
        user: publicUser,
        sessionToken: createSessionToken({
          username: String(publicUser.username || ""),
          displayName: String(publicUser.fullName || publicUser.username || ""),
          division: String(publicUser.division || "CS"),
          divisionCode: String(publicUser.divisionCode || publicUser.divCode || "CS"),
          wa: String(publicUser.wa || ""),
          role: String(publicUser.role || "USER"),
          access: String(publicUser.access || ""),
        }),
        expiresIn: SESSION_TTL_SECONDS,
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


// --- Normalized Google Sheets API (Header/Detail schema) ---
// Required tabs: User_Role, Master_Stock, PR_Header, PR_Detail, PO_Header, PO_Detail
const NORMALIZED_SHEETS = {
  PR_HEADER: "PR_Header",
  PR_DETAIL: "PR_Detail",
  PO_HEADER: "PO_Header",
  PO_DETAIL: "PO_Detail",
};

const romanMonths = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
const safeText = (value: unknown) => String(value ?? "").trim();
const cleanCode = (value: unknown, fallback = "GEN") => safeText(value).replace(/[^A-Za-z0-9_-]/g, "").toUpperCase() || fallback;
const asNumber = (value: unknown) => Number(value || 0) || 0;

async function sheetValues(auth: any, range: string) {
  const sheets = getSheets(auth);
  const response = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
  return response.data.values || [];
}

async function appendSheetValues(auth: any, range: string, values: any[][]) {
  const sheets = getSheets(auth);
  return sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}

async function updateSheetValues(auth: any, range: string, values: any[][]) {
  const sheets = getSheets(auth);
  return sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}

async function deleteSheetRows(auth: any, sheetName: string, rowNumbers: number[]) {
  const uniqueRows = Array.from(new Set(rowNumbers)).filter(n => Number.isFinite(n) && n > 1).sort((a, b) => b - a);
  if (uniqueRows.length === 0) return;
  const sheetId = await getSheetId(sheetName, auth);
  const sheets = getSheets(auth);
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: uniqueRows.map(rowNumber => ({
        deleteDimension: {
          range: {
            sheetId,
            dimension: "ROWS",
            startIndex: rowNumber - 1,
            endIndex: rowNumber,
          },
        },
      })),
    },
  });
}

type PrHeaderRow = {
  rowIndex: number;
  prId: string;
  date: string;
  requester: string;
  division: string;
  supplier: string;
  notes: string;
  status: string;
  mgrApproval: string;
  dirApproval: string;
  pdfLink: string;
  poNo: string;
};

type PrDetailRow = {
  rowIndex: number;
  detailId: string;
  prId: string;
  itemName: string;
  unit: string;
  qty: any;
  stockOnhand: any;
  avgSales: any;
  b1: any;
  b2: any;
  b3: any;
};

type PoHeaderRow = {
  rowIndex: number;
  poNo: string;
  prId: string;
  purchaseName: string;
  date: string;
  deliveryDate: string;
  supplier: string;
  notes: string;
  pdfLink: string;
  status: string;
  division: string;
  discount: any;
  tax: any;
  others: any;
  grandTotal: any;
  discountPercent: any;
  taxPercent: any;
  subTotal: any;
  doNo: string;
  driverName: string;
  licensePlate: string;
  receivedDate: string;
  checkerBy: string;
};

type PoDetailRow = {
  rowIndex: number;
  detailId: string;
  poNo: string;
  prId?: string;
  itemName: string;
  unit: string;
  qty: any;
  price: any;
  total: any;
};

function mapPrHeader(row: any[], index: number): PrHeaderRow {
  return {
    rowIndex: index + 2,
    prId: safeText(row[0]),
    date: safeText(row[1]),
    requester: safeText(row[2]),
    division: safeText(row[3]),
    supplier: safeText(row[4]),
    notes: safeText(row[5]),
    status: safeText(row[6]),
    mgrApproval: safeText(row[7]),
    dirApproval: safeText(row[8]),
    pdfLink: safeText(row[9]),
    poNo: safeText(row[10]),
  };
}

function mapPrDetail(row: any[], index: number): PrDetailRow {
  return {
    rowIndex: index + 2,
    detailId: safeText(row[0]),
    prId: safeText(row[1]),
    itemName: safeText(row[2]),
    unit: safeText(row[3]),
    qty: row[4] ?? "",
    stockOnhand: row[5] ?? "",
    avgSales: row[6] ?? "",
    b1: row[7] ?? "",
    b2: row[8] ?? "",
    b3: row[9] ?? "",
  };
}

function mapPoHeader(row: any[], index: number): PoHeaderRow {
  return {
    rowIndex: index + 2,
    poNo: safeText(row[0]),
    prId: safeText(row[1]),
    purchaseName: safeText(row[2]),
    date: safeText(row[3]),
    deliveryDate: safeText(row[4]),
    supplier: safeText(row[5]),
    division: safeText(row[6]),
    notes: safeText(row[7]),
    pdfLink: safeText(row[8]),
    status: safeText(row[9]),
    subTotal: row[10] ?? "",
    discount: row[11] ?? "",
    discountPercent: row[12] ?? "",
    tax: row[13] ?? "",
    taxPercent: row[14] ?? "",
    others: row[15] ?? "",
    grandTotal: row[16] ?? "",
    doNo: safeText(row[17]),
    driverName: safeText(row[18]),
    licensePlate: safeText(row[19]),
    receivedDate: safeText(row[20]),
    checkerBy: safeText(row[21]),
  };
}

function mapPoDetail(row: any[], index: number): PoDetailRow {
  return {
    rowIndex: index + 2,
    detailId: safeText(row[0]),
    poNo: safeText(row[1]),
    itemName: safeText(row[2]),
    unit: safeText(row[3]),
    qty: row[4] ?? "",
    price: row[5] ?? "",
    total: row[6] ?? "",
  };
}

async function loadPrHeaderDetail(auth: any) {
  const [headerRows, detailRows] = await Promise.all([
    sheetValues(auth, `${NORMALIZED_SHEETS.PR_HEADER}!A2:K`),
    sheetValues(auth, `${NORMALIZED_SHEETS.PR_DETAIL}!A2:J`),
  ]);
  const headers = headerRows.map(mapPrHeader).filter((h: PrHeaderRow) => h.prId);
  const details = detailRows.map(mapPrDetail).filter((d: PrDetailRow) => d.prId);
  const headerById = new Map(headers.map((h: PrHeaderRow) => [h.prId, h]));
  return { headers, details, headerById };
}

async function loadPoHeaderDetail(auth: any) {
  const [headerRows, detailRows] = await Promise.all([
    sheetValues(auth, `${NORMALIZED_SHEETS.PO_HEADER}!A2:V`),
    sheetValues(auth, `${NORMALIZED_SHEETS.PO_DETAIL}!A2:G`),
  ]);
  const headers = headerRows.map(mapPoHeader).filter((h: PoHeaderRow) => h.poNo);
  const details = detailRows.map(mapPoDetail).filter((d: PoDetailRow) => d.poNo);
  const headerByPoNo = new Map(headers.map((h: PoHeaderRow) => [h.poNo, h]));
  return { headers, details, headerByPoNo };
}

function toPrApiRow(detail: PrDetailRow, header: PrHeaderRow) {
  return {
    rowIndex: detail.rowIndex,
    detailRowIndex: detail.rowIndex,
    headerRowIndex: header.rowIndex,
    detailId: detail.detailId,
    id: header.prId,
    date: header.date,
    requester: header.requester,
    division: header.division,
    supplier: header.supplier,
    itemName: detail.itemName,
    unit: detail.unit,
    qty: detail.qty,
    stockOnhand: detail.stockOnhand,
    avgSales: detail.avgSales,
    notes: header.notes,
    status: header.status,
    mgrApp: header.mgrApproval,
    dirApp: header.dirApproval,
    pdfLink: header.pdfLink || `/api/pdf/pr/${header.prId.replace(/\//g, "_")}.pdf`,
    poNumber: header.poNo,
    b1: detail.b1,
    b2: detail.b2,
    b3: detail.b3,
  };
}

function toPoApiRow(detail: PoDetailRow, header: PoHeaderRow) {
  return {
    rowIndex: detail.rowIndex,
    detailRowIndex: detail.rowIndex,
    headerRowIndex: header.rowIndex,
    detailId: detail.detailId,
    prId: header.prId || detail.prId,
    purchaseName: header.purchaseName,
    poNo: header.poNo,
    date: header.date,
    deliveryDate: header.deliveryDate,
    supplier: header.supplier,
    itemName: detail.itemName,
    unit: detail.unit,
    qty: detail.qty,
    price: detail.price,
    total: detail.total,
    notes: header.notes,
    pdfLink: header.pdfLink || `/api/pdf/po/${header.poNo.replace(/\//g, "_")}.pdf`,
    status: header.status,
    division: header.division,
    discount: header.discount,
    tax: header.tax,
    others: header.others,
    grandTotal: header.grandTotal,
    discountPercent: header.discountPercent,
    taxPercent: header.taxPercent,
    doNo: header.doNo,
    driverName: header.driverName,
    licensePlate: header.licensePlate,
    receivedDate: header.receivedDate,
    checkerBy: header.checkerBy,
  };
}

async function nextPrefixedNumber(auth: any, sheetName: string, rangeColumn: string, prefix: string) {
  const rows = await sheetValues(auth, `${sheetName}!${rangeColumn}:${rangeColumn}`);
  const nums = rows.slice(1).map((row: any[]) => {
    const match = safeText(row[0]).match(new RegExp(`^${prefix}(\\d+)`));
    return match ? parseInt(match[1], 10) : 0;
  });
  return Math.max(...nums, 0) + 1;
}

async function nextPrNumber(auth: any, yearSuffix: string) {
  const rows = await sheetValues(auth, `${NORMALIZED_SHEETS.PR_HEADER}!A:A`);
  const nums = rows.slice(1).map((row: any[]) => {
    const match = safeText(row[0]).match(/^PB-(\d+)-(\d{2})$/);
    if (match) {
      const num = parseInt(match[1], 10);
      const yr = match[2];
      if (yr === yearSuffix) return num;
    }
    return 0;
  });
  return Math.max(...nums, 0) + 1;
}

async function nextPoNumber(auth: any, yearSuffix: string) {
  const rows = await sheetValues(auth, `${NORMALIZED_SHEETS.PO_HEADER}!A:A`);
  const nums = rows.slice(1).map((row: any[]) => {
    const match = safeText(row[0]).match(/^BL-(\d+)-(\d{2})$/);
    if (match) {
      const num = parseInt(match[1], 10);
      const yr = match[2];
      if (yr === yearSuffix) return num;
    }
    return 0;
  });
  return Math.max(...nums, 0) + 1;
}

async function findPrHeader(auth: any, prId: string) {
  const rows = await sheetValues(auth, `${NORMALIZED_SHEETS.PR_HEADER}!A2:K`);
  for (let i = 0; i < rows.length; i++) {
    const header = mapPrHeader(rows[i], i);
    if (header.prId === prId) return header;
  }
  return null;
}

async function findPoHeader(auth: any, poNo: string) {
  const rows = await sheetValues(auth, `${NORMALIZED_SHEETS.PO_HEADER}!A2:V`);
  for (let i = 0; i < rows.length; i++) {
    const header = mapPoHeader(rows[i], i);
    if (header.poNo === poNo) return header;
  }
  return null;
}

async function updatePrHeaderPdfLink(auth: any, prId: string, link: string) {
  const header = await findPrHeader(auth, prId);
  if (header) await updateSheetValues(auth, `${NORMALIZED_SHEETS.PR_HEADER}!J${header.rowIndex}`, [[link]]);
}

async function updatePoHeaderPdfLink(auth: any, poNo: string, link: string) {
  const header = await findPoHeader(auth, poNo);
  if (header) await updateSheetValues(auth, `${NORMALIZED_SHEETS.PO_HEADER}!I${header.rowIndex}`, [[link]]);
}

async function updatePrHeaderStatus(auth: any, prId: string, status: string, poNo?: string) {
  const header = await findPrHeader(auth, prId);
  if (!header) return;
  await updateSheetValues(auth, `${NORMALIZED_SHEETS.PR_HEADER}!G${header.rowIndex}`, [[status]]);
  if (typeof poNo === "string") {
    await updateSheetValues(auth, `${NORMALIZED_SHEETS.PR_HEADER}!K${header.rowIndex}`, [[poNo]]);
  }
}

app.get("/api/stats", async (req, res) => {
  try {
    const auth = getAuthFromRequest(req);
    const { headers, details, headerById } = await loadPrHeaderDetail(auth);

    const statusCount = (statuses: string[]) => {
      const wanted = statuses.map(s => s.toUpperCase());
      return headers.filter(h => wanted.includes(safeText(h.status).toUpperCase())).length;
    };

    const waitingReceive = headers.filter(h => safeText(h.status).toUpperCase() === "WAITING RECEIVE" && h.poNo).length;
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthlyData: Record<string, { prIds: Set<string>; totalQty: number }> = {};
    monthNames.forEach(m => monthlyData[m] = { prIds: new Set(), totalQty: 0 });

    details.forEach(d => {
      const h = headerById.get(d.prId);
      if (!h?.date) return;
      const date = new Date(h.date);
      if (isNaN(date.getTime())) return;
      const month = monthNames[date.getMonth()];
      monthlyData[month].prIds.add(h.prId);
      monthlyData[month].totalQty += asNumber(d.qty);
    });

    const lastSixMonths: string[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      lastSixMonths.push(monthNames[d.getMonth()]);
    }

    const getTop = (kind: "supplier" | "division" | "item", limit = 5) => {
      const counts: Record<string, { prIds: Set<string>; totalQty: number }> = {};
      details.forEach(d => {
        const h = headerById.get(d.prId);
        const key = kind === "item" ? d.itemName : kind === "supplier" ? h?.supplier : h?.division;
        if (!key) return;
        if (!counts[key]) counts[key] = { prIds: new Set(), totalQty: 0 };
        if (d.prId) counts[key].prIds.add(d.prId);
        counts[key].totalQty += asNumber(d.qty);
      });
      return Object.entries(counts)
        .map(([name, data]) => ({ name, count: data.prIds.size, totalQty: data.totalQty }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
    };

    res.json({
      totalPR: headers.length,
      waitingManager: statusCount(["WAITING MANAGER APPROVAL"]),
      waitingDirector: statusCount(["WAITING DIREKTUR APPROVAL"]),
      waitingPO: statusCount(["WAITING CREATED PO"]),
      waitingReceive,
      finish: statusCount(["FINISH", "ALREADY RECEIVE"]),
      chartData: {
        labels: lastSixMonths,
        datasets: [
          {
            type: "line" as const,
            label: "PR Count",
            data: lastSixMonths.map(m => monthlyData[m].prIds.size),
            borderColor: "rgb(236, 72, 153)",
            backgroundColor: "rgba(236, 72, 153, 0.1)",
            fill: true,
            tension: 0.4,
            yAxisID: "y",
          },
          {
            type: "bar" as const,
            label: "Total Qty",
            data: lastSixMonths.map(m => monthlyData[m].totalQty),
            backgroundColor: "rgba(79, 70, 229, 0.6)",
            borderColor: "rgb(79, 70, 229)",
            borderRadius: 8,
            borderWidth: 1,
            yAxisID: "y1",
          },
        ],
      },
      topSuppliers: getTop("supplier"),
      topDivisions: getTop("division"),
      topItems: getTop("item", 10),
    });
  } catch (error: any) {
    handleApiError(res, error, "STATS_NORMALIZED");
  }
});

app.get("/api/pr", async (req, res) => {
  try {
    const auth = getAuthFromRequest(req);
    const { details, headerById } = await loadPrHeaderDetail(auth);
    const rows = details
      .map(d => {
        const header = headerById.get(d.prId);
        return header ? toPrApiRow(d, header) : null;
      })
      .filter(Boolean);
    res.json(rows.reverse());
  } catch (error: any) {
    handleApiError(res, error, "PR_LIST_NORMALIZED");
  }
});

app.post(["/api/pr", "/api/pr/create"], requirePermission("CREATE PR"), async (req, res) => {
  try {
    const sessionUser = (req as any).sessionUser as SessionUser;
    const requester = sessionUser.displayName || sessionUser.username;
    const division = sessionUser.division || req.body.division || "";
    const divCode = cleanCode(sessionUser.divisionCode || req.body.divCode || "GEN");
    const auth = getAuthFromRequest(req);
    const now = new Date();
    const date = now.toISOString().split("T")[0];
    const yearSuffix = String(now.getFullYear()).slice(-2);
    const nextNum = await nextPrNumber(auth, yearSuffix);
    const prId = `PB-${String(nextNum).padStart(10, "0")}-${yearSuffix}`;
    const pdfUrl = `/api/pdf/pr/${prId.replace(/\//g, "_")}.pdf`;
    const items = Array.isArray(req.body.items) ? req.body.items : [];

    const firstDetailNum = await nextPrefixedNumber(auth, NORMALIZED_SHEETS.PR_DETAIL, "A", "PRD");
    const detailRows = items.map((item: any, index: number) => {
      const b1 = item.b1 ?? "0";
      const b2 = item.b2 ?? "0";
      const b3 = item.b3 ?? "0";
      const avgSales = item.avgSales ?? ((asNumber(b1) + asNumber(b2) + asNumber(b3)) / 3);
      return [
        `PRD${String(firstDetailNum + index).padStart(7, "0")}`,
        prId,
        item.itemName,
        item.unit,
        item.qty,
        item.stockOnhand,
        avgSales,
        b1,
        b2,
        b3,
      ];
    });

    await appendSheetValues(auth, `${NORMALIZED_SHEETS.PR_HEADER}!A:K`, [[
      prId,
      date,
      requester,
      division,
      req.body.supplier,
      req.body.notes || "",
      "WAITING MANAGER APPROVAL",
      "",
      "",
      pdfUrl,
      "",
    ]]);

    if (detailRows.length) {
      await appendSheetValues(auth, `${NORMALIZED_SHEETS.PR_DETAIL}!A:J`, detailRows);
    }

    const pdfResult = await createPrPdf(prId, {
      date,
      requester,
      division,
      supplier: req.body.supplier,
      notes: req.body.notes || "",
      items: items.map((item: any) => ({
        ...item,
        avgSales: item.avgSales ?? ((asNumber(item.b1) + asNumber(item.b2) + asNumber(item.b3)) / 3),
      })),
    }, auth);

    const fileName = `${prId.replace(/\//g, "_")}.pdf`;
    const filePath = path.join(PDF_DIR, fileName);
    
    if (pdfResult && pdfResult.driveLink) {
      await updatePrHeaderPdfLink(auth, prId, pdfResult.driveLink);
    } else {
      uploadToDrive(filePath, fileName, auth).then(async (driveLink) => {
        const finalLink = driveLink || `${getAppUrl(req)}/api/pdf/pr/${prId.replace(/\//g, "_")}.pdf`;
        await updatePrHeaderPdfLink(auth, prId, finalLink);
      }).catch(err => console.warn(`[PR] Drive Backup upload failed: ${err.message}`));
    }

    notifyNewPR(prId, { ...req.body, requester, division, divCode, items }, req).catch(err => {
      console.error("[WHATSAPP] New PR notification failed:", err.message);
    });

    notifyNewPRTelegram(prId, { ...req.body, requester, division, divCode, items }).catch(err => {
      console.error("[TELEGRAM] New PR notification failed:", err.message);
    });

    res.json({ success: true, pr: { id: prId, pdfLink: pdfUrl } });
  } catch (error: any) {
    handleApiError(res, error, "PR_CREATE_NORMALIZED");
  }
});

app.post("/api/pr/approve", requireRoles(["MANAGER", "MANAJER", "MGR", "KABAG", "DIREKTUR", "DIREKSI", "DIR", "KADIV", "ADMIN"]), async (req, res) => {
  try {
    const { prId, action, reason } = req.body;
    const sessionUser = (req as any).sessionUser as SessionUser;
    const role = sessionUser.role;
    const user = sessionUser.displayName || sessionUser.username;
    const auth = getAuthFromRequest(req);
    const { headers, details } = await loadPrHeaderDetail(auth);
    const header = headers.find(h => h.prId === safeText(prId));
    if (!header) return res.status(404).json({ success: false, message: "PR not found" });

    const roleUp = safeText(role).toUpperCase();
    const statusUp = safeText(header.status).toUpperCase();
    let newStatus = "";
    if (action === "REJECT") newStatus = "Rejected";
    else if (action === "PENDING") {
      newStatus = roleUp === "MANAGER" || roleUp === "MGR" ? "WAITING MANAGER APPROVAL" : "WAITING DIREKTUR APPROVAL";
    } else if (roleUp === "MANAGER" || roleUp === "MGR") {
      newStatus = "WAITING DIREKTUR APPROVAL";
    } else if (roleUp === "DIREKTUR" || roleUp === "DIR") {
      newStatus = "WAITING CREATED PO";
    } else if (roleUp === "ADMIN") {
      newStatus = statusUp === "WAITING MANAGER APPROVAL" ? "WAITING DIREKTUR APPROVAL" : "WAITING CREATED PO";
    }

    await updateSheetValues(auth, `${NORMALIZED_SHEETS.PR_HEADER}!G${header.rowIndex}`, [[newStatus]]);

    if (action === "APPROVE") {
      let approverCol = "";
      if (roleUp === "MANAGER" || roleUp === "MGR" || (roleUp === "ADMIN" && statusUp === "WAITING MANAGER APPROVAL")) approverCol = "H";
      if (roleUp === "DIREKTUR" || roleUp === "DIR" || (roleUp === "ADMIN" && statusUp === "WAITING DIREKTUR APPROVAL")) approverCol = "I";
      if (approverCol) await updateSheetValues(auth, `${NORMALIZED_SHEETS.PR_HEADER}!${approverCol}${header.rowIndex}`, [[`${user} (APPROVE)`]]);
    }

    if (action === "REJECT" && reason) {
      await updateSheetValues(auth, `${NORMALIZED_SHEETS.PR_HEADER}!F${header.rowIndex}`, [[`${header.notes || ""} | REJECTED: ${reason}`]]);
    }

    const matchingDetails = details.filter(d => d.prId === prId);
    if (newStatus === "WAITING DIREKTUR APPROVAL") {
      const prData = {
        requester: header.requester,
        division: header.division,
        supplier: header.supplier,
        notes: header.notes,
        items: matchingDetails.map(d => ({ itemName: d.itemName, qty: d.qty })),
      };
      notifyDirekturPR(prId, prData, user, req).catch(err => console.error("[WHATSAPP] Direktur approval notification failed:", err.message));
      notifyDirekturPRTelegram(prId, prData, user).catch(err => console.error("[TELEGRAM] Direktur approval notification failed:", err.message));
    }

    notifyPRApprovalChange(prId, user, role, newStatus, action === "REJECT", reason, header.requester, req)
      .catch(err => console.error("[WHATSAPP] Approval notification failed:", err.message));

    res.json({ success: true });
  } catch (error: any) {
    handleApiError(res, error, "APPROVE_NORMALIZED");
  }
});

app.get("/api/po", async (req, res) => {
  try {
    const auth = getAuthFromRequest(req);
    const { details, headerByPoNo } = await loadPoHeaderDetail(auth);
    const rows = details
      .map(d => {
        const header = headerByPoNo.get(d.poNo);
        return header ? toPoApiRow(d, header) : null;
      })
      .filter(Boolean);
    res.json(rows.reverse());
  } catch (error: any) {
    handleApiError(res, error, "PO_LIST_NORMALIZED");
  }
});

app.post(["/api/po", "/api/po/create"], requireRoles(["PURCHASE", "PURCHASING", "ADMIN"]), async (req, res) => {
  try {
    const { prId, supplier, deliveryDate, items, notes, discount, tax, others, subTotal, grandTotal, discountPercent, taxPercent, division } = req.body;
    const sessionUser = (req as any).sessionUser as SessionUser;
    const purchaseName = sessionUser.displayName || sessionUser.username;
    const auth = getAuthFromRequest(req);
    const now = new Date();
    const yearSuffix = String(now.getFullYear()).slice(-2);
    const nextNum = await nextPoNumber(auth, yearSuffix);
    const poNo = `BL-${String(nextNum).padStart(9, "0")}-${yearSuffix}`;
    const date = now.toISOString().split("T")[0];
    const poPdfUrl = `/api/pdf/po/${poNo.replace(/\//g, "_")}.pdf`;
    const safeItems = Array.isArray(items) ? items : [];

    const pdfResult = await createPoPdf(poNo, {
      prId,
      purchaseName,
      supplier,
      deliveryDate,
      items: safeItems,
      notes,
      discount,
      tax,
      others,
      subTotal,
      grandTotal,
      discountPercent,
      taxPercent,
      division,
    }, auth);

    await appendSheetValues(auth, `${NORMALIZED_SHEETS.PO_HEADER}!A:Q`, [[
      poNo,
      prId,
      purchaseName,
      date,
      deliveryDate,
      supplier,
      division,
      notes || "",
      poPdfUrl,
      "WAITING RECEIVE",
      subTotal,
      discount,
      discountPercent,
      tax,
      taxPercent,
      others,
      grandTotal,
    ]]);

    const firstDetailNum = await nextPrefixedNumber(auth, NORMALIZED_SHEETS.PO_DETAIL, "A", "POD");
    const detailRows = safeItems.map((item: any, index: number) => [
      `POD${String(firstDetailNum + index).padStart(7, "0")}`,
      poNo,
      item.itemName,
      item.unit,
      item.qty,
      item.price,
      asNumber(item.price) * asNumber(item.qty),
    ]);
    if (detailRows.length) await appendSheetValues(auth, `${NORMALIZED_SHEETS.PO_DETAIL}!A:G`, detailRows);

    await updatePrHeaderStatus(auth, prId, "WAITING RECEIVE", poNo);

    const poFileName = `${poNo.replace(/\//g, "_")}.pdf`;
    const poFilePath = path.join(PO_PDF_DIR, poFileName);
    
    if (pdfResult && pdfResult.driveLink) {
      await updatePoHeaderPdfLink(auth, poNo, pdfResult.driveLink);
    } else {
      uploadToDrive(poFilePath, poFileName, auth, GOOGLE_DRIVE_PO_FOLDER_ID).then(async (driveLink) => {
        const finalLink = driveLink || `${getAppUrl(req)}/api/pdf/po/${poNo.replace(/\//g, "_")}.pdf`;
        await updatePoHeaderPdfLink(auth, poNo, finalLink);
      }).catch(err => console.warn(`[PO] Drive Backup upload failed: ${err.message}`));
    }

    res.json({ success: true, poNo, pdfLink: poPdfUrl });
  } catch (error: any) {
    handleApiError(res, error, "PO_CREATE_NORMALIZED");
  }
});

app.post("/api/po/receive", async (req, res) => {
  try {
    const auth = getAuthFromRequest(req);
    const sessionUser = (req as any).sessionUser as SessionUser | undefined;
    if (!sessionUser) return res.status(401).json({ success: false, message: "Unauthorized." });

    const { prId, poNo, doNo, driverName, licensePlate, checkerBy, receivedDate } = req.body;
    if (!poNo || !doNo || !driverName || !licensePlate || !checkerBy || !receivedDate) {
      return res.status(400).json({ success: false, message: "Semua data penerimaan wajib diisi." });
    }

    const poHeader = await findPoHeader(auth, poNo);
    if (!poHeader) {
      return res.status(404).json({ success: false, message: "Purchase Order tidak ditemukan." });
    }

    if (poHeader.status === "ALREADY RECEIVE") {
      return res.status(400).json({ success: false, message: "PO ini sudah diterima sebelumnya." });
    }

    // Check division permission (Gudang matching)
    const userRole = String(sessionUser.role || "").toUpperCase();
    const isPowerUser = ["ADMIN", "PURCHASE", "PURCHASING"].includes(userRole);
    if (!isPowerUser) {
      const userDiv = String(sessionUser.division || "").toUpperCase().trim();
      const poDiv = String(poHeader.division || "").toUpperCase().trim();
      if (!userDiv || (!poDiv.includes(userDiv) && !userDiv.includes(poDiv))) {
        return res.status(403).json({ success: false, message: "Anda tidak memiliki hak akses untuk menerima barang di divisi ini." });
      }
    }

    // Format receivedDate (YYYY-MM-DD -> DD/MM/YYYY)
    let formattedDate = "";
    const dateParts = receivedDate.split("-");
    if (dateParts.length === 3) {
      formattedDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
    } else {
      formattedDate = receivedDate;
    }

    // Update PO status to "ALREADY RECEIVE" (Column J)
    await updateSheetValues(auth, `${NORMALIZED_SHEETS.PO_HEADER}!J${poHeader.rowIndex}`, [["ALREADY RECEIVE"]]);

    // Update Columns R to V: DO_NO, DRIVER_NAME, LICENSE_PLATE, RECEIVED_DATE, CHEKER_BY
    await updateSheetValues(auth, `${NORMALIZED_SHEETS.PO_HEADER}!R${poHeader.rowIndex}:V${poHeader.rowIndex}`, [[
      doNo,
      driverName,
      licensePlate,
      formattedDate,
      checkerBy
    ]]);

    // Update PR status to "ALREADY RECEIVE"
    const targetPrId = prId || poHeader.prId;
    if (targetPrId) {
      await updatePrHeaderStatus(auth, targetPrId, "ALREADY RECEIVE");
    }

    res.json({ success: true, message: "Barang berhasil diterima dan status diperbarui." });
  } catch (error: any) {
    handleApiError(res, error, "PO_RECEIVE");
  }
});

app.post("/api/pr/finish", requireRoles(["PURCHASE", "PURCHASING", "ADMIN"]), async (req, res) => {
  try {
    const auth = getAuthFromRequest(req);
    await updatePrHeaderStatus(auth, safeText(req.body.prId), "FINISH");
    res.json({ success: true });
  } catch (error: any) {
    handleApiError(res, error, "PR_FINISH_NORMALIZED");
  }
});

app.put("/api/pr/:index", requireAdmin, async (req, res) => {
  try {
    const auth = getAuthFromRequest(req);
    const editIndex = parseInt(req.params.index, 10);
    const body = req.body;
    const detailRow = (await sheetValues(auth, `${NORMALIZED_SHEETS.PR_DETAIL}!A${editIndex}:J${editIndex}`))[0] || [];
    const oldPrId = safeText(detailRow[1] || body.id);
    const newPrId = safeText(body.id || oldPrId);
    const header = await findPrHeader(auth, oldPrId);
    if (!header) return res.status(404).json({ success: false, message: "PR header not found" });

    await updateSheetValues(auth, `${NORMALIZED_SHEETS.PR_HEADER}!A${header.rowIndex}:K${header.rowIndex}`, [[
      newPrId,
      body.date || header.date,
      body.requester || header.requester,
      body.division || header.division,
      body.supplier || header.supplier,
      body.notes || header.notes,
      body.status || header.status,
      body.mgrApp || header.mgrApproval,
      body.dirApp || header.dirApproval,
      body.pdfLink || header.pdfLink,
      body.poNumber || header.poNo,
    ]]);

    if (newPrId !== oldPrId) {
      const detailIds = await sheetValues(auth, `${NORMALIZED_SHEETS.PR_DETAIL}!B2:B`);
      for (let i = 0; i < detailIds.length; i++) {
        if (safeText(detailIds[i][0]) === oldPrId) {
          await updateSheetValues(auth, `${NORMALIZED_SHEETS.PR_DETAIL}!B${i + 2}`, [[newPrId]]);
        }
      }
    }

    await updateSheetValues(auth, `${NORMALIZED_SHEETS.PR_DETAIL}!C${editIndex}:J${editIndex}`, [[
      body.itemName,
      body.unit,
      body.qty,
      body.stockOnhand,
      body.avgSales,
      body.b1,
      body.b2,
      body.b3,
    ]]);

    res.json({ success: true });
  } catch (error: any) {
    handleApiError(res, error, "EDIT_PR_NORMALIZED");
  }
});

app.delete("/api/admin/pr/:index", requireAdmin, async (req, res) => {
  try {
    const auth = getAuthFromRequest(req);
    const index = parseInt(req.params.index, 10);
    const row = (await sheetValues(auth, `${NORMALIZED_SHEETS.PR_DETAIL}!B${index}:B${index}`))[0] || [];
    const prId = safeText(row[0]);
    if (!prId) return res.status(404).json({ success: false, message: "PR detail row not found" });

    const detailRows = await sheetValues(auth, `${NORMALIZED_SHEETS.PR_DETAIL}!B2:B`);
    const detailRowNumbers = detailRows
      .map((r: any[], i: number) => safeText(r[0]) === prId ? i + 2 : -1)
      .filter((n: number) => n !== -1);
    await deleteSheetRows(auth, NORMALIZED_SHEETS.PR_DETAIL, detailRowNumbers);

    const headerRows = await sheetValues(auth, `${NORMALIZED_SHEETS.PR_HEADER}!A2:A`);
    const headerRowNumbers = headerRows
      .map((r: any[], i: number) => safeText(r[0]) === prId ? i + 2 : -1)
      .filter((n: number) => n !== -1);
    await deleteSheetRows(auth, NORMALIZED_SHEETS.PR_HEADER, headerRowNumbers);

    res.json({ success: true });
  } catch (error: any) {
    handleApiError(res, error, "ADMIN_PR_DELETE_NORMALIZED");
  }
});

// WhatsApp diagnostics APIs
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

// 1. Users Management
app.get("/api/admin/users", async (req, res) => {
  try {
    const auth = getAuthFromRequest(req);
    const sheets = getSheets(auth);
    const response = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: "User_Role!A2:I" });
    const rows = response.data.values || [];
    // Do not expose password hashes or legacy plaintext passwords to the client.
    res.json(rows.map((r, i) => sanitizePublicUser(r, i)));
  } catch (error: any) {
    handleApiError(res, error, "ADMIN_USERS_GET");
  }
});

app.post("/api/admin/users", async (req, res) => {
  try {
    const auth = getAuthFromRequest(req);
    const sheets = getSheets(auth);
    const { username, password, fullName, division, divCode, wa, role, access, telegramChatId } = req.body;
    if (!String(username || "").trim() || !String(password || "")) {
      return res.status(400).json({ success: false, message: "Username dan password wajib diisi." });
    }
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "User_Role!A:I",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[username, hashPassword(String(password)), fullName, division, divCode, wa, role, access, telegramChatId || ""]] }
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
    const { username, password, fullName, division, divCode, wa, role, access, telegramChatId } = req.body;
    const currentRowRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `User_Role!A${index}:I${index}`,
    });
    const currentRow = currentRowRes.data.values?.[0] || [];
    const existingPassword = String(currentRow[1] || "");
    const passwordToStore = String(password || "") ? hashPassword(String(password)) : existingPassword;
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `User_Role!A${index}:I${index}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[username, passwordToStore, fullName, division, divCode, wa, role, access, telegramChatId || ""]] }
    });
    res.json({ success: true });
  } catch (error: any) {
    handleApiError(res, error, "ADMIN_USERS_PUT");
  }
});

// 1.5. Telegram Bot Webhook & Setup
app.post("/api/telegram/webhook", async (req, res) => {
  res.sendStatus(200);
  processTelegramUpdate(req.body).catch(err =>
    console.error("[TELEGRAM] Webhook callback processing error:", err.message)
  );
});

app.get("/api/telegram/setup-webhook", async (req, res) => {
  try {
    if (!TELEGRAM_BOT_TOKEN) {
      return res.status(400).json({ success: false, message: "TELEGRAM_BOT_TOKEN is not configured in environment variables." });
    }
    
    let targetUrl = TELEGRAM_WEBHOOK_URL;
    if (!targetUrl || targetUrl.includes("localhost") || targetUrl.includes("127.0.0.1")) {
      targetUrl = `${getAppUrl(req)}/api/telegram/webhook`;
    } else {
      if (targetUrl.startsWith("http://")) {
        targetUrl = targetUrl.replace("http://", "https://");
      }
      if (!targetUrl.endsWith("/api/telegram/webhook")) {
        targetUrl = targetUrl.replace(/\/+$/, "") + "/api/telegram/webhook";
      }
    }

    console.log(`[TELEGRAM] Registering webhook URL: ${targetUrl}`);
    const response = await sendTelegramRequest("setWebhook", { url: targetUrl });
    if (response && response.ok) {
      return res.json({ success: true, message: `Webhook registered successfully to: ${targetUrl}`, details: response });
    } else {
      return res.status(500).json({ success: false, message: "Failed to register webhook with Telegram.", details: response });
    }
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/api/admin/telegram/diagnostics", async (req, res) => {
  if (!TELEGRAM_BOT_TOKEN) {
    return res.status(400).json({
      success: false,
      message: "TELEGRAM_BOT_TOKEN is not configured in environment variables.",
      botInfo: null,
      webhookInfo: null,
      systemUsers: [],
    });
  }
  try {
    const [botInfoRes, webhookInfoRes, users] = await Promise.all([
      sendTelegramRequest("getMe", {}),
      sendTelegramRequest("getWebhookInfo", {}),
      getNotificationUsers(),
    ]);

    const systemUsers = users.map(u => ({
      username: u.username,
      displayName: u.displayName || u.username,
      role: u.role,
      telegramChatId: u.telegramChatId || "",
    }));

    res.json({
      success: botInfoRes?.ok,
      tokenSet: true,
      webhookUrlSet: !!TELEGRAM_WEBHOOK_URL,
      message: botInfoRes?.ok ? "Telegram connection is healthy." : "There may be an issue with the Telegram connection.",
      botInfo: botInfoRes?.result || null,
      webhookInfo: webhookInfoRes?.result || null,
      systemUsers,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: `An exception occurred: ${error.message}`, systemUsers: [] });
  }
});

app.post("/api/admin/telegram/send-test-message", async (req, res) => {
  if (!TELEGRAM_BOT_TOKEN) {
    return res.status(400).json({ success: false, message: "Telegram Bot Token is not configured." });
  }
  try {
    const { chatId, message } = req.body;
    if (!chatId || !message) {
      return res.status(400).json({ success: false, message: "chatId and message are required." });
    }

    const response = await sendTelegramRequest("sendMessage", {
      chat_id: chatId,
      text: message,
      parse_mode: "Markdown",
    });

    if (response && response.ok) {
      return res.json({ success: true, log: response, message: `Message sent successfully to Chat ID: ${chatId}` });
    } else {
      return res.status(500).json({ success: false, log: response, message: "Failed to send message via Telegram." });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message, message: `An exception occurred: ${error.message}` });
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

async function startServer() {
  const distPath = path.join(process.cwd(), "dist");
  const distIndexExists = fs.existsSync(path.join(distPath, "index.html"));

  if (distIndexExists) {
    // Production mode: serve pre-built static files from dist/
    console.log("[SERVER] Mode: PRODUCTION (serving static files from dist/)");
    app.use(express.static(distPath, { maxAge: "1h" }));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  } else {
    // Development mode: use Vite dev server (hot reload)
    console.log("[SERVER] Mode: DEVELOPMENT (using Vite dev server)");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true, host: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
    setupTelegram().catch(err => console.error("[TELEGRAM] Webhook setup failed:", err.message));
  });
}
if (process.env.VERCEL !== "1") {
  startServer();
}

export default app;
