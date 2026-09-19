# OH I SEE — Infrastructure Analysis (Phase 1)

**Status:** Read-only audit — no Docker, Kubernetes, or application code was modified.  
**Date:** 2026-09-12  
**Author:** Principal DevOps / Platform Engineering review  
**Scope:** Containerization and Kubernetes readiness for the **existing** OH I SEE platform.

---

## Executive Summary

OH I SEE is a **Node.js monorepo-style project** with two active deployable units:

| Unit | Path | Role |
|------|------|------|
| **Frontend** | `frontend/` | Vite 5 multi-page application (MPA), vanilla HTML/JS/CSS |
| **Backend API** | `backend/` | Express 4 REST API on port **3001** |

There are **no existing Dockerfiles**, **no docker-compose**, **no Kubernetes manifests**, and **no CI/CD pipelines** in the repository today.

Managed **Supabase** is the primary database/auth/storage platform. **OpenAI** and **Google Gemini** are used server-side for AI workloads. A separate **Blender-based 3D worker** exists for the legacy Design3D pipeline.

**Recommended initial production footprint:** `frontend` + `backend` (+ optional `design3d-worker` when 3D pipeline is required). BIM generation can remain inside the API for Phase 1.

---

## 1. Existing Architecture

### 1.1 Repository layout

| Path | Role | Deploy? |
|------|------|---------|
| `frontend/` | Primary UI (Vite MPA) | **Yes** |
| `backend/` | Primary API (Express) | **Yes** |
| `database/` | Manual SQL schemas/migrations | **No** (applied to Supabase) |
| `docs/` | Documentation | **No** |
| `output/` | Generated artifacts / test output | **No** |
| `src/` | Legacy duplicate backend | **Ignore** |
| `backend/src_old/` | Archived backend | **Ignore** |
| `frontend/react_vite/` | Disconnected React prototype | **Ignore** |
| `frontend/vanilla_vite/` | Older Vite copy | **Ignore** |
| `frontend/static_html/` | Static snapshots | **Ignore** |

Root `package.json` is a **minimal duplicate** of backend metadata and is **not** the canonical workspace root for builds. Use `frontend/package.json` and `backend/package.json`.

### 1.2 Runtime diagram (current)

```
Browser
   │
   ├─► Vite dev server :3000  (production: static build)
   │      proxy /api → :3001
   │
   └─► Express API :3001
          │
          ├─► Supabase Postgres (managed)
          ├─► Supabase Auth / Storage (managed)
          ├─► Google Gemini API (chat, vision, quotations)
          ├─► OpenAI API (Design3D specification extraction)
          ├─► Razorpay (construction payments)
          ├─► SMTP (email)
          │
          ├─► In-memory fallbacks (projects, BIM) — dev/single-pod only
          │
          └─► Design3D worker (separate Node process)
                 │
                 ├─► Supabase job queue (RPC: oh3d_enqueue)
                 ├─► Blender (headless or dev bridge :8766)
                 └─► Local disk or Supabase Storage (.data/design3d)
```

### 1.3 Frontend framework

| Item | Value |
|------|-------|
| Framework | **Vite 5** multi-page app (MPA) |
| UI | Vanilla HTML + CSS + JavaScript (no React in primary app) |
| 3D/BIM viewers | **Three.js** ^0.170 (`frontend/js/bim/`, `design3d-viewer.js`) |
| Build tool | Vite (`frontend/vite.config.js`) |
| Dev command | `npm run dev` → port **3000** |
| Build command | `npm run build` → `frontend/dist/` |
| Preview command | `npm run preview` |
| API routing | Dev proxy `/api` → `http://127.0.0.1:3001` |
| Lock file | `frontend/package-lock.json` (lockfileVersion 3) |

**Pages include:** marketplace, auth, account, intent engine, project workspace (BIM, 2D floor plan, 3D home), enterprise modules, admin, etc. (30+ HTML entry points in Vite config).

### 1.4 Backend framework

| Item | Value |
|------|-------|
| Runtime | **Node.js** (recommend **20 LTS**; dependencies require >=18, several >=20) |
| Framework | **Express 4** |
| Entry | `backend/src/server.js` |
| Dev command | `npm run dev` (nodemon) |
| Prod command | `node src/server.js` or `npm run server` |
| Test command | `npm test` (Node built-in test runner) |
| Worker command | `npm run worker:3d` → `backend/src/workers/design3d.js` |
| Lock file | `backend/package-lock.json` (lockfileVersion 3) |

