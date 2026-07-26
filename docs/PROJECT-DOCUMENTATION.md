# Email Header Forensics — Project Documentation

**From ideation to current state: architecture, algorithm, security model, and roadmap**

Maintainer: Atif Quamar ([LinkedIn](https://www.linkedin.com/in/theatifquamar/))
Document version: matches the codebase as of the logo/favicon update and Dockerfile `public/` fix.

---

## 1. Ideation and evolution

### 1.1 The original brief

The project began from a single request: build a privacy-first web application to help SOC (Security Operations Center) analysts perform comprehensive email header analysis during phishing investigations. The brief was unusually specific about two things that shaped every decision since:

1. **No data persistence of any kind.** Headers, IPs, domains, analyst responses, and analysis results must never be stored, logged, indexed, or used for training — not by the application, and not by whatever infrastructure hosts it.
2. **Completeness of analysis**, not just SPF/DKIM/DMARC checking: reverse DNS, FCrDNS, ASN/WHOIS, MX records, IP reputation, HELO/EHLO validation, Received-chain forensics, timestamp consistency, forged-header detection, ESP/gateway recognition, evidence correlation (not single-indicator verdicts), interactive follow-up questions when evidence is inconclusive, a visual transport-path map, and a final assessment with an explicit confidence score that never claims absolute certainty.

### 1.2 How the architecture decision followed from the brief

The "never stored, never logged" requirement is what determined the entire technical architecture: **there is no backend.** This isn't a simplification for convenience — it's the only way to make the privacy claim structurally true rather than a policy promise. A server that receives headers to analyze them is a server that *could* log them, whether or not it's configured to. Doing all parsing, scoring, and rendering client-side in the browser means the hosting infrastructure never receives the data at all, so there's nothing to promise not to log — it's architecturally absent.

This single decision cascades into most of the security properties documented in §6: no database means no data breach surface for analysis data; no API endpoint means no injection/auth-bypass surface for the sensitive part of the app; a static-file host is interchangeable (Vercel, Netlify, a Docker container, a USB stick) because the "application" is just files that run entirely in the visitor's browser.

### 1.3 Timeline of major milestones

| Stage | What was added | Why |
|---|---|---|
| 1 | Single-file React app (`App.jsx`): header parser, SPF/DKIM/DMARC engine, evidence scoring, hop-rail visualization, Markdown/PDF export | Satisfy the original brief in the fastest coherent form |
| 2 | Three deployment targets: Vercel, Netlify, Docker (platform-independent) | User needed to self-host and/or deploy on managed platforms; each needed its own header-delivery mechanism since CSP/HSTS/X-Frame-Options only work as real HTTP headers, which each platform configures differently |
| 3 | Multi-page app: Analyzer / How It Works / Glossary / Policy, credits banner, premium UI overhaul, PDF-export fix | Requirements for legal protection, methodology transparency, education, and visual polish before public release |
| 4 | Domain-age (RDAP) check, JSON export, cosign/SBOM image signing, Vitest test suite, CONTRIBUTING/SECURITY docs, issue templates, README badges | "Take the project to another level" — closing the highest-value analysis gap (domain age) and adding the trust infrastructure appropriate for a security tool auditing other people's security posture |
| 5 | Font/color system rework | Fixed a real bug (brand accent color was identical to the "Suspicious" verdict color) and replaced generic system fonts with self-hosted, CSP-compliant typography |
| 6 | Custom logo/favicon integration | Replaced the placeholder glyph logo with a commissioned icon, empirically cropped and verified via headless-browser pixel analysis rather than by eye |
| 7 | Docker `public/` COPY fix | A real bug found in production: the Dockerfile's build stage never copied the `public/` folder (added after the Dockerfile was originally written), so the Docker image silently never got favicon assets even though Vercel and local builds did |

Stages 6 and 7 are worth calling out specifically because they reflect a recurring lesson in this project: **claims and configuration were repeatedly verified against actual behavior, not assumed from code review alone** — the favicon crop was checked by rendering it and measuring pixel bounding boxes, and the Docker bug was confirmed by literally reproducing the old and new Dockerfile's file-copy behavior in isolation before shipping the fix.

---

## 2. Architecture overview

### 2.1 Directory structure

```
src/
├── theme.js              Design tokens: colors, fonts, shadows, radii
├── engine.js              Pure analysis logic — parsing, scoring, DNS/RDAP lookups
├── report.js              Markdown/JSON export builders, recommended actions
├── main.jsx               React entry point, font imports
├── App.jsx                Shell: nav, credits banner, page routing, global/print CSS
├── fonts.css              Self-hosted @font-face declarations (latin-only, woff2-only)
├── components/
│   ├── NavBar.jsx          Top navigation + logo
│   ├── CreditsBanner.jsx   Attribution bar
│   ├── Primitives.jsx      Badge, Tag, Collapsible, EvidenceRow
│   ├── HopRail.jsx         Chain-of-custody transport-path visualization
│   ├── PipelineDiagram.jsx SVG flowchart for the How It Works page
│   ├── PageShell.jsx       Shared prose-page layout wrapper
│   └── TrustSidebar.jsx    (Vercel only) privacy note + Docker self-host card
└── pages/
    ├── Analyzer.jsx        The core tool: input, enrichment, verdict, evidence, export
    ├── HowItWorks.jsx       Methodology documentation
    ├── Glossary.jsx         Searchable term reference
    └── Policy.jsx           Legal/acceptable-use/privacy statement
```

`engine.js` and `report.js` contain **zero UI code** — every function in them is a pure function (input in, data out) with no side effects other than the explicitly-documented network calls. This separation means the entire analysis engine is independently testable (see §5) and independently auditable without wading through JSX.

### 2.2 Data flow, end to end

1. Analyst pastes raw headers (or a full message; the body is discarded) into a `<textarea>` in `Analyzer.jsx`.
2. `parseHeaders()` (engine.js) unfolds continuation lines and splits the block into a `Map` of header name → value(s).
3. `analyzeStatic()` (engine.js) runs every static check — authentication, alignment, routing, timestamps, provider recognition, heuristics — and returns a list of weighted evidence items plus structured metadata (parsed hops, auth results, message identity).
4. If the analyst has enabled live enrichment (off by default — see §6.5), `Analyzer.jsx` additionally calls `ptrLookup()`, `fcrdns()`, `asnLookup()`, `doh()` for MX/SPF/DMARC records, and `domainAgeInfo()` for RDAP registration data — each optional, each independently gracefully-degrading on failure.
5. `scoreEvidence()` (engine.js) reduces the full evidence list to a single 2–98 confidence score and one of five verdict bands.
6. If the score lands in the inconclusive band (or authentication evidence is entirely absent), `Analyzer.jsx` surfaces the `QUESTIONS` array as interactive chips; answers are folded back into the evidence list and the score is recomputed live via `useMemo`.
7. The final render assembles the verdict panel, hop rail, evidence panels, and scoring ledger; `report.js`'s `buildMarkdown()` and `buildJson()` can serialize the same data for export, and the browser's native print function (with a corrected print stylesheet — see §4.6) produces the PDF.

At no point in this pipeline does data leave the function call stack into a network request, except the explicitly-optional enrichment calls in step 4, which are individually documented in §6.

---

## 3. The analysis algorithm, in detail

### 3.1 Parsing (`unfoldHeaders`, `parseHeaders`)

Raw email headers use RFC 5322 line folding — a continuation line starts with a space or tab and is logically part of the previous header. `unfoldHeaders()` rejoins these before any field extraction happens, and — critically for the privacy model — truncates the input at the first blank line, which is where the header block ends and the message body begins (`raw.split(/\n[ \t]*\n/)[0]`). This one line is what makes "only transport metadata is analyzed" true even when an analyst pastes an entire message rather than just headers.

`parseHeaders()` then splits each unfolded line on the first colon, lower-cases the header name for case-insensitive lookup, and stores values in a `Map` (preserving multiple occurrences of headers like `Received` that legitimately repeat).

### 3.2 Authentication analysis

Three parallel extraction paths feed the alignment logic:

- **`parseAuthResults()`** reads the `Authentication-Results` (and `ARC-Authentication-Results`) headers most modern mail servers attach, extracting SPF/DKIM/DMARC verdicts, the DMARC policy (`p=reject/quarantine/none`), Microsoft's `compauth` composite verdict, and ARC chain status.
- **`parseReceivedSPF()`** is a fallback for older infrastructure that only records a legacy `Received-SPF` header.
- **`DKIM-Signature` headers** are parsed directly (for the signing domain and selector) even when no verification verdict is present, so the report can note "a signature exists but wasn't verified" rather than silently ignoring it.

**Why DKIM can't be fully verified here:** cryptographic DKIM verification requires the message body (specifically, its hash, referenced as `bh=` in the signature). A header-only tool structurally cannot compute this. The engine is explicit about this rather than pretending otherwise — see the code comment at `src/engine.js:315` and the user-facing explanation in `src/pages/HowItWorks.jsx:84`.

Alignment is computed independently of any single header: `orgDomain()` normalizes the SPF envelope domain, the DKIM signing domain, and the visible `From:` domain to their organizational (registrable) level and compares them pairwise. This is what catches the pattern DMARC's own pass/fail can sometimes obscure — a message that authenticates cleanly for an unrelated domain while displaying a different, trusted-looking brand name.

### 3.3 Routing and transport validation

Every `Received:` header is parsed by `parseReceived()` into a structured hop: source hostname, source IP, header-recorded reverse DNS, receiving hostname, protocol (`with ESMTPS` etc.), TLS usage, and timestamp — regardless of which of the many real-world `Received` header formats produced it. Hops are then reassembled chronologically (origin → delivery), since they appear in reverse order in the raw headers.

From the reconstructed chain, `analyzeStatic()` derives:
- **Timestamp forensics**: inter-hop deltas, flagging any reversal beyond normal clock-skew tolerance as a probable forged/reordered header, plus a check that the `Date:` header isn't wildly inconsistent with (or later than) actual delivery time.
- **HELO/EHLO validation**: comparing the hostname a server announced against its own reverse DNS at the origin hop.
- **Provider recognition**: `matchProvider()` checks each hop's hostnames against `PROVIDERS`, a registry of 22 hostname patterns covering major ESPs (SendGrid, Mailchimp, Amazon SES, Mailgun, Postmark, SparkPost...), secure email gateways (Proofpoint, Mimecast, Barracuda, Cisco IronPort...), and major mailbox providers. This is what lets the engine treat a security-gateway hop as expected inline filtering rather than suspicious forwarding, and an ESP's own bounce domain as normal rather than a spoofing signal.
- **Anomaly heuristics**: residential/dynamic-IP-pattern origins, missing reverse DNS, unusually long relay chains, and plaintext (no-TLS) hops.

### 3.4 Optional live enrichment

Four categories of live lookup are available, all gated by a single toggle that defaults to **off** (§6.5):

- **PTR / FCrDNS** (`ptrLookup()`, `fcrdns()`) — reverse DNS for each public origin IP, then a forward lookup of that name to confirm it resolves back to the same IP.
- **ASN/organization** (`asnLookup()`) — via Team Cymru's DNS-based WHOIS-equivalent, identifying whether an IP belongs to a known network operator, generic hosting/VPS space, or something else.
- **MX / SPF / DMARC domain records** (`doh()`) — confirming the sender domain can actually receive mail and has published its own authentication policy.
- **Domain registration age** (`domainAgeInfo()`) — via RDAP, described in detail in §3.6.

All four use DNS-over-HTTPS or RDAP-over-HTTPS (never raw UDP/TCP port 53), which is what allows them to run from a browser at all, and all four fail gracefully — a failed or unavailable lookup is recorded as an *uncertainty*, never silently treated as a negative finding.

### 3.5 Evidence weighting — the core design decision

Every message starts at a neutral baseline score of exactly 50 (`scoreEvidence()`, `src/engine.js:462`). Each finding — whether from static header analysis, live enrichment, or an analyst's answer to a follow-up question — is a discrete object `{ pol: "pos" | "neg" | "note", w: <number>, label, detail }` that adjusts the running total by its weight. The final score is clamped to the 2–98 range and mapped to one of five verdict bands:

```js
s = Math.max(2, Math.min(98, Math.round(s)));
const verdict = s >= 88 ? "Legitimate" : s >= 70 ? "Likely Legitimate"
              : s >= 45 ? "Suspicious"  : s >= 22 ? "Likely Malicious"
              : "Malicious";
```

Weights were assigned by how strongly each signal discriminates between legitimate and malicious mail in practice, not by how easy each check is to compute — DMARC failure against an enforcing policy and SPF hard-fail carry the heaviest negative weights (−16), domain registration under a week old is close behind (−14), while softer heuristics like scripted-mailer signatures or TLD reputation carry small weights (2–6) and function as corroborating context rather than standalone proof. This is deliberately different from many phishing-detection tools that either binary-flag on a single indicator or use opaque ML scores — every point in the final number is traceable to a named, human-readable reason, which is what the "scoring ledger" panel in the UI displays verbatim.

### 3.6 Domain age via RDAP

`domainAgeInfo()` (src/engine.js, added in the "next level" enhancement pass) queries Verisign's RDAP server directly for `.com`/`.net` domains — chosen specifically because Verisign's endpoint answers without an HTTP redirect, which matters under a strict Content-Security-Policy (a redirect to an unlisted host would be blocked by the browser). Every other TLD falls back to the public `rdap.org` bootstrap redirector. A domain younger than 7 days is weighted −14 (one of the heaviest single penalties in the entire engine, reflecting how strong a signal this is in practice), scaling down to a small +3 for domains registered over a year ago. When a TLD has no RDAP coverage yet, the result is `null` and the engine records "domain age unavailable" as a neutral uncertainty — never a penalty for a check that simply couldn't run.

### 3.7 Interactive follow-up questions

`QUESTIONS` (src/engine.js:454) defines five targeted questions (was the message expected; is the sender known; did the recipient interact with content; internal or external origin; does the content use urgency/payment pressure), each with its own weighted adjustment per possible answer. `Analyzer.jsx` only surfaces these when the running score sits in the genuinely inconclusive band or when authentication evidence is entirely absent — the UI explicitly states when header evidence is already strong enough that these answers wouldn't move the verdict, so analysts aren't asked pointless questions.

### 3.8 Reporting

`buildMarkdown()` and `buildJson()` (report.js) both consume the same final evidence/score/hop data structure, so the three output formats (on-screen, Markdown, JSON) can never drift out of sync with each other. The JSON schema is explicitly versioned (`schema: "header-forensics.report/v1"`, report.js:51) so downstream SIEM/SOAR consumers have a stable contract to build against.

---

## 4. Component inventory

| File | Responsibility | Notable properties |
|---|---|---|
| `theme.js` | Colors, fonts, shadows, radii | Brand color (violet) is deliberately not any of the four semantic verdict colors (good/warn/bad/info) — see §6.9 |
| `engine.js` | All parsing, scoring, and network-lookup logic | Zero UI imports; the only file with `fetch()` calls, and every call site is documented |
| `report.js` | Export builders | No side effects other than object construction; the caller (`Analyzer.jsx`) handles the actual `Blob`/download |
| `Analyzer.jsx` | The tool itself | Owns all React state; orchestrates the optional-enrichment flow |
| `HowItWorks.jsx` | Methodology transparency | Contains the pipeline diagram and the weighting-rationale table described in §3.5 |
| `Glossary.jsx` | Education | 27 terms across 7 categories, live-searchable |
| `Policy.jsx` | Legal | Warranty disclaimer, liability limitation, and the privacy statement this document cross-references throughout §6 |
| `HopRail.jsx` | Transport visualization | Contains the manual (non-automatic) reputation pivot links — see §6.7 |
| `App.jsx` | Shell | Global CSS including the print-media fix (§4.6) and the CSP-adjacent inline `<style>` block |

### 4.1 Why the app has no backend, restated precisely

There is no `server.js`, no API route, no database client, and no `fetch()` call anywhere in the codebase that sends header content, parsed metadata, evidence, or answers to any destination. The only outbound `fetch()` calls in the entire codebase are in `engine.js`'s `doh()` and `domainAgeInfo()` functions, and both take only an IP address or domain name string as their parameter — there is no code path by which message content could reach either function, because neither function's signature accepts anything else.

---

## 5. Testing

`src/__tests__/engine.test.js` contains 26 Vitest tests, split into two categories:

- **Regression tests** run the exact known-legitimate and known-phishing sample headers shown in the UI's "load sample" buttons through the real `analyzeStatic()`/`scoreEvidence()` pipeline and assert the verdict lands in the expected band. If a future change to the weighting logic ever flips either sample's verdict, CI fails immediately — this is the project's primary defense against silently regressing the thing that matters most (a tool that says "safe" about something malicious, or vice versa).
- **Unit tests** cover the individual parsing primitives (`unfoldHeaders`, `extractIPs`, `isPrivateIP`, `domainOf`, `orgDomain`, `matchProvider`, `parseReceived`, `parseAuthResults`) and the scoring engine's invariants (baseline is exactly 50 with no evidence; the 2–98 clamp holds under extreme input; each verdict band's boundary maps correctly).

The Docker repository's CI workflow runs this suite as a hard gate (`needs: test` in `docker-publish.yml`) before any image is built — a broken analysis engine cannot ship.

---

## 6. Security and privacy claims, mapped to code

This section takes every privacy/security claim the application makes and points to the specific code that makes it true, rather than asking anyone to take the claim on faith.

### 6.1 Claim: "Nothing you paste is stored, logged, or persisted"

**Code:** `src/pages/Analyzer.jsx` holds all analysis state in ordinary React `useState` — `raw`, `result`, `answers`, `dns` (lines 13–19). A grep across the entire `src/` tree for `localStorage`, `sessionStorage`, `indexedDB`, or `document.cookie` returns **zero actual usages** — the only two matches in the whole codebase are a code comment in `engine.js:4` and a sentence in `Policy.jsx:93` describing this exact fact. Nothing writes to browser storage because no such API call exists anywhere in the source.

### 6.2 Claim: "Everything is destroyed when you close or reload the tab"

**Code:** This follows directly from §6.1 — React component state (including the `dnsCache` module-level `Map` at `engine.js:173`) lives only in the JavaScript heap of that tab. There is no `beforeunload` handler attempting to persist anything, and no service worker caching analysis data. Closing the tab deallocates all of it as a consequence of normal browser memory management, not a special feature that could fail.

### 6.3 Claim: "The hosting server never receives your data"

**Code:** There is no backend to receive it (§4.1). For the Docker deployment specifically, this is reinforced at the infrastructure level: `docker/nginx.conf:24` sets `access_log off`, meaning the container doesn't even record standard web-server access logs (visitor IP, requested path) for anyone using that deployment — a stronger guarantee than Vercel/Netlify's managed hosting, which do keep standard CDN access logs (disclosed in `Policy.jsx`).

### 6.4 Claim: "A Content-Security-Policy restricts what the page can even connect to"

**Code:** `index.html:17` (and identically in `docker/nginx.conf:12`, plus `vercel.json` and Netlify's `public/_headers`) sets:
```
connect-src 'self' https://dns.google https://cloudflare-dns.com https://rdap.org https://rdap.verisign.com
```
This is enforced by the *browser*, not by application logic — meaning even a hypothetically compromised dependency inside the bundle could not make the page fetch to any host outside this exact list. `frame-ancestors 'none'`, `form-action 'none'`, and `object-src 'none'` in the same policy additionally close off clickjacking, form-hijacking, and plugin-injection vectors.

### 6.5 Claim: "Live DNS/RDAP enrichment is optional and off by default"

**Code:** `src/pages/Analyzer.jsx:18` — `const [useDns, setUseDns] = useState(false);`. The four network-lookup functions described in §3.4 are only invoked inside an `if (useDns)` guard; with the checkbox unchecked (the shipped default), none of `ptrLookup`, `fcrdns`, `asnLookup`, `doh`, or `domainAgeInfo` are ever called, and the analysis runs entirely offline.

### 6.6 Claim: "When enrichment is used, only IPs and domain names are sent — never message content"

**Code:** Function signatures enforce this structurally, not just by convention: `doh(name, type)` (engine.js:174), `ptrLookup(ip)` (engine.js:198), `domainAgeInfo(domain)` (engine.js:238) each accept only a string parameter representing an IP or hostname. There is no parameter, closure variable, or global through which header content could reach any of these functions' request bodies — the only place message-derived strings enter these calls is where `Analyzer.jsx` extracts a specific IP or domain first.

### 6.7 Claim: "IP/hash reputation is never queried automatically"

**Code:** `src/components/HopRail.jsx:115` and `:118` render `<a>` links to AbuseIPDB and VirusTotal with `target="_blank"` — these are plain hyperlinks the analyst must click; there is no corresponding `fetch()` to either domain anywhere in the codebase, and neither host appears in the CSP `connect-src` allow-list (§6.4), so even if such a call were added by mistake, the browser would block it.

### 6.8 Claim: "DKIM cannot be cryptographically verified by this tool"

**Code:** Stated directly in the engine's own logic and comments at `engine.js:315`, and explained to the analyst in `HowItWorks.jsx:84`. The engine reads only the receiving mail server's own recorded verdict (from `Authentication-Results`) rather than attempting — and silently failing at — real cryptographic verification it structurally cannot perform without the message body.

### 6.9 Claim: "Brand color and warning color are visually distinct" (a fixed bug, documented for transparency)

**Code:** `theme.js` defines `accent: "#8B7CF6"` (brand violet, used for buttons/logo/links) and `warn: "#F2B84B"` (semantic amber, used only for the "Suspicious" verdict and warning-polarity evidence) as two different hues. An earlier revision had both set to the identical hex value, meaning an analyst couldn't visually distinguish "this is just an interactive button" from "this specific finding is concerning" — documented here because a security tool's own UI failing to convey risk clearly is itself a class of security-relevant bug.

### 6.10 Claim: "Every printed/exported PDF matches what's on screen, including collapsed sections"

**Code:** `src/components/Primitives.jsx`'s `Collapsible` component always renders its children into the DOM and toggles visibility via a CSS class rather than conditional mounting — meaning the content exists even when visually hidden. `App.jsx`'s print stylesheet then forces `.collapsible-body { display: block !important; }` (App.jsx:60) so every section is included in a printed export regardless of what the analyst left open or closed on screen, and `print-color-adjust: exact` (App.jsx:51-52) overrides the browser default of stripping background colors on print, which was the actual root cause of the original PDF-mismatch bug.

### 6.11 Claim: "The published Docker image is signed and its contents can be inspected, not just trusted by assertion"

**Code:** `.github/workflows/docker-publish.yml` — the `sign` job (line 80) runs `cosign sign --yes` (line 103) using GitHub's OIDC identity token (`id-token: write`, line 24/85) for keyless signing via Sigstore, meaning no private signing key exists anywhere to leak or rotate. The `build-and-push` job sets `sbom: true` and `provenance: true` (lines 77–78), attaching a machine-readable Software Bill of Materials and build-provenance attestation directly to the published image. `docs/SETUP.md` documents the exact `cosign verify` and `docker buildx imagetools inspect` commands for independently checking both.

### 6.12 Claim: "The container runs with minimal privilege"

**Code:** `Dockerfile:30` uses `nginxinc/nginx-unprivileged:1.27-alpine` as the runtime base specifically because it runs as a non-root user (uid 101) by default, needing no Linux capabilities to bind its listening port. `docker-compose.yml` adds `read_only: true` (line 14, immutable root filesystem), `cap_drop: [ALL]` (line 17), and `no-new-privileges:true` (line 20) — meaning even a hypothetical code-execution compromise inside the container couldn't modify the served application files or escalate privileges.

### 6.13 Claim: "Tests must pass before any image is built or published"

**Code:** `docker-publish.yml`'s `build-and-push` job declares `needs: test` — the workflow's DAG structurally prevents the build step from running at all if the Vitest suite (§5) fails, rather than relying on a human to notice a red X and manually stop a release.

---

## 7. Known, documented limitations

These are stated in the app itself (`Policy.jsx`, `HowItWorks.jsx`) rather than buried — a deliberate choice for a tool whose credibility depends on not overclaiming:

- Score is mathematically capped at 2–98; the tool never asserts absolute certainty in either direction.
- DKIM verification relies on the receiving server's recorded verdict, not independent cryptographic re-verification (§6.8).
- Received headers below the first hop added by the recipient's own trusted infrastructure can be forged by a sender — header analysis has an inherent trust boundary.
- RDAP domain-age coverage varies by TLD; unsupported TLDs are marked "unavailable," not penalized.
- IP/hash reputation requires analyst action (manual pivot links) rather than being automatic (§6.7) — a deliberate trade of convenience for the zero-silent-third-party-call guarantee.

---

## 8. Roadmap

### 8.1 Already completed (see §1.3, stage 4)
Domain age/RDAP, JSON export, cosign image signing, SBOM/provenance attestation, Vitest regression suite, SECURITY.md/CONTRIBUTING.md/issue templates, README badges.

### 8.2 Proposed and scoped, not yet built
**Attachment and URL analysis** — a full separate proposal document exists for this (`proposal-attachment-url-analysis.md`) covering an `.eml`-upload mode, client-side MIME parsing, attachment hashing via `crypto.subtle.digest` (never uploading file bytes anywhere), and manual reputation pivot links for hashes/URLs — following the same "hash and link, never auto-query" pattern already used for IP reputation. The proposal explicitly scopes out rendering HTML email bodies or auto-fetching remote resources as a separate, more heavily sandboxed future effort, since rendering attacker-controlled markup is a fundamentally different risk category from parsing headers.

### 8.3 Discussed, not yet formally scoped
- **Batch/bulk triage** — analyzing multiple messages at once with a sortable results table, likely the highest-value remaining workflow improvement for daily SOC use.
- **Outlook add-in** — a task-pane version of the same analyzer using Office.js to auto-read the currently-open email's headers (`Office.context.mailbox.item.getAllInternetHeadersAsync`), removing the manual copy-paste step entirely while reusing `engine.js` unchanged.
- **CLI wrapper** — a thin Node wrapper around `engine.js` for scripted/offline use without a browser.
- **Sandboxed HTML body preview** — explicitly deferred (§8.2) pending a dedicated security design (network-isolated iframe, strict sanitization) rather than being bundled into the attachment-analysis work.

---

## 9. Summary

The project's throughline, from the original brief to the current state, is that every privacy and security claim is meant to be a structural property of the code rather than a configuration setting or a policy statement that could silently drift out of sync with reality. Where that wasn't quite true — the accent/warning color collision, the PDF export not matching the screen, the Docker image missing its own favicon — those were treated as bugs to find and fix with direct evidence (rendered screenshots, computed styles, reproduced build behavior), not just claims to restate more confidently. That verification habit is the intended standard going forward for anything added under §8.
