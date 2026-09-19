# Construction Services implementation and setup

## What changed

The active application remains the existing HTML/Vite frontend, Express backend and Supabase PostgreSQL database. The separate React prototype and legacy backend copies were not replaced or connected. This implementation extends the actual Services page shown in the request.

The Services page now provides:
- Residential project requirements, existing-project selection and Coimbatore as an editable initial city.
- Preliminary BOQ through the existing authenticated BOQ endpoint.
- Verified professional discovery for civil/general contractors, plumbers, electricians, civil/structural engineers, architects and interior designers.
- City matching, optional coordinate-based straight-line distance and service radius, rating, experience, completed-project, price and availability filters; comparison of up to three profiles.
- Professional registration and administrator-controlled manual verification.
- Project-linked quote/contact/site-visit requests and private participant messaging.
- Itemized quotations with server-calculated totals, customer acceptance and professional contract confirmation.
- Razorpay order creation and signature-verified captured-payment webhooks. No frontend action can mark payment successful.
- Sequential construction tasks, actual costs, materials, customer quality acceptance, handover and one completed-work review.
- Mutually approved variation records, event history and persistent in-app notifications.
- All 15 original service cards, grouped by purpose. Professional and complete-construction cards enter the new workflow.

## Existing architecture and findings

The active frontend is frontend/pages plus frontend/js and frontend/css. Vite serves multiple HTML pages. Authentication uses an application JWT stored under ohisee_jwt. Some older pages also use a separate Supabase session and an inconsistent ohisee_token key; the new page uses the actual backend JWT.

backend/src/server.js mounts Express routes. The server-side Supabase service-role client bypasses RLS, so every new private route checks ownership or participation. Existing project ownership uses the public project_id, not the internal numeric/UUID key.

The repository contains duplicated src, backend/src_old, frontend/static_html, frontend/vanilla_vite and a disconnected React prototype. Existing enterprise APIs cover procurement, suppliers, finance, quality and logistics, but they are not a professional marketplace. This release does not duplicate their supplier/product records.

There is an existing Gemini-backed AI service and BOQ fallback. Twelve independently working AI engines were not found. The new execution and event-history views provide application workflows, not a completed spatial/3D digital-twin or autonomous design engine.

The configured remote database was read-checked: public.projects was absent (PGRST205). The remote schema was not modified. A database connection string was not available; an isolated local PostgreSQL 17 cluster was used for migration tests.

Security fixes made while integrating:
- Public signup cannot request Admin or Super Admin.
- Password reset validates the Supabase access token with getUser before changing a password.
- Request bodies are omitted from server logs.
- New verification privileges use an explicit construction_admins allowlist, independent of legacy role strings.
- Demo seeding is disabled unless SEED_DEMO_DATA=true.
- BOQ persistence errors are checked instead of reporting an unsaved result as successful.

The legacy application still needs a wider security review before production, especially direct browser Supabase policies, older supplier endpoints, legacy order/payment logic, session handling and existing HTML rendering. These were not globally rewritten.

## Architecture and database

Browser Services workspace → existing JWT authentication → /api/projects and /api/construction → Supabase.

ERD:
users 1—N projects
users 1—0..1 construction_professionals
users 1—0..1 construction_admins
projects 1—N construction_engagements
construction_professionals 1—N construction_engagements
construction_engagements 1—N construction_events
users 1—N construction_notifications

Each engagement represents one project/customer/professional agreement. Its versioned JSON state contains the scope snapshot, quote, contract, payment reference, visit, messages, tasks, variations and review. Different professionals can have separate engagements on one project.

The construction_save database function locks the row, compares versions, saves state and writes events/notifications in one transaction. Failed or stale actions cannot leave partial audit records. Duplicate captured-payment webhooks are idempotent. A unique order ID prevents accidental order reuse across agreements. Browser database roles have no access to the new private tables or mutation functions.

Matching is an explainable rules-based score, not an AI claim. Completed counts and ratings are calculated from completed platform engagements. Profile experience is self-described and reviewed by an administrator. No fake profiles, ratings, credentials or distances are seeded.

## Files and dependencies

