# Prompt-driven building designs

Open a saved project and choose Floor Plan, 3D Home, or BIM & Technical. Enter requirements in Design prompt and select Generate design. The prompt is available even before the first model exists. All three views render the same validated model.

The backend reads OPENAI_API_KEY from its environment and OPENAI_BIM_MODEL (default gpt-4.1-mini). Keep the key in backend/.env, which is ignored by Git; never place it in frontend code. Restart the backend after changing configuration.

OpenAI produces schema-checked requirements. The local geometry generator creates the canonical model and checks room bounds/overlaps before saving a version to Supabase. Invalid responses, exhausted API quota, and persistence failures surface as errors. Existing project ownership is checked before generation. Requests are limited to 4,000 characters and four floors.

Saved plot dimensions stay fixed: edit Land & Site before requesting a different plot. Exact adjacency, structural calculations, code compliance and photorealistic output are not guaranteed. The result is a concept requiring professional review. Any packing adjustments and AI warnings appear below the prompt.

Verification: one live OpenAI response passed schema and geometry validation; 11 BIM regression checks and 4 adapter checks pass. Frontend production build passes. Browser rendering checks use synthetic project data and do not change customer projects.

Browser verification passed: prompt available on the empty BIM page; generation updates the model; 2D and 3D canvas views load with no page errors; Show interior works; slab coordinates map to the same positive plan axes as walls. Fixed per-floor origins for parking layouts and mirrored roof/slab/site geometry.

## Saved client requirements repair — September 2026
- Initial generation now collects the published client requirements and asks OpenAI for a floor arrangement. The saved room program, valid requested areas, plot and setbacks remain authoritative.
- Blueprint/2D, 3D and technical BIM show the same saved snapshot, plus the source requirements and generated room schedule. Empty prompts generate from the saved client requirements.
- Invalid tiny areas are retained in the source report and disclosed as proposed replacements. Layout scaling and unresolved preferences require review.
- Applied the user-approved database/bim_persistence_repair.sql: missing BIM tables, RLS and a server-only transactional snapshot save. Reads fetch the current database version; failed storage preflight avoids an unnecessary paid AI call.
- Mansion PRJ-56868: corrected version 5 persisted and reloaded from Supabase; 14 room/parking entries, plot 60 x 40 ft, setbacks front 10 ft and other sides 5 ft. No additional OpenAI call was needed to save the corrected version.
- Validation: 19 automated tests passed; production build passed; isolated browser rendering of the database-derived design passed on all three pages, with all 14 room schedule entries and no page errors.
