"use client";
import { useEffect, useState, useRef, useCallback } from "react";

type Brand = { id: string; name: string; category: string; color: string; };
type QRToken = { token_uuid: string; dataUrl?: string; };
type Toast = { id: number; message: string; type: "success" | "error" };

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div style={{ position: "fixed", bottom: "24px", right: "24px", zIndex: 9999, display: "flex", flexDirection: "column", gap: "10px", pointerEvents: "none" }}>
      <style>{`@keyframes toastIn { from { opacity:0; transform:translateY(20px) scale(0.95); } to { opacity:1; transform:translateY(0) scale(1); } }`}</style>
      {toasts.map((t) => (
        <div key={t.id} onClick={() => onDismiss(t.id)} style={{
          pointerEvents: "all", animation: "toastIn 0.35s cubic-bezier(0.4,0,0.2,1) both",
          background: t.type === "success" ? "linear-gradient(135deg,rgba(16,185,129,0.15),rgba(16,185,129,0.05))" : "linear-gradient(135deg,rgba(239,68,68,0.15),rgba(239,68,68,0.05))",
          backdropFilter: "blur(20px)", border: `1px solid ${t.type === "success" ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.4)"}`,
          borderRadius: "14px", padding: "14px 18px", color: t.type === "success" ? "#6ee7b7" : "#fca5a5",
          fontSize: "14px", fontWeight: "600", maxWidth: "340px", cursor: "pointer",
          boxShadow: t.type === "success" ? "0 8px 32px rgba(16,185,129,0.2)" : "0 8px 32px rgba(239,68,68,0.2)",
          display: "flex", alignItems: "center", gap: "10px",
        }}>
          <span style={{ fontSize: "18px" }}>{t.type === "success" ? "✓" : "✕"}</span>
          {t.message}
        </div>
      ))}
    </div>
  );
}

