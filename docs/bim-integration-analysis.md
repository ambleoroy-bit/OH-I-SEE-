# OH I SEE — BIM Integration Analysis (Phase 1)

**Status:** Read-only audit — no application code was modified.  
**Date:** 2026-09-12  
**Scope:** Inspect existing OH I SEE repository and define how BIM should be integrated without breaking current functionality.

---

## 1. Existing Architecture

### 1.1 Repository layout

| Path | Role | Active? |
|------|------|---------|
| `frontend/` | Primary UI — Vite 5 MPA, vanilla HTML/JS/CSS | **Yes** |
| `backend/` | Primary API — Express on port 3001 | **Yes** |
| `database/` | Manual SQL schemas (`schema.sql`, `schema_v2.sql`, `schema_v3.sql`) | **Yes** |
| `docs/` | Setup and architecture documentation | **Yes** |
| `output/` | Sample 3D renders / test artifacts | Reference only |
| `src/` | Legacy duplicate of older backend | **No — ignore** |
| `backend/src_old/` | Archived backend | **No — ignore** |
| `frontend/static_html/` | Static HTML snapshots | **No — ignore** |
| `frontend/vanilla_vite/` | Older Vite copy | **No — ignore** |
| `frontend/react_vite/` | Disconnected React storefront prototype | **No — ignore for BIM v1** |

### 1.2 Runtime stack

```
Browser (Vite dev :3000)
    │  /api/* proxied
    ▼
Express API (:3001)
    │  service role
    ▼
Supabase PostgreSQL + Auth + Storage
```

| Layer | Technology |
|-------|------------|
| Frontend | Vite 5, vanilla JS, Three.js ^0.170 (`design3d-viewer.js`) |
| Backend | Node.js, Express, JWT auth, `@supabase/supabase-js` |
| AI (chat/BOQ) | Google Gemini (`backend/src/services/aiService.js`) |
| AI (3D pipeline) | OpenAI Responses API + Blender worker |
| Database | Supabase Postgres (schemas applied manually, no migration runner in repo) |

### 1.3 Routing model (critical for BIM)

OH I SEE is a **multi-page application (MPA)**. There is **no client-side router** like React Router for construction flows.

**Current project URLs:**

| User-facing URL | File |
|-----------------|------|
| `/pages/project-detail.html?id=PRJ-xxx` | `frontend/pages/project-detail.html` |
| `/pages/intent-engine.html?intent=NEW_HOME` | `frontend/pages/intent-engine.html` |
| `/pages/blueprint-builder.html` | `frontend/pages/blueprint-builder.html` |
| `/pages/visualizer-3d.html?design=<uuid>` | `frontend/pages/visualizer-3d.html` |

**Requested BIM URL:** `/projects/:projectId/bim`

This does **not** exist today. The equivalent MPA pattern would be:

`/pages/project-bim.html?projectId=PRJ-xxx`

or a future SPA shell. Phase 2 should adopt a **logical route** (`/projects/:projectId/bim`) via:

- Vite history fallback + thin router page, **or**
- Query-param MPA pages consistent with existing patterns (`project-bim.html?projectId=`)

### 1.4 Authentication

| Concern | Implementation |
|---------|----------------|
| Signup / Login | `frontend/pages/login.html` (tabs) → `POST /api/auth/signup`, `POST /api/auth/login` |
| Forgot password | Modal in `login.html` → `POST /api/auth/forgot-password` (Supabase reset email) |
| Reset password | `#reset` hash handler in `login.html` |
| Session | App JWT in `localStorage` (`ohisee_jwt`, `ohisee_token`) |
| Middleware | `backend/src/middleware/auth.js` |
| E-commerce | Separate direct Supabase browser client (`frontend/js/supabase-client.js`) |

**BIM recommendation:** Use the **Express JWT pattern** exclusively. Do not expose service role keys to the BIM viewer.

---

## 2. Existing Project Workflow

### 2.1 Project creation paths

