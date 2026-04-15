"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  // Handle OAuth callback — check for ?code= in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
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
    <main style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="glass" style={{ padding: '48px', textAlign: 'center', maxWidth: '400px', width: '100%', margin: '0 16px' }}>
        
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
            { label: 'Sui Devnet', color: '#22c55e' },
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
    </main>
  );
}
