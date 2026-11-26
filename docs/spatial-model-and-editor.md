# Spatial model and editor

Open **Factory layout** and select an authorized factory in the EMS shell. Choose the site in the hierarchy, add a building and floor, then add an area, line and station. Select a template and choose **Place on floor**, or drag the template onto the 3D floor. Use the scene, plan, elevation, hierarchy, or placements table to select and inspect occurrences. The perspective and orthographic cameras support orbit, pan, zoom and fit; named camera views persist with the workspace. Select a terminal or HMI to open Application Studio and inspect the effective assignment when authorized.

## Identity and coordinates

The scoped workspace contains one organization root and one site with its building, floor, area, line and station hierarchy. A catalog entry is keyed by stable template ID and revision. A placement references that exact version and carries only the occurrence position, rotation, permitted overrides and engineering references. A new template revision leaves the original placement intact. Duplicating occurrences generates fresh IDs and clears physical asset, terminal, app authoring and process links. Physical links carry owning system and stable asset ID; exclusive duplicates within the saved design fail validation.

The editor uses metres in a right-handed, Y-up frame. +X follows the floor width, +Y is elevation, and +Z follows floor depth. A floor has a site anchor and independent width, height and depth. Placement positions are relative to the floor anchor, at the center of the equipment footprint and base of the envelope. Rotations are in degrees in Three.js XYZ Euler convention. Site points equal the floor-local points plus the floor anchor. Plan projects X/Z, and front elevation projects X/Y. The same rotated envelope drives both projections, the collider and 3D picking fallback. The WMS SVG projection informed color and single-identity selection. For a WMS dataset whose positive ground X/Y and elevation map to the EMS floor axes, the explicitly declared mapping is `(x, y, height) → (x, height, y)`; importing WMS records and establishing their spatial ownership require a separate crosswalk.

Assemblies store stable component IDs, local transforms, component dimensions and optional explode offsets against their exact catalog revision. Select an assembly to inspect its component list or view its configured exploded geometry. Process step references are crosslinks to engineering context, and geometry edits preserve them. A local authoring app ID opens the editor and preview. An effective runtime assignment comes from the separate resolver, with its exact release digest, configuration revision and target. An active device version requires authenticated readback.

## Authoring, save and recovery

Numeric inspector edits, gizmo moves and rotations, grid and angle snapping, surface placement on the floor, exact port snapping, selection translation, grouping, alignment, distribution, locking, layers and hide/isolate use the same draft document. A gizmo move or grouped edit is a single undo unit. The saved-design view disables editing. Connections type their ports by medium, interface designation and direction. Material routes and typed utility overlays use separate colors and line styles. Compatible direction and interface labels describe the engineering design.

Save accepts a reason and the expected server revision. The server checks the site grant, validates the payload and locks the current workspace row before committing the immutable revision and audit. A conflicting save leaves the local draft intact. The editor reads the authorized server head and offers a three-way merge by stable record ID; incompatible concurrent changes remain for manual resolution. Download JSON preserves the draft with its base revision. Importing a recovery file checks the selected site, base revision, document references and embedded artifact integrity. Changing application routes with a dirty workspace offers to download the draft first.

## Models and reference plans

The initial import path accepts self-contained static, untextured glTF 2.0 and GLB 2.0 up to 700 kB each. GLTFLoader includes nested transforms when measuring actual vertex bounds. The author declares Y-up source units in metres or millimetres. The loader places the model origin at the center of its ground footprint, scales uniformly into metres, and locks occurrence dimension overrides. Nonuniform manufacturer asset resizing is disabled. Supplier documents distinguish approximate, supplier-declared and verified source dimensions.

The workspace stores the immutable source bytes, byte count, SHA-256, supplier and license references, source frame, units, source bounds, metre dimensions and measurement algorithm version. Server-side checks validate the parsed static file profile, SHA-256, length and consistency of declared bounds and unit conversion. Before display, the viewer recomputes actual mesh bounds and compares them with the stored metadata. The workspace embeds small source files with a combined 1.9-million-character encoded budget. Oversized supplier files, textured scenes, CAD and point-cloud conversion need an external artifact workflow and importer. External URLs, unsupported extensions, cyclic nodes and over-budget model structures are rejected.

PNG and JPEG floor-plan references up to 700 kB and 3072 × 3072 pixels support an explicit width, depth, X/Z anchor, calibration status and source. The plan and 3D share the calibrated rectangle. Evidence that qualifies an image or supplier dimension as verified remains a site engineering responsibility.

## Checks and limits

