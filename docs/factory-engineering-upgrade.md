# Factory Engineering upgrade

## Scope and running baseline

The audit followed the component mounted by each TanStack file route and inspected the signed-in PostgreSQL training application. The starting engineering checkout was `29f515a` on `codex/ems-production`, descended from repository main `e08467c`. The separate original checkout contained unrelated work. The implementation preserves the ManuQube dark/light tokens, the EMS shell, the Cloud sandbox build and the native Nitro/PostgreSQL architecture.

## Active routes and changes

| URL | Active workspace | Engineering change |
| --- | --- | --- |
| `/` | EngineeringOverview | Factory layout revision, buildings, floors, areas and placement count from saved spatial records. Active line, station links, object-linked findings, empty-factory setup and governance entry points. |
| `/factory-layout` | FactoryLayout → FactoryWorkspace → Three.js scene | Hierarchy, library, canvas, plan, elevation and numeric inspector share placement selection. Optional explicit links identify canonical line, station and serialized equipment across workspaces. |
| `/lines`, `/lines/$lineId` | Line registry and detail | Search, sort, page, create, edit and archive lines. Detail shows configured stage order, assigned stations, operation use and entry to design/layout. |
| `/line-engineering` | Line design | Stage ordering, station resources, buffer rules, spatial area relationship, design takt and capacity with units. |
| `/asset-steps` | AssetStepsPage | Edit existing operation identities, sequence, station options and manual/automatic use. Deep links take a step ID. |
| `/process-routes`, `/step-templates` | ProcessRoute and StepTemplateLibrary | Review line operations and relationships, make station/template assignments and navigate into process design. |
| `/factory-process` | FactoryProcess | Saved process revisions, searchable station and operation relationships, diagram and structured steps, success/failure paths, bounded rework and validation. |
| `/stations`, `/stations/$stationId`, `/workstations` | Station list, detail and StationComposition | Three views of the same physical station. Inspect location, configured capability, process use, hardware ownership, application relationships and saved history. |
| `/machines`, `/terminals` | EquipmentComponents and TerminalsPeripherals | Inspect and edit placed hardware, dimensions in metres, interface and document references. Preview assignment impact and inspect exact application releases. |
| `/station-connectivity`, `/command-policy` | SignalBindings and command policy | Configure typed station/equipment signal bindings and freshness requirements. Command policy has a separate surface. Missing observations have an explicit unknown state. |
| `/registry` | AssetRegister | Table and hierarchy over stable, type-qualified identities. Server-paged saved revisions, search by ID/serial/crosswalk, lifecycle filtering, deep links, selection and history. |

The older route modules contained alternate editors or copied operational previews. Following the render path uncovered topology that ignored the selected line, unscoped signal bindings, fabricated equipment attributes, and buttons that implied device status. The first audit also found a numbered path through unrelated physical and manufacturing concepts, a free-text edge app binding and Studio publishing actions on the engineering overview. The upgraded navigation follows physical ownership. Manufacturing definitions reference the relevant resources independently.

## Application Studio and authorization

Application Studio is a sibling EMS section, available from the section selector, sidebar and workspace search. It owns `/application-studio`, `/edge-app-studio`, `/operator-apps` and its existing `/operator-app` alias, `/procedure-designer`, `/screen-editor`, `/hmi-layouts`, `/factory-releases` and `/factory-assignment`. The Operations consoles and their subordinate runtime-only pages have been retired. Old Operations bookmarks return the standard 404. Studio URLs, app definitions, releases and assignments retain their identities.

Station, step, machine and terminal inspectors read authorized assignment relationships. The panel shows the assigned app, Studio workspace revision, immutable release ID, configuration revision, assignment ID, node and effective interval. The Studio link opens the matching definition where available and carries factory, line, station and source entity for return navigation. A recorded assignment supplies intended configuration. Device activation requires separate readback evidence.

