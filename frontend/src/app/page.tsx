"use client";
import Link from "next/link";
import { useState } from "react";

type AudienceCardProps = {
  href: string;
  badge: string;
  title: string;
  tagline: string;
  bullets: string[];
  cta: string;
  color: string;
  accent: string;
  icon: React.ReactNode;
};

function AudienceCard({ href, badge, title, tagline, bullets, cta, color, accent, icon }: AudienceCardProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link
      href={href}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        background: "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)",
        backdropFilter: "blur(20px)",
        border: `1px solid ${color}${hovered ? "66" : "33"}`,
        borderRadius: "20px",
        padding: "32px 28px",
        textDecoration: "none",
        color: "inherit",
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        transform: hovered ? "translateY(-4px)" : "translateY(0)",
        boxShadow: hovered
          ? `0 20px 60px -10px ${color}40, 0 0 0 1px ${color}20 inset`
          : "0 8px 30px -8px rgba(0,0,0,0.3)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Animated orb */}
      <div style={{
        position: "absolute", top: "-40px", right: "-40px", width: "180px", height: "180px",
        borderRadius: "50%", background: `radial-gradient(circle, ${color}30 0%, ${color}10 50%, transparent 70%)`,
        pointerEvents: "none", transition: "all 0.3s ease",
        transform: hovered ? "scale(1.3)" : "scale(1)", opacity: hovered ? 1 : 0.6,
      }} />

      {/* Badge */}
      <div style={{
        alignSelf: "flex-start",
        fontSize: "10px",
        fontWeight: "800",
        textTransform: "uppercase",
        letterSpacing: "1.5px",
        color: accent,
        background: `${color}15`,
        padding: "5px 10px",
        borderRadius: "999px",
        border: `1px solid ${color}30`,
        marginBottom: "20px",
        position: "relative", zIndex: 1,
      }}>
        {badge}
      </div>

      {/* Icon + title */}
      <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "12px", position: "relative", zIndex: 1 }}>
        <div style={{
          width: "48px", height: "48px", borderRadius: "12px",
          background: `linear-gradient(135deg, ${color}30, ${color}15)`,
          border: `1px solid ${color}50`,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: accent, boxShadow: `0 4px 16px ${color}30`,
          transition: "all 0.3s ease",
          transform: hovered ? "scale(1.08) rotate(4deg)" : "scale(1)",
        }}>
          {icon}
        </div>
        <h2 style={{
          fontSize: "22px", fontWeight: "800", color: "#e2e8f0", letterSpacing: "-0.3px",
        }}>{title}</h2>
      </div>

      <p style={{
        color: "var(--muted)", fontSize: "14px", lineHeight: "1.55",
        marginBottom: "20px", position: "relative", zIndex: 1,
      }}>
        {tagline}
      </p>

      {/* Bullets */}
      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px 0", display: "flex", flexDirection: "column", gap: "8px", position: "relative", zIndex: 1 }}>
        {bullets.map((b) => (
          <li key={b} style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", color: "#cbd5e1" }}>
            <span style={{
              width: "16px", height: "16px", borderRadius: "5px",
              background: `linear-gradient(135deg, ${color}40, ${color}20)`,
              border: `1px solid ${color}50`,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              color: accent, flexShrink: 0,
            }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </span>
            {b}
          </li>
        ))}
      </ul>

      {/* CTA */}
      <div style={{
        marginTop: "auto",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px",
        background: `linear-gradient(135deg, ${color}25, ${color}10)`,
        border: `1px solid ${color}40`,
        borderRadius: "10px",
        transition: "all 0.3s ease",
        position: "relative", zIndex: 1,
      }}>
        <span style={{ fontSize: "14px", fontWeight: "700", color: accent }}>{cta}</span>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ transition: "transform 0.3s ease", transform: hovered ? "translateX(4px)" : "translateX(0)" }}
        >
          <line x1="5" y1="12" x2="19" y2="12"/>
          <polyline points="12 5 19 12 12 19"/>
        </svg>
      </div>
    </Link>
  );
}

