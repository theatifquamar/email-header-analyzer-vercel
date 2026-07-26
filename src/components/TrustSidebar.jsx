import React, { useState } from "react";
import { T } from "../theme.js";

const VERCEL_REPO = "https://github.com/theatifquamar/email-header-analyzer-vercel";
const DOCKER_REPO = "https://github.com/theatifquamar/email-header-analyzer";
const DOCKER_CMDS = [
  "docker pull ghcr.io/theatifquamar/email-header-analyzer:latest",
  "docker run -d -p 8080:8080 ghcr.io/theatifquamar/email-header-analyzer:latest",
];

function CopyBlock({ lines }) {
  const [copied, setCopied] = useState(false);
  const text = lines.join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch {}
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div
      style={{
        background: "#070A13",
        border: `1px solid ${T.line}`,
        borderRadius: T.r2,
        padding: "12px 14px",
        position: "relative",
        marginTop: 10,
      }}
    >
      <button
        onClick={copy}
        aria-label="Copy commands"
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          background: copied ? T.good : T.panel2,
          color: copied ? "#0A0E1A" : T.dim,
          border: `1px solid ${copied ? T.good : T.line}`,
          borderRadius: 6,
          padding: "4px 9px",
          fontSize: 11,
          fontFamily: T.mono,
          fontWeight: 700,
          cursor: "pointer",
          transition: `all .15s ${T.ease}`,
        }}
      >
        {copied ? "✓ Copied" : "Copy"}
      </button>
      <div style={{ fontFamily: T.mono, fontSize: 11.5, lineHeight: 1.9, color: T.ink, paddingRight: 60, wordBreak: "break-all" }}>
        {lines.map((l, i) => (
          <div key={i}>
            <span style={{ color: T.faint }}>$ </span>
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}

function SidebarCard({ icon, title, accent, children }) {
  return (
    <div
      className="hf-card"
      style={{
        border: `1px solid ${accent}3D`,
        borderRadius: T.r3,
        background: `linear-gradient(160deg, ${accent}14, ${T.panel} 60%)`,
        padding: 20,
        boxShadow: T.shadowMd,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
        <span
          style={{
            width: 28, height: 28, borderRadius: 8, background: accent + "22",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0,
          }}
        >
          {icon}
        </span>
        <div style={{ fontFamily: T.disp, fontWeight: 700, fontSize: 14.5, color: T.ink }}>{title}</div>
      </div>
      <div style={{ fontSize: 12.5, color: T.dim, lineHeight: 1.65 }}>{children}</div>
    </div>
  );
}

export function TrustSidebar() {
  return (
    <div className="no-print" style={{ display: "flex", flexDirection: "column", gap: 16, position: "sticky", top: 78 }}>
      <SidebarCard icon="🔒" title="Privacy & security" accent={T.good}>
        <p style={{ margin: "0 0 10px" }}>
          Analysis runs <strong style={{ color: T.ink }}>entirely in your browser's memory</strong>. Nothing
          you paste — headers, IPs, domains, your answers, the verdict — is ever sent to, logged by, or
          stored on this server. Vercel (the host) only serves the static app; it has no visibility into
          what you analyze.
        </p>
        <p style={{ margin: "0 0 12px" }}>
          The full source is open and <strong style={{ color: T.ink }}>MIT-licensed</strong> — audit the
          claims yourself, and suggestions for improvement are always welcome.
        </p>
        <a
          href={VERCEL_REPO}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            background: T.panel2, border: `1px solid ${T.line}`, borderRadius: 999,
            padding: "7px 14px", fontSize: 12, fontFamily: T.mono, color: T.ink, fontWeight: 600,
          }}
        >
          ⭐ View source & MIT license ↗
        </a>
      </SidebarCard>

      <SidebarCard icon="🐳" title="Want more control?" accent={T.info}>
        <p style={{ margin: "0 0 10px" }}>
          For a fully self-hosted deployment — your own server, your own log policy, zero third-party
          hosting at all — run the same analyzer via Docker in under a minute:
        </p>
        <CopyBlock lines={DOCKER_CMDS} />
        <a
          href={DOCKER_REPO}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "inline-flex", alignItems: "center", gap: 7, marginTop: 12,
            background: T.panel2, border: `1px solid ${T.line}`, borderRadius: 999,
            padding: "7px 14px", fontSize: 12, fontFamily: T.mono, color: T.ink, fontWeight: 600,
          }}
        >
          📦 Docker edition on GitHub ↗
        </a>
      </SidebarCard>
    </div>
  );
}
