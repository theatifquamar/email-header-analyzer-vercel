import React from "react";
import { T } from "../theme.js";

/**
 * Shown once at the very top of every page, above the compact sticky
 * NavBar. Not sticky — it scrolls away with the rest of the page, so it
 * never competes for permanent screen space the way a huge logo inside
 * the persistent nav bar would.
 */
export function Hero() {
  return (
    <div
      className="no-print"
      style={{
        display: "flex",
        justifyContent: "center",
        padding: "28px 22px 20px",
      }}
    >
      <img
        src="/nav-icon.png"
        alt="Email Header Forensics"
        width={176}
        height={176}
        style={{ display: "block", filter: `drop-shadow(0 0 22px ${T.accent}33)` }}
      />
    </div>
  );
}
