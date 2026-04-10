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
- **UI Language**: Spanish throughout

## Architecture

### Artifacts
- **lennox-admin** (`/`): React SPA admin panel with dark thriller aesthetic (navy/charcoal + amber/gold accents)
- **api-server** (`/api`): Express REST API serving all CRUD operations
- **mockup-sandbox** (`/mockup-sandbox`): Component preview server for design iterations

### Database Schema (PostgreSQL)
- **authors**: Pen names, bios, brand descriptions, genre focus
- **series**: Book series linked to authors, with status tracking
- **books**: Individual titles with funnel roles (lead_magnet, traffic_entry, core_offer, crossover_bridge), pricing strategies, publication scheduling
- **mailing_lists**: Email lists separated by author AND language, with lead magnet book links
- **subscribers**: Email subscribers with source tracking (lead_magnet, landing_page, manual, import), status management
- **activity**: Audit log of book-related actions

### Frontend Pages
1. **Panel de Control** (`/`): Dashboard with stats, series progress, recent activity
2. **Autores** (`/authors`): Author/pen name CRUD management
3. **Series** (`/series`): Book series management with author association
4. **Libros** (`/books`): Individual book management with funnel roles and pricing
5. **Embudo** (`/funnel`): Multi-stage sales funnel visualization
6. **Calendario** (`/calendar`): Rapid Release publication calendar
7. **Listas de Correo** (`/mailing-lists`): Mailing list management with subscriber stats, language/author filtering
8. **Suscriptores** (`/subscribers`): Subscriber table with search, filtering, status management

### Sales Funnel Stages
1. Lead Magnet (free precuela for email capture)
2. Traffic Entry (perma-free Book 1 on KDP)
3. Core Offer (paid books at full price)
4. Crossover Bridge (series connecting different pen names)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Seed Data
- 1 author (Lennox Hale), 1 series (Agente Especial Sloane Keller), 5 books, 2 mailing lists (ES/EN), 3+ subscribers

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
