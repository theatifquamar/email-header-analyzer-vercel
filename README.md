# Email Header Forensics

[![Test](https://github.com/theatifquamar/email-header-analyzer-vercel/actions/workflows/test.yml/badge.svg)](https://github.com/theatifquamar/email-header-analyzer-vercel/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Deployed on Vercel](https://img.shields.io/badge/deployed-vercel-black?logo=vercel)](https://vercel.com)

Privacy-first email header analysis for SOC analysts. 100% static, 100%
client-side: there is **no backend**, so the hosting server never receives
pasted headers — they exist only in the visitor's browser memory.

## Architecture & privacy model

- Static site (Vite + React). The server only ever serves JS/HTML/CSS; it
  receives no analysis data because none is ever POSTed anywhere.
- Optional DNS-over-HTTPS enrichment (PTR, FCrDNS, ASN, MX, SPF, DMARC)
  talks directly from the visitor's browser to `dns.google` /
  `cloudflare-dns.com`, sending **only IPs and domain names**, never
  message content. Users can disable it in the UI for fully offline use.
- A strict Content-Security-Policy (in `index.html` and `public/_headers`)
  makes this enforceable by the browser: `connect-src` allows only those
  two resolvers, so even a compromised dependency could not exfiltrate data.
- No cookies, no localStorage/sessionStorage, no analytics, no third-party
  fonts or CDNs. The DNS cache is an in-memory `Map` destroyed on reload.

## Build

```bash
npm install
npm run build     # output in dist/
npm run preview   # test the production build locally
```

## Deploy (pick one)

The `dist/` folder is the entire site. Any static host works.

**Cloudflare Pages / Netlify** — connect the repo (build command
`npm run build`, output `dist`) or drag-and-drop `dist/`. The included
`public/_headers` file is picked up automatically and applies the
security headers.

**Vercel** — import the repo; framework preset "Vite". Add the headers
via `vercel.json` if you want them server-side (the CSP `<meta>` tag in
`index.html` already covers the essentials).

**GitHub Pages** — `npm run build`, then publish `dist/` (e.g. with
`actions/deploy-pages`). Relative `base: "./"` is already configured, so
it works under `https://user.github.io/repo/`.

**Your own nginx**:

```nginx
server {
  listen 443 ssl http2;
  server_name headers.example.com;
  root /var/www/header-forensics/dist;

  add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://dns.google https://cloudflare-dns.com https://rdap.org https://rdap.verisign.com; frame-ancestors 'none'; base-uri 'self'; form-action 'none'; object-src 'none'" always;
  add_header X-Content-Type-Options nosniff always;
  add_header X-Frame-Options DENY always;
  add_header Referrer-Policy no-referrer always;
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

  # Privacy: consider disabling or minimizing access logs — the URL never
  # contains analysis data, but IP logging may matter to your users.
  # access_log off;

  location / { try_files $uri /index.html; }
}
```

## Operational recommendations for a public deployment

1. **Serve over HTTPS only** (HSTS is in the headers file).
2. **Keep the "no data leaves your browser" promise verifiable**: don't
   add analytics, error-reporting SDKs, tag managers, or third-party
   embeds. Anything you add must also pass the CSP.
3. **Minimize server logs.** The app never sends data to your server, but
   web-server access logs still record visitor IPs; disable or truncate
   them if you advertise strict privacy.
4. **Pin and audit dependencies** (`npm audit`, lockfile committed).
   Supply-chain compromise is the main realistic risk for a client-side
   tool; the CSP is the backstop.
5. **Subresource integrity isn't needed** — all assets are first-party and
   hash-named by Vite.
6. **Add a short terms/disclaimer page** if your org requires one, noting
   the tool provides analytical assistance, not a guaranteed verdict, and
   that analysts remain responsible for final disposition.
7. If your users must avoid *any* third-party egress by policy, tell them
   to untick "Live DNS enrichment" — or remove the two resolver hosts
   from `connect-src` and ship it fully offline.

## Repo layout

```
index.html          entry + CSP meta
src/App.jsx         the entire application
src/main.jsx        React bootstrap
public/_headers     security headers (Netlify / Cloudflare Pages)
vite.config.js      relative base for subpath hosting
```

## What's new

- **Credits banner** crediting Atif Quamar (linkedin.com/in/theatifquamar), shown on every page.
- **How It Works** — methodology page with a 9-stage pipeline diagram and scoring-weight rationale.
- **Glossary** — searchable reference for every email-security term the tool uses.
- **Policy** — acceptable use, "as is" warranty disclaimer, liability limitation, privacy statement.
- **Premium visual refresh** — refined palette, gradients, shadows, consistent iconography.
- **PDF export fix** — the exported report now matches the on-screen dark theme and colors exactly
  (root cause: browsers strip background colors when printing unless told not to), and every
  section is included in the export even if left collapsed on screen.
