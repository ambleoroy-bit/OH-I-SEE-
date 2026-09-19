# Construction roadmap implementation

Sources: Procedure.pdf (5 pages) and Grades.pdf (3 pages), supplied by the user on 2026-09-17.

## Working flow
1. Customer sends contractor request; contractor accepts.
2. Contractor proposes Economy, Basic, Standard, Premium or Luxury, with actual drawing/specification references and exclusions.
3. Customer agrees specification. Contractor prepares supplier-based itemized budget. Customer approves one contractor budget.
4. Contractor starts execution. Both participants use the same roadmap in the project request, Site Updates, execution and handover screens.
5. Each stage records Draw -> Check (named responsible inspector and evidence reference) -> customer Approve -> Execute -> Measure -> Record.
6. Columns, beams/slabs and masonry are tracked separately for each floor. Curing logs may run alongside other permitted activity. Concealed work and slab loading require the relevant test/clearance records.
7. Either participant records snags with responsible person and correction date. Contractor submits correction; customer closes it.
8. Contractor submits handover references after every stage is recorded and every snag closed. Customer signs off; the database trigger marks the project completed.

## Source mapping
- Procedure sections 1-12 map to the expanded 20 stages in Grades page 1.
- All ten rows of Grades page 3 are available in the five-grade reference table. Structural values are never copied into design or material quantities by selecting a grade.
- Measurement records support m3/m2 calculated from metre dimensions, plus m/kg/tonne/point/circuit/item quantities and descriptive reinforcement/material specifications.
- Hold-point labels cover excavation, footing steel/concrete, columns, beam/slab, concealed services, waterproofing and final testing.
- Work durations and curing references are planning guidance. No automatic project duration is calculated by summing them.

## Persistence and limitations
- Version-checked authenticated marketplace job actions persist the roadmap in the existing job JSON; no new table is required.
- `database/construction_roadmap_sync.sql` updates the existing synchronization trigger function for final handover completion. Applied through Supabase management API (HTTP 201).
- Inspector names, inspection evidence, curing observations and document references are entered by participants. This does not digitally authenticate an engineer or certify code compliance. Attachments remain in the existing document system; this register stores their references.
- No engineering calculations, structural design, reinforcement sizing or automatic material takeoff is performed by the five-grade selector.
- Legacy started jobs can agree a missing specification before using site controls.

## Validation
- Roadmap tests cover roles, stage order, calculated measurements, curing dates, per-floor dependencies, snag correction and handover sign-off.
- Marketplace integration tests cover specification approval before budget submission.
- Browser validation exercises grade agreement, proposal, customer approval, project start, drawing record, 23 generated stages for two floors, desktop/mobile layout and absence of horizontal page overflow.