The shell uses site-specific grants to present section links. Server reads and mutations independently check the current grant. A writer changing legacy Studio fields inside the mixed engineering document also needs Studio edit permission. Existing immutable revisions remain readable according to their established workspace permissions.

## Persistence and identity

- Engineering, process, spatial and Studio documents remain separate versioned PostgreSQL workspaces. Optional, schema-validated fields extend existing revision payloads. Existing migration checksums and stored release artifacts are preserved. This upgrade requires no new SQL migration.
- A same-site transaction lock and expected revision protect cross-workspace references. Introducing a link requires a valid saved engineering identity with the correct parent. Changes that would strand linked placements or linked process definitions are rejected. New process releases using engineering references pin the applicable engineering revision.
- Registry searches recheck site access before consulting a bounded cache of three projections keyed by site and immutable revision. Search, sorting and paging run on the server for saved native records. Unsaved changes use the same projection locally until saved. The canonical storage unit is still a factory revision. The registry does not provide SQL-indexed streaming of arbitrarily large catalogs.
- Physical duplication clears serials and exclusive bindings. Archival preserves identity and review history. The four components in the original detector training seed incorrectly shared one serial, preventing a first save under exclusivity validation. The corrected seed identifies only the detector. Existing saved serials are preserved for explicit reconciliation.
- Root search carries `site`, `engLine` and `engStation` through related links. Changing factory clears entity-specific query parameters, resets dynamic detail routes to their collection and remounts the scoped providers. Line and station switches validate child identities and clear incompatible selections. Stale async results cannot replace the currently scoped result.

## Spatial interaction and fidelity

The existing Three.js renderer supplies genuine WebGL geometry and camera controls. Changes include a searchable spatial hierarchy, canonical links, explicit placement destination, a resizable inspector, selection hover, camera directions and bounds-aware fit. The plan and front elevation use the same occurrence transforms as the canvas and numeric inspector. Moving a placement edits only its transform. It does not reorder stations or manufacture execution evidence.

The workspace supports orbit/pan/zoom, perspective and orthographic cameras, saved views, individual and multiple selection, numeric transforms, snapping, grouping, alignment, locking, visibility, isolation, undo/redo and local draft recovery. Saved design and editable draft are distinct views. Read-only users can navigate and inspect. Geometry shows configured envelopes or supported imported models with provenance, units and scale. The existing glTF/GLB path remains bounded. CAD conversion, certified clearance, shop-floor scans and speed on a physical tablet require separate evidence. See [spatial model and coordinate conventions](spatial-model-and-editor.md).

In headless Chromium using ANGLE SwiftShader at 1280 × 800 on an Intel Core i5-10300H, the 30, 450 and 1,800 procedural-placement cases reached their first instanced draw in 168, 122 and 238 ms. Orbit frame p95 was 16.8, 16.8 and 16.7 ms. These figures cover one repeated template, canvas and two projections. A separate concurrent build/test run took up to 1.9 s on first draw. See [benchmark conditions and measurements](factory-engineering/scene-benchmark.json).

## ManuQube station models and the EMS persona

The **Factory layout → Component library → Station assemblies** collection contains a commissioning workbench, a quality inspection station, a robot and conveyor cell, a warehouse storage rack, and an access control gate. Each thumbnail comes from the same mesh used by the interactive canvas. Choose a station in the hierarchy or placement selector, then drag a template onto the 3D floor or choose **Place on floor**. Its inspector shows dimensions in metres, and its occurrence can be selected in the scene, plan, elevation, or table. The **Equipment** collection retains the site's component templates.

