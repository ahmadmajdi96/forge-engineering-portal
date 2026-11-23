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

Application Studio is a sibling EMS section, available from the section selector, sidebar and workspace search. It owns `/application-studio`, `/edge-app-studio`, `/operator-apps` and its existing `/operator-app` alias, `/procedure-designer`, `/screen-editor`, `/hmi-layouts`, `/factory-releases` and `/factory-assignment`. Runtime entry points `/operator`, `/hmi` and `/live` remain under Operations. Existing URLs, app definitions, releases and assignments retain their identities.

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