```
Landing (index.html)
    ├── Intent Engine (NEW_HOME / RENOVATION / ELECTRICAL)
    │       └── intent-engine.html + intent-wizard.js
    │       └── POST/PUT /api/projects (construction_context, intentAnswers)
    ├── Project Wizard (8-step)
    │       └── project-wizard.html
    ├── Home Requirements form
    │       └── POST /api/construction/home-requirements
    └── AI Assistant chat
            └── POST /api/ai/intent → redirect to intent-engine
```

**Key files:**

| File | Purpose |
|------|---------|
| `frontend/pages/intent-engine.html` | Main requirements + AI report + project save |
| `frontend/js/intent-wizard.js` | NEW_HOME single-page requirements grid |
| `backend/src/services/intentEngine.js` | Intent keywords, question banks, payload builder |
| `backend/src/routes/projects.js` | CRUD, vendor marketplace, employees |
| `frontend/pages/project-detail.html` | Project dashboard (module grid) |
| `frontend/js/api/projects.js` | Frontend project API client |

### 2.2 Project identity

- Public ID: `project_id` string (e.g. `PRJ-xxxxxxxx`)
- Internal UUID: `projects.id`
- Rich JSON: `construction_context` (homeRequirements, intentAnswers, attachments)
- Progress columns: `progress_design`, `progress_boq`, etc.

### 2.3 Current project dashboard modules

From `project-detail.html` `MODULES` array:

| Module | Link today | BIM relevance |
|--------|------------|---------------|
| Design | `#` (placeholder) | → 3D Home |
| Blueprint | `bulk-quote.html?mode=blueprint` | Should → Floor Plan |
| BOQ | `#` | → Quantities / BOQ |
| Estimate | `#` | → Cost Estimate |
| Products | `products.html` | Marketplace |
| Professionals | `#professionals-section` | Exists inline |
| Construction | `#` | Future build tracking |

**Gap:** No Overview, Requirements, Floor Plan, 3D Home, BIM & Technical, Materials, Export workspace pages.

### 2.4 Post-generation flow today

After intent engine completion → `account.html#projects` (not a dedicated project overview).

**Target flow (per spec):**

```
Review & Generate → CREATE WITH AI
    → Parse → Validate → Structured JSON → BIM → 2D → 3D → BOQ → Cost
    → Save BIM version
    → Redirect to /projects/:projectId/overview
```

This pipeline **does not exist** as an orchestrated server workflow today.

---

## 3. Existing AI Architecture

### 3.1 Gemini (primary)

| Endpoint | File | Purpose |
|----------|------|---------|
| `POST /api/ai/chat` | `backend/src/routes/ai.js` | Conversational assistant |
| `POST /api/ai/vision` | same | Image analysis |
| `POST /api/ai/boq` | same | BOQ generation for project |
| `POST /api/ai/intent` | same | Intent detection → redirect |
| `POST /api/ai/question` | same | Progressive Q&A |

Service: `backend/src/services/aiService.js` (Gemini 1.5 Flash, fallback to keyword intent engine).

### 3.2 OpenAI (3D design only)

| Component | File |
|-----------|------|
| Orchestrator | `backend/src/services/design3d/orchestrator.js` |
| Worker | `backend/src/workers/design3d.js` (Blender) |
| Routes | `backend/src/routes/design3d.js` → `/api/3d/*` |

Produces: structured design spec JSON → Blender → `.glb`, `.blend`, PNG renders.

### 3.3 Intent engine (non-LLM)

`backend/src/services/intentEngine.js` — keyword matching, question banks, `buildProjectPayload()`.

### 3.4 AI → BIM gap

Today there is **no**:

- AI requirement parser producing validated building schema
- Building rules validator
- BIM generator
- BIM validator
- Orchestrated pipeline tying intent answers → BIM → derivatives

**Required pipeline (future):**

```
User prompt / intent answers
    → AI requirement parser (structured JSON only — no HTML/CSS/SQL)
    → Schema validation (JSON Schema / Ajv)
    → Building rules validation
    → BIM generation service
    → Geometry generation (parametric)
    → BIM validation
    → 2D + 3D + quantities + BOQ + cost (all from BIM)
```

---

## 4. Existing Supabase Schema

### 4.1 Checked-in SQL files