### 1.5 Authentication architecture

| Layer | Implementation |
|-------|----------------|
| User signup/login | `POST /api/auth/signup`, `POST /api/auth/login` |
| Token | Custom **JWT** (`JWT_SECRET`), stored in browser `localStorage` |
| Middleware | `backend/src/middleware/auth.js` — verifies JWT, loads `users` from Supabase |
| Supabase Auth | Used by `frontend/js/supabase-client.js` for e-commerce flows and password reset |
| Password reset | Supabase reset email via backend `authController` |

**Important:** Two auth paths coexist (app JWT + Supabase browser client). Containerization must preserve both.

### 1.6 Supabase integration

| Usage | Location |
|-------|----------|
| Server admin client | `backend/src/config/supabase.js` — **service role key** |
| Browser client | `frontend/js/supabase-client.js` — **anon key** (currently hardcoded) |
| Tables | `users`, products, orders, projects, BIM tables (schema_v4), oh3d_* tables, etc. |
| Storage | Design3D artifacts when `DESIGN3D_STORAGE=supabase` |
| Realtime | `ws` package used as Supabase realtime transport (not a public app WebSocket server) |

**Database migrations:** SQL files in `database/` applied manually in Supabase SQL Editor. No automated migration runner in repo.

### 1.7 AI integration

| Feature | Provider | Location |
|---------|----------|----------|
| Shopping assistant / chat | **Google Gemini** (`GEMINI_API_KEY`) | `backend/src/services/aiService.js` |
| Intent engine fallback | Rule-based (no API) | `backend/src/services/intentEngine.js` |
| Quotation PDF parsing | Gemini (optional) | `backend/src/routes/quotations.js` |
| Design3D specification | **OpenAI** (`OPENAI_API_KEY`) | `backend/src/services/design3d/orchestrator.js` |
| Image generation | Optional `IMAGE_GENERATION_API_KEY` | `aiService.js` |

**All AI keys are server-side only.** Frontend calls `/api/ai/*` — correct pattern.

### 1.8 BIM system

| Component | Location | Execution model |
|-----------|----------|-----------------|
| Requirements parser | `backend/src/bim/generation/requirementsParser.js` | Sync in API |
| Parametric generator | `backend/src/bim/generation/requirementsToBim.js` | Sync in API |
| Room layout | `backend/src/bim/generation/layoutBuilding.js` | Sync in API |
| Prompt modifier | `backend/src/bim/modification/promptModifier.js` | Sync in API |
| Validation / quantities | `backend/src/bim/validation/`, `calculations/` | Sync in API |
| API routes | `POST /api/projects/:id/bim/generate`, `/modify`, etc. | Sync |
| Memory fallback | `backend/src/services/bimMemoryStore.js` | **In-process Map** |
| Project memory fallback | `backend/src/services/projectMemoryStore.js` | **In-process array** |
| Frontend viewers | `bim-viewer.js`, `floor-plan-viewer.js` | Browser Three.js / Canvas |

**BIM is currently synchronous** inside the API process. IFC export is planned but not implemented. No separate BIM worker exists today.

### 1.9 2D floor-plan engine

- **Client-side:** `frontend/js/bim/floor-plan-viewer.js` (Canvas 2D from BIM JSON snapshot)
- **Server-side:** BIM model generation produces geometry; no separate 2D microservice

### 1.10 3D rendering / viewer

| System | Technology | Notes |
|--------|------------|-------|
| **Project workspace 3D** | Three.js (`bim-viewer.js`, mode `home` / `technical`) | Reads BIM API model |
| **Design3D pipeline** | Blender + OpenAI + Supabase queue | Separate worker, GLTF/PNG outputs |
| **Visualizer page** | `visualizer-3d.html`, `design3d.js` | Uses `/api/3d/*` |

### 1.11 File upload functionality

| Route | Mechanism | Limit |
|-------|-----------|-------|
| `POST /api/quotations/upload` | **multer** (optional — warns if not installed) | 10 MB memory |
| Design3D inputs | Uploaded to storage via worker | 6 MB (per capabilities endpoint) |
| Construction home requirements | JSON attachments in request body | Documented 6 MB combined |