export default function Picker() {
  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", position: "relative", overflow: "hidden" }}>
      {/* Background gradient blurs to match dashboard */}
      <div style={{ position: "fixed", top: "10%", left: "15%", width: "300px", height: "300px", borderRadius: "50%", background: "rgba(99,102,241,0.08)", filter: "blur(80px)", pointerEvents: "none" }} />
      <div style={{ position: "fixed", bottom: "20%", right: "10%", width: "250px", height: "250px", borderRadius: "50%", background: "rgba(6,182,212,0.06)", filter: "blur(80px)", pointerEvents: "none" }} />

      <style>{`
        @keyframes floatLogo { 0%,100% { transform:translateY(0) rotate(0); } 50% { transform:translateY(-6px) rotate(2deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .picker-shell {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 48px 16px;
          position: relative;
          z-index: 1;
        }
        .picker-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 20px;
          max-width: 920px;
          width: 100%;
          animation: fadeIn 0.6s cubic-bezier(0.4,0,0.2,1) both;
        }
        @media (min-width: 768px) {
          .picker-grid {
            grid-template-columns: 1fr 1fr;
            gap: 24px;
          }
        }
      `}</style>

      <div className="picker-shell">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header style={{ textAlign: "center", marginBottom: "48px", animation: "fadeIn 0.5s cubic-bezier(0.4,0,0.2,1) both" }}>
          <svg width="64" height="64" viewBox="0 0 56 56" style={{ margin: "0 auto 20px", display: "block", filter: "drop-shadow(0 8px 24px rgba(99,102,241,0.4))", animation: "floatLogo 4s ease-in-out infinite" }}>
            <defs>
              <linearGradient id="pickerLogo" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#6366f1"/>
                <stop offset="50%" stopColor="#8b5cf6"/>
                <stop offset="100%" stopColor="#06b6d4"/>
              </linearGradient>
            </defs>
            <polygon points="28,4 52,18 52,38 28,52 4,38 4,18" fill="none" stroke="url(#pickerLogo)" strokeWidth="2.5"/>
            <polygon points="28,12 44,21 44,35 28,44 12,35 12,21" fill="rgba(99,102,241,0.2)" stroke="url(#pickerLogo)" strokeWidth="1.5"/>
            <circle cx="28" cy="28" r="3" fill="url(#pickerLogo)"/>
          </svg>

          <h1 style={{
            fontSize: "36px",
            fontWeight: "900",
            lineHeight: "1.1",
            background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #06b6d4 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            marginBottom: "12px",
            letterSpacing: "-1px",
          }}>
            SuiLoyalty
          </h1>

          <p style={{ color: "var(--muted)", fontSize: "16px", maxWidth: "560px", margin: "0 auto", lineHeight: "1.55" }}>
            A blockchain loyalty platform on Sui. Choose how you&rsquo;re here today.
          </p>

          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: "16px",
            padding: "5px 12px",
            marginTop: "20px",
          }}>
            <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22c55e" }} />
            <span style={{ fontSize: "11px", color: "#cbd5e1", fontWeight: "500", letterSpacing: "0.5px" }}>Sui Testnet · Live</span>
          </div>
        </header>

        {/* ── Two cards ───────────────────────────────────────────────────── */}
        <div className="picker-grid">

          <AudienceCard
            href="/customer"
            badge="For shoppers"
            title="I'm a customer"
            tagline="Sign in with Google, scan QR codes on products, and earn loyalty points across every brand on the platform — no wallet or crypto knowledge needed."
            bullets={[
              "Google Sign-In via zkLogin — no seed phrase",
              "Real on-chain NFT loyalty card",
              "Zero gas fees, brands sponsor every scan",
            ]}
            cta="Continue as customer"
            color="#6366f1"
            accent="#a5b4fc"
            icon={(
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            )}
          />

          <AudienceCard
            href="/merchant"
            badge="For brands"
            title="I'm a brand operator"
            tagline="Generate single-use QR codes for your products, track campaigns, fulfil customer redemptions, and export per-campaign reports — all from a single brand portal."
            bullets={[
              "Multi-brand portal with owner / admin / operator roles",
              "Batch QR generation, mark-printed workflow",
              "Real-time pending-redemption queue",
            ]}
            cta="Continue as brand"
            color="#06b6d4"
            accent="#67e8f9"
            icon={(
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            )}
          />

        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <footer style={{ marginTop: "48px", textAlign: "center", color: "var(--muted)", fontSize: "12px", animation: "fadeIn 0.8s cubic-bezier(0.4,0,0.2,1) both" }}>
          Built on the Sui Network · zkLogin authentication · Move smart contracts
        </footer>

      </div>
    </main>
  );
}