| File | Tables |
|------|--------|
| `database/schema.sql` | `users`, `products`, `cart`, `orders`, `bulk_quotes` + RLS |
| `database/schema_v2.sql` | `projects`, `project_members`, `boqs`, `estimates`, procurement, finance, quality, etc. |
| `database/schema_v3.sql` | Extends `projects`, `intent_sessions`, `blueprints`, `builder_quotations`, `quote_comparisons`, `service_requests`, `analytics_events` |

### 4.2 `projects` table (relevant fields)

From schema v2/v3 + code usage:

```sql
project_id TEXT UNIQUE          -- PRJ-xxx (API-facing)
id UUID PRIMARY KEY
user_id UUID
project_name, project_type, location, plot_size, floors, bedrooms, bathrooms, budget
construction_context JSONB        -- homeRequirements, intentAnswers, vendor data
ai_analysis JSONB
boq_data JSONB
intent_type TEXT                  -- NEW_HOME, RENOVATION, etc.
progress_design, progress_boq, progress_estimate, progress_construction, ...
estimated_cost NUMERIC
```

### 4.3 `blueprints` table (v3)

```sql
blueprint_id, project_id, user_id, version
requirements JSONB
layout_data JSONB                 -- room rectangles, walls, doors (concept level)
validation_result JSONB
svg_content TEXT
```

### 4.4 Tables referenced in code but NOT in `database/*.sql`

| Table | Used by |
|-------|---------|
| `oh3d_projects`, `oh3d_jobs`, `oh3d_versions`, `oh3d_worker_leases` | `/api/3d/*`, design3d worker |
| `construction_professionals`, `construction_engagements`, `construction_notifications` | `/api/construction/*` |
| `project_employees` | `/api/projects/:id/employees` |

**Schema drift risk:** Production DB may not match checked-in SQL. Verify before BIM migrations.

### 4.5 RLS status

- RLS policies exist for e-commerce tables in `schema.sql`
- **`projects` and v2/v3 tables: no RLS in checked-in SQL**
- Backend uses **service role** and enforces `user_id` in route handlers

**BIM tables must implement RLS** per spec (users only access BIM for authorized projects).

---

## 5. Existing 2D Architecture

### 5.1 Blueprint Builder

| File | Role |
|------|------|
| `frontend/pages/blueprint-builder.html` | 3-step UI: Requirements → Review → Blueprint |
| `frontend/js/blueprint-cad.js` | **CAD data adapter** — rooms, walls, doors, windows JSON |
| `frontend/js/blueprint-cad-ui.js` | Canvas/SVG UI |
| `frontend/js/blueprint-styles.js` | Presentation styling |
| `backend/src/routes/blueprint.js` | `POST/GET /api/blueprints` |

### 5.2 Blueprint data model (today)

`BlueprintCAD.create()` outputs:

- `rooms[]`, `walls[]`, `doors[]`, `windows[]`
- `design_status: 'concept_requires_review'`
- `construction_ready: false`
- Explicit disclaimer: *"Room rectangles are not a construction-ready wall model"*

### 5.3 2D → BIM relationship

| Aspect | Today | Target |
|--------|-------|--------|
| Source of truth | Independent `layout_data` JSON in `blueprints` | **BIM model** |
| Wall definition | Room boundary lines, thickness `null` | Parametric walls (start, end, height, thickness) |
| Door/window | Opening widths from drawing, heights unconfirmed | Wall-hosted parametric openings |
| Floor plan page | `blueprint-builder.html` (standalone) | `/projects/:projectId/floor-plan` reading BIM |
| Selection sync | None | 2D selection = BIM element selection |

**Migration path:** Treat `BlueprintCAD` output as **input hints** to BIM generator, not as BIM itself. Eventually deprecate independent `layout_data` as source of truth.

---

## 6. Existing 3D Architecture

### 6.1 Two parallel systems

**A. Real AI pipeline (OpenAI + Blender)**

```
POST /api/3d/projects → oh3d_projects (UUID)
    → oh3d_jobs queue
    → Worker (Blender)
    → oh3d_versions (GLB, blend, PNG artifacts)
```

Files: `backend/src/routes/design3d.js`, `frontend/js/design3d.js`, `frontend/js/design3d-viewer.js` (Three.js GLTF).

