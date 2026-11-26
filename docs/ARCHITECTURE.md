# Architecture Overview

Alliar CRM is a modern TypeScript monorepo built with **TanStack Start** and **Supabase** as the backend. The core components are:

- **frontend (src/)** – React components, routes, and UI logic. Uses Vite for bundling and leverages `import.meta.env` for runtime env variables.
- **backend (supabase/ & worker/)** – Supabase database schemas, Row‑Level Security (RLS) policies, and background workers (e.g., gmaps‑worker). Server‑side code lives under `src/lib/` and `src/integrations/`.
- **API layer (src/routes/api/)** – Edge‑functions exposing public endpoints (webhooks, WhatsApp integration) with security middleware (`middleware/webhookSecurity.ts`).
- **CI/CD (netlify/ & .netlify/)** – Netlify configuration for preview deploys and serverless functions.
- **Documentation (docs/)** – Architecture and development guides.

The repository follows a **single‑branch** workflow (`main`) with a cleaned Git history. Sensitive files like `.env` are excluded via `.gitignore` and a placeholder `.env.example` is provided for developers.
