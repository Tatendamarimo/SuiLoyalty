"use client";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense, useRef, useCallback } from "react";

// ─── Toast System ────────────────────────────────────────────────────────────
type Toast = { id: number; message: string; type: "success" | "error" };

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div style={{ position: "fixed", bottom: "24px", right: "24px", zIndex: 9999, display: "flex", flexDirection: "column", gap: "10px", pointerEvents: "none" }}>
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => onDismiss(t.id)}
          style={{
            pointerEvents: "all",
            animation: "toastIn 0.35s cubic-bezier(0.4,0,0.2,1) both",
            background: t.type === "success"
              ? "linear-gradient(135deg, rgba(16,185,129,0.15), rgba(16,185,129,0.05))"
              : "linear-gradient(135deg, rgba(239,68,68,0.15), rgba(239,68,68,0.05))",
            backdropFilter: "blur(20px)",
            border: `1px solid ${t.type === "success" ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.4)"}`,
            borderRadius: "14px",
            padding: "14px 18px",
            color: t.type === "success" ? "#6ee7b7" : "#fca5a5",
            fontSize: "14px",
            fontWeight: "600",
            maxWidth: "340px",
            cursor: "pointer",
            boxShadow: t.type === "success"
              ? "0 8px 32px rgba(16,185,129,0.2)"
              : "0 8px 32px rgba(239,68,68,0.2)",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <span style={{ fontSize: "18px" }}>{t.type === "success" ? "✓" : "✕"}</span>
          {t.message}
        </div>
      ))}
    </div>
  );
}

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
function nextTierPts(t: number) { return (t + 1) * 500; } // matches contract: tier = points / 500
function progress(pts: number, t: number) { if (t >= 2) return 100; const tierStart = t * 500; return Math.min(100, ((pts - tierStart) / 500) * 100); }

