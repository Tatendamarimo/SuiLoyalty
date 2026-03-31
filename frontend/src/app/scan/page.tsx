"use client";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, Suspense } from "react";

function ScanContent() {
  const params = useSearchParams();
  const address = params.get("address") || "";
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"scanning" | "success" | "error" | "idle">("idle");
  const [message, setMessage] = useState("");
  const [points, setPoints] = useState(0);
  const [cameraOn, setCameraOn] = useState(false);
  const scanningRef = useRef(false);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setCameraOn(true);
        scanningRef.current = true;
        scanFrame();
      }
    } catch {
      setStatus("error");
      setMessage("Camera access denied. Please allow camera permission.");
    }
  }

  function stopCamera() {
    scanningRef.current = false;
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    setCameraOn(false);
  }

  async function scanFrame() {
    if (!scanningRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== 4) {
      requestAnimationFrame(scanFrame);
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const jsQR = (await import("jsqr")).default;
    const code = jsQR(imageData.data, imageData.width, imageData.height);

    if (code) {
      scanningRef.current = false;
      stopCamera();
      await validateToken(code.data);
    } else {
      requestAnimationFrame(scanFrame);
    }
  }

  async function validateToken(qrData: string) {
    setStatus("scanning");
    setMessage("Validating QR code...");
    try {
      let token_uuid = qrData;
      try {
        const parsed = JSON.parse(qrData);
        token_uuid = parsed.token_uuid || parsed.token || qrData;
      } catch { }

      const res = await fetch("http://localhost:3000/api/qr/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token_uuid, user_id: address }),
      });
      const data = await res.json();

      if (data.success) {
        setStatus("success");
        setPoints(data.token?.points_value || 10);
        setMessage("Points earned! Your NFT is updating on-chain.");
      } else {
        setStatus("error");
        setMessage(data.error || "Invalid or already used QR code.");
      }
    } catch {
      setStatus("error");
      setMessage("Network error. Check your connection.");
    }
  }

  useEffect(() => { return () => stopCamera(); }, []);

  return (
    <main style={{ minHeight: "100vh", background: "#0a0e1a", padding: "24px 16px" }}>
      <div style={{ maxWidth: "440px", margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "32px" }}>
          <button onClick={() => window.location.href = `/dashboard?address=${address}`}
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", padding: "8px 12px", color: "#e2e8f0", cursor: "pointer", fontSize: "13px" }}>
            ← Back
          </button>
          <div style={{ fontWeight: "700", fontSize: "18px", color: "#e2e8f0" }}>Scan QR Code</div>
        </div>

        {/* Scanner box */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: "20px", overflow: "hidden", marginBottom: "20px", position: "relative", aspectRatio: "1" }}>
          
          {!cameraOn && status === "idle" && (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px" }}>
              <div style={{ width: "64px", height: "64px", borderRadius: "16px", background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.5">
                  <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                  <rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z"/>
                </svg>
              </div>
              <p style={{ color: "#64748b", fontSize: "14px", textAlign: "center" }}>Point your camera at a SuiLoyalty QR code</p>
            </div>
          )}

          <video ref={videoRef} style={{ width: "100%", height: "100%", objectFit: "cover", display: cameraOn ? "block" : "none" }} playsInline muted />
          <canvas ref={canvasRef} style={{ display: "none" }} />

          {/* Scanner overlay */}
          {cameraOn && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
              <div style={{ width: "200px", height: "200px", border: "2px solid rgba(99,102,241,0.6)", borderRadius: "12px", boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)" }}>
                <div style={{ position: "absolute", top: 0, left: 0, width: "20px", height: "20px", borderTop: "3px solid #6366f1", borderLeft: "3px solid #6366f1", borderRadius: "4px 0 0 0" }} />
                <div style={{ position: "absolute", top: 0, right: 0, width: "20px", height: "20px", borderTop: "3px solid #6366f1", borderRight: "3px solid #6366f1", borderRadius: "0 4px 0 0" }} />
                <div style={{ position: "absolute", bottom: 0, left: 0, width: "20px", height: "20px", borderBottom: "3px solid #6366f1", borderLeft: "3px solid #6366f1", borderRadius: "0 0 0 4px" }} />
                <div style={{ position: "absolute", bottom: 0, right: 0, width: "20px", height: "20px", borderBottom: "3px solid #6366f1", borderRight: "3px solid #6366f1", borderRadius: "0 0 4px 0" }} />
              </div>
            </div>
          )}

          {/* Success/Error overlay */}
          {(status === "success" || status === "error") && (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: status === "success" ? "rgba(6,182,212,0.1)" : "rgba(239,68,68,0.1)", gap: "12px" }}>
              <div style={{ fontSize: "48px" }}>{status === "success" ? "✓" : "✗"}</div>
              <div style={{ fontSize: "14px", color: status === "success" ? "#06b6d4" : "#f87171", textAlign: "center", padding: "0 24px" }}>{message}</div>
              {status === "success" && (
                <div style={{ fontSize: "24px", fontWeight: "700", background: "linear-gradient(135deg, #6366f1, #06b6d4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>+{points} pts</div>
              )}
            </div>
          )}

          {status === "scanning" && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)" }}>
              <div style={{ color: "#6366f1", fontSize: "14px" }}>{message}</div>
            </div>
          )}
        </div>

        {/* Action button */}
        {status === "idle" || status === "error" ? (
          <button onClick={cameraOn ? stopCamera : startCamera}
            style={{ width: "100%", padding: "16px", background: cameraOn ? "rgba(239,68,68,0.2)" : "linear-gradient(135deg, #6366f1, #06b6d4)", border: cameraOn ? "1px solid rgba(239,68,68,0.4)" : "none", borderRadius: "12px", color: "white", fontSize: "15px", fontWeight: "600", cursor: "pointer" }}>
            {cameraOn ? "Stop Camera" : "Start Camera"}
          </button>
        ) : status === "success" ? (
          <div style={{ display: "flex", gap: "10px" }}>
            <button onClick={() => { setStatus("idle"); setMessage(""); }}
              style={{ flex: 1, padding: "16px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", color: "#e2e8f0", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>
              Scan Another
            </button>
            <button onClick={() => window.location.href = `/dashboard?address=${address}`}
              style={{ flex: 1, padding: "16px", background: "linear-gradient(135deg, #6366f1, #06b6d4)", border: "none", borderRadius: "12px", color: "white", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>
              View Card
            </button>
          </div>
        ) : null}

      </div>
    </main>
  );
}

export default function Scan() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#0a0e1a" }} />}>
      <ScanContent />
    </Suspense>
  );
}
