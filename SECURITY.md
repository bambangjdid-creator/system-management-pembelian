# Security Notes

## Immediate incident response for exposed secrets

This repository previously contained real-looking Google service account material, WhatsApp gateway tokens, debug logs, and generated business PDFs. Treat every exposed secret as compromised.

Required actions before redeploying:

1. **Rotate Google service account keys** in Google Cloud IAM.
2. **Revoke the leaked key** and remove unused service accounts.
3. **Rotate the WhatsApp/Fonnte API token**.
4. **Rotate `JWT_SECRET`** with a random value of at least 32 characters.
5. **Force password reset for all users** in `User_Role`.
6. **Rewrite Git history** to purge secrets and PDFs; deleting files in a new commit is not enough.
7. **Review Google Drive/Sheets sharing permissions** and remove public/unknown access.

## Git history cleanup

Example using `git filter-repo`:

```bash
python -m pip install git-filter-repo

git filter-repo \
  --path .env.example \
  --path firebase-debug.log \
  --path kayorama-debug.log \
  --path PR_PDF \
  --path PO_PDF \
  --path GAS_Backend.gs \
  --path GAS_Code.gs.txt \
  --invert-paths

# Recreate a safe .env.example after history cleanup, then force-push intentionally.
git push --force-with-lease origin main
```

After force-push, every collaborator should re-clone the repository.

## Runtime security model

- The Node/Express backend issues a signed `sessionToken` on `/api/login`.
- The frontend sends the token in `X-Session-Token` for protected API calls.
- Admin and WhatsApp diagnostics routes require admin role/server-side RBAC.
- New/updated passwords are stored using PBKDF2-SHA256 hashes.
- Legacy plaintext passwords are upgraded opportunistically on successful login.
- Secrets are read only from environment variables or ignored local files, never from `.env.example`.

## Required environment variables

See `.env.example`. Never commit `.env` or real secret values.
