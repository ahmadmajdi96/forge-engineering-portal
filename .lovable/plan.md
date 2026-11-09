# Engineering Portal: report implementation and reference pages

## Outcome
Build the missing engineering capabilities in the uploaded report, using the four images as the page-layout reference and keeping the portal’s existing sidebar design. The report governs behavior where an image differs—for example, its six-station pilot keeps four automatic and two manual stations, and simulated connection indicators must never imply a live connection.

This is a substantial system upgrade, not four static screens. Implement the application features and automated checks below; keep equipment control, production activation and external acknowledgements unavailable until authorized integrations and site commissioning demonstrate them.

## 1. Shared engineering foundation
- Introduce a canonical, scoped registry for plants, areas, lines, logical stations, physical equipment/components, terminals and edge nodes, with stable IDs and explicit MES crosswalks.
- Make engineering overview, asset lists, station editors, app bindings, analytics and inventory reports consume the same filtered registry. Keep scope selectors and source/environment labels consistent.
- Preserve the existing assembly records and MES sample records as separate legacy datasets pending reviewed mappings; never silently merge matching names or overwrite engineering revisions with runtime samples. Provide a migration/crosswalk review with mapped, conflicting and quarantined records.
- Treat the image’s Riyadh/Mixer line and equipment details as an explicitly labeled demonstration workspace, not installed equipment.
- Add multi-equipment assignments, component relationships, dated replacements, ownership, calibration evidence and eligibility; validate broken references, graph cycles and overlapping exclusive assignments.
- Separate draft/approved configuration, observed equipment state, station availability, material disposition and connection freshness.

## 2. Match the four reference pages

### Line engineering
- Rebuild the engineering line page around the reference’s header, draft/production revision badges, tabs, asset tree, fit-to-width topology, station table and selected-station inspector.
- Add Topology, Stations, Equipment, Process Bindings and MES Mapping views; selecting a tree item, diagram node or table row updates the same inspector.
- Support material-flow branches, buffers and bounded rework separately from containment. Include zoom, a table alternative and usable narrow-screen layouts.
- Add draft editing, an eight-step commissioning checklist, configuration validation, review diffs and actionable station-linked release blockers. Saving a draft cannot change machine state or production targets.

### Station configuration and connectivity
- Reproduce the binding-chain layout linking MES operation → logical station → physical equipment → edge target → app version, with asset hierarchy, context panels, signal table and right-side policy/status panels.
- Add Overview, Equipment & Components, Process Bindings, Signals & Commands, Apps & Terminals, Quality & Holds, MES Mapping and History editing surfaces.
- Implement typed semantic signals and protocol-specific adapter configuration: address, datatype, unit, scaling, sample policy, quality, source/received timestamps and freshness thresholds. Store credential references only.
- Keep material holds and PLC inhibit/readback distinct. Show stale/bad inputs and unmet CCP evidence as explicit blockers.
- Provide read-test and commissioning-test records. Without a verified site gateway, tests report unavailable—not passed—and command writes remain refused.

### Edge App Studio
- Build the workflow palette, connected workflow canvas, step inspector, tablet screen preview and release-check panel shown in the image.
- Provide Workflow, Screens, Data Bindings, Permissions, Offline Policy and Tests views; editable step properties, semantic bindings and versioned reusable templates.
- Include scan, instruction, reading, timer, checklist, quality decision, supervisor review, printing/verification and aggregation steps, with failure branches, timeout/escalation and required evidence.
- Add screen composition, draft save, undo/redo, sandbox preview, nominal/failure simulations, validation and submission for review. Sandbox previews never contact equipment or record production facts.
- Validate missing bindings/evidence, unreachable states, missing failure paths and unbounded waits. Export immutable package manifests with exact dependencies, integrity hashes and compatibility requirements.
- Keep in-flight runtime sessions pinned to their original release; configure online-required, bounded-offline or read-only-offline policies without inventing site-approved execution limits.

### Release & MES readiness
- Reproduce the release header/progress, dependency manifest, integration streams, outbox, deployment targets and right-side readiness/actions arrangement.
- Link exact topology, assignment, signal, command-policy, route, app/HMI and schema revisions to each immutable release manifest.
- Add validation results, field-level diffs, downstream impact, evidence review, approval intent/reason and authenticated reviewer identity.
- Show MES engineering acknowledgement, edge staged/actual state and production transaction acceptance separately. Approval alone never means installed, active or production-authorized.
- Show desired/actual version drift and blocked/failed/unknown states; staging, activation and rollback requests require compatible approved manifests and verified target responses.

