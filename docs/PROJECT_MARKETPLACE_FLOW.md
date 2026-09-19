# Customer, contractor and supplier project flow

## Implemented workflow

1. Customer enters plot dimensions and setbacks. Room sizes must fit the buildable footprint; the total requested room area must fit built-up area across the selected floors. The additional-bedroom size is counted for every additional bedroom. Drafts can be saved incomplete; progression, publication and builder selection validate the areas.
2. A registered contractor signs in and completes company, city, included scope and a minimum/maximum INR price per sq.ft. Only available contractors with valid pricing in the project city appear. Registration is not described as verified certification.
3. Compare builders shows project area, budget, saved project estimate, contractor price ranges, calculated estimate ranges and budget differences. Ranking uses smallest minimum-budget overrun, then lowest maximum estimate. The design screen Compare button and customer Builder Quotes open this comparison. Sample builders and sample supplier fallback lists were removed.
4. Selecting a contractor creates one durable private lead, addressed by the registered account ID. Customer-submitted company names or prices do not determine the saved builder/estimate. The customer and selected contractor can read and message; unrelated accounts cannot.
5. Contractor opens Client Leads & Messages, reviews the shared requirements and accepts. An unread indicator and a 30-second dashboard badge refresh show new updates without replacing a form being edited.
6. Supplier accounts register separately, complete a company profile and maintain catalog categories, products, brand, unit, price, available quantity and active status. A registered supplier company appears even before its first product. Suspended/rejected accounts are excluded.
7. Contractor selects companies, adds their products and quantities, and enters labour, other costs, tax, contingency, duration and scope/exclusions. Cement, bricks, steel, sand, plumbing, electrical, flooring, paint, doors/windows, waterproofing and fixtures are supported. Unitemized categories are listed explicitly.
8. Sending the proposal recalculates prices and totals on the server using the saved supplier catalog. Stock, active status, ownership and quantities are checked. The customer receives an itemized proposal and can request a revision or approve the exact current total. The selected contractor can start execution after approval.

## Persistence and access

- `marketplace_profiles`: contractor pricing / supplier company profile, keyed by registered user.
- `marketplace_products`: supplier-owned catalog products.
- `marketplace_jobs`: one selected contractor per customer project, versioned state, estimate/requirements snapshot, proposal, messages and events.
- Every private route uses the existing JWT authentication and fresh user profile. Server-side checks enforce participant and catalog ownership.
- Versioned compare-and-swap updates reject stale actions. A database trigger updates the existing customer project status and contract value in the same transaction as the lead/proposal action.
- Browser database roles cannot access the new tables. Writes use the existing backend service-role connection.
- No local-memory or fabricated result substitutes for a failed marketplace database write.

## Activation for this installation

Live activation completed on 2026-09-16 for the application's configured Supabase project. The activation migration created all six required tables. The existing backend service-role connection can access every table, row-level security is enabled, the synchronization trigger is enabled, and `/api/ready` returns 200 with Supabase healthy. No sample records were inserted. An activation receipt is saved in `output/marketplace-supabase-activation.json`.

For another installation, run `database/activate_project_marketplace.sql` in the configured Supabase SQL Editor as the database owner. This creates the missing project table, required wizard columns, document/design-version tables, and marketplace tables. It includes the additive changes from `backend/database/marketplace_flow.sql`. It does not create sample accounts, quotes, products or projects. Existing deployments that already have the full project schema can apply only `backend/database/marketplace_flow.sql`.

Restart the backend from the `backend` folder with `npm run server` after applying the migration. The frontend uses the existing Vite server on port 3000.

Entry points:

- Customer: `frontend/pages/quote-compare.html?projectId=<saved project id>` or customer portal → Builder Quotes.
- Contractor: `frontend/pages/vendor-dashboard.html` → Client Leads & Messages; pricing form appears on sign-in.
- Supplier: `frontend/pages/supplier-dashboard.html`; Supplier is an explicit signup account type.

Previously saved browser drafts can be reopened and saved after activation. Marketplace selection requires a persisted, owned project; it will not silently bind a sample/memory project.

## Validation

- `npm run test:marketplace` (backend): domain and HTTP tests for the complete multi-role flow, area/quantity limits, registration eligibility, forged builder/price rejection, ownership, duplicate selections, stale versions, supplier stock and calculated totals.
- `npm test` (backend): existing construction/authentication regression suite. The auth test harness was updated to stub dependencies added by earlier application changes.
- `npm run build` (frontend): production bundle and new HTML entries.
- `backend/tests/marketplace-db.sql`: tested against an isolated PostgreSQL 17 cluster after the activation migration; tests table grants, missing rate constraints, unique selection, stale versions and atomic project updates. Test records roll back.
- Browser testing uses the real frontend against `backend/tests/marketplace-fixture.js`, which is a separate synthetic server and is never mounted by the application. Verified comparison, selection, contractor lead review/acceptance, supplier product selection, proposal submission, customer approval and supplier product creation.

## Scope and limits

Area checks are necessary limits, not a geometric floor-plan feasibility proof. They do not assign rooms to individual floors or calculate space for every wall, corridor, stair, parking bay or local planning requirement. The UI tells customers to leave room for these.

Published builder ranges are preliminary estimates; the actual supplier-based proposal remains separate. Supplier stock is checked when sending, but not reserved. No purchase orders, external supplier messages or payments are sent by this workflow. Existing construction-payment services remain separate.

The selection stores the requirements snapshot shared with the builder. Discuss later changes in the private conversation and request a revised proposal. A project cannot silently switch to a different builder while it has an existing selection.


## Multiple contractor requests
Apply `database/multiple_contractor_requests.sql` after the activation migration before restarting the updated backend. Each project/contractor pair has one private request. Contractors can independently accept; contact details are released to the owner after acceptance. A unique partial index allows only one customer-approved budget per project. Applied to Supabase on 2026-09-16 after explicit approval. Verified project/contractor uniqueness and the single approved-budget constraint; the existing request was preserved. Backend restarted and readiness returned Supabase OK.