function BrandCardUI({ card, index, onRedeem }: { card: BrandCard; index: number, onRedeem: (c: BrandCard) => void }) {
  const pts = Number(card.points_balance || 0);
  const t = Number(card.tier || 0);
  const color = card.brand_color || "#6366f1";
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        background: `linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)`,
        backdropFilter: "blur(20px)",
        border: `1px solid ${color}${isHovered ? '66' : '33'}`,
        borderRadius: "20px",
        padding: "24px",
        marginBottom: "16px",
        position: "relative",
        overflow: "hidden",
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        transform: isHovered ? "translateY(-4px) scale(1.02)" : "translateY(0) scale(1)",
        boxShadow: isHovered
          ? `0 20px 60px -10px ${color}40, 0 0 0 1px ${color}20 inset`
          : `0 8px 30px -8px rgba(0,0,0,0.3)`,
        animation: `slideInUp 0.5s cubic-bezier(0.4, 0, 0.2, 1) ${index * 0.1}s both`,
      }}>

      <style>{`
        @keyframes slideInUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>

      {/* Animated gradient orb */}
      <div style={{
        position: "absolute", top: "-40px", right: "-40px", width: "120px", height: "120px",
        borderRadius: "50%", background: `radial-gradient(circle, ${color}30 0%, ${color}10 50%, transparent 70%)`,
        pointerEvents: "none", transition: "all 0.3s ease",
        transform: isHovered ? "scale(1.3)" : "scale(1)", opacity: isHovered ? 1 : 0.6,
      }} />

      {/* Shimmer effect on hover */}
      {isHovered && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
          background: `linear-gradient(90deg, transparent, ${color}20, transparent)`,
          animation: "shimmer 2s infinite", pointerEvents: "none",
        }} />
      )}

      {/* Brand header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{
            width: "44px", height: "44px", borderRadius: "12px",
            background: `linear-gradient(135deg, ${color}30, ${color}15)`,
            border: `1px solid ${color}50`, display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 4px 16px ${color}30`, transition: "all 0.3s ease",
            transform: isHovered ? "scale(1.1) rotate(5deg)" : "scale(1)",
          }}>
            <span style={{ fontSize: "18px", fontWeight: "900", color, filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))" }}>
              {card.brand_name[0]}
            </span>
          </div>
          <div>
            <div style={{ fontSize: "16px", fontWeight: "700", color: "#e2e8f0", letterSpacing: "0.3px" }}>{card.brand_name}</div>
            <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>{card.brand_category}</div>
          </div>
        </div>
        <div style={{ textAlign: "right", background: `linear-gradient(135deg, ${color}15, transparent)`, padding: "8px 14px", borderRadius: "10px", border: `1px solid ${color}30` }}>
          <div style={{ fontSize: "10px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "2px" }}>Tier</div>
          <div style={{ fontSize: "14px", fontWeight: "800", background: tierGradient(t), WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))" }}>
            {tierName(t)}
          </div>
        </div>
      </div>

      {/* Points */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "16px", position: "relative", zIndex: 1 }}>
        <div>
          <div style={{ fontSize: "11px", color: "#94a3b8", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Points Balance</div>
          <div style={{ fontSize: "40px", fontWeight: "900", background: `linear-gradient(135deg, ${color}, ${color}CC)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", lineHeight: 1, filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.3))", transition: "all 0.3s ease", transform: isHovered ? "scale(1.05)" : "scale(1)" }}>
            {pts.toLocaleString()}
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onRedeem(card); }}
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "8px",
            padding: "8px 16px",
            color: "white",
            fontSize: "12px",
            fontWeight: "600",
            cursor: "pointer",
            transition: "all 0.2s"
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.15)"}
          onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
        >
          Redeem
        </button>
      </div>

      {/* Progress bar */}
      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
          <span style={{ fontSize: "11px", color: "#94a3b8", fontWeight: "600" }}>
            {t >= 2 ? "Max tier reached" : `${nextTierPts(t) - pts} pts to ${t >= 1 ? "Gold" : "Silver"}`}
          </span>
          <span style={{ fontSize: "11px", color: color, fontWeight: "700" }}>{Math.round(progress(pts, t))}%</span>
        </div>
        <div style={{ height: "6px", background: "rgba(255,255,255,0.08)", borderRadius: "4px", overflow: "hidden", boxShadow: "inset 0 1px 3px rgba(0,0,0,0.3)" }}>
          <div style={{ height: "100%", borderRadius: "4px", background: `linear-gradient(90deg, ${color}, ${color}DD)`, width: `${progress(pts, t)}%`, transition: "width 0.8s cubic-bezier(0.4,0,0.2,1)", boxShadow: `0 0 10px ${color}60`, position: "relative" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)", animation: "shimmer 2s infinite" }} />
          </div>
        </div>
      </div>
      
      {/* Mock Attributes display */}
      <div style={{ marginTop: "16px", display: "flex", gap: "8px", position: "relative", zIndex: 1 }}>
        {t >= 1 && (
          <div style={{ fontSize: "10px", padding: "4px 8px", background: "rgba(255,255,255,0.1)", borderRadius: "4px", color: "#cbd5e1" }}>
            🎖 VIP Access
          </div>
        )}
        {pts >= 200 && (
          <div style={{ fontSize: "10px", padding: "4px 8px", background: "rgba(255,255,255,0.1)", borderRadius: "4px", color: "#cbd5e1" }}>
            ☕ Free Refills
          </div>
        )}
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
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [redeemModal, setRedeemModal] = useState<BrandCard | null>(null);
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

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

  const loadData = (addr: string) => {
    fetch(`/api/loyalty-cards/${addr}`)
      .then(r => r.json())
      .then(data => { setCards(data.cards || []); setLoading(false); })
      .catch(() => setLoading(false));

    fetch(`/api/nft/${addr}`)
      .then(r => r.json())
      .then(data => { if (data.success && data.avatar) setAvatar(data.avatar); })
      .catch(() => {});
      
    fetch(`/api/transactions/${addr}`)
      .then(r => r.json())
      .then(data => { if (data.success && data.transactions) setTransactions(data.transactions); })
      .catch(() => {});
  };

  useEffect(() => {
    if (address) loadData(address);
  }, [address]);

  const handleRedeem = async (brand: BrandCard, points: number, reward: string) => {
    setRedeemLoading(true);
    try {
      const res = await fetch('/api/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_address: address, brand_id: brand.brand_id, points_to_redeem: points, reward_name: reward })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || "Reward redeemed successfully!", "success");
        loadData(address);
      } else {
        showToast(data.error || "Redemption failed.", "error");
      }
    } catch (e) {
      showToast("Something went wrong. Please try again.", "error");
    } finally {
      setRedeemLoading(false);
      setRedeemModal(null);
    }
  };

  const handleLogout = () => {
    fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    localStorage.removeItem("sui_address");
    localStorage.removeItem("sui_name");
    localStorage.removeItem("zklogin_ephemeral");
    window.location.href = "/";
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm("Are you sure you want to permanently delete your account and all data? Your on-chain Loyalty Avatar will be anonymised but your personal data will be erased. This cannot be undone.")) return;
    setIsDeleting(true);
    try {
      const res = await fetch("/api/users/me", { method: "DELETE", credentials: "include" });
      const data = await res.json();
      if (data.success) {
        handleLogout();
      } else {
        showToast(data.error || "Failed to delete account.", "error");
      }
    } catch (e) {
      showToast("Error deleting account.", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  const totalPoints = cards.reduce((sum, c) => sum + Number(c.points_balance || 0), 0);
  const totalScans = cards.reduce((sum, c) => sum + Number(c.scan_count || 0), 0);

  return (
    <main style={{ minHeight: "100vh", background: "#0a0e1a", padding: "0" }}>
      <style>{`
        .dashboard-container {
          max-width: 440px;
          margin: 0 auto;
          padding: 24px 16px;
          position: relative;
        }
        @media (min-width: 1024px) {
          .dashboard-container {
            max-width: 1000px;
            display: grid;
            grid-template-columns: 350px 1fr;
            gap: 40px;
            padding: 48px 32px;
          }
          .dashboard-left {
            position: sticky;
            top: 48px;
            height: fit-content;
          }
        }
      `}</style>

      <div style={{ position: "fixed", top: "10%", left: "15%", width: "300px", height: "300px", borderRadius: "50%", background: "rgba(99,102,241,0.08)", filter: "blur(80px)", pointerEvents: "none" }} />
      <div style={{ position: "fixed", bottom: "20%", right: "10%", width: "250px", height: "250px", borderRadius: "50%", background: "rgba(6,182,212,0.06)", filter: "blur(80px)", pointerEvents: "none" }} />

      <div className="dashboard-container">
        
        <div className="dashboard-left">

        {/* Top nav */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "36px" }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            cursor: "pointer",
            transition: "all 0.3s ease",
          }}
          onMouseEnter={(e) => {
            const svg = e.currentTarget.querySelector('svg');
            if (svg) svg.style.transform = "rotate(10deg) scale(1.1)";
          }}
          onMouseLeave={(e) => {
            const svg = e.currentTarget.querySelector('svg');
            if (svg) svg.style.transform = "rotate(0deg) scale(1)";
          }}>
            <svg width="32" height="32" viewBox="0 0 56 56" style={{ transition: "all 0.3s ease", filter: "drop-shadow(0 2px 8px rgba(99,102,241,0.4))" }}>
              <defs>
                <linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#6366f1"/>
                  <stop offset="50%" stopColor="#8b5cf6"/>
                  <stop offset="100%" stopColor="#06b6d4"/>
                </linearGradient>
              </defs>
              <polygon points="28,4 52,18 52,38 28,52 4,38 4,18" fill="none" stroke="url(#g1)" strokeWidth="3"/>
              <circle cx="28" cy="28" r="8" fill="url(#g1)" opacity="0.3"/>
            </svg>
            <span style={{
              fontWeight: "800",
              fontSize: "18px",
              background: "linear-gradient(135deg, #6366f1, #8b5cf6, #06b6d4)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              letterSpacing: "0.3px",
            }}>
              SuiLoyalty
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "16px",
              padding: "4px 10px",
            }}>
              <div style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: "#22c55e",
              }} />
              <span style={{ fontSize: "11px", color: "#cbd5e1", fontWeight: "500", letterSpacing: "0.5px" }}>Sui Testnet</span>
            </div>
            <button 
              onClick={() => setSettingsOpen(true)}
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "50%",
                width: "32px",
                height: "32px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#94a3b8",
                cursor: "pointer",
                transition: "all 0.2s ease"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.1)";
                e.currentTarget.style.color = "#e2e8f0";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                e.currentTarget.style.color = "#94a3b8";
              }}
              title="Settings"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
            </button>
          </div>
        </div>

        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.7; transform: scale(1.2); }
          }
        `}</style>

        {/* User greeting */}
        <div style={{
          marginBottom: "28px",
          background: "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "20px",
          padding: "20px",
          position: "relative",
          overflow: "hidden",
        }}>
          <div style={{
            position: "absolute",
            top: "-20px",
            right: "-20px",
            width: "100px",
            height: "100px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(99,102,241,0.2), transparent 70%)",
            pointerEvents: "none",
          }} />
          <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "600" }}>
            Welcome back
          </div>
          <div style={{
            fontSize: "28px",
            fontWeight: "800",
            background: "linear-gradient(135deg, #e2e8f0, #94a3b8)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            marginBottom: "8px",
            letterSpacing: "0.3px",
          }}>
            {name}
          </div>
          <div 
            onClick={() => {
              if (address) {
                navigator.clipboard.writeText(address);
                alert("Sui Address copied to clipboard!");
              }
            }}
            style={{
              fontSize: "11px",
              color: "#64748b",
              fontFamily: "monospace",
              background: "rgba(0,0,0,0.3)",
              padding: "6px 10px",
              borderRadius: "8px",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              border: "1px solid rgba(255,255,255,0.05)",
              cursor: "pointer",
              transition: "color 0.2s"
            }}
            title="Click to copy"
            onMouseEnter={(e) => e.currentTarget.style.color = "#e2e8f0"}
            onMouseLeave={(e) => e.currentTarget.style.color = "#64748b"}
          >
            {address ? `${address.slice(0, 10)}...${address.slice(-8)}` : ""}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </div>
        </div>

        {/* Summary stats */}
        <div className="merchant-split-grid" style={{ marginBottom: "28px", gap: "12px" }}>
          {[
            { label: "Avatar Level", value: loading ? "—" : (avatar ? `Lvl ${avatar.level}` : "Lvl 1"), color: "#f59e0b" },
            { label: "Experience", value: loading ? "—" : (avatar ? `${avatar.experience} XP` : "0 XP"), color: "#8b5cf6" },
            { label: "Total Points", value: loading ? "—" : totalPoints.toLocaleString(), color: "#06b6d4" },
            { label: "Brands Connected", value: loading ? "—" : cards.length, color: "#ec4899" },
          ].map(({ label, value, color }, idx) => (
            <div
              key={label}
              style={{
                background: "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)",
                backdropFilter: "blur(20px)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "16px",
                padding: "16px",
                textAlign: "center",
                position: "relative",
                overflow: "hidden",
                transition: "all 0.3s ease",
                cursor: "default",
                animation: `slideInUp 0.5s cubic-bezier(0.4, 0, 0.2, 1) ${idx * 0.05}s both`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-4px) scale(1.02)";
                e.currentTarget.style.boxShadow = `0 12px 40px -8px ${color}40`;
                e.currentTarget.style.borderColor = `${color}50`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0) scale(1)";
                e.currentTarget.style.boxShadow = "0 4px 20px -4px rgba(0,0,0,0.3)";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
              }}
            >
              <div style={{
                position: "absolute",
                top: "8px",
                right: "8px",
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: color,
                boxShadow: `0 0 12px ${color}`,
              }} />
              <div style={{
                fontSize: "24px",
                fontWeight: "800",
                background: `linear-gradient(135deg, ${color}, ${color}CC)`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                marginBottom: "4px",
              }}>
                {value}
              </div>
              <div style={{
                fontSize: "10px",
                color: "#94a3b8",
                textTransform: "uppercase",
                letterSpacing: "0.8px",
                fontWeight: "600",
              }}>
                {label}
              </div>
            </div>
          ))}
        </div>

        {/* Scan button */}
        <button
          onClick={() => window.location.href = `/scan?address=${address}`}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-2px) scale(1.02)";
            e.currentTarget.style.boxShadow = "0 20px 60px rgba(99,102,241,0.5), 0 0 0 1px rgba(255,255,255,0.1) inset";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0) scale(1)";
            e.currentTarget.style.boxShadow = "0 8px 32px rgba(99,102,241,0.4)";
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.transform = "translateY(0) scale(0.98)";
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = "translateY(-2px) scale(1.02)";
          }}
          style={{
            width: "100%",
            padding: "18px",
            background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #06b6d4 100%)",
            backgroundSize: "200% 100%",
            border: "none",
            borderRadius: "16px",
            color: "white",
            fontSize: "16px",
            fontWeight: "700",
            cursor: "pointer",
            letterSpacing: "0.5px",
            boxShadow: "0 8px 32px rgba(99,102,241,0.4)",
            marginBottom: "20px",
            position: "relative",
            overflow: "hidden",
            transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          <span style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <rect x="3" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/>
              <rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
            <span>Scan QR Code to Earn Points</span>
          </span>
          {/* Animated gradient on hover */}
          <div style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "linear-gradient(135deg, transparent, rgba(255,255,255,0.1), transparent)",
            animation: "shimmer 3s infinite",
            pointerEvents: "none",
          }} />
        </button>

        </div> {/* End dashboard-left */}

        <div className="dashboard-right">
        {/* Brand cards */}
        <div style={{ marginBottom: "32px" }}>
          <div style={{
            fontSize: "12px",
            color: "#94a3b8",
            textTransform: "uppercase",
            letterSpacing: "1px",
            marginBottom: "16px",
            fontWeight: "700",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}>
            <span>Your Loyalty Cards</span>
            {!loading && cards.length > 0 && (
              <span style={{
                background: "linear-gradient(135deg, #6366f1, #06b6d4)",
                color: "white",
                fontSize: "10px",
                padding: "2px 8px",
                borderRadius: "10px",
                fontWeight: "700",
              }}>
                {cards.length}
              </span>
            )}
          </div>

          {loading ? (
            <div>
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{
                    background: "linear-gradient(90deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 100%)",
                    backgroundSize: "200% 100%",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: "20px",
                    padding: "24px",
                    marginBottom: "16px",
                    height: "180px",
                    animation: `shimmer 1.5s infinite`,
                  }}
                />
              ))}
            </div>
          ) : cards.length === 0 ? (
            <div style={{
              background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
              backdropFilter: "blur(20px)",
              border: "2px dashed rgba(255,255,255,0.15)",
              borderRadius: "20px",
              padding: "48px 32px",
              textAlign: "center",
              animation: "slideInUp 0.5s cubic-bezier(0.4, 0, 0.2, 1) both",
            }}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" style={{ margin: "0 auto 16px" }}>
                <rect x="3" y="7" width="18" height="13" rx="2" />
                <path d="M3 11h18" />
                <circle cx="7" cy="15" r="1" fill="rgba(255,255,255,0.2)" />
              </svg>
              <div style={{ fontSize: "15px", color: "#e2e8f0", marginBottom: "8px", fontWeight: "600" }}>No loyalty cards yet</div>
              <div style={{ fontSize: "12px", color: "#64748b" }}>Scan a brand QR code to start earning rewards</div>
            </div>
          ) : (
            cards.map((card, index) => <BrandCardUI key={card.brand_id} card={card} index={index} onRedeem={setRedeemModal} />)
          )}
        </div>


        {/* Transaction History */}
        {transactions.length > 0 && (
          <div>
            <div style={{
              fontSize: "12px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "1px",
              marginBottom: "16px", fontWeight: "700", marginTop: "16px"
            }}>
              Recent Activity
            </div>
            <div style={{
              background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
              backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "20px", overflow: "hidden"
            }}>
              {transactions.slice(0, 5).map((tx, idx) => (
                <div key={tx.id} style={{
                  padding: "16px 20px", borderBottom: idx < transactions.slice(0,5).length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                  display: "flex", justifyContent: "space-between", alignItems: "center"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{
                      width: "32px", height: "32px", borderRadius: "8px",
                      background: `linear-gradient(135deg, ${tx.brand_color || '#6366f1'}30, ${tx.brand_color || '#6366f1'}15)`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: tx.brand_color || "#6366f1", fontWeight: "bold", fontSize: "14px"
                    }}>
                      {tx.brand_name ? tx.brand_name[0] : "?"}
                    </div>
                    <div>
                      <div style={{ fontSize: "14px", color: "#e2e8f0", fontWeight: "600" }}>
                        {Number(tx.points_added) > 0 ? "Points Earned" : "Reward Redeemed"}
                      </div>
                      <div style={{ fontSize: "11px", color: "#64748b" }}>{tx.brand_name} • {new Date(tx.created_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                  <div style={{
                    fontSize: "15px", fontWeight: "700",
                    color: Number(tx.points_added) > 0 ? "#10b981" : "#ef4444"
                  }}>
                    {Number(tx.points_added) > 0 ? "+" : ""}{tx.points_added} pts
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        </div> {/* End dashboard-right */}
      </div> {/* End dashboard-container */}

      {/* Redeem Modal */}
      {redeemModal && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.8)", backdropFilter: "blur(10px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 100, padding: "20px"
        }} onClick={() => setRedeemModal(null)}>
          <div style={{
            background: "#0f172a", border: `1px solid ${redeemModal.brand_color || '#6366f1'}50`,
            borderRadius: "24px", padding: "32px", width: "100%", maxWidth: "400px",
            boxShadow: `0 20px 40px -10px ${redeemModal.brand_color || '#6366f1'}40`,
            position: "relative"
          }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: "20px", color: "white", marginBottom: "8px", fontWeight: "800" }}>Redeem Rewards</h2>
            <p style={{ fontSize: "14px", color: "#94a3b8", marginBottom: "24px" }}>
              Spend points from your <strong>{redeemModal.brand_name}</strong> card.
              You have <strong style={{color: redeemModal.brand_color}}>{Number(redeemModal.points_balance).toLocaleString()}</strong> points available.
            </p>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "24px" }}>
              {(() => {
                const cat = (redeemModal.brand_category || "").toLowerCase();
                let rewards = [
                  { name: "Mystery Reward", cost: 100 },
                  { name: `10% off at ${redeemModal.brand_name}`, cost: 500 },
                  { name: "Premium VIP Status", cost: 1000 }
                ];
                if (cat.includes('cafe') || cat.includes('coffee') || cat.includes('food')) {
                  rewards = [
                    { name: "Free Pastry", cost: 100 },
                    { name: "Free Coffee Drink", cost: 300 },
                    { name: "Skip The Line Pass", cost: 800 }
                  ];
                } else if (cat.includes('retail') || cat.includes('clothing') || cat.includes('fashion')) {
                  rewards = [
                    { name: "Free Tote Bag", cost: 200 },
                    { name: "15% Off Any Item", cost: 500 },
                    { name: "$50 Store Credit", cost: 2000 }
                  ];
                }

                return rewards.map(reward => {
                  const canAfford = Number(redeemModal.points_balance) >= reward.cost;
                  return (
                    <button
                      key={reward.name}
                      disabled={!canAfford || redeemLoading}
                      onClick={() => handleRedeem(redeemModal, reward.cost, reward.name)}
                      style={{
                        background: canAfford ? `linear-gradient(135deg, ${redeemModal.brand_color}40, ${redeemModal.brand_color}10)` : "rgba(255,255,255,0.05)",
                        border: `1px solid ${canAfford ? redeemModal.brand_color : 'rgba(255,255,255,0.1)'}`,
                        padding: "16px", borderRadius: "12px", display: "flex", justifyContent: "space-between",
                        color: canAfford ? "white" : "#64748b", cursor: canAfford ? "pointer" : "not-allowed",
                        transition: "all 0.2s"
                      }}
                    >
                      <span style={{ fontWeight: "600" }}>{reward.name}</span>
                      <span style={{ fontWeight: "800" }}>{reward.cost} pts</span>
                    </button>
                  )
                });
              })()}
            </div>
              <button 
                onClick={() => setRedeemModal(null)}
                style={{
                  width: "100%", padding: "14px", background: "transparent",
                  border: "none", color: "#64748b", fontWeight: "600", cursor: "pointer"
                }}
              >
                Cancel
              </button>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {settingsOpen && (
        <div onClick={() => setSettingsOpen(false)} style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.8)", backdropFilter: "blur(10px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 100, padding: "20px"
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: "#0f172a", border: "1px solid #334155",
            borderRadius: "24px", padding: "32px", width: "100%", maxWidth: "340px",
            boxShadow: "0 20px 40px -10px rgba(0,0,0,0.5)"
          }}>
            <h2 style={{ fontSize: "20px", color: "white", marginBottom: "8px", fontWeight: "800" }}>Settings</h2>
            <p style={{ fontSize: "13px", color: "#94a3b8", marginBottom: "24px" }}>
              Manage your SuiLoyalty account.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <button onClick={handleLogout} style={{
                width: "100%", padding: "14px", background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px",
                color: "#e2e8f0", fontWeight: "600", cursor: "pointer", transition: "all 0.2s"
              }}>
                Log out
              </button>
              <button onClick={handleDeleteAccount} disabled={isDeleting} style={{
                width: "100%", padding: "14px", background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.3)", borderRadius: "12px",
                color: "#fca5a5", fontWeight: "600", cursor: isDeleting ? "not-allowed" : "pointer",
                transition: "all 0.2s"
              }}>
                {isDeleting ? "Deleting..." : "Permanently Delete Account"}
              </button>
            </div>
            <button onClick={() => setSettingsOpen(false)} style={{
              width: "100%", padding: "14px", marginTop: "12px", background: "transparent",
              border: "none", color: "#64748b", fontWeight: "600", cursor: "pointer"
            }}>
              Close
            </button>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
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