**Risk:** `multer` is optional at runtime; production image should include it explicitly if quotations upload is required.

### 1.12 Background jobs

| Job system | Technology | Worker entry |
|------------|------------|--------------|
| Design3D generation | Supabase RPC queue (`oh3d_enqueue`, `oh3d_heartbeat`, `oh3d_finish`) | `backend/src/workers/design3d.js` |
| BIM generation | **None** — synchronous HTTP | N/A |
| Email | Synchronous in request path | N/A |

**No Redis, BullMQ, or cron** in the repository today. Design3D uses **database-backed queueing** in Supabase.

### 1.13 Database access

- Primary: `@supabase/supabase-js` with service role (server)
- Schemas: `database/schema.sql`, `schema_v2.sql`, `schema_v3.sql`, `schema_v4_bim.sql`, `apply_projects_bim.sql`
- **Projects/BIM tables may not be applied** in all environments — code falls back to in-memory stores

### 1.14 Storage access

| Store | Path / config |
|-------|---------------|
| Design3D local | `backend/.data/design3d` (`DESIGN3D_STORAGE_ROOT`) |
| Design3D remote | Supabase bucket `design3d-private` (`DESIGN3D_STORAGE=supabase`) |
| BIM models | Supabase tables when migrated; else API memory + browser `localStorage` |
| User uploads | Memory (multer) or Supabase (Design3D) |

### 1.15 Existing environment variables

Compiled from `backend/src/**` inspection:

#### Core application

| Variable | Required | Used by |
|----------|----------|---------|
| `NODE_ENV` | Recommended | All |
| `PORT` | No (default 3001) | API server |
| `FRONTEND_URL` | Production | CORS, redirects, email links |
| `APP_URL` | Optional | Email templates |
| `PLATFORM_DOMAIN` | Optional | Multi-tenant subdomain routing |

#### Auth / database

| Variable | Required | Exposure |
|----------|----------|----------|
| `JWT_SECRET` | **Yes** | Server only |
| `JWT_EXPIRES_IN` | No (default 7d) | Server only |
| `SUPABASE_URL` | **Yes** | Server + browser anon |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | **Server only** |
| `SUPABASE_ANON_KEY` | Frontend builds | Browser only |

#### AI

| Variable | Required | Exposure |
|----------|----------|----------|
| `GEMINI_API_KEY` | Optional (fallback engine) | Server only |
| `OPENAI_API_KEY` | Required for Design3D | Server only |
| `OPENAI_DESIGN_MODEL` | No (default gpt-4.1-mini) | Server only |
| `IMAGE_GENERATION_API_KEY` | Optional | Server only |

#### Design3D worker

| Variable | Required | Notes |
|----------|----------|-------|
| `DESIGN3D_WORKER_MODE` | No | `bridge` (dev) or `headless` (prod) |
| `BLENDER_BRIDGE_URL` | Dev | Default `http://127.0.0.1:8766` |
| `BLENDER_EXECUTABLE` | Prod headless | Path to Blender binary |
| `DESIGN3D_STORAGE` | Prod | Must be `supabase` in production |
| `DESIGN3D_STORAGE_ROOT` | Local dev | Default `.data/design3d` |
| `DESIGN3D_BUCKET` | No | Default `design3d-private` |
| `DESIGN3D_JOB_TIMEOUT_MS` | No | Default 3600000 |
| `DESIGN3D_WIDTH/HEIGHT/SAMPLES` | No | Render settings |

#### Payments / email

| Variable | Required |
|----------|----------|
| `RAZORPAY_KEY_ID` | Construction payments |
| `RAZORPAY_KEY_SECRET` | Server only |
| `RAZORPAY_WEBHOOK_SECRET` | Webhook verification |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Email |
| `SMTP_SECURE`, `EMAIL_FROM` | Optional |

#### Other

| Variable | Purpose |
|----------|---------|
| `SEED_DEMO_DATA` | Auto-seed products on startup |
| `CONSTRUCTION_AUTO_VERIFY` | Dev contractor verification |

**No `.env.example` exists in the repository today.**

### 1.16 Existing Docker / deployment configuration

| Asset | Status |
|-------|--------|
| Dockerfile | **None** |
| docker-compose | **None** |
| Kubernetes | **None** |
| Helm | **None** |
| CI/CD (GitHub Actions, etc.) | **None** |
| Render/Fly/Heroku config | **None** |

