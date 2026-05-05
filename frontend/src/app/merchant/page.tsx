"use client";
import { useEffect, useState, useRef, useCallback } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

type Brand = { id: string; name: string; category: string; color: string };
type Membership = { brand_id: string; brand_name: string; brand_color: string; brand_category: string; role: "owner" | "admin" | "operator" };
type Summary = { pending: number; fulfilled_30d: number; cancelled_30d: number; points_redeemed_30d: number };
type PendingRedemption = {
  id: string;
  brand_id: string;
  brand_name: string;
  brand_color: string;
  user_id: string;
  customer_wallet: string;
  customer_display_name: string | null;
  points_redeemed: number;
  reward_name: string;
  created_at: string;
};
type QRToken = { token_uuid: string; dataUrl?: string };
type InventoryToken = {
  token_uuid: string;
  points_value: number;
  printed: boolean;
  used: boolean;
  used_at: string | null;
  created_at: string;
  used_by_address: string | null;
};
type Inventory = { tokens: InventoryToken[]; stats: { total: number; printed: number; scanned: number; outstanding: number } };
type Toast = { id: number; message: string; type: "success" | "error" };
type AuthState = "loading" | "signin" | "no_access" | "brand_picker" | "dashboard";

// ─── API helper ──────────────────────────────────────────────────────────────

function authHeaders(): HeadersInit {
  return { "Content-Type": "application/json" };
}

// All fetch calls that touch session-protected routes must include credentials
const FETCH_OPTS: RequestInit = { credentials: "include" };

// ─── Toast ───────────────────────────────────────────────────────────────────

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, display: "flex", flexDirection: "column", gap: 10, pointerEvents: "none" }}>
      <style>{`@keyframes toastIn { from { opacity:0; transform:translateY(20px) scale(0.95); } to { opacity:1; transform:translateY(0) scale(1); } }`}</style>
      {toasts.map((t) => (
        <div key={t.id} onClick={() => onDismiss(t.id)} style={{
          pointerEvents: "all", animation: "toastIn 0.3s ease both",
          background: t.type === "success" ? "#0f3a2c" : "#3a1418",
          border: `1px solid ${t.type === "success" ? "#10b981" : "#ef4444"}`,
          borderRadius: 10, padding: "12px 16px",
          color: t.type === "success" ? "#6ee7b7" : "#fca5a5",
          fontSize: 13, fontWeight: 600, maxWidth: 360, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 16 }}>{t.type === "success" ? "✓" : "✕"}</span>
          {t.message}
        </div>
      ))}
    </div>
  );
}

// ─── Sign-in screen ──────────────────────────────────────────────────────────

function SignInScreen({ loading, error, onSignIn }: { loading: boolean; error: string; onSignIn: () => void }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 420, width: "100%", background: "#0f1421", border: "1px solid #1f2937", borderRadius: 12, padding: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <Logo size={28} />
          <span style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 16 }}>SuiLoyalty Brand Portal</span>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#e2e8f0", marginBottom: 10 }}>Sign in to your brand</h1>
        <p style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6, marginBottom: 28 }}>
          Brand operators authenticate with Google via zkLogin — the same wallet-less flow consumers use. No passwords. Your access to a brand portal is granted by the brand owner.
        </p>
        <button onClick={onSignIn} disabled={loading} style={{
          width: "100%", padding: "12px 18px",
          background: loading ? "#1f2937" : "#ffffff",
          border: "1px solid #1f2937", borderRadius: 8,
          color: loading ? "#94a3b8" : "#0f1421",
          fontSize: 14, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
        }}>
          <GoogleIcon />
          {loading ? "Connecting…" : "Sign in with Google"}
        </button>
        {error && <p style={{ marginTop: 14, color: "#fca5a5", fontSize: 12 }}>{error}</p>}
        <p style={{ marginTop: 28, fontSize: 11, color: "#64748b", textAlign: "center" }}>
          Need access? Ask your brand owner to grant your account.
        </p>
      </div>
    </div>
  );
}

// ─── No access screen ───────────────────────────────────────────────────────

function NoAccessScreen({ onSignOut, onBrandCreated }: { onSignOut: () => void; onBrandCreated: () => void }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 460, width: "100%", background: "#0f1421", border: "1px solid #1f2937", borderRadius: 12, padding: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <Logo size={28} />
          <span style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 16 }}>SuiLoyalty Brand Portal</span>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#e2e8f0", marginBottom: 10 }}>No brand access yet</h1>
        <p style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6, marginBottom: 24 }}>
          You're signed in but not a member of any brand. Create your own, or ask a brand owner to add you.
        </p>
        <CreateBrandModal onCreated={onBrandCreated} />
        <button onClick={onSignOut} style={{
          width: "100%", marginTop: 10, padding: "10px 16px", background: "transparent",
          border: "1px solid #334155", borderRadius: 8, color: "#94a3b8",
          fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}>
          Sign out
        </button>
      </div>
    </div>
  );
}

// ─── Brand picker screen ────────────────────────────────────────────────────