Structural rules reject broken hierarchy, missing exact template revisions, invalid port references, cross-floor connections, duplicate terminal or exclusive asset identity and incompatible dimensions. Findings include the linked occurrence, rule version and a corrective action. Geometry rules check floor bounds, rotated world-axis envelope overlap, configured clearance and material port gaps. The geometric tolerance is 1 mm. The author supplies the applicable site clearance rule and distance; these checks are an engineering aid. Axis-aligned envelopes may flag a rotated or concave shape conservatively. Exact geometry collision, machinery safety and electrical compatibility require their own validation.

Invalid or unavailable graphics have a retry path and leave the plan, elevation, placements table and numeric inspector usable. Imported geometry failures preserve the selection envelope. The 3D module loads on demand, rendering only after a scene, viewport or camera change. The renderer shares a unit box through instancing, retains stable occurrence picking and caps pixel ratio at 1.75. The nearest and selected imported objects receive up to 12 detailed models, with envelopes for the remaining occurrences. The target runtime budgets are up to 2,500 occurrences and 3,500 links per saved factory document.

## Verification

`bun run test src/lib/spatial/spatial.test.ts` covers metre GLB, millimetre GLB and embedded glTF, nested transform bounds, origin and hash checks, external resource and cycle rejection, exact template references, group undo, conflict handling, typed connectors and clearance and overlap rules.

On the local isolated database, browser verification selected a machine with the keyboard in plan, moved its X position numerically from 3 to 5.4 m, verified both projection polygons shifted by 2.4 m and saved revision 2. Chromium with WebGL 2 then moved the same machine from 5.4 to 6.0 m with a native pointer drag on the 3D X gizmo and verified the 0.1 m snap, synchronized selection and Undo. WebKit verified orthographic switching, forced context loss and retry, and a 390 px wide viewport without horizontal overflow.

Procedural performance was sampled on an Intel Core i5-10300H host using Chromium headless with SwiftShader at 1280 × 800. Each density used evenly spaced placements of one catalog envelope, duplicated plan and elevation projections, and no imported meshes or connections. The first draw time includes component mount and renderer setup; the orbit figures measure browser animation-frame intervals during 25 pointer steps. Heap is the observed Chromium JavaScript heap, excluding GPU and browser process memory. Domain median is from ten warmed Bun runs combining schema and geometry validation.

| Occurrences | Serialized draft | Domain median | DOM mount to first 3D draw | Orbit p95 frame interval |  JS heap |
| ----------: | ---------------: | ------------: | -------------------------: | -----------------------: | -------: |
|          30 |          16.6 kB |       1.13 ms |                     242 ms |                  16.8 ms | 12.9 MiB |
|         450 |         198.5 kB |       9.01 ms |                     174 ms |                  16.8 ms | 13.2 MiB |
|       1,800 |         784.6 kB |      32.90 ms |                     250 ms |                  16.7 ms | 17.5 MiB |

For that procedural fixture, the engineering targets are first mount below 350 ms, orbit p95 below 33 ms, and JavaScript heap below 30 MiB on the stated harness. Results vary with browser and scene complexity. Representative textured or supplier-scale scenes, device touch performance, production round-trip time, and physical tablet GPU and memory budgets remain unverified.

## References

- The [Khronos glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html) defines model transformations, units, Y-up, and binary GLB structure.
- The [Three.js TransformControls documentation](https://threejs.org/docs/pages/TransformControls.html) defines transform snapping and world or local gizmo space.
- The [Three.js GLTFLoader documentation](https://threejs.org/docs/pages/GLTFLoader.html) defines the loading APIs. EMS enforces a narrower static ingest profile.
- The [ISA-95 equipment hierarchy](https://reference.opcfoundation.org/specs/OPC-10030/7.4.1) and [ManuQube WMS repository](https://github.com/ahmadmajdi96/command-center-pro) informed the engineering containment model and spatial selection behavior.

## Buildings, floors and sections

Open **Buildings, floors and sections** above the viewer to navigate the physical hierarchy. Under **Manage buildings, floors and sections**, choose a parent to add a child, or choose **Rename**. Selecting a building previews its first floor in document order. Use the Floor selector to switch levels. Under **Floor dimensions and reference**, set the selected floor's dimensions and site anchor in metres.

A physical section uses the existing area identity. Select it and expand **Section footprint** to enter its lower X/Z corner, width and depth relative to the floor. The saved outline appears in the 3D scene and plan. Existing areas have no outline until someone supplies dimensions. Moving the outline preserves equipment locations and process assignments. Use **Save workspace** with a revision reason to persist changes. View-only users can navigate the same hierarchy.

The floor navigation bar selects sections by name. The 3D scene draws labelled floor slabs and translucent section surfaces. A configured footprint is authoritative. When a section has only placed equipment, the scene and plan display its clipped equipment envelope as an estimate. A section without either stays in the navigation bar until a footprint is supplied. These projections are calculated from the current draft. The Building floors control shows sibling storeys together, separating coincident elevations for inspection. Select a floor or section to return to its working view.
