"use client";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";

function DashboardContent() {
  const params = useSearchParams();
  const address = params.get("address") || "";
  const name = params.get("name") || "Customer";
  const [card, setCard] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!address) return;
    fetch(`http://localhost:3000/api/nft/${address}`)
      .then(r => r.json())
      .then(data => { setCard(data.card || null); setLoading(false); })
      .catch(() => setLoading(false));
  }, [address]);

  const tierName = (t: number) => ["Bronze", "Silver", "Gold"][t] || "Bronze";
  const tierGradient = (t: number) => [
    "linear-gradient(135deg, #CD7F32, #8B4513)",
    "linear-gradient(135deg, #C0C0C0, #808080)",
    "linear-gradient(135deg, #FFD700, #B8860B)",
  ][t] || "linear-gradient(135deg, #CD7F32, #8B4513)";
  const nextTier = (t: number) => t >= 2 ? 500 : t >= 1 ? 500 : 100;
  const progress = (points: number, tier: number) => tier >= 2 ? 100 : Math.min(100, (points / nextTier(tier)) * 100);

  return (
    <main style={{ minHeight: "100vh", background: "#0a0e1a", padding: "0" }}>

      {/* Ambient background orbs */}
      <div style={{ position: "fixed", top: "10%", left: "15%", width: "300px", height: "300px", borderRadius: "50%", background: "rgba(99,102,241,0.08)", filter: "blur(80px)", pointerEvents: "none" }} />
      <div style={{ position: "fixed", bottom: "20%", right: "10%", width: "250px", height: "250px", borderRadius: "50%", background: "rgba(6,182,212,0.06)", filter: "blur(80px)", pointerEvents: "none" }} />

      <div style={{ maxWidth: "440px", margin: "0 auto", padding: "24px 16px", position: "relative" }}>

        {/* Top nav */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "32px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <svg width="28" height="28" viewBox="0 0 56 56">
              <defs>
                <linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#6366f1"/>
                  <stop offset="100%" stopColor="#06b6d4"/>
                </linearGradient>
              </defs>
              <polygon points="28,4 52,18 52,38 28,52 4,38 4,18" fill="none" stroke="url(#g1)" strokeWidth="2.5"/>
            </svg>
            <span style={{ fontWeight: "700", fontSize: "16px", background: "linear-gradient(135deg, #6366f1, #06b6d4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>SuiLoyalty</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "20px", padding: "6px 12px" }}>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px #22c55e" }} />
            <span style={{ fontSize: "12px", color: "#64748b" }}>Devnet</span>
          </div>
        </div>

        {/* User greeting */}
        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "13px", color: "#64748b", marginBottom: "4px" }}>Welcome back</div>
          <div style={{ fontSize: "24px", fontWeight: "700", color: "#e2e8f0" }}>{name}</div>
          <div style={{ fontSize: "11px", color: "#334155", fontFamily: "monospace", marginTop: "4px" }}>
            {address ? `${address.slice(0, 10)}...${address.slice(-8)}` : ""}
          </div>
        </div>

        {/* Main loyalty card */}
        <div style={{
          background: "linear-gradient(135deg, rgba(99,102,241,0.15), rgba(6,182,212,0.08))",
          border: "1px solid rgba(99,102,241,0.25)",
          borderRadius: "20px",
          padding: "28px",
          marginBottom: "16px",
          backdropFilter: "blur(12px)",
          position: "relative",
          overflow: "hidden",
        }}>
          {/* Card shine effect */}
          <div style={{ position: "absolute", top: "-40px", right: "-40px", width: "120px", height: "120px", borderRadius: "50%", background: "rgba(99,102,241,0.1)", pointerEvents: "none" }} />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "28px" }}>
            <div>
              <div style={{ fontSize: "11px", color: "#64748b", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: "4px" }}>Loyalty Points</div>
              <div style={{ fontSize: "42px", fontWeight: "800", background: "linear-gradient(135deg, #6366f1, #06b6d4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", lineHeight: 1 }}>
                {loading ? "—" : (card?.points || 0).toLocaleString()}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Tier</div>
              <div style={{ fontSize: "15px", fontWeight: "700", background: tierGradient(card?.tier || 0), WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                {loading ? "—" : tierName(card?.tier || 0)}
              </div>
              <div style={{ display: "flex", gap: "4px", marginTop: "6px", justifyContent: "flex-end" }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{ width: "6px", height: "6px", borderRadius: "50%", background: i <= (card?.tier || 0) ? tierGradient(card?.tier || 0) : "rgba(255,255,255,0.1)" }} />
                ))}
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ fontSize: "11px", color: "#64748b" }}>
                {card?.tier >= 2 ? "Maximum tier reached" : `${nextTier(card?.tier || 0) - (card?.points || 0)} pts to ${["Silver","Gold","Gold"][card?.tier || 0]}`}
              </span>
              <span style={{ fontSize: "11px", color: "#64748b" }}>{Math.round(progress(card?.points || 0, card?.tier || 0))}%</span>
            </div>
            <div style={{ height: "5px", background: "rgba(255,255,255,0.06)", borderRadius: "3px", overflow: "hidden" }}>
              <div style={{
                height: "100%",
                borderRadius: "3px",
                background: "linear-gradient(90deg, #6366f1, #06b6d4)",
                width: `${progress(card?.points || 0, card?.tier || 0)}%`,
                transition: "width 0.8s cubic-bezier(0.4,0,0.2,1)",
              }} />
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "16px" }}>
          {[
            { label: "Scans", value: loading ? "—" : (card?.scan_count || 0) },
            { label: "Status", value: card ? "Active" : "New" },
            { label: "Network", value: "Sui" },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "14px 12px", textAlign: "center" }}>
              <div style={{ fontSize: "18px", fontWeight: "700", color: "#e2e8f0" }}>{value}</div>
              <div style={{ fontSize: "11px", color: "#64748b", marginTop: "3px" }}>{label}</div>
            </div>
          ))}
        </div>

        {/* On-chain proof */}
        {card?.objectId && (
          <div style={{ background: "rgba(6,182,212,0.05)", border: "1px solid rgba(6,182,212,0.15)", borderRadius: "12px", padding: "12px 16px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#06b6d4", flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: "11px", color: "#06b6d4", marginBottom: "2px" }}>On-chain NFT</div>
              <div style={{ fontSize: "10px", color: "#334155", fontFamily: "monospace" }}>{card.objectId.slice(0,12)}...{card.objectId.slice(-8)}</div>
            </div>
          </div>
        )}

        {/* Scan button */}
        <button
          onClick={() => window.location.href = `/scan?address=${address}`}
          style={{
            width: "100%",
            padding: "16px",
            background: "linear-gradient(135deg, #6366f1, #06b6d4)",
            border: "none",
            borderRadius: "12px",
            color: "white",
            fontSize: "15px",
            fontWeight: "600",
            cursor: "pointer",
            letterSpacing: "0.3px",
            boxShadow: "0 4px 24px rgba(99,102,241,0.3)",
          }}
        >
          Scan QR Code to Earn Points
        </button>

      </div>
    </main>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "#0a0e1a", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#64748b", fontSize: "14px" }}>Loading...</div>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}
