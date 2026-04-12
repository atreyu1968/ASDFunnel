# Lennox Hale Publishing Admin

## Overview

Full-stack automated publishing management admin panel for "Lennox Hale" — an independent digital publishing house for psychological thrillers. Built as a pnpm workspace monorepo with TypeScript.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui + wouter routing
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Email provider**: Resend (configured from admin panel UI, not env vars)
- **UI Language**: Spanish throughout

## Architecture

### Artifacts
- **lennox-admin** (`/`): React SPA admin panel with dark thriller aesthetic (navy/charcoal + amber/gold accents)
- **api-server** (`/api`): Express REST API serving all CRUD operations
- **mockup-sandbox** (`/mockup-sandbox`): Component preview server for design iterations

### Database Schema (PostgreSQL)
- **authors**: Pen names, bios, brand descriptions, genre focus
- **series**: Book series linked to authors, with status tracking
- **books**: Individual titles with funnel roles (lead_magnet, traffic_entry, core_offer, crossover_bridge), pricing strategies, publication scheduling, cover image URLs (GCS), manuscript paths, Books2Read universal link (`books2read_url`)
- **mailing_lists**: Email lists separated by author AND language, with lead magnet book links
- **subscribers**: Email subscribers with source tracking (lead_magnet, landing_page, manual, import), status management
- **activity**: Audit log of book-related actions
- **landing_pages**: Multi-language landing pages with SEO metadata, linked to mailing lists
- **email_templates**: Email templates (welcome, lead_magnet, newsletter) with HTML/text bodies per language
- **automation_rules**: Trigger-based automation rules (new_subscriber → send_email, assign_tag, etc.)
- **automation_logs**: Execution logs for automation rules
- **email_settings**: Email provider configuration (Resend API key, from email/name, reply-to) + AI config (provider: deepseek/openai, model, API key) — managed from admin UI

### Frontend Pages
1. **Panel de Control** (`/`): Dashboard with stats, series progress, recent activity
2. **Autores** (`/authors`): Author/pen name CRUD management
3. **Series** (`/series`): Book series management with author association
4. **Libros** (`/books`): Individual book management with funnel roles, pricing, cover image uploads (hover thumbnail), .docx manuscript upload with AI landing page generation (brain button)
5. **Embudo** (`/funnel`): Multi-stage sales funnel visualization
6. **Calendario** (`/calendar`): Rapid Release publication calendar
7. **Listas de Correo** (`/mailing-lists`): Mailing list management with subscriber stats, language/author filtering
8. **Suscriptores** (`/subscribers`): Subscriber table with search, filtering, status management
9. **Landing Pages** (`/landing-pages`): Multi-language landing page management with SEO fields
10. **Plantillas Email** (`/email-templates`): Email template editor with HTML/text, language and type filtering
11. **Automatizaciones** (`/automations`): Automation rule builder with trigger/action config, execution logs
12. **Configuración** (`/settings`): Resend email provider configuration (API key, sender info, test email) + AI configuration (DeepSeek/OpenAI provider, model, API key for landing page generation)

### Object Storage
- Files (book covers, manuscripts) uploaded via presigned GCS URLs
- Flow: browser → `POST /api/storage/uploads/request-url` → PUT to GCS → objectPath saved in DB
- Served via `/api/storage/objects/{path}`