**B. Browser demo visualizer**

`frontend/pages/visualizer-3d.html` — legacy Three.js r134 CDN, extrudes 2D rectangles.

### 6.2 ID namespace collision

| System | ID format | Table |
|--------|-----------|-------|
| Construction projects | `PRJ-xxx` | `public.projects` |
| 3D design jobs | UUID | `oh3d_projects` |

**No foreign key** links `projects.project_id` → `oh3d_projects` in visible schema.

### 6.3 3D → BIM relationship

| Aspect | Today | Target |
|--------|-------|--------|
| Source of truth | GLB mesh / Blender scene | **BIM model** (mesh is representation) |
| Homeowner view | `visualizer-3d.html` + design3d viewer | `/projects/:projectId/3d` from BIM |
| Technical view | Does not exist | `/projects/:projectId/bim` |
| Walk mode / FPS | Partial in visualizer | Both views from same BIM geometry |

**Rule:** A GLTF file is **not** BIM. The BIM engine generates render meshes from parametric objects.

---

## 7. Where BIM Will Be Integrated

### 7.1 Placement (per spec — NOT on landing or onboarding)

```
OH I SEE
├── Home / Landing                    (unchanged)
├── New Home wizard                   (unchanged fields — triggers BIM generation on submit)
└── PROJECT WORKSPACE                 (extend project-detail.html)
     ├── Overview          → project-overview.html?projectId=
     ├── Requirements      → (section or page — reads construction_context)
     ├── Floor Plan        → project-floor-plan.html?projectId=
     ├── 3D Home           → project-3d.html?projectId=     (homeowner)
     ├── BIM & Technical   → project-bim.html?projectId=    (technical)
     ├── Materials         → project-materials.html?projectId=
     ├── Quantities / BOQ  → project-boq.html?projectId=
     ├── Cost Estimate     → project-cost.html?projectId=
     ├── Professionals     → (existing inline section)
     └── Export            → project-export.html?projectId=
```

### 7.2 BIM page location

**Primary technical interface:**

- Logical: `/projects/:projectId/bim`
- MPA equivalent: `/pages/project-bim.html?projectId=PRJ-xxx`

**Must contain:**

- Header (project name, Save, Version, Validate, Export IFC)
- View controls (2D / 3D / BIM Data)
- Layer panel (Architecture, Structure, MEP, Site)
- Main viewer (orbit, pan, zoom, selection, hide/show, floor isolation)
- Element information panel (real BIM object data — not fake UI)

### 7.3 Homeowner vs technical

| View | Route | Audience |
|------|-------|----------|
| 3D Home | `/projects/:projectId/3d` | Homeowner — beautiful, materials, walkthrough |
| BIM & Technical | `/projects/:projectId/bim` | Architects, engineers, QS — IDs, properties, layers, IFC |

**Both read the same BIM model.**

### 7.4 Integration anchors (existing code to extend)

| Anchor | File | Change type |
|--------|------|-------------|
| Project dashboard | `frontend/pages/project-detail.html` | Add workspace nav modules |
| Project API | `backend/src/routes/projects.js` | Add BIM status, generation trigger |
| Intent completion | `frontend/pages/intent-engine.html` | Redirect to overview, not account |
| Blueprint CAD | `frontend/js/blueprint-cad.js` | Feed BIM generator (input adapter) |
| 3D viewer | `frontend/js/design3d-viewer.js` | Reuse Three.js patterns for BIM mesh renderer |
| AI service | `backend/src/services/aiService.js` | New structured building JSON parser (no geometry) |

---

## 8. Proposed BIM Architecture

### 8.1 Core principle

```
USER REQUIREMENTS
        ↓
STRUCTURED BUILDING JSON     (AI output — validated schema)
        ↓
BIM MODEL                    (source of truth — parametric objects + relationships)
        ↓
 ┌──────┼────────┬────────┐
 ↓      ↓        ↓        ↓
2D     3D     QUANTITY   COST
PLAN   HOME   TAKEOFF    ENGINE
        ↓        ↓        ↓
        └──── BOQ ───────┘
                ↓
            IFC EXPORT
```

