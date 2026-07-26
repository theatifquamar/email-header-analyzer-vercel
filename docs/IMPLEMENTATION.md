# Email Header Forensics — Implementation Explanation: Vercel and Netlify Deployments

## 1. What is identical in both implementations

Both packages deploy the exact same application: a single-page React app, compiled by Vite into one hashed JavaScript bundle (~63 kB gzipped) plus an `index.html`. There is no server-side code in either version. The application is architecturally a pure client: when an analyst pastes email headers, the parsing, Received-chain reconstruction, SPF/DKIM/DMARC evaluation, alignment checks, timestamp analysis, provider recognition, evidence weighting, scoring, and report generation all execute as JavaScript inside the visitor's browser tab. The hosting platform's only job — in both implementations — is to deliver the static files once. No pasted header, IP address, verdict, analyst answer, or exported report ever travels back to the host, because the application contains no code path that could send it: there are no form submissions, no API endpoints, and no telemetry.

This privacy claim is not merely a design intention; it is enforced by the browser through a Content-Security-Policy shipped in both versions. The policy's `connect-src` directive allows outbound connections only to the site's own origin and to four external services powering the optional live enrichment feature: two DNS-over-HTTPS resolvers (`dns.google`, `cloudflare-dns.com` — PTR, forward-confirmed reverse DNS, ASN via Team Cymru, and MX/SPF/DMARC record lookups) and two RDAP endpoints (`rdap.org`, `rdap.verisign.com` — domain registration age). Those DoH requests carry only IP addresses and domain names extracted from headers, never message content, and the analyst can switch them off in the UI for fully offline analysis. Because the CSP is enforced by the visitor's browser, even a hypothetically compromised npm dependency inside the bundle could not exfiltrate data to any other destination. The remaining directives (`frame-ancestors 'none'`, `form-action 'none'`, `object-src 'none'`, `base-uri 'self'`) close off clickjacking, form-hijacking, and plugin-injection vectors. Both versions also send `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, a restrictive `Permissions-Policy`, `Cross-Origin-Opener-Policy: same-origin`, and HSTS.

Two further shared choices support the privacy posture. First, the app uses only in-memory state — React state and a JavaScript `Map` for the DNS cache — and deliberately avoids `localStorage`, `sessionStorage`, IndexedDB, and cookies, so closing or reloading the tab destroys everything. Second, all assets are first-party: fonts come from system font stacks rather than a CDN, so a visitor's browser never contacts a third party just by loading the page.

The build pipeline is also identical in substance: `npm ci` followed by `vite build`, producing a `dist/` directory whose JavaScript filename contains a content hash. Both packages ship with a prebuilt `dist/` so you can deploy without running the build yourself.

## 2. Where the implementations differ

The only real difference is *how each platform is told what to build and which HTTP headers to attach*, because Vercel and Netlify use different, mutually incompatible configuration mechanisms.

| Concern | Vercel implementation | Netlify implementation |
|---|---|---|
| Build configuration | `vercel.json` (`framework: vite`, `buildCommand`, `outputDirectory`) | `netlify.toml` (`command`, `publish`) |
| Security headers | `headers[]` array inside `vercel.json`, applied by Vercel's edge | `public/_headers` file, copied into `dist/` by Vite and read by Netlify's CDN |
| Cache strategy | Explicit rules in `vercel.json`: `no-store` for pages, `immutable` for `/assets/*` | Declared in `_headers`; hashed assets remain safely cacheable |
| Zero-build deploy path | `vercel --prod` via CLI, or Git import | Drag-and-drop `dist/` onto app.netlify.com/drop, or Git import |

### 2.1 The Vercel implementation

Vercel reads a single `vercel.json` at the repository root. In this package it does two jobs. The first is build orchestration: it pins the framework preset to Vite, the build command to `npm run build`, and the output directory to `dist`, so importing the repository requires no manual settings. The second job is header injection. Vercel does not honor a `_headers` file, so every security header is declared in the `headers[]` array and applied by Vercel's edge network to matching routes. The configuration defines two scopes: a catch-all rule (`/(.*)`) carrying the CSP and all hardening headers with `Cache-Control: no-store`, and a narrower rule for `/assets/(.*)` that overrides caching to `public, max-age=31536000, immutable` — safe because Vite embeds a content hash in each asset filename, meaning a changed file always gets a new URL. The `_headers` file is intentionally absent from this variant (and stripped from its `dist/`) so no dead configuration ships to production.

Deployment works two ways: connect the Git repository at vercel.com and every push builds and deploys automatically through Vercel's CI, or run `vercel --prod` from the project folder for a one-off CLI deployment. Operationally, note that Vercel's edge keeps short-retention request logs containing visitor IPs and asset paths — never analysis data, since none is transmitted — and that Vercel Analytics or Speed Insights must not be enabled, as their injected scripts would both violate the CSP and contradict the tool's no-telemetry promise.

### 2.2 The Netlify implementation

Netlify splits the same two jobs across two files. Build orchestration lives in `netlify.toml`, which declares the build command and the `dist` publish directory; no plugins, functions, or redirects are configured because none are needed. Header injection uses Netlify's native `_headers` convention: the file sits in `public/`, Vite copies anything in `public/` verbatim into `dist/` at build time, and Netlify's CDN reads it from the published output and attaches the declared headers to every response. The header set is character-for-character the same policy as the Vercel version.

This variant has the lowest-friction deployment path of the two: because `_headers` travels inside `dist/`, you can drag the prebuilt `dist/` folder onto app.netlify.com/drop and get a fully hardened deployment with no account CLI, no build, and no repository — useful for a quick internal pilot before setting up Git-based continuous deployment. The same logging caveat applies: Netlify's CDN records visitor IPs in access logs, so a published privacy statement should say "no analysis data reaches the server" rather than "no data of any kind is collected."

### 2.3 Defense-in-depth overlap

Both variants additionally embed the CSP as a `<meta http-equiv>` tag inside `index.html` itself. This creates deliberate redundancy: if a platform header rule is ever misconfigured or dropped, the browser still enforces the egress allow-list from the document. The platform-delivered headers remain the primary mechanism because some protections (HSTS, `X-Frame-Options`, and CSP's `frame-ancestors`) only take effect as real HTTP response headers.

## 3. Threat model, briefly

For both implementations the realistic risks and their mitigations are the same. A compromise of the hosting platform is an integrity risk (serving tampered JavaScript), not a confidentiality risk over stored data, since nothing is stored; Git-based CI builds and content-hashed assets make tampering detectable and rollbacks trivial. A supply-chain compromise of an npm dependency is contained by the CSP egress allow-list, which is why the dependency surface was kept to React and React-DOM only. The residual data exposure in both deployments is limited to standard CDN access logs (visitor IP, user agent, asset URLs) and, when the analyst leaves live enrichment enabled, DoH queries containing IPs and domains sent from the visitor's browser directly to Google or Cloudflare — a disclosure the UI states explicitly and lets the analyst disable.

## 4. Choosing between them

Functionally and security-wise the deployments are equivalent, so the choice is operational. Pick the Netlify package if you value the drag-and-drop path or your organization already standardizes on Netlify; pick the Vercel package if your team's tooling, DNS, or preview-deployment workflow already lives there. If you later migrate, only the configuration file changes — the application, the header policy, and the privacy architecture carry over unchanged.