### AI Features
- **Shared AI utility** (`api-server/src/lib/ai.ts`): `callAi()` with provider abstraction (DeepSeek/OpenAI), `parseJsonResponse`/`parseJsonArrayResponse`, error classes
- **Frontend AI utility** (`lennox-admin/src/lib/ai-api.ts`): Client-side fetch helpers for all 6 AI endpoints
- **Landing Page Generation**: .docx manuscripts parsed with `mammoth`, AI generates title/description/hook/CTA/SEO. Endpoint: `POST /api/books/:id/upload-manuscript`
- **AI Email Generation** (`POST /api/ai/generate-email`): Generates full email templates from book context (subject, HTML body, text body) by type and language
- **Auto-Translation** (`POST /api/ai/translate`): Translates landing pages and email templates between supported languages (es/en/fr/de/pt/it)
- **D2D Editorial Content** (`POST /api/ai/generate-kdp`): Generates store descriptions, back cover, tagline, keywords, BISAC categories, comparable authors for wide distribution via Draft2Digital
- **Nurturing Sequences** (`POST /api/ai/generate-sequence`): Generates 2-10 email nurturing sequences with day scheduling and template types
- **A/B Subject Lines** (`POST /api/ai/generate-subjects`): Generates variant subject lines for A/B testing from existing email templates
- **Series Summaries** (`POST /api/ai/generate-series-summary`): Generates series description, tagline, reading order, and audience hook from individual book data
- **Spin-off Guide** (`POST /api/series/:id/generate-spinoff-guide`): Generates connection strategy, unique angle, suggested books, cross-promotion ideas for spin-off series
- **Orthotypographic Proofreader** (`POST /api/ai/proofread`): Forensic editorial auditor with 14-phase detection protocol. Processes text in ~6000-char blocks. Group A (critical): dialogue overlaps, mid-sentence cuts, action loops, cloned paragraphs, perspective shifts, temporal breaks, ghost characters. Group B (medium): AI clichés/stock phrases, emotional over-explanation, artificial transitions, info-dump dialogue. Group C (editorial): RAE orthotypography, literary dialogue format, lexical coherence. Returns correctedText + typed glitches array + stats (qualityScore capped at 7 for AI text with no findings). Works with .docx manuscripts or pasted text.
- All AI routes include series context (previous books) for character/plot consistency
- All AI routes have strict input validation (type checking, enum validation, bounds checking)

### Sales Funnel Stages
1. Lead Magnet (free precuela for email capture)
2. Traffic Entry (perma-free Book 1 via D2D wide distribution)
3. Core Offer (paid books at full price)
4. Crossover Bridge (series connecting different pen names)

### Distribution Model
- **Wide via Draft2Digital (D2D)**: Amazon, Apple Books, Kobo, Barnes & Noble, Google Play
- **Books2Read**: Universal book links (https://books2read.com/) stored per book for cross-store discovery
- NOT KDP Select / Kindle Unlimited exclusive

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Authentication
- Admin panel protected by password login (scrypt hash stored in `ADMIN_PASSWORD_HASH` env var)
- Auth routes: `POST /api/auth/login`, `GET /api/auth/check`, `POST /api/auth/logout`
- Auth middleware (`middleware/auth.ts`) protects all `/api/*` routes except `/api/auth/*`, `/api/public/*`, `/api/capture/*`, `/api/confirmation/*`, `/api/health`
- If `ADMIN_PASSWORD_HASH` is not set, auth is bypassed (allows development without password)
- Sessions stored in-memory (`activeSessions` Set), cookie-based (`asd_session`, HttpOnly, 7-day expiry)
- Frontend: `App.tsx` checks auth on load, shows `login.tsx` if not authenticated; `main-layout.tsx` has logout button
- `change-password.sh` — helper script to change admin password
- **custom-fetch.ts**: All API client requests include `credentials: "include"` for cookie-based auth

## Production Deployment (Ubuntu)
- `install.sh` — autoinstaller/updater for Ubuntu 22.04/24.04 (systemd + Nginx + PostgreSQL + optional Cloudflare Tunnel)
- Asks for admin password during install; detects updates and preserves existing config
- Config stored in `/etc/asdfunnel/env` (preserved across updates)
- Nginx root must point to `dist/public` (NOT `dist/`) — Vite outputs to `dist/public/`
- Build: only compile `@workspace/api-server` and `@workspace/lennox-admin` — skip `mockup-sandbox` (dev-only, needs PORT env var)
- Express 5 wildcard routes: use `"*path"` not `"*"` (path-to-regexp v8 requirement)
- Nginx serves frontend static files at `/`, proxies `/api/*` to Node.js (port 5000)
- In production, API server (`app.ts`) also serves frontend static files as fallback for SPA routing
- Local file storage (`localFileStorage.ts`) replaces Replit GCS sidecar, files saved to `$UPLOAD_DIR`
- Storage route selection: Replit uses GCS (`storage.ts`), production uses local files (`localStorageRoutes.ts`)
- `APP_BASE_URL` env var used for confirmation/unsubscribe email links
- Vite config defaults: `BASE_PATH=/` and `PORT=3000` when building for production
- DB push needs DATABASE_URL exported: `export $(grep -v '^#' /etc/asdfunnel/env | xargs) && pnpm --filter @workspace/db run push`
- GitHub repo: https://github.com/atreyu1968/ASDFunnel

## Seed Data
- 1 author (Lennox Hale), 1 series (Agente Especial Sloane Keller), 5 books, 2 mailing lists (ES/EN), 3+ subscribers

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