### 1.17 Ports

| Service | Port | Protocol |
|---------|------|----------|
| Frontend (Vite dev) | 3000 | HTTP |
| Frontend (Vite preview) | 4173 | HTTP |
| Backend API | 3001 | HTTP |
| Blender dev bridge | 8766 | HTTP (local only) |

**No application WebSocket listener.** `ws` is a dependency for Supabase client transport only.

### 1.18 Long-running / scheduled processes

| Process | Type | Notes |
|---------|------|-------|
| `node src/server.js` | Long-running HTTP | Main API |
| `node src/workers/design3d.js` | Long-running poller | Claims jobs from Supabase, runs Blender |
| Blender subprocess | Child process | Spawned per Design3D job |

No cron jobs or systemd units in repo.

---

## 2. Services Discovered

### 2.1 API route groups (mounted in `server.js`)

| Prefix | Domain |
|--------|--------|
| `/api/health` | Health check |
| `/api/auth` | Authentication |
| `/api/users` | User profiles |
| `/api/projects` | Project CRUD |
| `/api/projects/:id/bim` | BIM generate/modify/validate |
| `/api/ai` | AI chat, vision, intent |
| `/api/products`, `/orders`, `/quotes` | E-commerce |
| `/api/partners`, `/suppliers` | Vendor/partner |
| `/api/procurement`, `/logistics`, `/finance`, `/quality`, `/analytics` | Enterprise modules |
| `/api/construction` | Home requirements, professionals, payments |
| `/api/quotations` | Builder quote comparison |
| `/api/blueprints` | Blueprint builder |
| `/api/3d` | Design3D pipeline |
| `/api/geo` | Geo helpers |
| `/api/build-supply` | Build & supply |

### 2.2 Services to containerize (Phase 1 recommendation)

| Container | Priority | Rationale |
|-----------|----------|-----------|
| `ohisee-frontend` | **Required** | Static Vite build served by nginx/Caddy |
| `ohisee-api` | **Required** | Express API |
| `ohisee-design3d-worker` | **Optional** | Only if Design3D pipeline needed in env |

### 2.3 Services NOT to containerize

| Service | Reason |
|---------|--------|
| Supabase Postgres | Managed external |
| Supabase Auth | Managed external |
| Supabase Storage | Managed external |
| OpenAI API | External SaaS |
| Google Gemini API | External SaaS |
| Razorpay | External SaaS |
| SMTP provider | External SaaS |

### 2.4 What can remain in the monolith (Phase 1)

- BIM generation (sync, CPU-light parametric model)
- AI chat routing (Gemini / intent engine)
- Authentication
- Project CRUD
- Enterprise route modules
- Quotation parsing

### 2.5 What should become a worker (Phase 2+)

| Workload | When to extract |
|----------|-----------------|
| Design3D / Blender | **Already separate** — containerize as `design3d-worker` |
| BIM / IFC heavy processing | When IFC export or models exceed API timeout (>30s) |
| AI batch / expensive generation | When async job status UX is required |
| PDF/BOQ large exports | When file size or duration blocks API |

**No Redis required for Phase 1** unless adding a new queue abstraction. Design3D already uses Supabase as queue.

---

## 3. Runtime Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| Node.js (API) | 18.x | **20 LTS** |
| Node.js (frontend build) | 18.x | **20 LTS** |
| npm | 9+ | 10+ |
| Blender (Design3D worker only) | 3.x+ | Same version as dev |
| Memory (API pod) | 512 Mi | **512 Mi – 1 Gi** |
| Memory (frontend pod) | 128 Mi | **128 – 256 Mi** |
| Memory (Design3D worker) | 2 Gi | **4 Gi+** (Blender renders) |
| CPU (API pod) | 250m | **500m** |
| CPU (Design3D worker) | 1 core | **2+ cores** |

---

## 4. Deployment Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| In-memory BIM/project stores | **High** | Apply Supabase migrations; remove reliance on single-pod memory before multi-replica API |
| Hardcoded Supabase URL/anon key in `supabase-client.js` | **High** | Inject at build time via env; never commit keys |
| No `/ready` endpoint | Medium | Add readiness that checks Supabase connectivity |
| CORS hardcoded to localhost | Medium | Drive `FRONTEND_URL` from ConfigMap per environment |
| `multer` optional dependency | Medium | Add to production `package.json` dependencies |
| Design3D worker requires Blender + GPU optional | Medium | Separate node pool or dedicated worker Deployment |
| No request correlation IDs | Low | Add middleware before production |
| SQL migrations manual | Medium | Document migration job (init container or CI step) |
| JWT secret rotation | Medium | External secret manager + rolling restart |
| Multiple replicas + rate limiter in-memory | Low | Move to Redis-backed limiter if scaling API |