### 8.2 Proposed backend module structure

Adapt to existing `backend/src/` layout:

```
backend/src/
├── bim/
│   ├── core/
│   │   ├── BimModel.ts/js          # Root model container
│   │   ├── BimElement.ts/js        # Base element type
│   │   └── BimRelationship.ts/js
│   ├── models/
│   │   ├── Wall.js, Door.js, Window.js, Room.js, Slab.js, ...
│   │   └── index.js
│   ├── geometry/
│   │   ├── parametricWall.js
│   │   ├── parametricDoor.js
│   │   └── meshBuilder.js          # BIM → Three.js buffers (render only)
│   ├── generation/
│   │   ├── requirementsToBim.js  # Structured JSON → BIM
│   │   └── blueprintAdapter.js     # Legacy BlueprintCAD → BIM hints
│   ├── calculations/
│   │   ├── quantities.js
│   │   └── boq.js
│   ├── validation/
│   │   ├── bimValidator.js
│   │   └── rules/
│   ├── ifc/
│   │   └── exportService.js        # Isolated IFC service (web-ifc or similar)
│   ├── versioning/
│   │   └── versionManager.js
│   └── routes/
│       └── bim.js                  # /api/projects/:projectId/bim/*
├── services/
│   └── bimGenerationPipeline.js    # Orchestrates AI → BIM → derivatives
```

**Frontend module structure:**

```
frontend/
├── pages/
│   ├── project-overview.html
│   ├── project-bim.html
│   ├── project-3d.html
│   ├── project-floor-plan.html
│   ├── project-boq.html
│   ├── project-cost.html
│   ├── project-materials.html
│   └── project-export.html
├── js/
│   └── bim/
│       ├── bim-viewer.js           # Technical viewer (layers, properties)
│       ├── home-3d-viewer.js       # Homeowner viewer (materials, walk)
│       ├── floor-plan-viewer.js    # 2D from BIM
│       └── api/bim.js              # API client
```

Use **TypeScript** for BIM domain types if introducing a build step; otherwise JSDoc + JSON Schema validation with Ajv (already in backend deps).

### 8.3 BIM element model (domain)

Every BIM object:

```typescript
interface BimElement {
  id: string;
  globalId: string;           // IFC-compatible GUID
  type: BimElementType;
  name: string;
  description?: string;
  storeyId: string;
  geometry: GeometryRef;      // parametric definition, not mesh
  position: Vector3;
  rotation: Vector3;
  dimensions: Record<string, number>;
  materialId?: string;
  properties: Record<string, unknown>;
  quantity: QuantitySet;
  relationships: BimRelationship[];
  createdAt: string;
  updatedAt: string;
}
```

**Parametric examples:**

- Wall: `startPoint`, `endPoint`, `height`, `thickness`, `openings[]`
- Door: `hostWallId`, `positionOnWall`, `width`, `height`
- Slab: `boundaryPolygon`, `thickness`

### 8.4 Relationship graph

```
Building → Storeys → Rooms, Walls, Slabs, Columns, Beams
Room → boundaryWalls[], doors[], windows[], furniture[]
Wall → doors[], windows[], material
Door → hostWall, roomFrom, roomTo
```

Stored in `bim_relationships` table and queryable in the BIM viewer properties panel.

---

## 9. Proposed Database Changes

### 9.1 New tables (do not duplicate `users` or `projects`)

