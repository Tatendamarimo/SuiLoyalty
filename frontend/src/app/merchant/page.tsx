"use client";
import { useEffect, useState, useRef } from "react";

type Brand = {
  id: string;
  name: string;
  category: string;
  color: string;
};

type QRToken = {
  token_uuid: string;
  dataUrl?: string;
};

export default function Merchant() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [quantity, setQuantity] = useState(5);
  const [pointsPerScan, setPointsPerScan] = useState(10);
  const [tokens, setTokens] = useState<QRToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [qrLoaded, setQrLoaded] = useState(false);

  useEffect(() => {
    fetch("http://localhost:3000/api/brands")
      .then(r => r.json())
      .then(data => setBrands(data.brands || []));

    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
    script.onload = () => setQrLoaded(true);
    document.head.appendChild(script);
  }, []);

  async function generateBatch() {
    if (!selectedBrand) return;
    setLoading(true);
    setTokens([]);

    const results: QRToken[] = [];
    for (let i = 0; i < quantity; i++) {
      const res = await fetch("http://localhost:3000/api/qr/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_id: selectedBrand.id }),
      });
      const data = await res.json();
      if (data.success) results.push({ token_uuid: data.token.token_uuid });
    }

    // Generate QR images
    if (qrLoaded) {
      const QRCode = (window as any).QRCode;
      for (const token of results) {
        const div = document.createElement("div");
        new QRCode(div, {
          text: token.token_uuid,
          width: 200,
          height: 200,
          colorDark: "#000000",
          colorLight: "#ffffff",
        });
        await new Promise(r => setTimeout(r, 100));
        const img = div.querySelector("img") as HTMLImageElement;
        if (img) token.dataUrl = img.src;
      }
    }

    setTokens(results);
    setLoading(false);
  }

  function downloadAll() {
    tokens.forEach((token, i) => {
      if (!token.dataUrl) return;
      const a = document.createElement("a");
      a.href = token.dataUrl;
      a.download = `${selectedBrand?.name}_qr_${i + 1}.png`;
      a.click();
    });
  }

  return (
    <main style={{ minHeight: "100vh", background: "#0a0e1a", padding: "24px 16px" }}>
      <div style={{ maxWidth: "640px", margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: "32px" }}>
          <div style={{ fontSize: "22px", fontWeight: "700", color: "#e2e8f0", marginBottom: "4px" }}>Merchant Terminal</div>
          <div style={{ fontSize: "13px", color: "#64748b" }}>Generate scratch QR codes for product packaging</div>
        </div>

        {/* Brand selector */}
        <div style={{ marginBottom: "20px" }}>
          <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "12px" }}>Select Brand</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            {brands.map(brand => (
              <button key={brand.id} onClick={() => setSelectedBrand(brand)} style={{
                padding: "14px",
                background: selectedBrand?.id === brand.id ? `${brand.color}22` : "rgba(255,255,255,0.03)",
                border: `1px solid ${selectedBrand?.id === brand.id ? brand.color : "rgba(255,255,255,0.08)"}`,
                borderRadius: "12px",
                cursor: "pointer",
                textAlign: "left",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ width: "28px", height: "28px", borderRadius: "8px", background: `${brand.color}33`, border: `1px solid ${brand.color}55`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: "12px", fontWeight: "800", color: brand.color }}>{brand.name[0]}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: "600", color: "#e2e8f0" }}>{brand.name}</div>
                    <div style={{ fontSize: "11px", color: "#64748b" }}>{brand.category}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Config */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px" }}>
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", padding: "16px" }}>
            <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "8px" }}>Number of codes</div>
            <input
              type="number" min={1} max={50} value={quantity}
              onChange={e => setQuantity(Number(e.target.value))}
              style={{ width: "100%", background: "transparent", border: "none", color: "#e2e8f0", fontSize: "24px", fontWeight: "700", outline: "none" }}
            />
          </div>
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", padding: "16px" }}>
            <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "8px" }}>Points per scan</div>
            <input
              type="number" min={1} max={1000} value={pointsPerScan}
              onChange={e => setPointsPerScan(Number(e.target.value))}
              style={{ width: "100%", background: "transparent", border: "none", color: "#e2e8f0", fontSize: "24px", fontWeight: "700", outline: "none" }}
            />
          </div>
        </div>

        {/* Generate button */}
        <button
          onClick={generateBatch}
          disabled={!selectedBrand || loading}
          style={{
            width: "100%", padding: "16px",
            background: !selectedBrand || loading ? "rgba(255,255,255,0.05)" : "linear-gradient(135deg, #6366f1, #06b6d4)",
            border: "none", borderRadius: "12px", color: "white", fontSize: "15px", fontWeight: "600",
            cursor: !selectedBrand || loading ? "not-allowed" : "pointer",
            marginBottom: "24px",
          }}
        >
          {loading ? `Generating ${quantity} codes...` : `Generate ${quantity} QR Codes for ${selectedBrand?.name || "..."}`}
        </button>

        {/* Generated QR codes */}
        {tokens.length > 0 && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div style={{ fontSize: "13px", color: "#e2e8f0", fontWeight: "600" }}>
                {tokens.length} codes generated for {selectedBrand?.name}
              </div>
              <button onClick={downloadAll} style={{
                padding: "8px 16px", background: `${selectedBrand?.color}22`,
                border: `1px solid ${selectedBrand?.color}55`, borderRadius: "8px",
                color: selectedBrand?.color, fontSize: "12px", fontWeight: "600", cursor: "pointer"
              }}>
                Download All
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
              {tokens.map((token, i) => (
                <div key={token.token_uuid} style={{
                  background: "rgba(255,255,255,0.03)",
                  border: `1px solid ${selectedBrand?.color}33`,
                  borderRadius: "12px", padding: "12px", textAlign: "center"
                }}>
                  {token.dataUrl ? (
                    <img src={token.dataUrl} alt={`QR ${i + 1}`} style={{ width: "100%", borderRadius: "8px" }} />
                  ) : (
                    <div style={{ height: "80px", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", fontSize: "12px" }}>Loading...</div>
                  )}
                  <div style={{ fontSize: "10px", color: "#64748b", marginTop: "8px" }}>Code {i + 1}</div>
                  <a href={token.dataUrl} download={`${selectedBrand?.name}_qr_${i + 1}.png`}
                    style={{ fontSize: "11px", color: selectedBrand?.color, textDecoration: "none" }}>
                    Download
                  </a>
                </div>
              ))}
            </div>

            <div style={{ marginTop: "16px", background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: "12px", padding: "14px 16px" }}>
              <div style={{ fontSize: "12px", color: "#6366f1", marginBottom: "4px", fontWeight: "600" }}>How to use</div>
              <div style={{ fontSize: "12px", color: "#64748b", lineHeight: "1.6" }}>
                Print these QR codes on {selectedBrand?.name} product packaging or scratch cards.
                Each code can only be scanned once. Customer earns {pointsPerScan} points per scan.
              </div>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
