# System Management Pembelian

Aplikasi PR/PO berbasis Vite + React + TypeScript dengan backend Node/Express yang terhubung ke Google Sheets, Drive, Docs, dan gateway WhatsApp.

## Security first

Repository ini harus dianggap pernah mengalami exposure secret. Sebelum deploy production:

- Rotate Google Service Account key.
- Rotate token WhatsApp/Fonnte.
- Rotate `JWT_SECRET`.
- Reset password semua user.
- Purge secret/PDF dari Git history; lihat [`SECURITY.md`](./SECURITY.md).
- Ikuti checklist owner/deployment di [`DEPLOYMENT_CHECKLIST.md`](./DEPLOYMENT_CHECKLIST.md).
- Siapkan struktur Google Sheets sesuai [`docs/SPREADSHEET_SCHEMA.md`](./docs/SPREADSHEET_SCHEMA.md). Template header CSV tersedia di [`templates/google-sheets/`](./templates/google-sheets/).

## Run locally

Prerequisites: Node.js 20+.

```bash
npm install
cp .env.example .env
# isi semua nilai .env dengan secret milik environment Anda
npm run dev
```

Server berjalan di `http://localhost:3000`. Vite middleware dilayani oleh `server.ts`, sehingga frontend memakai endpoint relatif `/api/*`.

## Required environment variables

Lihat `.env.example` untuk daftar lengkap:

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `SPREADSHEET_ID`
- `GOOGLE_DRIVE_FOLDER_ID`
- `GOOGLE_DRIVE_PO_FOLDER_ID`
- `TEMPLATE_PR_ID`
- `TEMPLATE_PO_ID`
- `JWT_SECRET`
- `ALLOWED_ORIGINS`
- `APP_BASE_URL`

## Struktur frontend

```text
src/
├── app/layout/              # layout shell: sidebar, header, mobile drawer
├── features/
│   ├── admin/               # user, stock, WhatsApp diagnostics settings
│   ├── auth/                # LoginScreen
│   ├── components/          # reusable UI primitives
│   ├── dashboard/           # Dashboard statistics/charts
│   ├── po/                  # PO list, form, detail, purchase queue, hooks
│   └── pr/                  # PR list, form, detail, approvals, hooks
├── lib/                     # api wrapper, permissions, theme, shared types
└── store/                   # React context app store bridge
```

## Build

```bash
npm run typecheck
npm run build
npm start
```

## Notes

- `.env`, generated PDFs, debug logs, and local WhatsApp config are ignored by git.
- The legacy Google Apps Script backend was removed from the working tree to avoid running an unauthenticated duplicate backend.
