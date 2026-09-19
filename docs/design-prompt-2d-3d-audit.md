# OH I SEE — Design Prompt / 2D / 3D / BIM Audit

**Date:** 2026-09-13  
**Status:** Phase 1 complete — audit only, no major implementation  
**Scope:** Repository inspection for canonical building model, design prompt engine, 2D/3D/BIM sync, materials, BOQ, persistence, Docker/K8s

---

## Executive Summary

OH I SEE already has a **partial single-source-of-truth architecture** in the **project workspace** (Floor Plan, 3D Home, BIM & Technical). All three views read the same BIM JSON from `GET /api/projects/:projectId/bim` and update together when `POST /api/projects/:projectId/bim/modify` succeeds.

However, the **Design Prompt is not a real natural-language command system**. It is a **rule-based keyword matcher** (`promptModifier.js`) that patches high-level **building requirements** (bedroom count, floors, plot size, pooja room, etc.) and then **fully regenerates** the entire BIM model. It does **not** support:

- Adding a door to a specific room/wall
- Placing a flower pot in a garden
- Resizing a single room by dimension
- Material/color/texture changes per element
- Spatial placement intelligence
- Incremental geometry edits

Additionally, **three parallel design systems** exist without shared state:

| System | Data source | Connected to workspace BIM? |
|--------|-------------|----------------------------|
| Project workspace (2D/3D/BIM) | `/api/projects/:id/bim` | Yes (internal) |
| Blueprint Builder (SVG) | Client procedural `planRooms()` | No |
| AI 3D Design (`/api/3d`) | OpenAI + Blender renders | No |

**Verdict:** The foundation for a canonical model exists, but the design prompt engine, element-level editing, spatial intelligence, materials sync, and persistence reliability must be built before the acceptance tests in the master prompt can pass.

---

