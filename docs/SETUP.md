# Email Header Forensics — Setup Guide (Vercel version)

## 1. Prerequisites
A Vercel account (free Hobby tier is sufficient) and, for the Git path, a
GitHub/GitLab repository containing this folder's contents. Node.js is only
needed if you want to build or preview locally (`npm install && npm run dev`).

## 2. Deploy via Git (recommended)
1. Push this folder to a repository.
2. At vercel.com → **Add New… → Project**, import the repository.
3. Vercel reads `vercel.json` automatically (framework: Vite, build
   `npm run build`, output `dist`, all security headers). Click **Deploy**.
4. Every subsequent `git push` builds and deploys automatically; pull
   requests get preview URLs.

## 3. Deploy via CLI (no Git)
```bash
npm i -g vercel
cd <this folder>
vercel --prod
```

## 4. Verify
```bash
curl -sI https://<your-app>.vercel.app | grep -iE "content-security|x-frame|nosniff|referrer|strict-transport"
```
You should see the CSP (connect-src limited to 'self', dns.google,
cloudflare-dns.com), X-Frame-Options: DENY, nosniff, no-referrer, and HSTS.
In the app, click **load phishing sample → Analyze headers** to confirm the
engine end to end.

## 5. Custom domain
Project → Settings → Domains → add your domain and follow the DNS prompt.
HTTPS certificates are provisioned automatically; HSTS is already sent via
`vercel.json`.

## 6. Privacy do-not list
Do not enable Vercel Analytics or Speed Insights — their injected scripts
violate the CSP and the tool's no-telemetry promise. Note in your privacy
statement that Vercel's edge keeps short-retention request logs (visitor IP
+ asset paths); analysis data never reaches the server by design.

## 7. Updating
Git path: just push. CLI path: rerun `vercel --prod`. `index.html` is served
`no-store` and assets are content-hashed, so users get updates on next load.

## 8. Troubleshooting
**Headers missing** — confirm `vercel.json` is at the repository root and the
project wasn't imported with a subdirectory as root.
**404 on refresh** — should not occur (SPA has a single route); if you add
routes later, add a rewrite to `/index.html` in `vercel.json`.
**DNS enrichment "unreachable"** — the visitor's network blocks DoH; the app
degrades to header-only analysis by design.