// ─── Create Brand modal ────────────────────────────────────────────────────

function CreateBrandModal({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    if (!name.trim()) { setError("Brand name is required"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/brands", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), category: category.trim() || null, color }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to create brand");
      setOpen(false); setName(""); setCategory(""); setColor("#6366f1");
      onCreated();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} style={{
        width: "100%", padding: "11px 16px", background: "#6366f1",
        border: "none", borderRadius: 8, color: "#fff",
        fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 4,
      }}>
        + Create a new brand
      </button>
      {open && (
        <div onClick={() => { setOpen(false); setError(""); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#0f1421", border: "1px solid #1f2937", borderRadius: 14, padding: 32, width: "100%", maxWidth: 420 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0", marginBottom: 20 }}>Create Brand</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>Brand name *</label>
                <input value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Brew House"
                  style={{ width: "100%", marginTop: 6, padding: "10px 12px", background: "#0a0e1a", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>Category</label>
                <input value={category} onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. Coffee, Retail, Food"
                  style={{ width: "100%", marginTop: 6, padding: "10px 12px", background: "#0a0e1a", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>Brand colour</label>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
                  <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
                    style={{ width: 40, height: 40, border: "1px solid #334155", borderRadius: 8, background: "none", cursor: "pointer", padding: 2 }} />
                  <span style={{ fontSize: 13, color: "#94a3b8", fontFamily: "monospace" }}>{color}</span>
                </div>
              </div>
              {error && <p style={{ color: "#fca5a5", fontSize: 12, margin: 0 }}>{error}</p>}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
              <button onClick={create} disabled={loading} style={{
                flex: 1, padding: "11px", background: loading ? "#334155" : "#6366f1",
                border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 700, cursor: loading ? "wait" : "pointer",
              }}>{loading ? "Creating…" : "Create brand"}</button>
              <button onClick={() => { setOpen(false); setError(""); }} style={{
                padding: "11px 16px", background: "transparent", border: "1px solid #334155",
                borderRadius: 8, color: "#94a3b8", fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Edit Brand modal ──────────────────────────────────────────────────────

function EditBrandModal({ brand, onEdited }: { brand: Membership; onEdited: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(brand.brand_name);
  const [category, setCategory] = useState(brand.brand_category || "");
  const [color, setColor] = useState(brand.brand_color || "#6366f1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function update() {
    if (!name.trim()) { setError("Brand name is required"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/brands/${brand.brand_id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), category: category.trim() || null, color }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to update brand");
      setOpen(false);
      onEdited();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} style={{ background: "transparent", border: "1px solid #334155", borderRadius: 6, padding: "6px 12px", color: "#94a3b8", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Settings
      </button>
      {open && (
        <div onClick={() => { setOpen(false); setError(""); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#0f1421", border: "1px solid #1f2937", borderRadius: 14, padding: 32, width: "100%", maxWidth: 420 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0", marginBottom: 20 }}>Edit Brand</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>Brand name *</label>
                <input value={name} disabled
                  title="Brand names cannot be changed after creation because they are permanently recorded on the blockchain."
                  style={{ width: "100%", marginTop: 6, padding: "10px 12px", background: "rgba(255,255,255,0.02)", border: "1px solid #1f2937", borderRadius: 8, color: "#64748b", fontSize: 14, outline: "none", boxSizing: "border-box", cursor: "not-allowed" }} />
                <div style={{ fontSize: 10, color: "#475569", marginTop: 4 }}>
                  Locked to preserve on-chain blockchain integrity.
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>Category</label>
                <input value={category} onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. Coffee, Retail, Food"
                  style={{ width: "100%", marginTop: 6, padding: "10px 12px", background: "#0a0e1a", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>Brand colour</label>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
                  <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
                    style={{ width: 40, height: 40, border: "1px solid #334155", borderRadius: 8, background: "none", cursor: "pointer", padding: 2 }} />
                  <span style={{ fontSize: 13, color: "#94a3b8", fontFamily: "monospace" }}>{color}</span>
                </div>
              </div>
              {error && <p style={{ color: "#fca5a5", fontSize: 12, margin: 0 }}>{error}</p>}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
              <button onClick={update} disabled={loading} style={{
                flex: 1, padding: "11px", background: loading ? "#334155" : brand.brand_color,
                border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 700, cursor: loading ? "wait" : "pointer",
              }}>{loading ? "Saving…" : "Save changes"}</button>
              <button onClick={() => { setOpen(false); setError(""); }} style={{
                padding: "11px 16px", background: "transparent", border: "1px solid #334155",
                borderRadius: 8, color: "#94a3b8", fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}


function BrandPickerScreen({ memberships, onSelect, onSignOut, onBrandCreated }: { memberships: Membership[]; onSelect: (m: Membership) => void; onSignOut: () => void; onBrandCreated: () => void }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 540, width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Logo size={28} />
            <span style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 16 }}>SuiLoyalty Brand Portal</span>
          </div>
          <button onClick={onSignOut} style={{ background: "transparent", border: "1px solid #334155", borderRadius: 6, padding: "6px 12px", color: "#94a3b8", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Sign out</button>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#e2e8f0", marginBottom: 6 }}>Choose a brand</h1>
        <p style={{ fontSize: 13, color: "#94a3b8", marginBottom: 16 }}>
          You have access to {memberships.length} brand{memberships.length === 1 ? "" : "s"}.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, marginBottom: 14 }}>
          {memberships.map((m) => (
            <button key={m.brand_id} onClick={() => onSelect(m)} style={{
              padding: 16, background: "#0f1421", border: "1px solid #1f2937", borderRadius: 10,
              cursor: "pointer", textAlign: "left", transition: "border-color 0.15s",
              display: "flex", alignItems: "center", gap: 14,
            }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = m.brand_color)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#1f2937")}
            >
              <div style={{ width: 36, height: 36, borderRadius: 8, background: `${m.brand_color}25`, border: `1px solid ${m.brand_color}50`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: m.brand_color }}>{m.brand_name[0]}</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>{m.brand_name}</div>
                <div style={{ fontSize: 11, color: "#64748b" }}>{m.brand_category} · {m.role}</div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          ))}
        </div>
        <CreateBrandModal onCreated={onBrandCreated} />
      </div>
    </div>
  );
}

// ─── Dashboard header ───────────────────────────────────────────────────────

function DashboardHeader({ brand, role, onSignOut, onSwitchBrand, hasMultiple, onBrandEdited }: { brand: Membership; role: string; onSignOut: () => void; onSwitchBrand: () => void; hasMultiple: boolean; onBrandEdited: () => void; }) {
  const canEdit = role === "owner" || role === "admin";
  return (
    <div className="merchant-header-container" style={{ background: "#0f1421", borderBottom: "1px solid #1f2937", padding: "14px 24px" }}>
      <div className="merchant-header-group">
        <Logo size={24} />
        <span style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 14 }}>SuiLoyalty</span>
        <span style={{ color: "#475569", fontSize: 14 }}>/</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: `${brand.brand_color}25`, border: `1px solid ${brand.brand_color}50`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: brand.brand_color }}>{brand.brand_name[0]}</span>
          </div>
          <span style={{ color: "#e2e8f0", fontWeight: 600, fontSize: 14 }}>{brand.brand_name}</span>
          <span style={{ background: "#1f2937", color: "#94a3b8", fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{role}</span>
        </div>
      </div>
      <div className="merchant-header-group" style={{ gap: 8 }}>
        {canEdit && <EditBrandModal brand={brand} onEdited={onBrandEdited} />}
        {hasMultiple && (
          <button onClick={onSwitchBrand} style={{ background: "transparent", border: "1px solid #334155", borderRadius: 6, padding: "6px 12px", color: "#94a3b8", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Switch brand</button>
        )}
        <button onClick={onSignOut} style={{ background: "transparent", border: "1px solid #334155", borderRadius: 6, padding: "6px 12px", color: "#94a3b8", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Sign out</button>
      </div>
    </div>
  );
}

// ─── Summary tiles ──────────────────────────────────────────────────────────

function SummaryTiles({ summary, brand }: { summary: Summary | null; brand: Membership }) {
  const tiles = [
    { label: "Pending redemptions", value: summary?.pending ?? 0, color: "#f59e0b" },
    { label: "Fulfilled (30d)", value: summary?.fulfilled_30d ?? 0, color: "#10b981" },
    { label: "Cancelled (30d)", value: summary?.cancelled_30d ?? 0, color: "#94a3b8" },
    { label: "Points redeemed (30d)", value: (summary?.points_redeemed_30d ?? 0).toLocaleString(), color: brand.brand_color },
  ];
  return (
    <div className="merchant-stats-grid">
      {tiles.map((t) => (
        <div key={t.label} style={{ background: "#0f1421", border: "1px solid #1f2937", borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: t.color, marginBottom: 4 }}>{t.value}</div>
          <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>{t.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Pending redemptions panel ──────────────────────────────────────────────

function PendingRedemptionsPanel({ brandId, onChange, showToast }: { brandId: string; onChange: () => void; showToast: (msg: string, type?: "success" | "error") => void }) {
  const [rows, setRows] = useState<PendingRedemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);

  const fetchPending = useCallback(async () => {
    try {
      const res = await fetch(`/api/brand/${brandId}/redemptions/pending`, { credentials: "include", headers: authHeaders() });
      const data = await res.json();
      if (data.success) setRows(data.redemptions || []);
    } finally {
      setLoading(false);
    }
  }, [brandId]);

  useEffect(() => { fetchPending(); }, [fetchPending]);

  // Auto-refresh every 15s
  useEffect(() => {
    const interval = setInterval(fetchPending, 15000);
    return () => clearInterval(interval);
  }, [fetchPending]);

  async function fulfil(id: string) {
    setWorking(id);
    try {
      const res = await fetch(`/api/brand/${brandId}/redemptions/${id}/fulfil`, { method: "POST", credentials: "include", headers: authHeaders(), body: JSON.stringify({}) });
      const data = await res.json();
      if (data.success) {
        showToast("Marked as fulfilled.", "success");
        await fetchPending();
        onChange();
      } else {
        showToast(data.error || "Could not fulfil.", "error");
      }
    } finally {
      setWorking(null);
    }
  }

  async function cancel(id: string) {
    if (!confirm("Cancel this redemption and refund the customer's points?")) return;
    setWorking(id);
    try {
      const res = await fetch(`/api/brand/${brandId}/redemptions/${id}/cancel`, { method: "POST", credentials: "include", headers: authHeaders(), body: JSON.stringify({}) });
      const data = await res.json();
      if (data.success) {
        showToast("Cancelled and refunded.", "success");
        await fetchPending();
        onChange();
      } else {
        showToast(data.error || "Could not cancel.", "error");
      }
    } finally {
      setWorking(null);
    }
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const ago = (Date.now() - d.getTime()) / 1000;
    if (ago < 60) return "just now";
    if (ago < 3600) return `${Math.floor(ago / 60)}m ago`;
    if (ago < 86400) return `${Math.floor(ago / 3600)}h ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div style={{ background: "#0f1421", border: "1px solid #1f2937", borderRadius: 10, padding: 18, marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>Pending Redemptions</div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Customers waiting to collect their reward — {rows.length}</div>
        </div>
        <button onClick={fetchPending} style={{ background: "transparent", border: "1px solid #334155", borderRadius: 6, padding: "5px 10px", color: "#94a3b8", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Refresh</button>
      </div>
      {loading ? (
        <div style={{ fontSize: 12, color: "#64748b", padding: 16, textAlign: "center" }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ fontSize: 12, color: "#64748b", padding: 24, textAlign: "center", background: "#0a0e1a", borderRadius: 8 }}>
          No pending redemptions. New customer redemptions will appear here.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((r) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, background: "#0a0e1a", border: "1px solid #1f2937", borderRadius: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", marginBottom: 2 }}>{r.reward_name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: "#64748b" }}>
                  <span style={{ fontFamily: "monospace" }}>
                    {r.customer_wallet ? `${r.customer_wallet.slice(0, 8)}…${r.customer_wallet.slice(-6)}` : "anonymous"}
                  </span>
                  <span>·</span>
                  <span>{formatTime(r.created_at)}</span>
                </div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#f59e0b", whiteSpace: "nowrap" }}>{r.points_redeemed} pts</div>
              <div style={{ display: "flex", gap: 6 }}>
                <button disabled={working === r.id} onClick={() => fulfil(r.id)} style={{
                  background: "#10b981", border: "none", borderRadius: 6, padding: "7px 12px",
                  color: "#0a0e1a", fontSize: 11, fontWeight: 700, cursor: working === r.id ? "wait" : "pointer",
                }}>Mark fulfilled</button>
                <button disabled={working === r.id} onClick={() => cancel(r.id)} style={{
                  background: "transparent", border: "1px solid #334155", borderRadius: 6, padding: "7px 10px",
                  color: "#94a3b8", fontSize: 11, fontWeight: 600, cursor: working === r.id ? "wait" : "pointer",
                }}>Cancel</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Inventory panel ────────────────────────────────────────────────────────

function InventoryPanel({ inventory, brand, onRefresh }: { inventory: Inventory | null; brand: Membership; onRefresh: () => void }) {
  const stats = inventory?.stats || { total: 0, printed: 0, scanned: 0, outstanding: 0 };
  const scanRate = stats.printed > 0 ? Math.round((stats.scanned / stats.printed) * 100) : 0;
  const recentScans = (inventory?.tokens || [])
    .filter((t) => t.used && t.used_at)
    .sort((a, b) => new Date(b.used_at!).getTime() - new Date(a.used_at!).getTime())
    .slice(0, 5);

  const cells = [
    { label: "Printed", value: stats.printed, suffix: "", color: "#6366f1" },
    { label: "Scanned", value: stats.scanned, suffix: "", color: "#10b981" },
    { label: "Outstanding", value: stats.outstanding, suffix: "", color: "#f59e0b" },
    { label: "Scan rate", value: scanRate, suffix: "%", color: brand.brand_color },
  ];

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const ago = (Date.now() - d.getTime()) / 1000;
    if (ago < 60) return "just now";
    if (ago < 3600) return `${Math.floor(ago / 60)}m ago`;
    if (ago < 86400) return `${Math.floor(ago / 3600)}h ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  return (
    <div style={{ background: "#0f1421", border: "1px solid #1f2937", borderRadius: 10, padding: 18, marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>Code Inventory</div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>QR codes generated for {brand.brand_name}</div>
        </div>
        <button onClick={onRefresh} style={{ background: "transparent", border: "1px solid #334155", borderRadius: 6, padding: "5px 10px", color: "#94a3b8", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Refresh</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 14 }}>
        {cells.map((c) => (
          <div key={c.label} style={{ background: "#0a0e1a", border: "1px solid #1f2937", borderRadius: 8, padding: 12, textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: c.color }}>{c.value.toLocaleString()}{c.suffix}</div>
            <div style={{ fontSize: 9, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginTop: 2 }}>{c.label}</div>
          </div>
        ))}
      </div>
      <div style={{ background: "#0a0e1a", border: "1px solid #1f2937", borderRadius: 8, padding: 12 }}>
        <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 700, marginBottom: 10 }}>Recent scans</div>
        {recentScans.length === 0 ? (
          <div style={{ fontSize: 11, color: "#64748b", padding: "10px 4px", textAlign: "center" }}>No codes scanned yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {recentScans.map((s) => (
              <div key={s.token_uuid} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 8px", background: "#0f1421", borderRadius: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <div style={{ width: 18, height: 18, borderRadius: 4, background: "rgba(16,185,129,0.15)", color: "#10b981", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                  </div>
                  <span style={{ fontSize: 11, fontFamily: "monospace", color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.used_by_address ? `${s.used_by_address.slice(0, 8)}…${s.used_by_address.slice(-6)}` : "anonymous"}
                  </span>
                  <span style={{ fontSize: 10, color: "#64748b" }}>{s.used_at ? formatTime(s.used_at) : ""}</span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#10b981" }}>+{s.points_value}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Report export card ─────────────────────────────────────────────────────

function ReportExportCard({ brandId, refreshTrigger = 0 }: { brandId: string, refreshTrigger?: number }) {
  const [campaigns, setCampaigns] = useState<string[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/brand/${brandId}/campaigns`, { credentials: "include", headers: authHeaders() })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.campaigns) {
          setCampaigns(data.campaigns);
        }
      })
      .catch(err => console.error("Failed to load campaigns", err))
      .finally(() => setLoading(false));
  }, [brandId, refreshTrigger]);

  const downloadPDF = () => {
    const urlParams = selectedCampaign ? `?campaign=${encodeURIComponent(selectedCampaign)}` : '';
    fetch(`/api/brand/${brandId}/report.pdf${urlParams}`, { credentials: "include", headers: authHeaders() })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `SuiLoyalty-${selectedCampaign || 'All'}-Campaign-Report-${new Date().toISOString().slice(0, 10)}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      });
  };

  const downloadCSV = () => {
    const urlParams = selectedCampaign ? `?campaign=${encodeURIComponent(selectedCampaign)}` : '';
    fetch(`/api/brand/${brandId}/report.csv${urlParams}`, { credentials: "include", headers: authHeaders() })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `SuiLoyalty-${selectedCampaign || 'All'}-Campaign-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      });
  };
  return (
    <div style={{ background: "#0f1421", border: "1px solid #1f2937", borderRadius: 10, padding: 18, marginBottom: 24 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>Campaign Report</div>
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 14 }}>
        Printable summary of every QR code issued, scanned, and redeemed.
      </div>
      
      <div style={{ marginBottom: 14 }}>
        <select
          value={selectedCampaign}
          onChange={(e) => setSelectedCampaign(e.target.value)}
          disabled={loading || campaigns.length === 0}
          style={{ width: "100%", padding: "8px 12px", background: "#0a0e1a", border: "1px solid #1f2937", borderRadius: 6, color: (loading || campaigns.length === 0) ? "#475569" : "#e2e8f0", fontSize: 13, outline: "none", cursor: (loading || campaigns.length === 0) ? "not-allowed" : "pointer" }}
        >
          <option value="">{loading ? "Loading Campaigns..." : (campaigns.length === 0 ? "No campaigns yet" : "All Campaigns")}</option>
          {campaigns.map(c => (
            <option key={c || 'null'} value={c || ''}>{c || 'Unnamed Campaign'}</option>
          ))}
        </select>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={downloadPDF} style={{
          flex: 1, padding: "10px 16px", background: "#6366f1",
          border: "none", borderRadius: 8, color: "#ffffff",
          fontSize: 13, fontWeight: 600, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
          Download PDF report
        </button>
        <button onClick={downloadCSV} style={{
          padding: "10px 14px", background: "transparent",
          border: "1px solid #334155", borderRadius: 8, color: "#94a3b8",
          fontSize: 12, fontWeight: 600, cursor: "pointer",
        }}>
          Export CSV
        </button>
      </div>
    </div>
  );
}

// ─── QR generation card (tightened version of original) ────────────────────

function QRGenerationCard({ brand, qrLoaded, onGenerated, showToast }: {
  brand: Membership; qrLoaded: boolean; onGenerated: () => void; showToast: (m: string, t?: "success" | "error") => void;
}) {
  const [quantity, setQuantity] = useState(5);
  const [pointsPerScan, setPointsPerScan] = useState(10);
  const [campaignName, setCampaignName] = useState("General Campaign");
  const [expiryDays, setExpiryDays] = useState(0); // 0 = Never
  const [tokens, setTokens] = useState<QRToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  async function generateBatch() {
    setLoading(true);
    setTokens([]);
    setProgress(0);

    await fetch(`/api/qr/clear-unprinted`, {
      method: "POST", headers: authHeaders(brand.brand_id),
      body: JSON.stringify({ brand_id: brand.brand_id }),
    });

    const results: QRToken[] = [];
    for (let i = 0; i < quantity; i++) {
      const res = await fetch(`/api/qr/generate`, {
        method: "POST", headers: authHeaders(brand.brand_id),
        body: JSON.stringify({ 
          brand_id: brand.brand_id, 
          points_value: pointsPerScan, 
          campaign_name: campaignName,
          expires_in_days: expiryDays > 0 ? expiryDays : null
        }),
      });
      const data = await res.json();
      if (data.success) results.push({ token_uuid: data.token.token_uuid });
      setProgress(Math.round(((i + 1) / quantity) * 100));
    }

    if (qrLoaded) {
      const QRCode = (window as unknown as { QRCode: any }).QRCode;
      for (const token of results) {
        const div = document.createElement("div");
        new QRCode(div, { text: token.token_uuid, width: 200, height: 200, colorDark: "#000000", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.L });
        await new Promise((r) => setTimeout(r, 80));
        const original = div.querySelector("canvas") as HTMLCanvasElement;
        if (original) {
          const padded = document.createElement("canvas");
          const padding = 20;
          padded.width = original.width + padding * 2;
          padded.height = original.height + padding * 2;
          const ctx = padded.getContext("2d");
          if (ctx) {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, padded.width, padded.height);
            ctx.drawImage(original, padding, padding);
            token.dataUrl = padded.toDataURL("image/png");
          }
        }
      }
    }

    setTokens(results);
    setLoading(false);
    onGenerated();
    showToast(`${results.length} QR codes generated.`, "success");
  }

  async function downloadAll() {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    tokens.forEach((token, i) => {
      if (!token.dataUrl) return;
      const base64 = token.dataUrl.split(",")[1];
      zip.file(`${brand.brand_name}_qr_${i + 1}.png`, base64, { base64: true });
    });
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${brand.brand_name}_QR_Codes.zip`;
    a.click();
    URL.revokeObjectURL(url);
    await fetch(`/api/qr/mark-printed`, {
      method: "POST", headers: authHeaders(brand.brand_id),
      body: JSON.stringify({ token_uuids: tokens.map((t) => t.token_uuid) }),
    });
    setTokens([]);
    onGenerated();
    showToast("Codes saved as ZIP and marked as printed.", "success");
  }

  async function saveOne(token: QRToken, index: number) {
    if (!token.dataUrl) return;
    const a = document.createElement("a");
    a.href = token.dataUrl;
    a.download = `${brand.brand_name}_qr_${index + 1}.png`;
    a.click();
    await fetch(`/api/qr/mark-printed`, {
      method: "POST", headers: authHeaders(brand.brand_id),
      body: JSON.stringify({ token_uuids: [token.token_uuid] }),
    });
    onGenerated();
    showToast(`Code ${index + 1} saved and marked as printed.`, "success");
  }

  return (
    <div style={{ background: "#0f1421", border: "1px solid #1f2937", borderRadius: 10, padding: 18, marginBottom: 24 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>Generate QR Codes</div>
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 18 }}>
        Create one-time scannable codes for product packaging or scratch cards.
      </div>

      <div className="merchant-split-grid" style={{ marginBottom: 12, gap: 12 }}>
        <div style={{ background: "#0a0e1a", border: "1px solid #1f2937", borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 6 }}>Campaign Name</div>
          <input type="text" value={campaignName} onChange={(e) => setCampaignName(e.target.value)}
            placeholder="e.g. Summer Promo 2026"
            style={{ width: "100%", background: "none", border: "none", color: "#e2e8f0", fontSize: 13, outline: "none" }} />
        </div>
        <div style={{ background: "#0a0e1a", border: "1px solid #1f2937", borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 6 }}>QR Expiry</div>
          <select 
            value={expiryDays} 
            onChange={(e) => setExpiryDays(Number(e.target.value))}
            style={{ width: "100%", background: "none", border: "none", color: "#e2e8f0", fontSize: 13, outline: "none", cursor: "pointer" }}
          >
            <option value={0} style={{ background: "#0f1421" }}>Never Expires</option>
            <option value={7} style={{ background: "#0f1421" }}>7 Days</option>
            <option value={30} style={{ background: "#0f1421" }}>30 Days</option>
            <option value={90} style={{ background: "#0f1421" }}>90 Days</option>
            <option value={365} style={{ background: "#0f1421" }}>1 Year</option>
          </select>
        </div>
      </div>

      <div className="merchant-split-grid" style={{ marginBottom: 14, gap: 12 }}>
        {[
          { label: "Number of codes", value: quantity, min: 1, max: 50, set: setQuantity },
          { label: "Points per scan", value: pointsPerScan, min: 1, max: 1000, set: setPointsPerScan },
        ].map(({ label, value, min, max, set }) => (
          <div key={label} style={{ background: "#0a0e1a", border: "1px solid #1f2937", borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 6 }}>{label}</div>
            <input type="number" min={min} max={max} value={value}
              onChange={(e) => set(Number(e.target.value))}
              style={{ width: "100%", background: "transparent", border: "none", color: brand.brand_color, fontSize: 22, fontWeight: 700, outline: "none" }}
            />
          </div>
        ))}
      </div>

      <button disabled={loading} onClick={generateBatch} style={{
        width: "100%", padding: 12, background: loading ? "#1f2937" : brand.brand_color,
        border: "none", borderRadius: 8, color: "#ffffff",
        fontSize: 13, fontWeight: 700, cursor: loading ? "wait" : "pointer",
        marginBottom: 8,
      }}>
        {loading ? `Generating… ${progress}%` : `Generate ${quantity} QR Codes`}
      </button>

      {loading && (
        <div style={{ height: 3, background: "#1f2937", borderRadius: 3, overflow: "hidden", marginBottom: 8 }}>
          <div style={{ height: "100%", width: `${progress}%`, background: brand.brand_color, transition: "width 0.3s" }} />
        </div>
      )}

      {tokens.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>{tokens.length} codes ready</div>
            <button onClick={downloadAll} style={{
              padding: "7px 14px", background: brand.brand_color,
              border: "none", borderRadius: 6, color: "#ffffff",
              fontSize: 11, fontWeight: 700, cursor: "pointer",
            }}>Download all (ZIP)</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {tokens.map((token, i) => (
              <div key={token.token_uuid} style={{ background: "#0a0e1a", border: "1px solid #1f2937", borderRadius: 8, padding: 8, textAlign: "center" }}>
                {token.dataUrl ? (
                  <img src={token.dataUrl} alt={`QR ${i + 1}`} style={{ width: "100%", borderRadius: 4 }} />
                ) : (
                  <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", fontSize: 10 }}>…</div>
                )}
                <button onClick={() => saveOne(token, i)} style={{
                  marginTop: 6, fontSize: 10, color: brand.brand_color, background: "transparent",
                  border: `1px solid ${brand.brand_color}40`, borderRadius: 4, padding: "3px 8px",
                  fontWeight: 600, cursor: "pointer",
                }}>↓ Save</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Logo + Google icon ─────────────────────────────────────────────────────

function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56">
      <defs><linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#6366f1" /><stop offset="100%" stopColor="#06b6d4" /></linearGradient></defs>
      <polygon points="28,4 52,18 52,38 28,52 4,38 4,18" fill="none" stroke="url(#logo-grad)" strokeWidth="3" />
      <circle cx="28" cy="28" r="8" fill="url(#logo-grad)" opacity="0.3" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 8 3l5.7-5.7C33.7 6.1 29.1 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3 0 5.8 1.1 8 3l5.7-5.7C33.7 6.1 29.1 4 24 4c-7.6 0-14.2 4.3-17.7 10.7z" />
      <path fill="#4CAF50" d="M24 44c5 0 9.6-1.9 13.1-5l-6.1-5.1c-2 1.4-4.4 2.1-7 2.1-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.7 39.6 16.3 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.1 5.1c-.4.4 6.7-4.9 6.7-14.7 0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function Merchant() {
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [activeBrand, setActiveBrand] = useState<Membership | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [qrLoaded, setQrLoaded] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  // QR library
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
    script.onload = () => setQrLoaded(true);
    document.head.appendChild(script);
  }, []);

  // Auth bootstrap: check existing session, then handle OAuth ?code= callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    if (code) {
      // Exchange code for session via backend
      window.history.replaceState({}, "", "/merchant");
      setAuthLoading(true);
      fetch("/api/auth/callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code }),
      })
        .then(async (r) => {
          const data = await r.json();
          if (data.success) {
            await loadMemberships();
          } else {
            setAuthError(data.error || "Sign-in failed.");
            setAuthState("signin");
          }
        })
        .catch((e) => { setAuthError(`Network error: ${e.message}`); setAuthState("signin"); })
        .finally(() => setAuthLoading(false));
      return;
    }

    // No code — check if we already have a valid session
    fetch("/api/auth/session", { credentials: "include" })
      .then(async (r) => {
        const data = await r.json();
        if (data.authenticated) {
          await loadMemberships();
        } else {
          setAuthState("signin");
        }
      })
      .catch(() => setAuthState("signin"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadMemberships() {
    setAuthState("loading");
    try {
      const res = await fetch("/api/brand/memberships", { credentials: "include" });
      const data = await res.json();
      if (res.status === 401) { setAuthState("signin"); return; }
      if (!data.success) throw new Error(data.error || "Failed to load memberships");
      const list: Membership[] = data.memberships || [];
      setMemberships(list);
      if (list.length === 0) { setAuthState("no_access"); return; }
      const stored = sessionStorage.getItem("selected_brand_id");
      const matching = stored ? list.find((m) => m.brand_id === stored) : null;
      if (matching) {
        setActiveBrand(matching);
        setAuthState("dashboard");
      } else if (list.length === 1) {
        sessionStorage.setItem("selected_brand_id", list[0].brand_id);
        setActiveBrand(list[0]);
        setAuthState("dashboard");
      } else {
        setAuthState("brand_picker");
      }
    } catch (err: any) {
      setAuthError(err.message || "Could not load brand memberships");
      setAuthState("signin");
    }
  }

  async function handleSignIn() {
    setAuthLoading(true);
    setAuthError("");
    try {
      const res = await fetch("/api/auth/zklogin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnUrl: window.location.origin + "/merchant" }),
      });
      const data = await res.json();
      if (data.authUrl) {
        localStorage.setItem("zklogin_ephemeral", JSON.stringify({
          ephemeralPublicKey: data.ephemeralPublicKey,
          maxEpoch: data.maxEpoch,
          randomness: data.randomness,
        }));
        window.location.href = data.authUrl;
      } else {
        setAuthError("Could not start sign-in. Is the backend running?");
        setAuthLoading(false);
      }
    } catch (e: any) {
      setAuthError(`Cannot connect to backend: ${e.message}`);
      setAuthLoading(false);
    }
  }

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    sessionStorage.removeItem("selected_brand_id");
    setActiveBrand(null);
    setMemberships([]);
    setSummary(null);
    setInventory(null);
    setAuthState("signin");
  }

  function handleSelectBrand(m: Membership) {
    sessionStorage.setItem("selected_brand_id", m.brand_id);
    setActiveBrand(m);
    setAuthState("dashboard");
  }

  function handleSwitchBrand() {
    sessionStorage.removeItem("selected_brand_id");
    setActiveBrand(null);
    setAuthState("brand_picker");
  }

  // Summary + inventory loaders
  const refreshSummary = useCallback(async () => {
    if (!activeBrand) return;
    try {
      const res = await fetch(`/api/brand/${activeBrand.brand_id}/summary`, { credentials: "include", headers: authHeaders() });
      const data = await res.json();
      if (data.success) setSummary(data.summary);
    } catch { /* silent */ }
  }, [activeBrand]);

  const refreshInventory = useCallback(async () => {
    if (!activeBrand) return;
    try {
      const res = await fetch(`/api/qr/brand/${activeBrand.brand_id}`, { credentials: "include", headers: authHeaders() });
      const data = await res.json();
      if (data.success) setInventory({ tokens: data.tokens, stats: data.stats });
    } catch { /* silent */ }
  }, [activeBrand]);

  useEffect(() => {
    if (authState !== "dashboard") return;
    refreshSummary();
    refreshInventory();
    const interval = setInterval(() => { refreshSummary(); refreshInventory(); }, 15000);
    return () => clearInterval(interval);
  }, [authState, refreshSummary, refreshInventory]);

  // ── Render by state ──────────────────────────────────────────────────────

  if (authState === "loading") {
    return (
      <main style={{ minHeight: "100vh", background: "#0a0e1a", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#64748b", fontSize: 13 }}>Loading…</div>
      </main>
    );
  }

  if (authState === "signin") {
    return (
      <main style={{ minHeight: "100vh", background: "#0a0e1a", color: "#e2e8f0" }}>
        <SignInScreen loading={authLoading} error={authError} onSignIn={handleSignIn} />
        <ToastContainer toasts={toasts} onDismiss={(id) => setToasts((p) => p.filter((t) => t.id !== id))} />
      </main>
    );
  }

  if (authState === "no_access") {
    return (
      <main style={{ minHeight: "100vh", background: "#0a0e1a", color: "#e2e8f0" }}>
        <NoAccessScreen onSignOut={handleSignOut} onBrandCreated={() => loadMemberships()} />
      </main>
    );
  }

  if (authState === "brand_picker") {
    return (
      <main style={{ minHeight: "100vh", background: "#0a0e1a", color: "#e2e8f0" }}>
        <BrandPickerScreen memberships={memberships} onSelect={handleSelectBrand} onSignOut={handleSignOut} onBrandCreated={() => loadMemberships()} />
      </main>
    );
  }

  // dashboard
  if (!activeBrand) return null;

  return (
    <main style={{ minHeight: "100vh", background: "#0a0e1a", color: "#e2e8f0" }}>
      <DashboardHeader brand={activeBrand} role={activeBrand.role} onSignOut={handleSignOut} onSwitchBrand={handleSwitchBrand} hasMultiple={memberships.length > 1} onBrandEdited={() => loadMemberships()} />

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px" }}>
        <SummaryTiles summary={summary} brand={activeBrand} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 0 }}>
          <PendingRedemptionsPanel brandId={activeBrand.brand_id} onChange={refreshSummary} showToast={showToast} />

          <div className="merchant-split-grid">
            <QRGenerationCard brand={activeBrand} qrLoaded={qrLoaded} onGenerated={refreshInventory} showToast={showToast} />
            <InventoryPanel inventory={inventory} brand={activeBrand} onRefresh={refreshInventory} />
          </div>

          <ReportExportCard brandId={activeBrand.brand_id} refreshTrigger={inventory?.stats?.total_codes || 0} />
        </div>
      </div>

      <ToastContainer toasts={toasts} onDismiss={(id) => setToasts((p) => p.filter((t) => t.id !== id))} />
    </main>
  );
}