## 3. Remaining report capabilities
- **Process & routes:** product/recipe version references, conditional operations, eligible capabilities, operation-to-station/template bindings and unit/lot/batch/continuous tracking context.
- **Fleet & deployments:** node enrollment review, identity/certificate metadata, runtime/adapter capabilities, heartbeat, desired/downloaded/staged/active versions, controlled rollout/rollback and session-drain policy. Actual enrollment and device-side verification require the real runtime.
- **MES integration:** separate EMS–MES engineering, EMS–edge deployment and MES–edge execution views; mapping coverage, versioned contracts, acknowledgements, correlation search, queue depth/age, dead letters, reconciliation and controlled replay preview.
- **Command governance:** authenticated bounded requests, writable allowlists, expected state/version, expiry, reason, idempotency and lifecycle tracking. Timeouts remain Unknown until readback reconciliation; never blindly repeat physical actuation.
- **Quality and execution readiness:** independent material containment and local inhibit evidence, CCP procedure/schedule/evidence, calibration eligibility, operator qualifications/reservations, genealogy and applicable food/assembly checks. Site-approved limits are required before production use.
- **Diagnostics & reports:** object-linked readiness blockers, mapping gaps, stale required signals, calibration exceptions, drift, queue failures, audit/release coverage, inventory consistency and exports. Replace average-version emphasis with actionable readiness measures.
- **Audit and recovery:** append-only change events with actor, reason, before/after, scope and correlation; retire referenced assets instead of hard deletion. Provide backup/export and recovery evidence tracking, runbooks and pilot acceptance checklists; do not claim restore or capacity targets are met without measured tests.
- Keep the existing sidebar appearance and grouping; add necessary destinations in that style. Give authoring and runtime entries distinct purposes instead of several identical launchers. Preserve current public paths.

## 4. Persistence, access and system alignment
- Enable Lovable Cloud for shared engineering records, revisions, validation jobs, packages, audit and integration queues instead of adding more browser-local production data.
- Preserve Command Access Hub as the role/permission authority, with its system key kept server-side. The current email lookup is not proof of identity: persistent protected writes require an authenticated identity and server-validated Hub permissions plus plant/line scope.
- Keep demo access isolated from production writes and approvals. Use managed sign-in for verified identity without changing the existing sign-in visual style; unconfigured Hub access remains clearly blocked for privileged work.
- Enforce authorization, input validation, optimistic concurrency, immutable approved revisions and release gates on the server, not just disabled buttons.
- Preserve the disconnected MES boundary until supported contracts and credentials are authorized. Do not invent MES write endpoints or replace local control/interlocks with browser actions.

## Technical implementation
- Keep TanStack Start, the existing shared shell and shadcn controls; use semantic design tokens and existing dark/light themes. Build actual editable screens, not embedded reference screenshots.
- Introduce focused engineering registry, validation, workflow, release and integration modules; record their ownership/boundary rules in AGENTS.md.
- Use Lovable Cloud tables with explicit grants, scoped row policies, versioned identity/revision separation and transactional audit/outbox updates. Seed only explicitly labeled demonstration data in migrations.
- Use authenticated server functions for internal operations and validated, authenticated/signed public server handlers for external callbacks. Keep keys and privileged clients out of browser bundles.
- Implement protocol/runtime adapters as explicit integration boundaries. Unsupported/uncommissioned device operations must refuse with an actionable reason.
- Give every content page unique title/description/social metadata. Match desktop reference proportions where space permits and reflow panels without overlap on tablet/mobile.

## Verification and completion boundaries
- Add and run focused tests for stable references/scope, assignment overlap/cycles, immutable revisions, concurrency, mandatory process/evidence bindings, units and freshness, release gates, session version pinning, permissions, idempotency/sequence gaps and desired-versus-actual deployment state.
- Exercise the central authenticated draft → validate → review flow with saved records read back through the UI; test the blocked cases as well as the successful application-only path.
- Verify all four page layouts and key interactions in the browser at desktop and the current narrow viewport; check screenshots for clipping, alignment and overlapping text.
- Check the preview build/error signals before reporting completion. Keep roadmap items open and identify any external blockers explicitly.
- Real MES acknowledgement, real edge deployment, physical command/readback, power-loss durability, FAT/SAT, qualification, backup restore and sustained-load performance remain commissioning requirements until the relevant services/hardware and site owners supply verified evidence. No production-ready claim follows from page completion alone.