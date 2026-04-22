"use client";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, Suspense } from "react";

function ScanContent() {
  const params = useSearchParams();
  const address = params.get("address") || localStorage.getItem("sui_address") || "";
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"scanning" | "success" | "error" | "idle">("idle");
  const [message, setMessage] = useState("");
  const [points, setPoints] = useState(0);
  const [cameraOn, setCameraOn] = useState(false);
  const scanningRef = useRef(false);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } } });
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
    if (!ctx) { requestAnimationFrame(scanFrame); return; }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const jsQR = (await import("jsqr")).default;
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "attemptBoth" });

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

      const res = await fetch(`/api/qr/validate`, {
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
    <main style={{ minHeight: "100vh", background: "#0a0e1a", padding: "24px 16px", position: "relative" }}>
      {/* Animated background blurs */}
      <div style={{ position: "fixed", top: "20%", left: "10%", width: "300px", height: "300px", borderRadius: "50%", background: "rgba(99,102,241,0.08)", filter: "blur(80px)", pointerEvents: "none" }} />
      <div style={{ position: "fixed", bottom: "30%", right: "10%", width: "250px", height: "250px", borderRadius: "50%", background: "rgba(6,182,212,0.06)", filter: "blur(80px)", pointerEvents: "none" }} />

      <div style={{ maxWidth: "440px", margin: "0 auto", position: "relative", zIndex: 1 }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "32px" }}>
          <button
            onClick={() => window.location.href = `/dashboard?address=${address}`}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.08)";
              e.currentTarget.style.transform = "translateX(-4px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.05)";
              e.currentTarget.style.transform = "translateX(0)";
            }}
            style={{
              background: "rgba(255,255,255,0.05)",
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "12px",
              padding: "10px 16px",
              color: "#e2e8f0",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "600",
              transition: "all 0.3s ease",
            }}>
            ← Back
          </button>
          <div style={{
            fontWeight: "800",
            fontSize: "20px",
            background: "linear-gradient(135deg, #e2e8f0, #94a3b8)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}>
            Scan QR Code
          </div>
        </div>

        {/* Scanner box */}
        <div style={{
          background: "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(99,102,241,0.3)",
          borderRadius: "24px",
          overflow: "hidden",
          marginBottom: "24px",
          position: "relative",
          aspectRatio: "1",
          boxShadow: "0 20px 60px -10px rgba(0,0,0,0.5), 0 0 0 1px rgba(99,102,241,0.1) inset",
        }}>

          <style>{`
            @keyframes scanLine {
              0%, 100% { top: 0%; opacity: 0; }
              50% { opacity: 1; }
              100% { top: 100%; opacity: 0; }
            }
            @keyframes pulse-border {
              0%, 100% { opacity: 0.6; transform: scale(1); }
              50% { opacity: 1; transform: scale(1.05); }
            }
            @keyframes successPop {
              0% { transform: scale(0) rotate(0deg); opacity: 0; }
              50% { transform: scale(1.2) rotate(180deg); opacity: 1; }
              100% { transform: scale(1) rotate(360deg); opacity: 1; }
            }
            @keyframes confetti {
              0% { transform: translateY(0) rotate(0deg); opacity: 1; }
              100% { transform: translateY(400px) rotate(720deg); opacity: 0; }
            }
          `}</style>

          {!cameraOn && status === "idle" && (
            <div style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "20px",
              animation: "slideInUp 0.5s ease both",
            }}>
              <div style={{
                width: "80px",
                height: "80px",
                borderRadius: "20px",
                background: "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(99,102,241,0.1))",
                border: "2px solid rgba(99,102,241,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 8px 32px rgba(99,102,241,0.3)",
                animation: "pulse-border 2s ease-in-out infinite",
              }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                  <rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z"/>
                </svg>
              </div>
              <p style={{ color: "#94a3b8", fontSize: "15px", textAlign: "center", padding: "0 32px", fontWeight: "500" }}>
                Point your camera at a<br/>SuiLoyalty QR code
              </p>
            </div>
          )}

          <video ref={videoRef} style={{ width: "100%", height: "100%", objectFit: "cover", display: cameraOn ? "block" : "none" }} playsInline muted />
          <canvas ref={canvasRef} style={{ display: "none" }} />

          {/* Scanner overlay */}
          {cameraOn && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
              <div style={{
                width: "220px",
                height: "220px",
                border: "3px solid rgba(99,102,241,0.8)",
                borderRadius: "16px",
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.6), 0 0 40px rgba(99,102,241,0.6) inset",
                position: "relative",
              }}>
                {/* Animated scan line */}
                <div style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  height: "2px",
                  background: "linear-gradient(90deg, transparent, #6366f1, transparent)",
                  boxShadow: "0 0 20px #6366f1",
                  animation: "scanLine 2s ease-in-out infinite",
                }} />

                {/* Corner brackets */}
                <div style={{ position: "absolute", top: "-3px", left: "-3px", width: "30px", height: "30px", borderTop: "4px solid #06b6d4", borderLeft: "4px solid #06b6d4", borderRadius: "8px 0 0 0", boxShadow: "0 0 10px #06b6d4" }} />
                <div style={{ position: "absolute", top: "-3px", right: "-3px", width: "30px", height: "30px", borderTop: "4px solid #06b6d4", borderRight: "4px solid #06b6d4", borderRadius: "0 8px 0 0", boxShadow: "0 0 10px #06b6d4" }} />
                <div style={{ position: "absolute", bottom: "-3px", left: "-3px", width: "30px", height: "30px", borderBottom: "4px solid #06b6d4", borderLeft: "4px solid #06b6d4", borderRadius: "0 0 0 8px", boxShadow: "0 0 10px #06b6d4" }} />
                <div style={{ position: "absolute", bottom: "-3px", right: "-3px", width: "30px", height: "30px", borderBottom: "4px solid #06b6d4", borderRight: "4px solid #06b6d4", borderRadius: "0 0 8px 0", boxShadow: "0 0 10px #06b6d4" }} />
              </div>
              <div style={{
                position: "absolute",
                bottom: "24px",
                left: 0,
                right: 0,
                textAlign: "center",
                fontSize: "13px",
                color: "#e2e8f0",
                fontWeight: "600",
                background: "rgba(0,0,0,0.7)",
                backdropFilter: "blur(10px)",
                padding: "8px",
                borderRadius: "8px",
                margin: "0 40px",
                border: "1px solid rgba(99,102,241,0.3)",
              }}>
                Scanning...
              </div>
            </div>
          )}

          {/* Success/Error overlay */}
          {(status === "success" || status === "error") && (
            <div style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: status === "success"
                ? "linear-gradient(135deg, rgba(6,182,212,0.2), rgba(99,102,241,0.2))"
                : "linear-gradient(135deg, rgba(239,68,68,0.2), rgba(220,38,38,0.2))",
              backdropFilter: "blur(10px)",
              gap: "16px",
            }}>
              {/* Confetti effect on success */}
              {status === "success" && (
                <>
                  {[...Array(20)].map((_, i) => (
                    <div
                      key={i}
                      style={{
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        width: "10px",
                        height: "10px",
                        background: ["#6366f1", "#06b6d4", "#8b5cf6", "#f59e0b"][i % 4],
                        borderRadius: i % 2 === 0 ? "50%" : "2px",
                        animation: `confetti ${1 + Math.random()}s ease-out forwards`,
                        animationDelay: `${i * 0.05}s`,
                        transform: `translate(-50%, -50%) rotate(${i * 18}deg) translateY(-${50 + i * 10}px)`,
                      }}
                    />
                  ))}
                </>
              )}

              <div style={{
                fontSize: "72px",
                animation: status === "success" ? "successPop 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55) both" : "successPop 0.6s ease both",
              }}>
                {status === "success" ? "✓" : "✗"}
              </div>
              <div style={{
                fontSize: "16px",
                color: status === "success" ? "#06b6d4" : "#f87171",
                textAlign: "center",
                padding: "0 32px",
                fontWeight: "600",
                textShadow: "0 2px 8px rgba(0,0,0,0.3)",
              }}>
                {message}
              </div>
              {status === "success" && (
                <div style={{
                  fontSize: "36px",
                  fontWeight: "900",
                  background: "linear-gradient(135deg, #6366f1, #8b5cf6, #06b6d4)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  filter: "drop-shadow(0 4px 12px rgba(99,102,241,0.5))",
                  animation: "successPop 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55) 0.2s both",
                }}>
                  +{points} pts
                </div>
              )}
            </div>
          )}

          {status === "scanning" && (
            <div style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.8)",
              backdropFilter: "blur(10px)",
            }}>
              <div style={{
                color: "#6366f1",
                fontSize: "15px",
                fontWeight: "600",
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}>
                <div style={{
                  width: "20px",
                  height: "20px",
                  border: "3px solid rgba(99,102,241,0.3)",
                  borderTop: "3px solid #6366f1",
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite",
                }} />
                {message}
              </div>
            </div>
          )}

          <style>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
            @keyframes slideInUp {
              from { opacity: 0; transform: translateY(20px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `}</style>
        </div>

        {/* Action button */}
        {status === "idle" || status === "error" ? (
          <button
            onClick={cameraOn ? stopCamera : startCamera}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px) scale(1.02)";
              e.currentTarget.style.boxShadow = cameraOn
                ? "0 12px 40px rgba(239,68,68,0.4)"
                : "0 12px 40px rgba(99,102,241,0.5)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0) scale(1)";
              e.currentTarget.style.boxShadow = cameraOn
                ? "0 4px 20px rgba(239,68,68,0.3)"
                : "0 4px 20px rgba(99,102,241,0.4)";
            }}
            style={{
              width: "100%",
              padding: "18px",
              background: cameraOn
                ? "linear-gradient(135deg, rgba(239,68,68,0.3), rgba(220,38,38,0.3))"
                : "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #06b6d4 100%)",
              backgroundSize: "200% 100%",
              border: cameraOn ? "1px solid rgba(239,68,68,0.5)" : "none",
              borderRadius: "16px",
              color: "white",
              fontSize: "16px",
              fontWeight: "700",
              cursor: "pointer",
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              boxShadow: cameraOn
                ? "0 4px 20px rgba(239,68,68,0.3)"
                : "0 4px 20px rgba(99,102,241,0.4)",
              position: "relative",
              overflow: "hidden",
            }}>
            <span style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
              {cameraOn ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              )}
              <span>{cameraOn ? "Stop Camera" : "Start Camera"}</span>
            </span>
          </button>
        ) : status === "success" ? (
          <div style={{ display: "flex", gap: "12px" }}>
            <button
              onClick={() => { setStatus("idle"); setMessage(""); }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
              }}
              style={{
                flex: 1,
                padding: "16px",
                background: "rgba(255,255,255,0.05)",
                backdropFilter: "blur(10px)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "14px",
                color: "#e2e8f0",
                fontSize: "15px",
                fontWeight: "600",
                cursor: "pointer",
                transition: "all 0.3s ease",
              }}>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                </svg>
                <span>Scan Another</span>
              </span>
            </button>
            <button
              onClick={() => window.location.href = `/dashboard?address=${address}`}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-2px) scale(1.02)";
                e.currentTarget.style.boxShadow = "0 12px 40px rgba(99,102,241,0.5)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0) scale(1)";
                e.currentTarget.style.boxShadow = "0 4px 20px rgba(99,102,241,0.4)";
              }}
              style={{
                flex: 1,
                padding: "16px",
                background: "linear-gradient(135deg, #6366f1, #06b6d4)",
                border: "none",
                borderRadius: "14px",
                color: "white",
                fontSize: "15px",
                fontWeight: "700",
                cursor: "pointer",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                boxShadow: "0 4px 20px rgba(99,102,241,0.4)",
              }}>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 7h18M3 12h18M3 17h18"/>
                  <rect x="2" y="5" width="20" height="14" rx="2"/>
                </svg>
                <span>View Card</span>
              </span>
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