```sql
-- Core BIM storage (keyed to projects.id UUID internally, project_id TEXT for API)

bim_models (
  id UUID PK,
  project_id UUID FK → projects(id),
  current_version_id UUID FK → bim_versions(id),
  status TEXT,                    -- draft | validated | exported
  created_at, updated_at
)

bim_versions (
  id UUID PK,
  bim_model_id UUID FK,
  version_number INT,
  label TEXT,                     -- "Version 1 — 4 bedrooms"
  structured_input JSONB,         -- AI/requirements snapshot
  model_snapshot JSONB,           -- full BIM JSON at this version
  validation_result JSONB,
  created_by UUID FK → users(id),
  created_at
)

bim_elements (
  id UUID PK,
  bim_version_id UUID FK,
  global_id TEXT UNIQUE,
  type TEXT,
  name TEXT,
  storey_id TEXT,
  geometry JSONB,                 -- parametric definition
  properties JSONB,
  quantity JSONB,
  created_at, updated_at
)

bim_relationships (
  id UUID PK,
  bim_version_id UUID FK,
  source_element_id UUID FK,
  target_element_id UUID FK,
  relationship_type TEXT,         -- contains | hosted_by | bounds | connects
  properties JSONB
)

bim_materials (
  id UUID PK,
  bim_version_id UUID FK,
  name TEXT,
  category TEXT,
  properties JSONB,
  unit_price_ref UUID NULL        -- future marketplace link
)

bim_quantities (
  id UUID PK,
  bim_version_id UUID FK,
  element_id UUID FK,
  measure_type TEXT,              -- volume | area | count | length
  value NUMERIC,
  unit TEXT,
  boq_line_ref UUID NULL
)

bim_files (
  id UUID PK,
  bim_version_id UUID FK,
  file_type TEXT,                   -- ifc | bim_json | pdf_floor_plan
  storage_path TEXT,
  created_at
)
```

### 9.2 Extend existing tables (minimal)

```sql
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS bim_model_id UUID REFERENCES bim_models(id),
  ADD COLUMN IF NOT EXISTS bim_generation_status TEXT DEFAULT 'none';
  -- none | pending | generating | ready | failed

ALTER TABLE blueprints
  ADD COLUMN IF NOT EXISTS bim_version_id UUID REFERENCES bim_versions(id);
  -- links legacy blueprint row to BIM version that superseded it
```

### 9.3 Link 3D design jobs (optional Phase 2)

```sql
ALTER TABLE oh3d_projects  -- if table exists in production
  ADD COLUMN IF NOT EXISTS construction_project_id UUID REFERENCES projects(id);
```

### 9.4 RLS policies (required)

- `bim_models`: user can SELECT/INSERT/UPDATE only if `project_id` belongs to `auth.uid()` or `project_members`
- Same pattern for child tables via `bim_version_id` → `bim_models.project_id`
- Service role bypasses RLS (backend worker); browser uses JWT → backend API, not direct Supabase for BIM writes

### 9.5 Migration file

Create: `database/schema_v4_bim.sql` (manual apply, consistent with repo convention).

---

## 10. Required Dependencies

### 10.1 Backend (new)

| Package | Purpose | Notes |
|---------|---------|-------|
| `ajv` | Already present | JSON Schema validation for AI building output |
| `uuid` | Already present | GlobalId generation |
| `web-ifc` or `@thatopen/components` | IFC export | Evaluate license + maintenance; isolate in `bim/ifc/` |
| Optional: `mathjs` | Quantity calculations | Lightweight geometry math |

### 10.2 Frontend (new)

| Package | Purpose | Notes |
|---------|---------|-------|
| `three` | Already present ^0.170 | BIM mesh renderer, orbit controls |
| Optional: `@thatopen/components` | IFC viewing | If client-side IFC preview needed |
| Optional: `d3` or `paper.js` | 2D floor plan canvas | Or SVG renderer from BIM |

### 10.3 Do NOT add yet

- Full Revit/IFC authoring SDKs until export path is proven
- Separate 3D engine from Three.js (reuse existing `design3d-viewer.js` patterns)

---

## 11. Implementation Phases

Aligned with spec §32. **Phase 1 is complete (this document).**

| Phase | Deliverable | Depends on |
|-------|-------------|------------|
| **1** | This analysis document | — |
| **2** | Architecture sign-off + file change approval | Phase 1 |
| **3** | BIM TypeScript/domain models + JSON Schema | Phase 2 |
| **4** | Supabase `schema_v4_bim.sql` + RLS | Phase 2 |
| **5** | AI → structured building JSON parser | Phase 3 |
| **6** | Structured JSON → BIM generator | Phase 3, 4 |
| **7** | Parametric geometry + mesh builder | Phase 6 |
| **8** | BIM → Floor Plan viewer page | Phase 7 |
| **9** | BIM → 3D Home viewer page | Phase 7 |
| **10** | BIM & Technical page | Phase 7, 8, 9 |
| **11** | BIM validation engine | Phase 6 |
| **12** | Quantity engine | Phase 6 |
| **13** | BOQ page | Phase 12 |
| **14** | Cost engine + page | Phase 12, 13 |
| **15** | IFC export service | Phase 6, 11 |
| **16** | Version control UI + API | Phase 4 |
| **17** | Intent engine → pipeline → overview redirect | Phase 5–10 |
| **18** | Demo project "OH I SEE Demo House" + E2E tests | All |

