export const metadata = {
  title: "Privacy Policy – SuiLoyalty",
  description: "Privacy policy for the SuiLoyalty loyalty rewards platform.",
};

export default function PrivacyPolicy() {
  return (
    <main style={{ minHeight: "100vh", background: "#0a0e1a", color: "#e2e8f0", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "60px 24px" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, color: "#fff" }}>Privacy Policy</h1>
        <p style={{ color: "#64748b", marginBottom: 40 }}>Last updated: May 2026</p>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#c7d2fe", marginBottom: 12 }}>1. Information We Collect</h2>
          <p style={{ color: "#94a3b8", lineHeight: 1.7 }}>
            SuiLoyalty collects information you provide when signing in with Google, including your name, email address, and Google account identifier. We also collect loyalty interaction data such as QR code scans, points balances, and redemption history.
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#c7d2fe", marginBottom: 12 }}>2. How We Use Your Information</h2>
          <p style={{ color: "#94a3b8", lineHeight: 1.7 }}>
            We use your information solely to operate the SuiLoyalty platform — to create and manage your loyalty account, track points earned and redeemed, and associate your activity with participating brands. We do not sell your data to third parties.
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#c7d2fe", marginBottom: 12 }}>3. Data Storage</h2>
          <p style={{ color: "#94a3b8", lineHeight: 1.7 }}>
            Your data is stored securely in a PostgreSQL database hosted by Supabase. Authentication is handled via Google OAuth 2.0. We do not store your Google password or any payment information.
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#c7d2fe", marginBottom: 12 }}>4. Data Deletion</h2>
          <p style={{ color: "#94a3b8", lineHeight: 1.7 }}>
            You may delete your account at any time from within the app. Upon deletion, your personal data (email, name, Google identifier) will be permanently removed from our systems.
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#c7d2fe", marginBottom: 12 }}>5. Contact</h2>
          <p style={{ color: "#94a3b8", lineHeight: 1.7 }}>
            For any privacy-related questions, contact us at:{" "}
            <a href="mailto:tatendaictmarimo@gmail.com" style={{ color: "#6366f1" }}>tatendaictmarimo@gmail.com</a>
          </p>
        </section>
      </div>
    </main>
  );
}