---

## 5. Docker Strategy

### 5.1 Principles

- Multi-stage builds (build → minimal runtime)
- Non-root users (`node` or `nginx`)
- `.dockerignore` for `node_modules`, `.git`, `.env`, `backend/.data`
- No secrets in images
- Health checks via `GET /api/health`

### 5.2 Proposed images

```
docker/
  frontend.Dockerfile    # Stage 1: npm ci + vite build
                         # Stage 2: nginx:alpine serves frontend/dist
  backend.Dockerfile     # Stage 1: npm ci
                         # Stage 2: node:20-alpine, copy src + prod deps
  design3d-worker.Dockerfile  # node:20 + blender (or sidecar pattern)
```

### 5.3 docker-compose (local dev only)

```yaml
services:
  frontend:   # vite dev OR nginx preview of build
  backend:    # node src/server.js, env from .env
  # design3d-worker:  # optional profile
  # NO postgres — use Supabase
  # NO redis — not required today
```

Frontend dev can proxy `/api` to backend service name `backend:3001`.

---

## 6. Kubernetes Strategy

### 6.1 Tooling

Use **Kustomize** (`k8s/base` + `k8s/overlays/{dev,staging,production}`). No Helm present; no reason to introduce both.

### 6.2 Base resources (initial)

| Resource | Services |
|----------|----------|
| Deployment + Service | `frontend`, `backend` |
| Deployment | `design3d-worker` (optional, staging/prod overlay) |
| Ingress | `ohisee.com`, `www.ohisee.com`, `api.ohisee.com` |
| ConfigMap | Non-secret env |
| Secret | JWT, Supabase service role, API keys |
| HPA | `backend` (production) |
| PDB | `backend` (production, minAvailable: 1) |
| ServiceAccount | Per deployment |

### 6.3 Domain structure (production)

| Host | Target |
|------|--------|
| `ohisee.com` / `www.ohisee.com` | frontend Service |
| `api.ohisee.com` | backend Service |

TLS via cert-manager + Let's Encrypt (documented, not auto-created).

### 6.4 Local Kubernetes

Recommend **kind** (lightweight, CI-friendly) over minikube for this project.

---

## 7. Required Files (to create after approval)

| File | Purpose |
|------|---------|
| `docker/frontend.Dockerfile` | Production frontend image |
| `docker/backend.Dockerfile` | Production API image |
| `docker/design3d-worker.Dockerfile` | Optional Blender worker |
| `.dockerignore` | Build hygiene |
| `docker-compose.yml` | Local dev |
| `.env.example` | Document all variables |
| `k8s/base/*` | Base manifests |
| `k8s/overlays/dev/*` | Dev patches |
| `k8s/overlays/staging/*` | Staging patches |
| `k8s/overlays/production/*` | Production patches |
| `.github/workflows/ci.yml` | Lint, test, build, scan (proposed) |
| `docs/docker-development.md` | Local Docker guide |
| `docs/kubernetes-development.md` | kind/minikube guide |
| `docs/kubernetes-production.md` | Production deploy guide |
| `docs/deployment.md` | End-to-end pipeline |
| `docs/secrets.md` | Secret management |
| `docs/monitoring.md` | Observability |
| `docs/troubleshooting.md` | Ops runbook |
| `docs/production-readiness.md` | Checklist |

---

## 8. Required Changes (application — minimal)

| Change | Reason | Breaking? |
|--------|--------|-------------|
| Add `GET /api/ready` | K8s readiness probe | No |
| Externalize Supabase anon key in frontend build | Security / env parity | No |
| Ensure `FRONTEND_URL` / `OHISEE_API_BASE` for prod builds | CORS + API routing | No |
| Document Supabase migration apply order | DB consistency | No |
| Optional: persist BIM without in-memory fallback | Multi-replica API | No API contract change |
| Add `engines.node` to package.json | Pin Node 20 | No |

**No business logic changes required for containerization.**