| File | Change and reason | Dependencies / risk |
| --- | --- | --- |
| frontend/pages/services.html | Adds customer/professional workspace and groups existing cards | Keeps existing links; vanilla frontend |
| frontend/css/construction.css | Scoped responsive black/yellow styling | Shared global CSS remains |
| frontend/js/construction.js | Forms, search, comparison and workflow actions | Backend JWT, /api endpoints |
| frontend/vite.config.js | Preserves classic JS assets and includes omitted HTML entries | Existing global scripts are retained rather than converted |
| backend/src/routes/construction.js | Adds participant-protected marketplace/workflow APIs | New migration, Supabase service role |
| backend/src/services/constructionDomain.js | Input validation, ranking, legal state transitions | Pure functions, no provider calls |
| backend/src/services/constructionPayments.js | Signature and captured-payment validation | Razorpay webhook secret |
| backend/database/construction_workflow.sql | Additive tables, RLS restrictions and transactional functions | Existing users and projects |
| backend/src/routes/projects.js | Validates and saves construction_context with project write | New projects column |
| backend/src/routes/ai.js | Checks BOQ save failure | Existing AI implementation |
| backend/src/controllers/authController.js | Blocks signup escalation and forged reset tokens | Existing Supabase Auth |
| backend/src/server.js | Mounts API/raw webhook, omits body logs, opt-in seeding | Restart server |
| backend/tests/construction*.test.js | Domain and HTTP authorization regression tests | Node built-in test runner |
| backend/tests/construction-db.sql | SQL permissions, CAS, audit and notification checks | Isolated test DB only |

## API reference

Existing:
- GET/POST /api/projects
- GET/PUT /api/projects/:projectId
- POST /api/ai/boq — {projectId}

New, under /api/construction:
- GET /capabilities — public integration availability
- GET /professionals — public, verified profiles only; city, profession, lat/lng, radius, rating, experience, price, completed, available, sort
- GET /me — own profile and marketplace-admin capability
- PUT /profile — submit/edit own profile; resets verification to pending
- GET /verification — explicit marketplace administrator
- POST /verification/:id — status and private review reference; no self-verification
- PUT /projects/:id/context — owner-only construction context
- POST /requests — project_id, professional_id, kind, scope
- GET /engagements — participant agreements
- POST /engagements/:id/actions — version, action, input
- GET /engagements/:id/events — participant-only event metadata
- POST /engagements/:id/payment-order — customer-only, mutually accepted contract
- POST /payments/webhook — raw signed Razorpay webhook; no user JWT
- GET /notifications and PATCH /notifications/:id — own updates

Actions: message, site_visit, confirm_visit, quote, accept_quote, sign_contract, start, task, quality, variation, approve_variation, reject_variation, request_completion, complete, review.

Stages: requested → quoted → contract → payment → ready → construction → handover → completed.

## Setup

1. Use the existing configured Supabase project. Back up its schema before applying migrations.
2. If public.users and the base application tables do not exist, apply backend/database/schema.sql through Supabase SQL Editor. Do not rerun that full legacy script blindly on an existing database.
3. Apply backend/database/projects_migration.sql if public.projects is absent.
4. Apply backend/database/construction_workflow.sql. It adds construction_context and the marketplace tables/functions. Do not use database/schema_v2.sql as a substitute: it conflicts with the active project's field names.
5. Choose an existing trusted administrator account. In SQL Editor, explicitly authorize its UUID:

   INSERT INTO public.construction_admins(user_id)
   VALUES ('REPLACE_WITH_TRUSTED_EXISTING_USER_UUID')
   ON CONFLICT DO NOTHING;

   Do not auto-populate this allowlist from existing users.role values. Audit existing privileged accounts because the earlier signup endpoint permitted privileged role requests.

6. Ensure backend/.env contains the existing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET and FRONTEND_URL. Keep secrets server-side. Use a strong JWT secret and rotate it if earlier tokens are untrusted. Leave SEED_DEMO_DATA unset/false.
7. In D:\OH I SEE\backend run npm install, then node src/server.js.
8. In D:\OH I SEE\frontend run npm install, then npm run dev -- --host 127.0.0.1.
9. Open http://127.0.0.1:3000/pages/services.html. Use the same hostname for sign-in and Services because browser storage is origin-specific.
10. Register separate customer and professional accounts through the existing sign-in page. The professional submits their profile in For professionals. The authorized administrator reviews credentials privately and changes the profile status through Verification.
11. Create the customer project, find that verified/available professional and send a request. The professional sees it under Quotes & construction. Continue through the shared workspace.

