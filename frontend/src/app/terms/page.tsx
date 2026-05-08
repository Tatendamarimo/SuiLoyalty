export const metadata = {
  title: "Terms of Service – SuiLoyalty",
  description: "Terms of service for the SuiLoyalty loyalty rewards platform.",
};

export default function TermsOfService() {
  return (
    <main style={{ minHeight: "100vh", background: "#0a0e1a", color: "#e2e8f0", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "60px 24px" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, color: "#fff" }}>Terms of Service</h1>
        <p style={{ color: "#64748b", marginBottom: 40 }}>Last updated: May 2026</p>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#c7d2fe", marginBottom: 12 }}>1. Acceptance of Terms</h2>
          <p style={{ color: "#94a3b8", lineHeight: 1.7 }}>
            By accessing or using SuiLoyalty, you agree to be bound by these Terms of Service. If you do not agree, please do not use the platform.
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#c7d2fe", marginBottom: 12 }}>2. Description of Service</h2>
          <p style={{ color: "#94a3b8", lineHeight: 1.7 }}>
            SuiLoyalty is a blockchain-powered loyalty rewards platform that allows consumers to earn and redeem points with participating brands. Points are tracked on the Sui blockchain and stored securely in our database.
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#c7d2fe", marginBottom: 12 }}>3. User Accounts</h2>
          <p style={{ color: "#94a3b8", lineHeight: 1.7 }}>
            You must sign in with a valid Google account to use SuiLoyalty. You are responsible for maintaining the security of your account. You may delete your account at any time from within the application.
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#c7d2fe", marginBottom: 12 }}>4. Points and Rewards</h2>
          <p style={{ color: "#94a3b8", lineHeight: 1.7 }}>
            Loyalty points have no monetary value and cannot be exchanged for cash. Points are subject to the terms of each individual brand's loyalty program. SuiLoyalty reserves the right to adjust or expire points in cases of fraud or abuse.
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#c7d2fe", marginBottom: 12 }}>5. Limitation of Liability</h2>
          <p style={{ color: "#94a3b8", lineHeight: 1.7 }}>
            SuiLoyalty is provided "as is" without warranties of any kind. We are not liable for any indirect, incidental, or consequential damages arising from your use of the platform.
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#c7d2fe", marginBottom: 12 }}>6. Contact</h2>
          <p style={{ color: "#94a3b8", lineHeight: 1.7 }}>
            For any questions about these terms, contact us at:{" "}
            <a href="mailto:tatendaictmarimo@gmail.com" style={{ color: "#6366f1" }}>tatendaictmarimo@gmail.com</a>
          </p>
        </section>
      </div>
    </main>
  );
}
