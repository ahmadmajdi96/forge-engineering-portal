# App and HMI assignment resolution

Each assignment binds an immutable signed app release digest and ID to its site, exact node, app kind, effective interval, and configuration revision. A terminal retains a stable identity when its geometric placement changes. The trusted target context identifies the site, line, station, terminal and node. Machine, operation and step may additionally constrain a deployment. A configuration's secret references are opaque identifiers. The kiosk response carries only the configuration revision.

Resolution operates on one app kind and one target context. Times use UTC epoch milliseconds and half-open effective intervals, with a null end representing an open interval. An eligible record matches every dimension it specifies. The winning record must refine all otherwise matching branches to produce a unique maximal record. A refinement preserves every constraint on the broader record and adds at least one. A scoped terminal-and-step override wins over its terminal base. A terminal-only selector and a step-only selector overlap wherever both match. Define a consistent nested selector or use nonoverlapping intervals before recording those conflicting assignments. The resolver reports overridden assignment IDs.

After resolution, the exact release must be available within the site and app kind. Runtime, OS, CPU architecture, display, peripheral, signal and command-policy capabilities must all match. An incompatible winning assignment fails resolution so the operator cannot silently fall through to a different release. Callers must supply trusted target context and validated, current node capabilities. Signature and digest verification, AMS authorization, and external MES/QMS acceptance belong to their respective control-plane boundaries.

The edge daemon accepts a signed deployment envelope containing one selected assignment and target context. It cannot infer factory assignments or trust selector data from a kiosk query. The run grant additionally binds the active deployment, actor, device, scope, workflow release and exact operational references. The SQLite transaction stores the original assignment and configuration revision with each run. Finishing a run allows the separately approved activation to cross the drain boundary.

## Verification

`bun x vitest run src/lib/edge` exercises strict refinement, ambiguous overlap, adjacent intervals, wrong scope, exact release mismatch, capability rejection, active-version pinning and deferred activation. The signed edge fixture covers one terminal. Assignment authoring and live crosswalk verification require trusted factory, device, and partner records.

## EMS workspace entry point

Select **Assignments** within an authorized factory, or pass its `site` and stable `terminal` as search parameters to `/factory-assignment`. The server checks `ems.factory_assignments.view` for listing and resolution and `ems.factory_assignments.edit` plus request origin for recording an assignment. Terminal lookup requires a unique current enrollment. Each fixture site has one explicit synthetic terminal and node. Production targets require current enrollment records, and publication/assignment mutations remain gated on verified production authority.

PostgreSQL stores the selected typed context and release digest alongside the immutable published artifact. A scoped advisory transaction lock serializes relevant overlapping writes and joins the audit event to an accepted assignment. The runtime database role has no assignment update/delete privilege. Plan the closing time when a future peer assignment needs an identical selector. The current UI does not edit accepted assignment intervals. Readback requires a separate signed edge deployment and authenticated node observation.

A local smoke using the EMS role confirmed reviewer write denial, restricted cross-site list denial, north-to-south release rejection, one winner in two concurrent overlapping creates, and terminal resolution to the recorded digest and configuration.

### API

`GET /api/ems/assignments?site=training-north` lists one stable cursor page, including the current target enrollment and published release choices for that authorized factory. Supply `after` from `next` for the following page. Add exactly one of `nodeId` or `terminalId` and `kind=operator|hmi` to resolve. The optional `at` is a UTC epoch millisecond value. Mutation is `POST /api/ems/assignments` with the signed-in session and same-origin request. Its [OpenAPI contract](api/assignments.openapi.json) defines command inputs.

The standalone fixture check runs after a draft has been published by the [factory acceptance script](../scripts/ops/factory-acceptance.ts):

```sh
bun run scripts/ops/assignment-acceptance.ts .ems/fixture-acceptance-release.json
```