---

## 9. Proposed Production Architecture

```
                         USERS / CDN
                              |
                              v
                    INGRESS (TLS)
                    /              \
                   v                v
            FRONTEND pods      API pods (2+ replicas)
            (nginx static)          |
                    |         +-----+-----+
                    |         |     |     |
                    |        BIM   AI   Projects
                    |      (in-process modules)
                    |         |
                    +---------+ (same API)
                              |
              +---------------+---------------+
              |                               |
              v                               v
        DESIGN3D WORKER                  SUPABASE
        (optional, Blender)           DB + Auth + Storage
              |
              v
        OpenAI + Gemini (external APIs)
```

---

## 10. Proposed Local Development Architecture

```
docker compose up --build

  frontend:3000  ──proxy /api──►  backend:3001
                                       │
                                       ├──► Supabase (cloud or local CLI)
                                       └──► optional design3d-worker profile
```

Developer may also continue running `npm run dev` in `frontend/` and `backend/` without Docker during active development.

---

## 11. Security Changes (planned)

- Non-root container users
- Read-only root filesystem where feasible (frontend nginx)
- Secrets via K8s Secrets / external vault — never in Git
- NetworkPolicy: backend egress to Supabase + AI APIs only
- Image scanning in CI (Trivy or similar)
- Remove hardcoded credentials from `supabase-client.js`
- Service role key only on `backend` and `design3d-worker` Deployments

---

## 12. CI/CD (proposed)

Platform: **GitHub Actions** (no existing CI detected).

```
push → lint/test → docker build → security scan → push registry
     → deploy staging (manual or auto) → smoke tests
     → production approval → deploy production
```

Image tags: `ohisee-api:git-<sha>` (immutable), not `latest` in production.

---

## 13. Estimated Complexity

| Phase | Effort | Risk |
|-------|--------|------|
| Docker (frontend + backend) | 1–2 days | Low |
| docker-compose local | 0.5 day | Low |
| K8s base + dev overlay | 1–2 days | Medium |
| Staging/production overlays + Ingress/TLS | 1–2 days | Medium |
| Design3D worker image (Blender) | 2–4 days | High |
| CI/CD pipeline | 1–2 days | Medium |
| Production hardening (secrets, monitoring) | 2–3 days | Medium |

**Total Phase 1–2 (without Design3D worker): ~1 week**  
**Full platform including Blender worker: ~2 weeks**

---

## 14. Observability Gaps

| Area | Current | Target |
|------|---------|--------|
| Logging | `morgan` + `console.log` | Structured JSON to stdout |
| Metrics | None | Prometheus `/metrics` or APM |
| Tracing | None | OpenTelemetry (optional) |
| Request ID | None | `X-Request-Id` middleware |
| Health | `/api/health` only | Add `/api/ready` |

---

## 15. Stateless Application Notes

**Must be externalized before horizontal API scaling:**

1. `bimMemoryStore` — in-process Map
2. `projectMemoryStore` — in-process array
3. Rate limiter state (in-memory per pod)
4. Design3D worker temp files — use object storage (already supported)

**Already stateless:** JWT auth, Supabase data (when tables exist), static frontend.

---

## 16. Database / Migration Strategy

1. Apply `database/schema_v2.sql` (projects) if missing
2. Apply `database/apply_projects_bim.sql` or `schema_v4_bim.sql`
3. Apply Design3D schema (see `backend/tests/design3d-db.sql` for RPC references)
4. Run migrations in **CI or init Job** — **not** on every pod startup
5. Document rollback: forward-only SQL + Supabase point-in-time recovery

---

## 17. Cost Considerations

- Start with **2 API replicas** + **1 frontend replica** (frontend is cheap to scale)
- Design3D worker is **CPU/memory expensive** — scale to zero or min 0 when idle (KEDA optional later)
- Do not provision GPU nodes unless Blender GPU rendering is required
- Supabase plan covers DB/auth/storage — no self-hosted Postgres cost
- OpenAI/Gemini costs are usage-based — mock in CI

---

## 18. Approval Gate Summary

### A. CURRENT ARCHITECTURE

- Vite 5 MPA frontend (:3000) + Express API (:3001)
- Supabase for DB/auth/storage (managed)
- Gemini + OpenAI server-side
- BIM sync in API with memory fallback
- Design3D async via Supabase queue + Blender worker
- No Docker/K8s/CI today

