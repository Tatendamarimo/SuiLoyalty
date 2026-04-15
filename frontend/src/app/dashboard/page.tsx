"use client";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";

type BrandCard = {
  brand_id: string;
  brand_name: string;
  brand_color: string;
  brand_category: string;
  points_balance: number;
  tier: number;
  scan_count: number;
};

function tierName(t: number) { return ["Bronze", "Silver", "Gold"][t] || "Bronze"; }
function tierGradient(t: number) {
  return [
    "linear-gradient(135deg, #CD7F32, #8B4513)",
    "linear-gradient(135deg, #C0C0C0, #808080)",
    "linear-gradient(135deg, #FFD700, #B8860B)",
  ][t] || "linear-gradient(135deg, #CD7F32, #8B4513)";
}
function nextTierPts(t: number) { return t >= 1 ? 500 : 100; }
function progress(pts: number, t: number) { return t >= 2 ? 100 : Math.min(100, (pts / nextTierPts(t)) * 100); }

function BrandCardUI({ card }: { card: BrandCard }) {
  const pts = card.points_balance;
  const t = card.tier;
  const color = card.brand_color || "#6366f1";

  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: `1px solid ${color}33`,
      borderRadius: "16px",
      padding: "20px",
      marginBottom: "12px",
      position: "relative",
      overflow: "hidden",
    }}>
      <div style={{ position: "absolute", top: "-30px", right: "-30px", width: "90px", height: "90px", borderRadius: "50%", background: `${color}18`, pointerEvents: "none" }} />

      {/* Brand header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: `${color}22`, border: `1px solid ${color}44`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: "14px", fontWeight: "800", color }}>{card.brand_name[0]}</span>
          </div>
          <div>
            <div style={{ fontSize: "14px", fontWeight: "700", color: "#e2e8f0" }}>{card.brand_name}</div>
            <div style={{ fontSize: "11px", color: "#64748b" }}>{card.brand_category}</div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.4px" }}>Tier</div>
          <div style={{ fontSize: "13px", fontWeight: "700", background: tierGradient(t), WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{tierName(t)}</div>
        </div>
      </div>

      {/* Points */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "12px" }}>
        <div>
          <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "2px" }}>Points</div>
          <div style={{ fontSize: "32px", fontWeight: "800", color, lineHeight: 1 }}>{pts.toLocaleString()}</div>
        </div>
        <div style={{ fontSize: "11px", color: "#64748b" }}>{card.scan_count} scan{card.scan_count !== 1 ? "s" : ""}</div>
      </div>

      {/* Progress bar */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
          <span style={{ fontSize: "10px", color: "#64748b" }}>
            {t >= 2 ? "Max tier" : `${nextTierPts(t) - pts} pts to ${t >= 1 ? "Gold" : "Silver"}`}
          </span>
          <span style={{ fontSize: "10px", color: "#64748b" }}>{Math.round(progress(pts, t))}%</span>
        </div>
        <div style={{ height: "4px", background: "rgba(255,255,255,0.06)", borderRadius: "2px", overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: "2px", background: color, width: `${progress(pts, t)}%`, transition: "width 0.8s cubic-bezier(0.4,0,0.2,1)" }} />
        </div>
      </div>
    </div>
  );
}

function DashboardContent() {
  const params = useSearchParams();
  const [address, setAddress] = useState("");
  const [name, setName] = useState("Customer");
  const [cards, setCards] = useState<BrandCard[]>([]);
  const [avatar, setAvatar] = useState<{ level: number; experience: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const paramAddress = params.get("address");
    const paramName = params.get("name");
    if (paramAddress) {
      localStorage.setItem("sui_address", paramAddress);
      if (paramName) localStorage.setItem("sui_name", decodeURIComponent(paramName));
    }
    const addr = paramAddress || localStorage.getItem("sui_address") || "";
    const storedName = paramName ? decodeURIComponent(paramName) : localStorage.getItem("sui_name") || "";
    setAddress(addr);
    if (storedName) {
      setName(storedName);
    } else if (addr) {
      fetch(`/api/user/${addr}`)
        .then(r => r.json())
        .then(data => {
          if (data.success && data.user.display_name) {
            setName(data.user.display_name);
            localStorage.setItem("sui_name", data.user.display_name);
          }
        })
        .catch(() => {});
    }
  }, [params]);

  useEffect(() => {
    if (!address) return;
    fetch(`/api/loyalty-cards/${address}`)
      .then(r => r.json())
      .then(data => { setCards(data.cards || []); setLoading(false); })
      .catch(() => setLoading(false));

    fetch(`/api/nft/${address}`)
      .then(r => r.json())
      .then(data => { if (data.success && data.avatar) setAvatar(data.avatar); })
      .catch(() => {});
  }, [address]);

  const totalPoints = cards.reduce((sum, c) => sum + c.points_balance, 0);
  const totalScans = cards.reduce((sum, c) => sum + c.scan_count, 0);

  return (
    <main style={{ minHeight: "100vh", background: "#0a0e1a", padding: "0" }}>
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

        {/* Summary stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "24px" }}>
          {[
            { label: "Avatar Level", value: loading ? "—" : (avatar ? `Lvl ${avatar.level}` : "Lvl 1") },
            { label: "Experience", value: loading ? "—" : (avatar ? `${avatar.experience} XP` : "0 XP") },
            { label: "Total Points", value: loading ? "—" : totalPoints.toLocaleString() },
            { label: "Brands Connected", value: loading ? "—" : cards.length },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "14px 12px", textAlign: "center" }}>
              <div style={{ fontSize: "18px", fontWeight: "700", color: "#e2e8f0" }}>{value}</div>
              <div style={{ fontSize: "11px", color: "#64748b", marginTop: "3px" }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Brand cards */}
        <div style={{ marginBottom: "8px" }}>
          <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "12px" }}>Your Loyalty Cards</div>

          {loading ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#64748b", fontSize: "14px" }}>Loading...</div>
          ) : cards.length === 0 ? (
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.08)", borderRadius: "16px", padding: "32px", textAlign: "center" }}>
              <div style={{ fontSize: "13px", color: "#64748b", marginBottom: "4px" }}>No loyalty cards yet</div>
              <div style={{ fontSize: "11px", color: "#334155" }}>Scan a brand QR code to get started</div>
            </div>
          ) : (
            cards.map(card => <BrandCardUI key={card.brand_id} card={card} />)
          )}
        </div>

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
            marginTop: "16px",
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
