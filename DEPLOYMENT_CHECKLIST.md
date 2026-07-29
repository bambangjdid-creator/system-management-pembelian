# Deployment & Owner Checklist

Gunakan checklist ini sebelum menjalankan aplikasi di production.

## 1. Tindakan keamanan wajib

- [ ] Rotate Google Service Account key di Google Cloud IAM.
- [ ] Hapus/revoke key lama yang pernah bocor.
- [ ] Rotate token WhatsApp/Fonnte.
- [ ] Generate `JWT_SECRET` baru minimal 32 karakter:

```bash
openssl rand -base64 48
```

- [ ] Reset password semua user di sheet `User_Role`.
- [ ] Bersihkan Git history dari secret/PDF/log lama. Lihat `SECURITY.md`.
- [ ] Minta semua collaborator re-clone repo setelah force-push history bersih.

## 2. Siapkan environment lokal

```bash
npm install
cp .env.example .env
```

Isi `.env` dengan nilai environment milik Anda. Jangan commit `.env`.

Variabel wajib:

```env
NODE_ENV=development
PORT=3000
APP_BASE_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

GOOGLE_SERVICE_ACCOUNT_EMAIL=...
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
SPREADSHEET_ID=...
GOOGLE_DRIVE_FOLDER_ID=...
GOOGLE_DRIVE_PO_FOLDER_ID=...
TEMPLATE_PR_ID=...
TEMPLATE_PO_ID=...
JWT_SECRET=...
SESSION_TTL_SECONDS=28800
WA_API_TOKEN=...
```

Firebase OAuth opsional untuk mode Google user-token:

```env
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
```

## 3. Siapkan akses Google

- [ ] Share Spreadsheet ke `GOOGLE_SERVICE_ACCOUNT_EMAIL` minimal Editor.
- [ ] Share folder Drive PR PDF ke service account.
- [ ] Share folder Drive PO PDF ke service account.
- [ ] Share Google Docs template PR ke service account.
- [ ] Share Google Docs template PO ke service account.

Pastikan Spreadsheet memiliki sheet/tab berikut:

- `User_Role`
- `Master_Stock`
- `PR_Header`
- `PR_Detail`
- `PO_Header`
- `PO_Detail`

## 4. Validasi sebelum deploy

```bash
npm run validate
```

Perintah ini menjalankan:

- TypeScript typecheck
- Unit tests
- Production build

Semua harus lolos sebelum deploy.

## 5. Jalankan lokal

```bash
npm run dev
```

Buka:

```text
http://localhost:3000
```

## 6. Deploy production

Set semua environment variable di platform deployment Anda, misalnya Cloud Run/VPS/Render/Railway.

Contoh high-level flow:

```bash
npm ci
npm run validate
npm start
```

Untuk production, gunakan:

```env
NODE_ENV=production
APP_BASE_URL=https://domain-production-anda
ALLOWED_ORIGINS=https://domain-production-anda
```

## 7. Smoke test setelah deploy

- [ ] Login user biasa.
- [ ] Login admin.
- [ ] Buat PR baru.
- [ ] Approve PR sebagai Manager.
- [ ] Approve PR sebagai Direktur.
- [ ] Buat PO dari Purchase Queue.
- [ ] Buka PDF PR.
- [ ] Buka PDF PO.
- [ ] Tes notifikasi WhatsApp jika token diaktifkan.
- [ ] Cek Settings > Users tidak menampilkan password/hash.
- [ ] Cek endpoint admin tidak bisa diakses tanpa session admin.

## 8. Jangan commit file berikut

Sudah ada di `.gitignore`, tetap pastikan tidak masuk commit:

- `.env`
- `.env.*` selain `.env.example`
- `config_wa.json`
- `PR_PDF/`
- `PO_PDF/`
- `*-debug.log`
- secret key/token apa pun