### B. PROPOSED DOCKER ARCHITECTURE

| Image | Base | Serves |
|-------|------|--------|
| `ohisee-frontend` | nginx:alpine | `frontend/dist` static assets |
| `ohisee-api` | node:20-alpine | Express API |
| `ohisee-design3d-worker` | node:20 + blender | Optional async 3D jobs |

`docker-compose.yml` for local: frontend + backend (+ optional worker profile).

### C. PROPOSED KUBERNETES ARCHITECTURE

Kustomize overlays:

- **dev:** 1 replica each, NodePort or port-forward
- **staging:** 2 API replicas, Ingress with staging domains
- **production:** 2–10 API replicas (HPA), 2+ frontend replicas, PDB, TLS Ingress

### D. SERVICES TO CONTAINERIZE

1. Frontend (static build)
2. Backend API
3. Design3D worker (optional, when 3D pipeline enabled)

### E. SERVICES NOT TO CONTAINERIZE

- Supabase (Postgres, Auth, Storage)
- OpenAI, Gemini, Razorpay, SMTP

### F. FILES TO CREATE

Listed in Section 7 above (Dockerfiles, compose, k8s/, docs/, `.env.example`, CI workflow).

### G. FILES TO MODIFY (minimal)

| File | Change |
|------|--------|
| `backend/src/server.js` | Add `/api/ready` |
| `frontend/js/supabase-client.js` | Build-time env injection for Supabase URL/anon key |
| `frontend/vite.config.js` | Optional `define` for API base URL in prod |
| `backend/package.json` | Add `engines`, ensure `multer` in dependencies if uploads needed |
| `frontend/package.json` | Add `engines` |

### H. NEW DEPENDENCIES

| Dependency | Where | Purpose |
|------------|-------|---------|
| `multer` | backend production deps | Quotation upload (currently optional) |
| None for Redis/queue | — | Not needed Phase 1 |

Infrastructure tools (not app deps): Docker, kubectl, kustomize, kind, cert-manager (cluster).

### I. ENVIRONMENT VARIABLES

See Section 1.15. `.env.example` will be created in Phase 3 with dev/staging/prod separation documented.

**Frontend (build-time / runtime config):**

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_BASE` (optional, default `/api`)

**Backend (runtime secrets):**

- `JWT_SECRET`, `SUPABASE_*`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, payment/SMTP keys

### J. SECURITY CHANGES

- Non-root containers, no secrets in images
- Externalize hardcoded Supabase anon key
- Service role only on backend/worker
- TLS at Ingress
- NetworkPolicies for backend egress
- Image + dependency scanning in CI

### K. DEPLOYMENT PLAN

| Phase | Deliverable |
|-------|-------------|
| 1 | This analysis (**complete**) |
| 2 | `.env.example` + `/api/ready` |
| 3 | Dockerfiles + `.dockerignore` |
| 4 | `docker-compose.yml` + `docs/docker-development.md` |
| 5 | `k8s/base` + dev overlay |
| 6 | Staging/production overlays |
| 7 | Ingress + TLS docs |
| 8 | CI pipeline (build, scan, push) |
| 9 | Staging deploy + smoke tests |
| 10 | Production readiness review |

### L. RISKS

1. Multi-replica API with in-memory BIM/project cache → inconsistent data
2. Blender worker image size and build complexity
3. Missing DB migrations in Supabase → silent fallback to memory
4. Dual auth paths (JWT + Supabase client) increase test surface
5. Long synchronous BIM calls may timeout Ingress/load balancer (mitigate later with workers)

### M. ROLLBACK PLAN

- **Kubernetes:** `kubectl rollout undo deployment/ohisee-api` (and frontend)
- **Images:** Immutable tags allow redeploy of previous SHA
- **Database:** Supabase PITR; migrations are forward-only with manual rollback scripts
- **Secrets:** Version in secret manager; rollback = redeploy previous secret version + restart pods

---

## 19. Next Step

**STOP — awaiting approval before Phase 2.**

No Dockerfiles, Kubernetes manifests, or application changes have been made.

Please review sections **A–M** and approve to proceed with:

1. `.env.example` + health/readiness endpoints
2. Docker multi-stage builds
3. docker-compose local environment
4. Kustomize base + overlays

---

*End of Phase 1 infrastructure analysis.*