---

## 12. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Schema drift (DB ≠ checked-in SQL) | High | Run schema audit on production Supabase before v4 migration |
| Dual project ID spaces (`PRJ-xxx` vs `oh3d` UUID) | High | Single `bim_models.project_id` FK; explicit linking table |
| Blueprint data not construction-ready | Medium | BIM generator treats blueprint as hints; validate and flag gaps |
| GLB mistaken for BIM | High | Enforce architecture rule in code reviews; separate `bim_elements` from `render_meshes` |
| MPA routing vs `/projects/:id/bim` | Medium | Adopt logical routes in API; MPA pages with query params + optional Vite rewrite |
| AI hallucinating geometry | High | AI outputs JSON only; geometry only from BIM engine |
| IFC library maturity | Medium | Isolate export service; ship BIM JSON export first |
| Performance on large models | Medium | Lazy load elements by storey; instancing; separate render cache |
| Breaking existing intent-engine UX | High | **Do not change form fields**; add pipeline behind existing submit |
| Dual auth (JWT + Supabase browser) | Medium | BIM API only via Express JWT |

---

## 13. Files That Need Modification (Phase 2+)

**Await approval before editing.**

| File | Why |
|------|-----|
| `frontend/pages/project-detail.html` | Add workspace navigation (Overview, Floor Plan, 3D, BIM, BOQ, etc.) |
| `frontend/pages/intent-engine.html` | Post-generation redirect to project overview; optional generation status UI |
| `frontend/vite.config.js` | Register new workspace pages in build inputs |
| `backend/src/server.js` | Mount `/api/projects/:projectId/bim` routes |
| `backend/src/routes/projects.js` | `bim_generation_status`, trigger generation endpoint |
| `backend/src/services/intentEngine.js` | Hook into generation pipeline (no field changes) |
| `backend/src/services/aiService.js` | Structured building JSON parser endpoint |
| `frontend/js/intent-wizard.js` | Redirect target after project creation |
| `frontend/js/api/projects.js` | BIM status, overview helpers |
| `database/schema_v3.sql` | Reference only — add v4 file instead |

**Do NOT modify (unless explicitly approved):**

- `frontend/pages/index.html` (landing)
- `frontend/pages/login.html` (auth)
- Existing form field definitions in `intent-engine.html` / `intent-wizard.js`
- `frontend/css/global.css` (global styling — extend via new BIM CSS files)

---

## 14. New Files to Create (Phase 2+)

**Await approval before creating.**

### Database

| File | Purpose |
|------|---------|
| `database/schema_v4_bim.sql` | BIM tables + RLS + project extensions |

### Backend

| File | Purpose |
|------|---------|
| `backend/src/bim/core/BimModel.js` | Root model |
| `backend/src/bim/models/*.js` | Wall, Door, Window, Room, etc. |
| `backend/src/bim/geometry/parametricWall.js` | Parametric wall geometry |
| `backend/src/bim/geometry/meshBuilder.js` | BIM → render mesh |
| `backend/src/bim/generation/requirementsToBim.js` | JSON → BIM |
| `backend/src/bim/validation/bimValidator.js` | Pre-save validation |
| `backend/src/bim/calculations/quantities.js` | Quantity takeoff |
| `backend/src/bim/ifc/exportService.js` | IFC export (isolated) |
| `backend/src/bim/versioning/versionManager.js` | Version CRUD |
| `backend/src/routes/bim.js` | REST API |
| `backend/src/services/bimGenerationPipeline.js` | End-to-end orchestration |
| `backend/src/schemas/building-requirements.schema.json` | AI output validation |

### Frontend

