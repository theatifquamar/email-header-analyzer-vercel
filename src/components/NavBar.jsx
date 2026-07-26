import React from "react";
import { T } from "../theme.js";

const PAGES = [
  { id: "analyzer", label: "Analyzer" },
  { id: "how", label: "How It Works" },
  { id: "glossary", label: "Glossary" },
  { id: "policy", label: "Policy" },
];

export function NavBar({ page, setPage }) {
  return (
    <header
      className="no-print"
      style={{
        borderBottom: `1px solid ${T.line}`,
        padding: "14px 22px",
        display: "flex",
        alignItems: "center",
        gap: 22,
        flexWrap: "wrap",
        position: "sticky",
        top: 0,
        zIndex: 20,
        background: "rgba(1,1,19,0.92)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }}
    >
      <div
        onClick={() => setPage("analyzer")}
        style={{ display: "flex", alignItems: "center", cursor: "pointer" }}
      >
        <img
          src="/nav-icon.png"
          alt="Email Header Forensics"
          width={40}
          height={40}
          style={{ display: "block", filter: `drop-shadow(0 0 8px ${T.accent}33)` }}
        />
      </div>

      <nav style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {PAGES.map((p) => {
          const active = page === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setPage(p.id)}
              style={{
                background: active ? T.panel2 : "transparent",
                color: active ? T.ink : T.dim,
                border: `1px solid ${active ? T.line : "transparent"}`,
                borderRadius: 8,
                padding: "7px 14px",
                fontSize: 13,
                fontFamily: T.disp,
                fontWeight: active ? 700 : 500,
                cursor: "pointer",
                transition: `all .15s ${T.ease}`,
              }}
            >
              {p.label}
            </button>
          );
        })}
      </nav>

      <div
        style={{
          marginLeft: "auto",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontFamily: T.mono,
          fontSize: 11,
          color: T.good,
          background: T.goodSoft,
          border: `1px solid ${T.good}33`,
          borderRadius: 999,
          padding: "5px 12px",
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: 99, background: T.good, display: "inline-block", boxShadow: `0 0 6px ${T.good}` }} />
        IN-MEMORY ONLY
      </div>
    </header>
  );
}