The station forms follow the factory viewer in the local ManuQube Digital Experience landing redesign. The published reference provided the official EMS persona, **Sentinel**, the tracked inspection rover. Its sign-in portrait and sidebar profile follow the pattern used by the sibling ManuQube applications. The overview brief reads a finding from the selected factory. Graphite and ivory surfaces, vermilion actions and EMS amber are shared across light and dark themes. Instrument Sans and IBM Plex Mono ship locally with their licenses. [ManuQube Digital Experience reference](https://github.com/ahmadmajdi96/manuqube-digital-experience/tree/7fc905128da6a5c70a93f811e44b44a8c52bc311).

A template can now carry an optional, validated `stationModel` identifier. Existing revisions continue to load. Opening a layout only offers the built-ins. First placement adds the exact template revision and an independently identified occurrence to the draft. Subsequent placements reference that revision. The existing save transaction persists both. The forms and their default dimensions are illustrative. Imported glTF/GLB geometry and authored component assemblies retain their existing render paths.

In a restored copy of the training database, the five assembly types were saved together and loaded from the next PostgreSQL spatial revision. The automated browser checks also placed assemblies through the library, synchronized their selection with plan, elevation and inspector, filtered the equipment catalog and undid the edits. The persona dialog passed keyboard open, close and focus-return checks. Screens below use training data.

With the five station types mixed together, Chromium submitted five instanced mesh draws at 30, 450 and 1,800 placements. In one run at 1280 × 800 on an Intel Core i5-10300H with SwiftShader, the first instanced draw took 425, 343 and 937 ms respectively. These timings include mounting the plan and elevation. Physical GPU and tablet performance remain unmeasured.

| Review | Captures |
| --- | --- |
| 3D station layout | [Five assemblies in WebGL](factory-engineering/station-assemblies-canvas.png) · [Engineering workspace](factory-engineering/station-assemblies-workspace.png) |
| Sentinel sign-in | [Previous](factory-engineering/sentinel-sign-in-before.png) · [Desktop](factory-engineering/sentinel-sign-in-1440.png) · [Mobile](factory-engineering/sentinel-sign-in-390.png) |
| Engineering overview | [Dark](factory-engineering/sentinel-overview-dark.png) · [Light](factory-engineering/sentinel-overview-light.png) |

## Browser and database evidence

The before captures show the original overview, populated layout and filtered-empty line list. The after captures include a populated engineering revision and a genuinely empty site with saved empty engineering and layout workspaces. The latter were created on a disposable database. The screenshots use training data.

| Surface | Review evidence |
| --- | --- |
| Overview | [Before](factory-engineering/overview-before.png) · [After](factory-engineering/overview-1440-after.png) · [Empty factory](factory-engineering/empty-factory-after.png) |
| Line registry | [Filtered empty before](factory-engineering/empty-lines-before.png) · [Empty factory after](factory-engineering/empty-lines-after.png) |
| Layout | [Before](factory-engineering/layout-before.png) · [1920 × 1080](factory-engineering/factory-layout-1920-after.png) · [1024 × 768](factory-engineering/factory-layout-1024-after.png) · [Selected placement](factory-engineering/factory-layout-selected-1440.png) |
| Manufacturing and signals | [Line](factory-engineering/line-engineering-1440-after.png) · [Steps](factory-engineering/asset-steps-1440-after.png) · [Route graph](factory-engineering/process-graph-after.png) · [Connectivity](factory-engineering/station-connectivity-1440-after.png) |
| Hardware | [Registry](factory-engineering/registry-1440-after.png) · [Station](factory-engineering/station-desktop-after.png) · [Tablet equipment](factory-engineering/equipment-tablet-after.png) · [Mobile terminal](factory-engineering/terminals-mobile-after.png) |

At tablet and phone widths the duplicate navigation strips consumed roughly 300 vertical pixels before the terminal controls. A disclosure now groups related engineering pages. Browser verification also caught a station-detail scope update resolving to the overview, and a station switch retaining the previous machine selection. The regression checks exercise the actual menu routes, permissions and scoped forms. The full-route diagram supports keyboard node selection for up to 40 steps. Larger routes retain the selected-step graph and structured path inspector.

The database scenarios use an independent local training database. They exercised competing saves, exact signed release relationships, denial across sites and for reviewer mutations, assignment conflicts, save/reload and preservation of linked spatial records. The fixture author entered 17.5 seconds per unit and 180 cases per hour on a new line, saved a station-owned signal and stored a two-step process with a success edge. These values are test inputs.

## Verification results

- The full Vitest suite passed 136 tests across 28 files. TypeScript, the EMS ESLint target, the native Nitro build and the Cloudflare/Lovable build passed.
- Seven Playwright scenarios passed against the running PostgreSQL fixture. They covered keyboard sidebar navigation, existing Studio editing, scoped hardware search/duplication/archive, direct station links, selection across 3D/plan/elevation, and read-only camera/inspector controls.
- The signed-in sweep covered 13 routes at each of 1920 × 1080, 1440 × 900, 1024 × 768 and 390 × 844. No page-wide horizontal overflow, uncaught page errors, console errors or failed network responses occurred in that sweep. At actual 200% Chromium tab zoom the registry reflowed from 1440 to 720 CSS pixels, with a 720-pixel document and keyboard focus advancing to the next control.
- The north terminal inspector displayed the published fixture's exact release and assignment. Opening its Studio definition and returning preserved the physical terminal. Switching to the empty south factory cleared the north entity selection.
- Applying native migrations to an empty PostgreSQL database and applying them again passed. The signed-package, assignment and spatial acceptance checks ran against isolated PostgreSQL. The local Docker socket denied access; a local OCI build and container-level restore were unavailable in this environment.

## Release boundary

The native review application binds to loopback. A production HTTPS origin, AMS client and grants, package trust, peer credentials and physical commissioning evidence are environment-owned. The native fixture and its release key are for local review. Production signing and assignment creation retain their existing checks. See [operation and deployment workflow](operations.md) and [readiness prerequisites](production-readiness.md).

## Connected production lines

Start in **Production Lines**, open a line and choose **Design sections and steps**. The route editor groups manufacturing steps in named sections. The physical hierarchy still places each station within its line. A step can reference an engineering station before anyone places it on the floor. For a step with multiple assigned stations, choose whether any one or all of them participate. The route graph defines sequence, branches and terminal outcomes independently of object placement. A station profile lists its directly assigned route steps, including the section and a link back to the node.

Manual work has a responsible operator role. Automatic work needs completion evidence or a configured read signal. Semi-automatic work also identifies the human-to-machine handoff and completion signal. Incomplete definitions can remain drafts. Validate the route before release. Version-one process documents accept the additional fields without a database migration. Historical revisions retain their original station placement IDs. Related Studio, engineering, layout and process edits check the saved relationships under the same site lock. The client receives the existing process-edit grant for its site, and the backend checks mutation permissions independently.

In **Engineering relationships**, select an engineering operation, stations, a completion signal and its consumers. Studio inputs must match the engineering datatype and unit. A MES consumer must have a configured mapping on the source station. **Trace in 3D** opens the saved route and step. A directed overlay connects placed source equipment to a placed terminal associated with the consuming app. The floor plan and front elevation show the same direction. The inspector identifies the signal address, allowed age, Studio input, consuming screen and widget, and MES resource. Source and destination links open their owning workspaces. Physical links have their own port identities and connection types.

Application authoring, releases and assignments remain in the sibling Studio section. The primary Factory Engineering menu exposes lines, stations, machines, terminals, connectivity, layout, routes and registry. **Show all workspaces** and search retain access to existing specialist and legacy destinations under their original permissions.

### Reproduce the packaging example

The training example contains three stations and seven placed assets. Manual loading hands off to automatic filling. Weight verification requires the filling cell and a semi-automatic inspection station. The scale publishes a designed weight in kg to the inspection HMI input and a proposed MES quality mapping. A separate network link connects the scale and panel ports. The operator terminal and inspection panel reference Studio definitions. The training example contains no deployed release or verified device observation.

Use an empty local training-south site in a separate fixture database. Run `bun scripts/ops/load-packaging-training.ts` with `EMS_SMOKE_ORIGIN` pointing to its loopback HTTP origin. The loader authenticates through the fixture API, verifies all four workspace heads before writing and can resume an identical partial installation. A differing existing revision blocks installation. The data is in [the packaging example](factory-engineering/packaging-training.json).

Verification covered installing twice on an isolated PostgreSQL database, editing a section through the browser, reloading the saved revision, opening a station's exact step, and following the signal, HMI and MES references. Changing the HMI unit, moving the source outside the assigned stations and archiving the referenced MES mapping each returned HTTP 409 with unchanged heads. For the browser regression suite set `EMS_PACKAGING_FIXTURE_ORIGIN` to the populated training origin. Desktop, tablet and narrow-screen checks covered 1920 × 1080, 1440 × 900, 1024 × 768 and 390 × 844 with software WebGL. Each viewport displayed the canvas on initial load with no page-wide horizontal overflow.

The overlay represents configured logical endpoints and draws up to 1,000 paths at once. A live observation overlay, intermediate gateway routing, historical signal replay, cross-line capacity reservations and benchmarking on plant hardware remain open. End-to-end physical handover still requires an authorized adapter, actual device observations, release readback and a correlated MES acknowledgement.

### Factory Engineering journey redesign

The overview uses the selected line's station sequence as its main workspace. Each station links to its composition. A suggested task uses the loaded engineering records and findings. The Sentinel brief, reviews and saved layout summary remain available beside the line.

The engineering navigation connects line setup, manufacturing sections and steps, station hardware, signals, 3D layout and readiness. Previous and next actions carry the relevant factory, line and station. In the process editor, the route outline and graph sit beside the selected step on wide screens. Revision and validation controls stay with the route.

In the layout, buildings, floors and sections share the desktop hierarchy column. On smaller screens, open **Floors & hierarchy** to select or manage a space and **Views** to return to the canvas. A compact stage selector and revision bar leave room for the scene. Screenshots from the populated training factory showed the canvas starting 287 CSS pixels below the top at 1920×1080 and 1440×900, 339 pixels at 1024×768 and 373 pixels at 390×844. These are measurements from Chromium at default zoom.

Lovable authored the interface in revisions `d96cc05` and `bb7ce23`. The second revision addressed the canvas being pushed below the first screen in the first pass. This change uses the existing EMS records, assignments, and save APIs. The new browser regression follows a packaging station through its signals into the layout and checks all three scope IDs.

### Page ownership and setup from 3D

Overview remains a standalone landing page. The sidebar contains six primary engineering destinations and Application Studio. Search accepts former page names. Each section has a keyboard-accessible tools list. A saved bookmark still opens its editor with its own authorization.

| Destination | Active routes and responsibilities |
| --- | --- |
| Overview | `/` summarizes the factory. It does not join a setup sequence. |
| Factory Layout | `/factory-layout` owns physical hierarchy, placement, footprint and 3D, plan and elevation selection. Start setup after saving a placement or space. |
| Assets | `/registry` is the entry for equipment and station inventory. Lines, line design, stations, station composition, machines and terminals retain their detail URLs and identities. The Stations list shows engineering configuration. Shift and operator presence belong in MES. |
| Process Design | `/factory-process` owns the versioned line process. `/process-routes`, `/asset-steps` and `/step-templates` remain editing surfaces for their respective manufacturing definitions. Native line routes and engineering templates have distinct revision streams. The active template library saves assignments through the engineering workspace. |
| Connectivity | `/station-connectivity` owns signal design. `/command-policy` covers writable signals and `/mes-integration` covers MES resource mappings. Only mappings reached through the saved line's signal consumers and exact station record enter an item's setup. |
| Readiness | `/release-readiness` shows engineering findings for the selected setup item and distinguishes related line and station findings. Opening the page independently presents the existing governance workspace. Diagnostics, commissioning, approval, changes and deployment history remain available with their grants. |
| Application Studio | `/application-studio` keeps app definitions, workflows, screens, previews, factory releases and assignments together. Native editor modes use the selected native definition. Existing Edge App Studio, Operator Apps, Screen Editor, Procedure Designer and HMI Designer URLs still address their original records. |
| Specialist tools | Edge Fleet, System Integrations and Admin QA retain their own pages and access checks. |

A line's station order and its geometry are independent. Guided navigation carries the saved site, physical item, engineering line, station and asset IDs. Selecting another scope clears inapplicable relationship IDs. Finishing returns to the same 3D object. Save, publish, approval, commissioning and delivery retain separate actions.

| Selected item | Guided work |
| --- | --- |
| Building, floor or area | Review dimensions and hierarchy in the layout inspector and finish on the same space. |
| Line | Configure the line, organize its stations, inspect manufacturing sections and review readiness. |
| Station | Configure its composition, manufacturing steps and signals. Command policy appears for configured writable signals. |
| Equipment | Configure the exact equipment record, inspect its signals, review applicable command policy and MES mapping, then open readiness. The packaging scale links to `PACK-SCALE`, `inspection_weight` and `PACK-WEIGHT` at station `CHECK`. |
| Terminal | Inspect the saved terminal and its application relationship. An explicit authoring reference opens the current definition. Published release links open an immutable Studio revision. A terminal without an app reference lists assignments for that terminal. |

The wizard explains missing relationships and grants. Other authorized pages remain available through its optional tools list. A successful review reports findings against engineering records. Physical commissioning and MES acknowledgement each require separate evidence.

### Bookmarks, data and integration

- `/analytics` redirects to Diagnostics. `/reports` redirects to the reports view in Assets and retains a supported report tab and factory context. Inventory, station memberships and crosswalks use the scoped engineering model. Native calibration dates, assignment intervals and signed changes appear only where the underlying service supplies evidence. The sandbox can display its local records with source labels. Available exports quote CSV values and neutralize formula text.
- The read-only Studio lookup checks the existing site Studio grant and joins the published application and revision to its immutable document. A missing, unpublished, inaccessible or mismatched revision cannot silently open the current draft. The existing edit, publish, assign and audit APIs retain their responsibilities. No schema migration or data rewrite is required.
- The Operations URLs, runtime consoles, work-order, unit and waste-reason pages remain retired. Production execution belongs to MES. A production MES launch URL and federated entitlement have not been verified.
- The active Step Templates route already used the factory engineering workspace. The old browser-store editor in that file was unreachable and has been removed. No legacy records were migrated or renumbered.

### Verification

The repository includes browser scenarios for exact item setup, scoped signal/mapping handoff, return to placement, native report exports, old bookmarks, terminal-only Studio navigation and invalid versions. Disposable PostgreSQL scenarios exercise template assignment save/reload, new floor/section footprint persistence and historical application preview after the Studio head changes. The release scenario expects the published fixture produced by `scripts/ops/factory-acceptance.ts`. It runs only with `EMS_DISPOSABLE_RELEASE_TEST=1`.

Lovable authored the interface in draft revisions `bb138a9`, `45140db`, `856772b` `26f3846` and `4c00bc3`. Integration and backend validation use the running EMS and its canonical PostgreSQL records.

The release check ran 198 unit and component tests, the EMS lint and TypeScript checks, the production build and the Node server build. Chromium passed 18 scenarios against the two running local factories. Two write-dependent tests were excluded there and passed against disposable PostgreSQL databases. The packaging run passed six scenarios. The release run also exercised concurrent writes, independent approval, a signed package and historical preview after changing the Studio head. Screenshot inspection covered 1920 × 1080, 1440 × 900, 1024 × 768 and 390 × 844. The measured page width matched each viewport, with no uncaught page errors during that walkthrough.