export default function Merchant() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [quantity, setQuantity] = useState(5);
  const [pointsPerScan, setPointsPerScan] = useState(10);
  const [tokens, setTokens] = useState<QRToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [qrLoaded, setQrLoaded] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  useEffect(() => {
    fetch(`/api/brands`).then(r => r.json()).then(data => setBrands(data.brands || []));
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
    script.onload = () => setQrLoaded(true);
    document.head.appendChild(script);
  }, []);

  async function generateBatch() {
    if (!selectedBrand) return;
    setLoading(true);
    setTokens([]);
    setProgress(0);

    await fetch(`/api/qr/clear-unprinted`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand_id: selectedBrand.id }),
    });

    const results: QRToken[] = [];
    for (let i = 0; i < quantity; i++) {
      const res = await fetch(`/api/qr/generate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_id: selectedBrand.id, points_value: pointsPerScan }),
      });
      const data = await res.json();
      if (data.success) results.push({ token_uuid: data.token.token_uuid });
      setProgress(Math.round(((i + 1) / quantity) * 100));
    }

    if (qrLoaded) {
      const QRCode = (window as any).QRCode;
      for (const token of results) {
        const div = document.createElement("div");
        new QRCode(div, { text: token.token_uuid, width: 200, height: 200, colorDark: "#000000", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.L });
        await new Promise(r => setTimeout(r, 100));
        const originalCanvas = div.querySelector("canvas") as HTMLCanvasElement;
        if (originalCanvas) {
          const paddedCanvas = document.createElement("canvas");
          const padding = 20;
          paddedCanvas.width = originalCanvas.width + padding * 2;
          paddedCanvas.height = originalCanvas.height + padding * 2;
          const ctx = paddedCanvas.getContext("2d");
          if (ctx) {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, paddedCanvas.width, paddedCanvas.height);
            ctx.drawImage(originalCanvas, padding, padding);
            token.dataUrl = paddedCanvas.toDataURL("image/png");
          }
        }
      }
    }

    setTokens(results);
    setLoading(false);
    showToast(`${results.length} QR codes generated for ${selectedBrand.name}!`, "success");
  }

  async function downloadAll() {
    tokens.forEach((token, i) => {
      if (!token.dataUrl) return;
      const a = document.createElement("a");
      a.href = token.dataUrl;
      a.download = `${selectedBrand?.name}_qr_${i + 1}.png`;
      a.click();
    });
    await fetch(`/api/qr/mark-printed`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token_uuids: tokens.map(t => t.token_uuid) }),
    });
    setTokens([]);
    showToast("All codes downloaded and marked as printed.", "success");
  }

  const color = selectedBrand?.color || "#6366f1";

  return (
    <main style={{ minHeight: "100vh", background: "#0a0e1a", padding: "0" }}>
      <style>{`
        @keyframes slideInUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.7; transform:scale(1.2); } }
        @keyframes shimmer { 0% { transform:translateX(-100%); } 100% { transform:translateX(100%); } }
        @keyframes progressFill { from { width: 0%; } }
        .brand-btn { transition: all 0.25s cubic-bezier(0.4,0,0.2,1); }
        .brand-btn:hover { transform: translateY(-2px); }
        .gen-btn { transition: all 0.3s cubic-bezier(0.4,0,0.2,1); }
        .gen-btn:not(:disabled):hover { transform: translateY(-2px); box-shadow: 0 16px 48px rgba(99,102,241,0.45) !important; }
        .gen-btn:not(:disabled):active { transform: translateY(0) scale(0.98); }
        .qr-card { transition: all 0.25s ease; }
        .qr-card:hover { transform: translateY(-3px); }
        input[type=number]::-webkit-inner-spin-button { opacity: 0.4; }
      `}</style>

      {/* Fixed ambient glows */}
      <div style={{ position: "fixed", top: "10%", left: "10%", width: "300px", height: "300px", borderRadius: "50%", background: "rgba(99,102,241,0.07)", filter: "blur(80px)", pointerEvents: "none" }} />
      <div style={{ position: "fixed", bottom: "15%", right: "10%", width: "250px", height: "250px", borderRadius: "50%", background: "rgba(6,182,212,0.05)", filter: "blur(80px)", pointerEvents: "none" }} />

      <div style={{ maxWidth: "680px", margin: "0 auto", padding: "24px 16px" }}>

        {/* Nav */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "40px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <svg width="32" height="32" viewBox="0 0 56 56" style={{ filter: "drop-shadow(0 2px 8px rgba(99,102,241,0.4))" }}>
              <defs><linearGradient id="mg1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#6366f1"/><stop offset="50%" stopColor="#8b5cf6"/><stop offset="100%" stopColor="#06b6d4"/></linearGradient></defs>
              <polygon points="28,4 52,18 52,38 28,52 4,38 4,18" fill="none" stroke="url(#mg1)" strokeWidth="3"/>
              <circle cx="28" cy="28" r="8" fill="url(#mg1)" opacity="0.3"/>
            </svg>
            <span style={{ fontWeight: "800", fontSize: "18px", background: "linear-gradient(135deg,#6366f1,#8b5cf6,#06b6d4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>SuiLoyalty</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "linear-gradient(135deg,rgba(245,158,11,0.1),rgba(245,158,11,0.05))", border: "1px solid rgba(245,158,11,0.3)", borderRadius: "24px", padding: "6px 12px" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2"/></svg>
            <span style={{ fontSize: "11px", color: "#fcd34d", fontWeight: "600" }}>Merchant Terminal</span>
          </div>
        </div>

        {/* Title */}
        <div style={{ marginBottom: "32px", animation: "slideInUp 0.4s ease both" }}>
          <div style={{ fontSize: "28px", fontWeight: "800", background: "linear-gradient(135deg,#e2e8f0,#94a3b8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: "6px" }}>Generate QR Codes</div>
          <div style={{ fontSize: "13px", color: "#64748b" }}>Create one-time scannable codes for product packaging or scratch cards</div>
        </div>

        {/* Brand Selector */}
        <div style={{ marginBottom: "24px", animation: "slideInUp 0.4s ease 0.05s both" }}>
          <div style={{ fontSize: "11px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "14px", fontWeight: "700" }}>Select Brand</div>
          {brands.length === 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              {[1, 2, 3, 4].map(i => (
                <div key={i} style={{ height: "72px", borderRadius: "14px", background: "linear-gradient(90deg,rgba(255,255,255,0.03),rgba(255,255,255,0.06),rgba(255,255,255,0.03))", animation: "shimmer 1.5s infinite" }} />
              ))}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              {brands.map(brand => {
                const isSelected = selectedBrand?.id === brand.id;
                return (
                  <button key={brand.id} className="brand-btn" onClick={() => { setSelectedBrand(brand); setTokens([]); }} style={{
                    padding: "14px", background: isSelected ? `linear-gradient(135deg,${brand.color}20,${brand.color}08)` : "rgba(255,255,255,0.03)",
                    border: `1px solid ${isSelected ? brand.color + "80" : "rgba(255,255,255,0.08)"}`,
                    borderRadius: "14px", cursor: "pointer", textAlign: "left",
                    boxShadow: isSelected ? `0 8px 24px ${brand.color}25` : "none",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{ width: "32px", height: "32px", borderRadius: "9px", background: `${brand.color}25`, border: `1px solid ${brand.color}50`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <span style={{ fontSize: "14px", fontWeight: "800", color: brand.color }}>{brand.name[0]}</span>
                      </div>
                      <div>
                        <div style={{ fontSize: "13px", fontWeight: "700", color: "#e2e8f0" }}>{brand.name}</div>
                        <div style={{ fontSize: "11px", color: "#64748b" }}>{brand.category}</div>
                      </div>
                      {isSelected && <div style={{ marginLeft: "auto", width: "8px", height: "8px", borderRadius: "50%", background: brand.color, boxShadow: `0 0 10px ${brand.color}`, flexShrink: 0 }} />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Config inputs */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "24px", animation: "slideInUp 0.4s ease 0.1s both" }}>
          {[
            { label: "Number of codes", value: quantity, min: 1, max: 50, set: setQuantity, icon: "🎯" },
            { label: "Points per scan", value: pointsPerScan, min: 1, max: 1000, set: setPointsPerScan, icon: "⭐" },
          ].map(({ label, value, min, max, set, icon }) => (
            <div key={label} style={{ background: "linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))", border: `1px solid ${selectedBrand ? color + "30" : "rgba(255,255,255,0.08)"}`, borderRadius: "16px", padding: "18px", transition: "border-color 0.3s ease" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
                <span style={{ fontSize: "14px" }}>{icon}</span>
                <div style={{ fontSize: "11px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.6px", fontWeight: "600" }}>{label}</div>
              </div>
              <input type="number" min={min} max={max} value={value}
                onChange={e => set(Number(e.target.value))}
                style={{ width: "100%", background: "transparent", border: "none", color: selectedBrand ? color : "#e2e8f0", fontSize: "28px", fontWeight: "800", outline: "none", transition: "color 0.3s ease" }}
              />
            </div>
          ))}
        </div>

        {/* Generate button */}
        <button className="gen-btn" onClick={generateBatch} disabled={!selectedBrand || loading} style={{
          width: "100%", padding: "18px",
          background: !selectedBrand || loading ? "rgba(255,255,255,0.06)" : `linear-gradient(135deg, ${color}, #06b6d4)`,
          border: "none", borderRadius: "16px", color: "white", fontSize: "15px", fontWeight: "700",
          cursor: !selectedBrand || loading ? "not-allowed" : "pointer",
          marginBottom: "8px", position: "relative", overflow: "hidden",
          boxShadow: !selectedBrand || loading ? "none" : `0 8px 32px ${color}40`,
          animation: "slideInUp 0.4s ease 0.15s both",
        }}>
          {!loading && !selectedBrand && <span>Select a brand to continue</span>}
          {!loading && selectedBrand && (
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
              Generate {quantity} QR Codes for {selectedBrand.name}
            </span>
          )}
          {loading && <span>Generating... {progress}%</span>}
          {!loading && selectedBrand && (
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "linear-gradient(135deg,transparent,rgba(255,255,255,0.1),transparent)", animation: "shimmer 3s infinite", pointerEvents: "none" }} />
          )}
        </button>

        {/* Progress bar */}
        {loading && (
          <div style={{ marginBottom: "24px", height: "4px", background: "rgba(255,255,255,0.08)", borderRadius: "4px", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progress}%`, background: `linear-gradient(90deg,${color},#06b6d4)`, borderRadius: "4px", transition: "width 0.3s ease", boxShadow: `0 0 12px ${color}60` }} />
          </div>
        )}

        {/* Generated QR codes */}
        {tokens.length > 0 && (
          <div style={{ animation: "slideInUp 0.4s ease both" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", marginTop: "8px" }}>
              <div style={{ fontSize: "13px", color: "#e2e8f0", fontWeight: "700" }}>
                <span style={{ background: `linear-gradient(135deg,${color},#06b6d4)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{tokens.length} codes</span> ready for {selectedBrand?.name}
              </div>
              <button onClick={downloadAll} style={{
                padding: "9px 18px", background: `linear-gradient(135deg,${color}25,${color}10)`,
                border: `1px solid ${color}50`, borderRadius: "10px", color, fontSize: "12px", fontWeight: "700", cursor: "pointer",
                display: "flex", alignItems: "center", gap: "6px", transition: "all 0.2s",
              }}
                onMouseEnter={e => e.currentTarget.style.background = `${color}35`}
                onMouseLeave={e => e.currentTarget.style.background = `linear-gradient(135deg,${color}25,${color}10)`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Download All
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "20px" }}>
              {tokens.map((token, i) => (
                <div key={token.token_uuid} className="qr-card" style={{
                  background: "linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))",
                  border: `1px solid ${color}30`, borderRadius: "14px", padding: "12px", textAlign: "center",
                  boxShadow: `0 4px 16px ${color}15`,
                }}>
                  {token.dataUrl ? (
                    <img src={token.dataUrl} alt={`QR ${i + 1}`} style={{ width: "100%", borderRadius: "8px" }} />
                  ) : (
                    <div style={{ height: "80px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <div style={{ width: "20px", height: "20px", borderRadius: "50%", border: `2px solid ${color}`, borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
                    </div>
                  )}
                  <div style={{ fontSize: "10px", color: "#64748b", marginTop: "8px", marginBottom: "6px", fontWeight: "600" }}>Code {i + 1}</div>
                  <a href={token.dataUrl} download={`${selectedBrand?.name}_qr_${i + 1}.png`}
                    style={{ fontSize: "11px", color, textDecoration: "none", fontWeight: "700", padding: "4px 10px", background: `${color}15`, borderRadius: "6px", display: "inline-block" }}>
                    ↓ Save
                  </a>
                </div>
              ))}
            </div>

            <div style={{ background: "linear-gradient(135deg,rgba(99,102,241,0.08),rgba(99,102,241,0.03))", border: "1px solid rgba(99,102,241,0.2)", borderRadius: "14px", padding: "16px 18px" }}>
              <div style={{ fontSize: "12px", color: "#818cf8", marginBottom: "6px", fontWeight: "700", display: "flex", alignItems: "center", gap: "6px" }}>
                <span>💡</span> How to use
              </div>
              <div style={{ fontSize: "12px", color: "#64748b", lineHeight: "1.7" }}>
                Print these QR codes on <strong style={{ color: "#94a3b8" }}>{selectedBrand?.name}</strong> product packaging or scratch cards.
                Each code can only be scanned once. Customers earn <strong style={{ color }}>{pointsPerScan} points</strong> per scan.
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <ToastContainer toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </main>
  );
}