## 1. Current Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (Vite MPA)                           │
├─────────────────────────────────────────────────────────────────────────┤
│  intent-engine / project-wizard / home-requirements                     │
│       │ POST /api/projects                                              │
│       │ POST /api/projects/:id/bim/generate                               │
│       ▼                                                                 │
│  Project Workspace (project-floor-plan | project-3d | project-bim)     │
│       │ BimAPI.getModel() / modify() / generate()                       │
│       │ localStorage: ohisee_bim_{projectId}                            │
│       ├─ FloorPlanViewer (Canvas 2D)                                    │
│       ├─ BimViewer mode=home (Three.js)                                 │
│       └─ BimViewer mode=technical (Three.js)                            │
│                                                                         │
│  SEPARATE (not connected):                                              │
│  • blueprint-builder.html → procedural SVG                              │
│  • design3d.js → /api/3d → OpenAI + Blender PNG/GLB                     │
│  • visualizer-3d.html → client-side demo geometry                       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         BACKEND (Express :3001)                         │
├─────────────────────────────────────────────────────────────────────────┤
│  POST /api/projects/:id/bim/modify                                      │
│       │ applyPromptToRequirements()  ← rule-based, NO LLM               │
│       │ generate(requirements)       ← full regen                       │
│       │ validate() + calculateQuantities()                              │
│       ▼                                                                 │
│  bimMemoryStore (always) + bim_* tables (if Supabase migrated)        │
│                                                                         │
│  POST /api/ai/boq → Gemini → projects.boq_data (independent of BIM)   │
│  POST /api/3d/projects/:id/modify → OpenAI → Blender (separate system)│
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    SUPABASE (optional / partial)                        │
│  projects, bim_models, bim_versions, bim_elements, bim_relationships    │
│  bim_materials, bim_quantities (schema exists; not fully written)       │
└─────────────────────────────────────────────────────────────────────────┘
```

### Infrastructure

| Component | Status | Location |
|-----------|--------|----------|
| Docker Compose | Working | `docker-compose.yml`, `docker/*.Dockerfile` |
| Kubernetes | Manifests ready; cluster not deployed locally | `k8s/base/`, `k8s/overlays/{dev,staging,production}/` |
| CI | Validates Kustomize + runs `bim.test.js` | `.github/workflows/ci.yml` |

---

## 2. Current 2D Implementation

### Primary: Project Workspace Floor Plan

| Item | Detail |
|------|--------|
| **Page** | `frontend/pages/project-floor-plan.html` |
| **Renderer** | `frontend/js/bim/floor-plan-viewer.js` — `FloorPlanViewer` class |
| **Engine** | HTML5 Canvas 2D |
| **Data source** | BIM model from `BimAPI.getModel()` → `GET /api/projects/:id/bim` |
| **Cache** | `localStorage` key `ohisee_bim_{projectId}` |

**Rendered element types:** Site/plot, Slab, Room (name + bounds), Wall, Door, Window.

**Not rendered:** Furniture, Garden, FlowerPot, Stairs, Columns, Beams, Railings, dimensions annotations, north arrow, door swing arcs (partial), landscape.

**Behavior:** Dynamic from `model.elements[]`. Auto-fit bounds, grid, PNG export. Updates when prompt bar calls `BimAPI.modify()` and page reloads model.

### Secondary: Legacy Blueprint Builder (disconnected)

| Item | Detail |
|------|--------|
| **Page** | `frontend/pages/blueprint-builder.html` |
| **Logic** | `frontend/js/blueprint-presentation.js` — `planRooms()` + SVG |
| **Data** | Form requirements object; **procedural client-side layout** |
| **Persistence** | `POST /api/blueprints` (separate `blueprints` table) |

**Problem:** This pipeline does not feed the workspace BIM model. Users may see different layouts in Blueprint Builder vs Floor Plan.

---

## 3. Current 3D Implementation

### Primary: Project Workspace 3D Home

| Item | Detail |
|------|--------|
| **Page** | `frontend/pages/project-3d.html` |
| **Viewer** | `frontend/js/bim/bim-viewer.js` — `BimViewer` with `{ mode: 'home' }` |
| **Engine** | Three.js v0.170 (npm) |
| **Materials** | `frontend/js/bim/bim-materials.js` — procedural Canvas textures |
| **Data source** | Same BIM model as 2D |

**Rendered element types:** Wall (box), Slab (extruded), Room (plane), Door, Window, auto-generated roof heuristic in home mode.

**Layer map includes but does not generate:** Column, Beam, Roof, Pipe, Duct, Cable.

**Behavior:** Full scene rebuild on `loadModel()`. No incremental mesh updates. Same BIM JSON drives 2D and 3D within workspace.

### Secondary: AI 3D Design Service (disconnected)

| Item | Detail |
|------|--------|
| **UI** | `frontend/js/design3d.js`, `design3d-viewer.js` |
| **API** | `/api/3d/*` — OpenAI spec extraction + Blender worker |
| **Output** | PNG renders, `.blend`, optional GLB — **not BIM elements** |

**Problem:** Prompt modifications here do not update workspace 2D/3D/BIM.

### Tertiary: Visualizer 3D Demo (disconnected)

| Item | Detail |
|------|--------|
| **Page** | `frontend/pages/visualizer-3d.html` |
| **Engine** | Three.js r134 CDN |
| **Data** | Hardcoded `generateRooms()` from form inputs |

---

## 4. Current BIM Implementation

### Page & Viewer

| Item | Detail |
|------|--------|
| **Page** | `frontend/pages/project-bim.html` |
| **Viewer** | `BimViewer` with `{ mode: 'technical' }` |
| **Layout** | Layer toggles, 3D viewer, element list, properties panel |
| **API client** | `frontend/js/bim/api/bim.js` |

### Backend BIM Model

| Item | Detail |
|------|--------|
| **Core class** | `backend/src/bim/core/BimModel.js` |
| **Generator** | `backend/src/bim/generation/requirementsToBim.js` |
| **Layout** | `backend/src/bim/generation/layoutBuilding.js` — room grid + partition walls |
| **Parser** | `backend/src/bim/generation/requirementsParser.js` — project → requirements schema |
| **Validation** | `backend/src/bim/validation/bimValidator.js` |
| **Quantities** | `backend/src/bim/calculations/quantities.js` |

### Supported BIM Element Types (generated today)

| Type | Generated? | Notes |
|------|------------|-------|
| Site | Yes | Plot boundary |
| Building | Yes | Metadata container |
| BuildingStorey | Yes | Per floor |
| Slab | Yes | Floor plate per storey |
| Wall | Yes | Exterior + partition |
| Room | Yes | Named bounds, linked to storey |
| Door | Yes | One per room heuristic; hosted on wall |
| Window | Yes | On exterior walls heuristic |
| Roof | No | 3D viewer fakes in home mode |
| Column, Beam, Stair, Railing | No | Layer types exist in viewer only |
| Furniture, Landscape, Plant, FlowerPot | No | Not in schema or generator |
| Electrical, Plumbing, HVAC | No | MEP layer placeholder only |

### BIM API Routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/projects/:id/bim` | Fetch model |
| POST | `/api/projects/:id/bim/generate` | Generate from project requirements |
| POST | `/api/projects/:id/bim/modify` | Prompt → requirements patch → full regen |
| POST | `/api/projects/:id/bim/validate` | Validate model |
| GET | `/api/projects/:id/bim/quantities` | Quantity takeoff |
| GET | `/api/projects/:id/bim/versions` | Version list |
| GET | `/api/projects/:id/bim/elements/:elementId` | Single element |

### Properties Panel (current)

Shows: ID, Global ID, Type, Name, Storey, dimensions, quantity fields.

**Missing:** Room assignment, wall host, material name/color/texture, placement coordinates in user-friendly form, design history.

---

## 5. Current Design Prompt Implementation

### Frontend

| File | Role |
|------|------|
| `frontend/js/bim/bim-prompt-bar.js` | Text input, Apply button, status line |
| Mounted on | `project-floor-plan.html`, `project-3d.html`, `project-bim.html` |

**Example chips (hardcoded):** "Add bedroom", "G+1 floor", "Add terrace", "Add pooja room", "Bigger plot", "Premium finish", "50x40 plot".

**API call:**
```javascript
POST /api/projects/:projectId/bim/modify
Body: { prompt, project: projectSnapshot, bim: cachedBim }
```

On success: `cacheBim()` → `onApplied()` → viewer re-renders.

**Missing UI:** Change preview, approve/cancel, design history, materials panel, validation results panel, suggested commands matching master prompt examples.

### Backend

| File | Role |
|------|------|
| `backend/src/bim/modification/promptModifier.js` | Rule-based keyword → requirements patch |
| `backend/src/services/bimService.js` | `modifyFromPrompt()` orchestration |

**Flow:**
```
prompt → applyPromptToRequirements() → patch building requirements
      → syncRoomsFromBuilding() (rebuilds default room list from counts)
      → generate(requirements) [FULL REGEN]
      → validate → quantities → save version
```

### What the prompt engine CAN do today

- Change bedroom/bathroom counts
- Add floors (G+1, G+2, G+3)
- Resize plot (e.g. "50x40")
- Add pooja, office, terrace, parking, balcony rooms
- Enlarge kitchen/living (keyword + "bigger")
- Set architectural style, quality level, vastu preference

### What it CANNOT do (master prompt requirements)

| Command example | Status |
|-----------------|--------|
| "Add a door to the master bedroom" | ❌ No room-targeted door add |
| "Add a 900mm door to the east wall" | ❌ No wall orientation / dimension parsing |
| "Add a flower pot in the garden" | ❌ No Garden or FlowerPot types |
| "Make the bedroom 12 x 14 feet" | ❌ No per-room dimension resize |
| "Change living room floor to marble" | ❌ No material commands |
| "Remove the kitchen window" | ❌ No REMOVE command |
| "Move the sofa to the north wall" | ❌ No Furniture or MOVE |
| "Add a staircase to the first floor" | ❌ No Stair type |

**Critical:** `syncRoomsFromBuilding()` **overwrites** custom room layouts when bedroom/bathroom counts change, destroying per-room edits.

**No LLM:** Despite UI implying "natural language design", `promptModifier.js` explicitly states "Rule-based v1 — deterministic, no external AI required."

---

## 6. Data Flow

### Project creation → BIM generation

```
User completes intent-engine / project-wizard / home-requirements
    → POST /api/projects (or /api/construction/home-requirements)
    → Redirect to project-overview.html?projectId=PRJ-xxx
    → User clicks Generate BIM (or auto-generate on intent-engine)
    → POST /api/projects/:id/bim/generate
        → fromProject(project) → requirements JSON
        → requirementsToBim.generate() → BimModel
        → validate + calculateQuantities
        → bimMemoryStore + (optional) bim_* DB tables
    → User opens Floor Plan / 3D / BIM pages
        → GET /api/projects/:id/bim
        → fallback: localStorage ohisee_bim_{projectId}
        → FloorPlanViewer / BimViewer.loadModel()
```

### Design prompt modification (current)

```
User types prompt in bim-prompt-bar
    → POST /api/projects/:id/bim/modify { prompt, project, bim }
    → resolveProjectForUser() (DB or memory or client hint)
    → applyPromptToRequirements(baseReq, prompt)
    → if no keyword match → 400 error
    → generateFromRequirements() [FULL MODEL REGEN]
    → response { model, version, validation, quantities, modification }
    → frontend cacheBim() + re-render all viewers on current page
```

### Cross-page sync

- **Same source:** Yes — all workspace pages read same BIM endpoint/cache.
- **Live sync across tabs/pages:** No — each page holds own `bimData` variable; navigation re-fetches.
- **Incremental updates:** No — always full regen.

### BOQ / Cost (disconnected from BIM)

```
POST /api/ai/boq → Gemini → projects.boq_data JSONB
GET /api/projects/:id/bim/quantities → BIM takeoff (walls, slabs, rooms, doors, windows)

These are NOT linked. BOQ ignores BIM quantities.
```

### Materials (disconnected from prompt)

- BIM model has `materials[]` with 4 defaults (AAC block, concrete, wood door, glass).
- `bim_materials` DB table exists but `persistToDatabase()` does not write it.
- `project-materials.html` page exists but is not driven by per-element prompt changes.
- No material/color/texture command path.

---

## 7. Problems Found

### P1 — Critical (blocks acceptance tests)

| # | Problem |
|---|---------|
| 1 | Design prompt is keyword rules on **requirements**, not structured **design commands** on **elements** |
| 2 | No element types: Garden, FlowerPot, Furniture, Stair, Railing, Column, Beam |
| 3 | No spatial intelligence — no room/wall lookup, no collision, no placement strategies |
| 4 | No ADD/REMOVE/MOVE/MODIFY at element level — only full model regeneration |
| 5 | `syncRoomsFromBuilding()` resets rooms to defaults, preventing per-room edits |
| 6 | Doors/windows placed by generator heuristics, not user-targeted walls |
| 7 | No material/color/texture change commands |
| 8 | No dimension parsing for per-room resize (feet, mm, etc. at room level) |
| 9 | No design change history, undo/redo, or preview-before-apply |
| 10 | Master prompt acceptance scenario (door + flower pot + marble floor + bedroom resize) **will fail today** |

### P2 — Architecture / Data fragmentation

| # | Problem |
|---|---------|
| 11 | Three project systems: `PRJ-*`, `HOME-*`, `/api/3d` UUID — no cross-link |
| 12 | Blueprint Builder SVG pipeline disconnected from BIM |
| 13 | AI 3D (`/api/3d`) disconnected from workspace BIM |
| 14 | BOQ (`/api/ai/boq`) disconnected from BIM quantities |
| 15 | Two modify paths: `/bim/modify` (rules) vs `/3d/modify` (OpenAI+Blender) |

### P3 — Persistence reliability

| # | Problem |
|---|---------|
| 16 | Memory fallback masks missing Supabase migrations — data lost on restart |
| 17 | BIM DB persist requires UUID `projects.id`; memory projects use `Date.now()` numeric ID |
| 18 | `bim_materials`, `bim_quantities` tables not written by `persistToDatabase()` |
| 19 | `listVersions()` returns cached version only when memory hit exists |
| 20 | `boqs` table unused — BOQ only in `projects.boq_data` |

### P4 — Rendering gaps

| # | Problem |
|---|---------|
| 21 | 2D missing: door swing, dimension lines, north arrow, furniture, landscape |
| 22 | 3D missing: actual roof BIM element, furniture, garden, flower pots |
| 23 | 3D full scene rebuild on every change — no incremental mesh update |
| 24 | BIM page missing: materials panel, design history, validation results, 2D/3D inline views |

### P5 — Testing & docs

| # | Problem |
|---|---------|
| 25 | Only 1 prompt test case in `bim.test.js` ("add bedroom and G+1 floor") |
| 26 | No API integration tests for `/bim/modify` |
| 27 | No frontend tests for `bim-prompt-bar.js` |
| 28 | `docs/API.md` empty |

---

## 8. Files to Modify

### Backend (Phase 2–5)

| File | Changes |
|------|---------|
| `backend/src/bim/core/BimModel.js` | Extend element schema, versioning helpers |
| `backend/src/bim/generation/requirementsToBim.js` | Garden/landscape generation; preserve room edits |
| `backend/src/bim/generation/layoutBuilding.js` | Spatial regions, garden zone, placement grids |
| `backend/src/bim/generation/requirementsParser.js` | Map new element types from project |
| `backend/src/bim/modification/promptModifier.js` | Replace/augment with command parser delegation |
| `backend/src/services/bimService.js` | Command apply path, incremental updates, history |
| `backend/src/routes/bim.js` | Add `POST /design-commands`, preview endpoint |
| `backend/src/bim/validation/bimValidator.js` | Collision, fit, wall capacity checks |
| `backend/src/bim/calculations/quantities.js` | New element types, material areas |
| `backend/src/schemas/building-requirements.schema.json` | Extended requirements |

### Frontend (Phase 6–9)

| File | Changes |
|------|---------|
| `frontend/js/bim/bim-prompt-bar.js` | Preview UI, history, better examples |
| `frontend/js/bim/api/bim.js` | `designCommands()`, preview API |
| `frontend/js/bim/floor-plan-viewer.js` | Garden, furniture, door swing, dimensions |
| `frontend/js/bim/bim-viewer.js` | New element meshes, incremental update |
| `frontend/js/bim/bim-materials.js` | Per-element materials, marble/wood/etc. |
| `frontend/pages/project-bim.html` | Materials panel, history, validation, 2D/3D tabs |
| `frontend/pages/project-materials.html` | Drive from actual model materials |
| `frontend/pages/project-floor-plan.html` | Wire new panels if needed |
| `frontend/pages/project-3d.html` | Wire new panels if needed |

### Database

| File | Changes |
|------|---------|
| `database/schema_v5_design_commands.sql` (new) | `design_commands`, `design_changes`, extended `bim_versions` |

### Tests

| File | Changes |
|------|---------|
| `backend/tests/bim.test.js` | All 12 master prompt test cases |
| `backend/tests/design-commands.test.js` (new) | Parser, validation, placement |
| `backend/tests/bim-api.test.js` (new) | Integration tests |

---

## 9. Files to Create

| File | Purpose |
|------|---------|
| `backend/src/bim/commands/designCommandSchema.js` | Structured command JSON schema |
| `backend/src/bim/commands/commandParser.js` | NL → structured command (rules + optional LLM) |
| `backend/src/bim/commands/commandValidator.js` | Pre-apply validation |
| `backend/src/bim/commands/commandExecutor.js` | Apply command to BimModel |
| `backend/src/bim/spatial/roomResolver.js` | Find room by name/fuzzy match |
| `backend/src/bim/spatial/wallResolver.js` | Find wall by orientation (N/E/S/W) |
| `backend/src/bim/spatial/placementEngine.js` | Collision-free placement |
| `backend/src/bim/spatial/dimensionParser.js` | mm/cm/m/feet/inches normalization |
| `backend/src/bim/elements/doorFactory.js` | Create door on wall with opening |
| `backend/src/bim/elements/windowFactory.js` | Create window on wall |
| `backend/src/bim/elements/furnitureFactory.js` | Furniture placement |
| `backend/src/bim/elements/landscapeFactory.js` | Garden, FlowerPot, Plant |
| `backend/src/bim/elements/materialResolver.js` | Material/color/texture lookup |
| `backend/src/bim/history/designHistory.js` | Change records, undo/redo stack |
| `backend/src/routes/designCommands.js` | `POST /api/projects/:id/design-commands` |
| `frontend/js/bim/design-history-panel.js` | UI for change history |
| `frontend/js/bim/materials-panel.js` | Materials schedule from model |
| `frontend/js/bim/change-preview-modal.js` | Preview before apply |
| `database/schema_v5_design_commands.sql` | New tables migration |

---

## 10. Database Changes

### Existing tables (keep, extend usage)

| Table | Current use | Needed change |
|-------|-------------|---------------|
| `projects` | Project metadata | Link `bim_model_id`, ensure migrations applied |
| `bim_models` | One per project | Already correct |
| `bim_versions` | Snapshots | Add `model_version` integer, `change_summary` |
| `bim_elements` | Normalized index | Write on persist (currently partial) |
| `bim_relationships` | Element links | Write on persist |
| `bim_materials` | Material catalog | **Start writing** from model |
| `bim_quantities` | Takeoffs | **Start writing** from `calculateQuantities()` |

### New tables (proposed — `schema_v5_design_commands.sql`)

```sql
-- design_commands: raw prompt + parsed command JSON
-- design_changes: atomic change records per version
-- design_versions: optional alias/enhancement of bim_versions metadata
```

**Do NOT duplicate** if `bim_versions.structured_input` + `model_snapshot` can store command history with a `changes[]` array in snapshot metadata. Prefer extending `bim_versions` over new tables unless query patterns require normalization.

### Migration strategy

1. Apply `database/apply_projects_bim.sql` or full v1→v4 chain in Supabase
2. Add v5 migration for design command history
3. Fix `persistToDatabase()` to write materials + quantities
4. Fix memory project UUID issue for FK compatibility

---

## 11. API Changes

### New endpoints (proposed)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/projects/:id/design-commands` | Parse prompt → validate → apply (or preview) |
| POST | `/api/projects/:id/design-commands/preview` | Parse + validate without apply |
| GET | `/api/projects/:id/design-history` | List change records |
| POST | `/api/projects/:id/design-commands/undo` | Revert to previous version |
| POST | `/api/projects/:id/design-commands/redo` | Re-apply undone version |

### Request/response (target)

**Request:**
```json
{
  "prompt": "Add a flower pot in the garden",
  "preview": false
}
```

**Response:**
```json
{
  "success": true,
  "command": {
    "command": "ADD",
    "entityType": "FlowerPot",
    "target": { "type": "Garden" },
    "placement": { "strategy": "inside_target" }
  },
  "changes": [{ "action": "ADD", "elementId": "flowerpot-001", "type": "FlowerPot" }],
  "modelVersion": 5,
  "model": { "...": "full snapshot or delta" },
  "updatedElements": ["flowerpot-001"]
}
```

### Existing endpoint changes

| Endpoint | Change |
|----------|--------|
| `POST /bim/modify` | Deprecate gradually; delegate to design-commands internally |
| `GET /bim/quantities` | Include new element types |
| `GET /bim/versions` | Return full history from DB, not just cache |

### AI integration approach

| Layer | Use AI? | Role |
|-------|---------|------|
| Command parsing | Optional LLM (Gemini/OpenAI) with **strict JSON schema** | NL → structured command |
| Command execution | **Never AI** | Deterministic domain logic only |
| Validation | **Never AI** | Geometry rules, collision checks |
| Full regen fallback | Rules only | When command is "rebuild house" type |

---

## 12. Testing Plan

### Unit tests (`backend/tests/design-commands.test.js`)

| # | Prompt | Assertions |
|---|--------|------------|
| 1 | "Add a door to the master bedroom." | command ADD Door; door on valid wall; 2D/3D element exists |
| 2 | "Add a 900mm door to the master bedroom." | width=900mm |
| 3 | "Add a window to the living room." | window on exterior wall |
| 4 | "Make the bedroom 12 x 14 feet." | room dimensions updated; walls adjusted |
| 5 | "Add a garden in the backyard." | Garden element created |
| 6 | "Add a flower pot in the garden." | FlowerPot inside garden bounds |
| 7 | "Place three flower pots near the garden entrance." | count=3; valid positions |
| 8 | "Change the living room floor to marble." | slab materialId updated |
| 9 | "Change the exterior walls to white." | wall material/color updated |
| 10 | "Remove the kitchen window." | window element removed |
| 11 | "Move the sofa to the north wall." | furniture position updated |
| 12 | "Add a staircase to the first floor." | stair element on storey 1 |

Each test chain: **prompt → parse → validate → execute → model diff → quantities diff**.

### Integration tests (`backend/tests/bim-api.test.js`)

- `POST /design-commands` with auth
- Preview mode returns command without mutation
- Invalid placement returns 422 with clear message
- Version increments on apply

### Acceptance test (manual + automated)

Use master prompt scenario:
- Plot 50×40 ft, ground floor rooms + garden
- Prompt 1: 900mm master bedroom door
- Prompt 2: flower pot in garden
- Prompt 3: living room white marble floor
- Prompt 4: master bedroom 14×16 ft

Verify in API response + 2D canvas pixel bounds + 3D mesh count + BIM element list.

### Frontend tests

- `bim-prompt-bar.js`: submit, preview, error display
- Cache invalidation after apply

### CI updates

- Add `design-commands.test.js` to `.github/workflows/ci.yml`
- Optional: add `test:design` npm script

---

## 13. Recommended Implementation Phases

| Phase | Scope | Depends on |
|-------|-------|------------|
| **1** | This audit document | — |
| **2** | Canonical model extensions (element types, stable IDs, metric units) | Approval |
| **3** | Structured command schema + parser (rules first, LLM optional) | Phase 2 |
| **4** | Spatial engine (room/wall resolver, placement, dimensions) | Phase 2 |
| **5** | Command executor + validation (incremental apply) | Phase 3–4 |
| **6** | 2D viewer updates (new elements, door swing, dimensions) | Phase 5 |
| **7** | 3D viewer updates (new meshes, incremental refresh) | Phase 5 |
| **8** | Materials/color/texture sync + materials panel | Phase 5 |
| **9** | Design history, versioning, preview UI | Phase 5 |
| **10** | Automated tests (12 cases + acceptance) | Phase 5–9 |
| **11** | Docker verification | Phase 10 |
| **12** | K8s compatibility check | Phase 11 |

---

## 14. What Already Works (do not rewrite)

- Project workspace shell (`project-workspace.js`) and navigation
- BIM API client with localStorage cache (`bim/api/bim.js`)
- Shared BIM fetch path for 2D, 3D, BIM pages
- Parametric generator for basic house layout (`layoutBuilding.js`, `requirementsToBim.js`)
- Canvas 2D and Three.js viewers (extend, don't replace)
- Docker Compose stack
- K8s manifests and CI validation
- `bimValidator` and `calculateQuantities` foundations

---

## 15. Approval Gate

**No major architectural changes should begin until this audit is reviewed.**

Please confirm:

1. Proceed with Phase 2 (canonical model extensions)?
2. Parser approach: **rules-first** with optional LLM for NL parsing?
3. Deprecate or isolate Blueprint Builder and `/api/3d` from workspace BIM?
4. Apply Supabase migrations (`apply_projects_bim.sql` + v5) as part of implementation?

---

*Generated by repository audit — Phase 1 of Design Prompt 2D/3D/BIM Engine.*
