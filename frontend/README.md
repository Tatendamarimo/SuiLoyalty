# SuiLoyalty Frontend

Next.js 16 / React 19 / Tailwind 4 progressive web app. Hosts both the consumer sign-in flow and the brand-operator merchant terminal under a single audience picker at `/`.

## Routes

| Route | Audience | Purpose |
| --- | --- | --- |
| `/` | Anyone | Audience picker — Customer · Brand operator |
| `/customer` | Customer | Google Sign-In via zkLogin |
| `/dashboard` | Customer | Per-brand loyalty cards, NFT avatar stats, reward redemption |
| `/scan` | Customer | Camera QR scanner (jsQR) |
| `/merchant` | Brand operator | Brand portal — picker, QR generator, redemption queue, PDF / CSV reports |

## Local development

```bash
npm install
npm run dev          # http://localhost:3001
```

The frontend proxies `/api/*` to `http://127.0.0.1:3000` (see `next.config.ts`); the backend must be running for any flow to work end-to-end.

Environment template: [`.env.local.example`](.env.local.example). Copy to `.env.local` and fill in real values. Only `NEXT_PUBLIC_*` variables are safe in the frontend bundle — server-side secrets (Google client secret, Sui keys, DB URL) live exclusively in `backend/.env`.

## Production build

```bash
npm run build
npm start
```

## Documentation

For architecture, deployment, and full project context, see the [root README](../README.md) and `docs/` directory.