| File | Purpose |
|------|---------|
| `frontend/pages/project-overview.html` | Default workspace landing |
| `frontend/pages/project-bim.html` | BIM & Technical viewer |
| `frontend/pages/project-3d.html` | Homeowner 3D view |
| `frontend/pages/project-floor-plan.html` | 2D from BIM |
| `frontend/pages/project-boq.html` | Quantities / BOQ |
| `frontend/pages/project-cost.html` | Cost estimate |
| `frontend/pages/project-materials.html` | Materials |
| `frontend/pages/project-export.html` | IFC / JSON / PDF export |
| `frontend/js/bim/api/bim.js` | API client |
| `frontend/js/bim/bim-viewer.js` | Technical viewer |
| `frontend/js/bim/home-3d-viewer.js` | Homeowner viewer |
| `frontend/js/bim/floor-plan-viewer.js` | 2D viewer |
| `frontend/css/project-workspace.css` | Shared workspace styles |
| `frontend/css/bim-viewer.css` | BIM page styles |

### Tests

| File | Purpose |
|------|---------|
| `backend/tests/bim-validator.test.js` | Validation rules |
| `backend/tests/bim-quantities.test.js` | Quantity calculations |
| `backend/tests/bim-pipeline.test.js` | E2E: requirements → BIM → BOQ |
| `backend/tests/fixtures/demo-house-requirements.json` | Demo project input |

### Documentation

| File | Purpose |
|------|---------|
| `docs/bim-api.md` | API reference (Phase 2+) |

---

## 15. Files to Delete

**None recommended in Phase 1.**

Do **not** delete:

- `blueprint-builder.html` / `blueprint-cad.js` — migrate gradually to BIM-fed floor plan
- `visualizer-3d.html` / `design3d.js` — reuse viewer patterns; link to BIM-backed 3D page
- Legacy folders (`src/`, `src_old/`, `static_html/`) — out of BIM scope; separate cleanup

---

## Appendix A — Demo Project Specification

**OH I SEE Demo House** (for Phase 18 testing):

| Attribute | Value |
|-----------|-------|
| Floors | 2 |
| Area | 2000 sq.ft |
| Bedrooms | 4 |
| Bathrooms | 3 |
| Rooms | Living, kitchen, dining, balcony, parking |
| Input prompt | *"I want a 2-floor 2000 sq.ft 4-bedroom house."* |

**Expected outputs:** valid structured requirements, BIM model with rooms/walls/doors/windows/slabs, 2D plan, 3D home, quantities, BOQ, cost, valid IFC.

---

## Appendix B — Current vs Target Project Workspace Navigation

| Workspace item | Exists today | Target route |
|----------------|--------------|--------------|
| Overview | Partial (`project-detail.html`) | `/projects/:projectId/overview` |
| Requirements | In `construction_context` only | `/projects/:projectId/requirements` |
| Floor Plan | `blueprint-builder.html` (unlinked) | `/projects/:projectId/floor-plan` |
| 3D Home | `visualizer-3d.html` (separate IDs) | `/projects/:projectId/3d` |
| BIM & Technical | **Missing** | `/projects/:projectId/bim` |
| Materials | **Missing** | `/projects/:projectId/materials` |
| Quantities / BOQ | Placeholder module | `/projects/:projectId/boq` |
| Cost Estimate | Placeholder module | `/projects/:projectId/cost` |
| Professionals | Inline in project-detail | Keep or `/projects/:projectId/professionals` |
| Export | **Missing** | `/projects/:projectId/export` |

---

## Appendix C — Approval Checklist (Phase 2 Gate)

Before any implementation, confirm:

- [ ] MPA routing strategy (`project-*.html?projectId=` vs SPA rewrite)
- [ ] `database/schema_v4_bim.sql` table design
- [ ] IFC library choice (`web-ifc` vs alternatives)
- [ ] TypeScript introduction vs JSDoc + Ajv for BIM domain
- [ ] Whether to link or replace `oh3d_projects` pipeline
- [ ] Phase 2 file list (§13–§14) approved
- [ ] Demo project priority for early testing

---

**End of Phase 1 analysis. No code changes were made. Awaiting approval to proceed to Phase 2.**
