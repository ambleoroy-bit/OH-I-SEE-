# Home requirements and account workflow

The existing HTML/Vite frontend, Express API and Supabase database are retained.

## Database setup

In the configured Supabase project's SQL editor, apply these files in order:

1. backend/database/projects_migration.sql
2. backend/database/construction_workflow.sql
3. backend/database/supplier_onboarding.sql (vendor business onboarding)

These depend on the existing public.users table. Never paste database credentials into chat. A database-owner DATABASE_URL may instead be configured privately in backend/.env for an authorized migration run.

The September 10 live check returned PGRST205 for projects, construction_professionals, construction_engagements and supplier_profiles. Therefore publication and provider acceptance have not passed a live end-to-end test.

## Account and project flow

Customers register through login.html. Contractors and vendors use the account-type selector; these accounts retain the existing Partner database role and a Contractor/Vendor subtype. Signup does not grant administrator or verified-provider privileges.

A client completes blueprint-builder.html, reviews structured requirements, and explicitly chooses whether to share with verified providers in their city. Drafts remain in the browser when the database is unavailable. File attachments must be reattached after a reload.

Providers complete their professional profile in services.html. An independently authorized construction administrator verifies their profession. Verified, available professionals in an eligible construction profession can view shared requests under New home requests, then accept and discuss privately. A vendor selling materials does not automatically qualify as a home builder. Client agreement, contract and payment gates precede construction start.

## Validation

Run npm test --prefix backend and node --test backend/tests/home-requirements.test.js.
Run npm run build --prefix frontend.
After the migrations, run node backend/tests/home-flow.integration.js with the local API running. It uses synthetic accounts and verifies ownership, pending-provider denial, city matching, acceptance, private conversation and construction gates. It fails before creating accounts if prerequisites are missing.

## Planning scope

The thirteen-section requirements form produces validated numeric JSON and preserves both existing conceptual blueprint styles. AI geometry, rule checks and comparison scores are explicitly pending; the form does not claim to generate construction-ready plans. The backend imports the shared frontend/js/home-requirements-model.js module, so deploy both source directories together.