For production, set VITE_API_BASE to the deployed HTTPS API URL before npm run build, or reverse-proxy /api to Express. Serve frontend/dist, including the emitted classic js assets. Configure FRONTEND_URL and the existing CORS settings for the actual origin.

### Payment setup

Razorpay is the implemented provider assumption for INR payments; no live payment was attempted.
Set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET in backend/.env.
Configure a publicly reachable HTTPS webhook:
https://YOUR_API_HOST/api/construction/payments/webhook
Subscribe to payment.captured and use the same webhook secret.
Start with Razorpay test credentials and test webhook delivery before enabling live payments.

The amount is calculated from the accepted quote and sent in paise. Only a correctly signed captured event with matching order, amount and INR currency advances the workflow. Closing Checkout or receiving its browser callback is not proof of payment.

If provider order creation times out, the durable creating state intentionally blocks another order. Support must reconcile the engagement receipt in the gateway before clearing/replacing that state. This release has no automated reconciliation/refund/payout console.

Provider references:
- https://razorpay.com/docs/webhooks/validate-test/
- https://razorpay.com/docs/api/orders/create/
- https://razorpay.com/docs/webhooks/payments/

## Verification performed

All 16 domain, HTTP and authentication regression tests passed.

- Node domain tests: quotation calculations, role restrictions, agreement/payment gates, sequential tasks, quality acceptance, handover/reviews, scope variations, distance/radius filtering and webhook validation.
- HTTP integration tests: actual JWT middleware with isolated database test doubles; anonymous/invalid-token denial, participant visibility, IDOR rejection, explicit verification privileges and stale versions.
- PostgreSQL 17: actual project and construction migrations applied successfully to an isolated cluster. SQL checks verified transactional audit/notification writes, failed-write rollback, CAS conflicts and browser-role restrictions. Test records were rolled back.
- Vite production build succeeded. Existing classic-script bundling warnings remain; those scripts are now emitted as assets.
- Chrome: project and professional-search views render; Services starts without console errors. Search correctly reports the missing remote database setup. Mobile width 390px has no horizontal overflow. Administrator navigation stays hidden for anonymous visitors.

Run:
node --test backend/tests/construction.test.js backend/tests/construction-api.test.js backend/tests/construction-auth.test.js
cd frontend
npm run build

The complete customer/professional flow was exercised as domain logic. A live end-to-end account/payment test remains pending the remote migrations, approved real profiles and payment test configuration.

## Remaining scope from the broader specification

This is a connected first implementation, not the complete 44-section platform specification:
- The active frontend was preserved; no React migration was performed.
- Eight professions are supported; the broader 43-profession catalogue, company/legal-entity modelling, portfolios and credential-specific verification providers remain to be added.
- Verification is manual with a private case reference. OTP, Aadhaar/PAN/GST provider validation and secure document-upload workflows are not implemented here.
- Matching is rules-based, uses straight-line coordinates or exact city, and returns at most 50 results from capped datasets. Large-scale geospatial/paginated ranking needs a database query/index strategy.
- Only a full-contract payment is supported. Milestone billing, refundable measurement fees, escrow, payouts, commissions and refunds are future work.
- Engine 11 currently means versioned project state/event history; Engine 12 means execution tasks and acceptance. There is no automatic spatial model, cross-engine redesign or autonomous engineering approval.
- Variations record mutual approval and flag downstream review; they do not regenerate drawings, revise payment orders or automatically reschedule work.
- Existing procurement/supplier pages remain accessible. Their wider authorization and financial correctness issues need a separate production-hardening phase.
- Notifications are persistent in-app records. Email, SMS/WhatsApp, realtime delivery and attachment/document storage are not connected.
- The repository's broader legacy security issues and the existing login page's mixed Supabase/JWT integration still require remediation before production rollout.

