# OH I SEE shared construction design engine

Implementation status: integrated development implementation, not yet signed off for production. The real OpenAI-to-website acceptance test remains pending. Do not substitute the engine fixture for that test.

## Existing application integration

The active frontend is the existing Vite-served HTML/classic JavaScript application. Express and the existing Supabase service client/custom JWT middleware remain the backend. `intent-engine.html?intent=NEW_HOME` and `visualizer-3d.html` load the same `design3d.js` interface and API. Existing cards, navigation, wizard and browser-only layout preview remain available. The interactive GLB viewer is loaded on demand.

## Setup

1. Apply `backend/database/design3d_migration.sql` in the existing Supabase SQL editor. This is additive; it uses `public.users`. Reapply the latest file after function changes. No new application database is required.
2. Add `OPENAI_API_KEY` privately to `backend/.env`. Never paste it into browser code or commit it. Optional configuration is listed in `backend/design3d.env.example`.
3. Run the existing Blender bridge in Blender on `127.0.0.1:8766`. Its existing Python action schedules the fixed construction module; prompts never become Python source. Do not expose the bridge through a tunnel or public listener.
4. Start the backend with `npm run server --prefix backend`, frontend with `npm run dev --prefix frontend`, and private worker with `npm run worker:3d --prefix backend`.
5. Sign in using the application's existing account flow. Open `/pages/intent-engine.html?intent=NEW_HOME` or `/pages/visualizer-3d.html`.

The API saves a project then returns a persistent job immediately. A separate worker extracts and validates the specification, builds an isolated Blender scene, saves a blend, exports GLB and renders. The browser polls every four seconds and fetches authenticated artifacts. Failed jobs never become successful placeholder results. When dependencies are unavailable, queued work remains saved.

## Storage and production workers

Development files live privately in `backend/.data/design3d`. Do not serve this directory statically. Production requires `DESIGN3D_WORKER_MODE=headless` and `DESIGN3D_STORAGE=supabase`; create the private bucket `design3d-private` in the existing Supabase project. Keep the bucket private and grant no anonymous policies. API/worker use the existing server-only service role; download links expire after ten minutes. Size the bucket limit for generated blend/GLB files.

Run the worker on a private machine/container with Blender and outbound access to Supabase/OpenAI. The worker opens no HTTP port. Isolate it from other workloads, provision storage/render memory, and limit process privileges. PostgreSQL claims use row locks, a Blender-resource lease and completion fencing. Each account is limited to three active jobs; each project has one. Multiple headless workers claim from the same queue. Configure a stable worker resource identifier when sharing one Blender instance. Production deployment, load tests, monitoring, retention/cleanup and recovery drills are still required before launch.

## Versions and updates

Every generation, modification or render retry creates an immutable numbered version. Changes to materials and individual outdoor features retain unaffected geometry. Room/layout edits rebuild affected room collections; building size/floor changes rebuild architecture within the project scene. Other Blender scenes are retained. Restore changes the active version; the next edit receives a new version number and uses the restored blend. A render failure retains the blend and exposes Retry Render. Interrupted jobs are marked failed instead of automatically dispatching Blender twice; private work files remain available for operator recovery.

## Verification

- `npm run test:3d --prefix backend`: structured schema, resource and upload validation.
- `backend/tests/design3d-db.sql`: run only in an isolated PostgreSQL test database with test prerequisites. Exercises ownership, queue deduplication, resource leases and restore numbering, rolling records back.
- `backend/tests/design3d-engine.py`: Blender geometry regression using a previously generated bridge fixture; skips rendering deliberately and verifies unaffected geometry survives updates.
- A real fixture render executed through the existing localhost bridge is under `output/design3d-tests/bridge-engine`. It is not an AI extraction result.

Acceptance prompt (must use the real OpenAI API and signed-in UI):

> Create a modern 2-floor luxury house in Coimbatore on approximately 2,000 sq.ft with 4 bedrooms, large living room, dining room, modular kitchen, 2 balconies, car parking, garden and swimming pool. Use white marble exterior, large glass windows, wood interiors and warm evening lighting.

Confirm a real job ID, completed specification, saved blend, exterior PNG, browser image load and GLB interaction. Then modify, reload, and restore a version. No end-to-end completion claim is valid until these steps pass.

## Current modeling limits

This is a deterministic conceptual visualization engine for rectangular homes of one to three floors, not permit-ready architectural drawings. Uploaded plans require readable dimensions and rectangular, non-overlapping rooms. Complex footprints require clarification. Architectural asset detail, arbitrary-plan circulation, furniture fit at extreme room sizes and interior camera coverage need broader review before production use. Current exterior fixture is verified; all interior render combinations and uploaded-plan extraction are not yet acceptance-tested.
