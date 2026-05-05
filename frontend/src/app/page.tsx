"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  // Handle OAuth callback — check for ?address= in URL (backend handles the code exchange)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const address = params.get("address");
    const name = params.get("name");
    
    if (address) {
      localStorage.setItem("sui_address", address);
      if (name) localStorage.setItem("sui_name", name);
      window.history.replaceState({}, "", "/");
      router.push("/dashboard");
      return;
    }

    // Legacy handler in case code slips through
    const code = params.get("code");
    if (!code) return;

    window.history.replaceState({}, "", "/");
    setLoading(true);

    fetch("/api/auth/callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ code }),
    })
      .then(async (r) => {
        const data = await r.json();
        if (data.user) {
          localStorage.setItem("sui_address", data.user.suiAddress);
          router.push("/dashboard");
        } else {
          setError(data.error || "Authentication failed. Please try again.");
        }
      })
      .catch((e) => setError(`Network error: ${e.message}`))
      .finally(() => setLoading(false));
  }, [router]);

  async function handleSignIn() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/auth/zklogin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnUrl: window.location.origin }),
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
        setError("Failed to start sign in. Is the backend running?");
      }
    } catch {
      setError("Cannot connect to backend. Make sure it is running on port 3000.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <style>{`
        .signin-shell {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px 16px;
          gap: 0;
        }
        .signin-hero { display: none; }
        .signin-cards {
          display: flex;
          flex-direction: column;
          gap: 20px;
          max-width: 400px;
          width: 100%;
          flex-shrink: 0;
        }
        @keyframes heroIn { from { opacity:0; transform:translateX(-24px); } to { opacity:1; transform:translateX(0); } }
        @keyframes floatLogo { 0%,100% { transform:translateY(0) rotate(0); } 50% { transform:translateY(-6px) rotate(2deg); } }
        @media (min-width: 1024px) {
          .signin-shell {
            max-width: 1120px;
            margin: 0 auto;
            gap: 80px;
            padding: 24px 32px;
          }
          .signin-hero {
            display: block;
            flex: 1;
            max-width: 540px;
            animation: heroIn 0.6s cubic-bezier(0.4,0,0.2,1) both;
          }
        }
      `}</style>

      <div className="signin-shell">

        {/* ── Desktop hero (hidden on mobile) ──────────────────────────── */}
        <div className="signin-hero">
          <svg width="84" height="84" viewBox="0 0 56 56" style={{ marginBottom: '24px', filter: 'drop-shadow(0 8px 24px rgba(99,102,241,0.4))', animation: 'floatLogo 4s ease-in-out infinite' }}>
            <defs>
              <linearGradient id="heroGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#6366f1"/>
                <stop offset="50%" stopColor="#8b5cf6"/>
                <stop offset="100%" stopColor="#06b6d4"/>
              </linearGradient>
            </defs>
            <polygon points="28,4 52,18 52,38 28,52 4,38 4,18" fill="none" stroke="url(#heroGrad)" strokeWidth="2.5"/>
            <polygon points="28,12 44,21 44,35 28,44 12,35 12,21" fill="rgba(99,102,241,0.2)" stroke="url(#heroGrad)" strokeWidth="1.5"/>
            <circle cx="28" cy="28" r="3" fill="url(#heroGrad)"/>
          </svg>

          <h1 style={{
            fontSize: '52px',
            fontWeight: '900',
            lineHeight: '1.05',
            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #06b6d4 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '16px',
            letterSpacing: '-1.5px',
          }}>
            Loyalty<br/>that lasts.
          </h1>

          <p style={{ color: 'var(--muted)', fontSize: '17px', lineHeight: '1.6', marginBottom: '32px', maxWidth: '460px' }}>
            A blockchain loyalty system that feels like any other app. Sign in with Google, scan a QR code, and watch your rewards live on a public blockchain — where no brand can ever delete them.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              { text: 'No wallet, no seed phrase — Google Sign-In only', color: '#6366f1' },
              { text: 'Real on-chain NFTs verifiable on Sui Testnet', color: '#8b5cf6' },
              { text: 'Zero gas fees — sponsored transactions', color: '#06b6d4' },
            ].map(({ text, color }) => (
              <div key={text} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  flexShrink: 0,
                  width: '24px', height: '24px', borderRadius: '7px',
                  background: `linear-gradient(135deg, ${color}30, ${color}15)`,
                  border: `1px solid ${color}50`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color, boxShadow: `0 2px 8px ${color}30`,
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <span style={{ fontSize: '14px', color: '#cbd5e1', fontWeight: '500' }}>{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Cards column (always visible, narrows on mobile) ─────────── */}
        <div className="signin-cards">

        {/* ── Sign-in card ──────────────────────────────────────────────── */}
        <div className="glass" style={{ padding: '48px', textAlign: 'center' }}>

          <div style={{ marginBottom: '32px' }}>
            <svg width="56" height="56" viewBox="0 0 56 56" style={{ margin: '0 auto 16px', display: 'block' }}>
              <defs>
                <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#6366f1"/>
                  <stop offset="100%" stopColor="#06b6d4"/>
                </linearGradient>
              </defs>
              <polygon points="28,4 52,18 52,38 28,52 4,38 4,18" fill="none" stroke="url(#grad)" strokeWidth="2"/>
              <polygon points="28,12 44,21 44,35 28,44 12,35 12,21" fill="rgba(99,102,241,0.2)" stroke="url(#grad)" strokeWidth="1"/>
            </svg>
            <h1 style={{ fontSize: '28px', fontWeight: '700', background: 'linear-gradient(135deg, #6366f1, #06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '8px' }}>SuiLoyalty</h1>
            <p style={{ color: 'var(--muted)', fontSize: '14px' }}>Blockchain loyalty — no wallet required</p>
          </div>

          <button
            onClick={handleSignIn}
            disabled={loading}
            style={{ width: '100%', padding: '14px 24px', background: loading ? 'var(--border)' : 'linear-gradient(135deg, #6366f1, #06b6d4)', border: 'none', borderRadius: '10px', color: 'white', fontSize: '15px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer', marginBottom: '16px', letterSpacing: '0.3px' }}
          >
            {loading ? "Connecting..." : "Sign in with Google"}
          </button>

          {error && (
            <p style={{ color: '#f87171', fontSize: '13px', marginBottom: '16px' }}>{error}</p>
          )}

          <div style={{ display: 'flex', justifyContent: 'center', gap: '20px' }}>
            {[
              { label: 'Sui Testnet', color: '#22c55e' },
              { label: 'Dynamic NFTs', color: '#6366f1' },
              { label: 'Zero gas fees', color: '#06b6d4' },
            ].map(({ label, color }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }} />
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{label}</span>
              </div>
            ))}
          </div>

        </div>

        {/* ── How it works card ─────────────────────────────────────────── */}
        <div className="glass" style={{ padding: '24px' }}>
          <div style={{
            fontSize: '11px',
            color: 'var(--muted)',
            textTransform: 'uppercase',
            letterSpacing: '1.2px',
            fontWeight: '700',
            textAlign: 'center',
            marginBottom: '20px',
          }}>
            How it works
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {[
              {
                num: '1',
                title: 'Sign in with Google',
                detail: 'No wallet, no seed phrase. Your Sui address is derived from your Google account using zkLogin.',
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </svg>
                ),
                color: '#6366f1',
              },
              {
                num: '2',
                title: 'Scan a QR code',
                detail: 'Point your camera at any SuiLoyalty code on a product. The app validates it instantly.',
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <path d="M14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z" />
                  </svg>
                ),
                color: '#8b5cf6',
              },
              {
                num: '3',
                title: 'Earn points on-chain',
                detail: 'Your loyalty card is a real NFT on Sui. Brands cannot delete or expire your points — ever.',
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                ),
                color: '#06b6d4',
              },
            ].map(({ num, title, detail, icon, color }) => (
              <div key={num} style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '14px',
                padding: '14px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '12px',
                transition: 'all 0.3s ease',
              }}>
                <div style={{
                  flexShrink: 0,
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: `linear-gradient(135deg, ${color}30, ${color}10)`,
                  border: `1px solid ${color}40`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color,
                  position: 'relative',
                }}>
                  {icon}
                  <div style={{
                    position: 'absolute',
                    top: '-6px',
                    right: '-6px',
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    background: color,
                    color: 'white',
                    fontSize: '10px',
                    fontWeight: '800',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: `0 2px 6px ${color}60`,
                  }}>
                    {num}
                  </div>
                </div>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: '#e2e8f0', marginBottom: '2px' }}>
                    {title}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: '1.5' }}>
                    {detail}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        </div> {/* end signin-cards */}
      </div> {/* end signin-shell */}
    </main>
  );
}
