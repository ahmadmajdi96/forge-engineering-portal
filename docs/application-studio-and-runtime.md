# Application Studio and runtime

Application Studio is available at `/application-studio?site=<factory>`. Factory mode redirects the former workflow, screen, operator app, procedure, and HMI design routes into this editor. Lovable sandbox routes retain their legacy previews. The Studio sandbox starts with an empty temporary workspace and exports JSON. Factory mode supplies site write, review, signing, and deployment authority.

## Site revisions and authoring

The `studio` workspace stores a versioned site document with separate definitions for each application. Application identity, screen/widget references, variable and signal bindings, graph node/transition identity, templates, and selected values are explicit. A save checks the expected site revision, normalizes the structural schema, and creates an immutable revision with an author and reason. Concurrent saves conflict, preserving the open edits so they can be exported before reloading. Undo and redo retain the most recent 50 authoring changes in the tab. New applications start from a small executable workflow, with independent application IDs and content.

A screen's layout is authored on independent 12-column panel, 8-column tablet, and 4-column portrait grids. The editor supports direct placement, a pointer resize handle, keyboard placement/resize fields, reusable component presets, a screen/component tree, and validated numeric target and tolerance settings. The player selects a variant from the rendered width unless preview explicitly selects one. Variant preview also constrains the rendered width. Themes support system, light, and dark.

The palette includes instructions, basic inputs, measurements, checklists, keyboard-wedge barcode input, workflow buttons, typed signal displays, alarm indicators, signal trends, equipment state, annotated process links, countdowns, evidence notes, reference tables, and pinned media references. Alarm indicators display observations. Alarm acknowledgement and physical operations require an authorized owner adapter. PNG, JPEG, and WebP are the defined media reference types. Fixture publication currently requires a definition without media and peers. The player uses pinned media through an allowlisted adapter.

Variables declare a type, default, lifetime, and applicable numeric bounds and unit. Signal definitions declare the semantic ID, type, unit, and allowed freshness window. Observations arrive from the runtime adapter with quality plus source and receipt timestamps. Stale, bad, unavailable, and invalid samples are visible as statuses. Connectors use stable IDs and selected inputs. Credentials and endpoint destinations remain in the runtime adapter configuration.

## Workflow version 1

The entry step displays a screen. An interactive step accepts submit or cancel, and may have a finite timer. Connector steps accept an explicit accepted or rejected result. Terminal steps identify the complete, failed, or cancelled outcome. The compiler checks every reachable path, rejects cycles, requires event fallbacks and valid failure/cancel targets, and requires declared evidence to be captured on all paths that enter an evidence-gated step.

For an event, the interpreter evaluates ordered guards against one input snapshot and takes the first passing path. It applies declared variable updates and captures evidence from the same pre-transition snapshot. Connector inputs capture the post-update values before resetting step-scoped variables. Run-scoped variables survive transitions. Numeric tolerances compare the entered finite decimal values and include the stated boundaries. There is no arbitrary JavaScript, network destination, shell, or SQL action type.

The runtime assigns each connector request a run/sequence/node ID and a deadline. Only a response for that exact outstanding request can advance the workflow. A stale event cannot advance a later step. A timeout, disconnected request, or interrupted pending action blocks the run and preserves the request ID for reconciliation. Runtime version 1 sends each effect once and leaves uncertain effects blocked. Rejection may follow an explicitly designed recovery route. A host that restores a stored snapshot can call `recoverInterruptedRun` to surface pending outcomes without replay. Durable run storage and browser refresh recovery remain open.

## Validation, review, and the player

Draft validation uses the compiler immediately in the browser. For a saved application the **Validate** command recompiles that exact revision on the server, checks `ems.application_studio.validate` in the site, and records pass/fail, content digest, actor, and revision in the audit log. Preview uses the same validated renderer and interpreter as the player. It pins the selected draft when loaded, creates synthetic signals, and simulates accepted, rejected, or unknown connector outcomes. Connector and media adapters are available only in player mode. **Open release review** passes the exact site, revision, and app identity for a separate server-side submit, approve, and publish flow. The fixture release supports operator apps and HMIs. Procedures can be saved, validated, and simulated.

The player receives a validated immutable application from the edge host. The mounted definition stays pinned through the run if the host receives a new release. The host is responsible for package verification, assignment, operator and device identity, activation, durable evidence, and authenticated adapter enforcement. Read-only offline can show the current disabled screen and stale signal status. Online-required and bounded-offline apps pause browser actions when disconnected. Bounded offline evidence needs a separately verified edge grant and durable local service. Physical drivers, live production commands, operator qualification, and offline outcomes require separate runtime evidence.

A terminal link can supply `site`, `terminal`, and an optional `app` to enter preview in context. An immutable assignment and authenticated device readback are managed separately from the draft and its geometry.

## Verification

Run the targeted compiler and runtime tests with `bunx vitest run src/lib/studio/runtime.test.ts src/components/studio/application-player.test.tsx`. The cases exercise serialized application isolation and variants, units and evidence, graph errors, exact measurement boundaries, type/value validation, connector idempotency and timeouts, draft pinning, freshness, and preview isolation.

On the compiled Node application using disposable site fixtures, an authenticated engineer created a separate HMI in Training Factory North, added a second screen and instruction component, connected the two screens with submit and cancel paths, saved revision 2, and recorded a passing server validation. The portrait simulation advanced through the new screen to completion. Reload restored the saved definition. The same app ID was unavailable in Training Factory South. The 390-pixel viewport showed no document-width spill. This exercised the local authoring and simulation path. Live media, alarm acknowledgement, peripheral drivers, bounded-offline actions, and production AMS sign-in require deployment and partner verification.

### Compiler timing

In-memory synthetic definitions were serialized to JSON and compiled on an Intel Core i5-10300H with Bun 1.4.4. Timings include JSON parsing and compiler checks. Each profile used five warm-up runs and 30 measured runs.

| Profile | Screens | Widgets | Serialized bytes |   Median | 95th percentile |
| ------- | ------: | ------: | ---------------: | -------: | --------------: |
| Small   |       2 |      16 |            7,299 |  0.32 ms |         3.03 ms |
| Medium  |      12 |     480 |          180,359 |  5.28 ms |        17.87 ms |
| Large   |      30 |   3,000 |        1,110,101 | 39.00 ms |        66.15 ms |

Browser interaction and render budgets for large production apps remain to be measured on target industrial panels and tablets.
