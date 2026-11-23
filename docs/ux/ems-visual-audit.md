# EMS visual and interaction audit

## Scope and evidence

The working baseline was the restored Engineering Portal on branch `codex/ems-production`, commit `9c14595`. The audit followed the system brief from factory and line design through application authoring, independent review, assignment and commissioning evidence. The observations below come from the running local training system, its component code and interaction tests. They describe task friction. No operator interviews, plant observations or usage analytics were available.

The baseline desktop screenshot shows “r3 · Confirmed”, three pending review entries and a green check beside incomplete dependency coverage. Those values were embedded in the overview component. At 1280 × 800, the factory layout link sat below the visible sidebar. A user had to scroll past the legacy groups to discover it. [Baseline desktop screenshot](overview-before.png)

## Journey and changes

| Person and decision | Observed obstacle | Implemented change | Authority or recovery |
| --- | --- | --- | --- |
| Engineer entering a factory | A rejected fixture token led to an API error page. The narrow navigation drawer stayed open after choosing a page. | The form keeps the intended destination, explains the error and returns focus to the token field. Workspace search matches titles and groups, supports clearing an empty result and closes the mobile drawer on selection. | Session issuance and factory authorization still run on the server. Training access is visibly labeled. |
| Line engineer deciding what needs work | Example release state and review entries looked operational. The outcome of some save/review controls did not match their labels. | The overview uses the selected line’s station mappings, process bindings and current workspace revision. Issue links open the relevant editor. Draft and review actions use their corresponding save operation. | Loading, access failure and an authorized empty workspace have distinct states. A production site without a saved design starts empty. |
| Asset engineer placing or inspecting equipment | Stacked hierarchy and inspector regions competed with the canvas on narrow screens. Several original asset inspectors repeated example equipment details regardless of selection. | Narrow layouts switch between hierarchy, views and properties. Wider layouts keep the three regions together. Original inspectors derive equipment, configuration and conflicts from records for the selected station. | 3D remains the placement view. Plan, elevation and numeric properties provide alternative ways to inspect and edit it. |
| Process engineer saving a route | Edits made while a save was in flight could leave the screen reporting an outdated saved state. | Revision feedback differentiates local edits from a saved revision. Load failure offers retry. Conflicting saves preserve the draft and require confirmation before loading another revision. | The server’s revision check determines whether the save succeeds. |
| Application engineer designing a workflow or HMI | Original editors used fixed sample identities and a shared step list. Weight inputs and screen variants could disappear on selection changes. Studio validation showed paths without an editing destination. | Original editors select or create application, screen and HMI records. Workflow values belong to the selected application and step. Screen variants persist with the screen. Studio findings take the engineer to the affected field or editor. HMI previews show configured widget values. | Original design records remain in engineering revisions. Application Studio owns executable packages. The legacy walkthrough advances through authored steps and has no equipment authority. |
| Independent reviewer deciding on a revision | The reason for a release decision was entered outside the revision being reviewed. The current engineering decision could be buried below history. | Each release card owns its decision reason and feedback. Engineering review presents the current action before older revisions. | Server authorization, revision identity and independent review still govern each decision. A failed mutation preserves the reason for retry. |
| Deployment engineer assigning the published package | Publication ended at a download. Re-entering a release identity on another page introduced ambiguity. | A published package links to assignments with the exact release selected. Unknown or stale targets prompt for a valid target. | Assignment, delivery and authenticated device readback remain distinct records. |
| QA engineer deciding whether commissioning evidence is sufficient | Empty and pending results looked alike. Unresolved checks required scanning the whole table. | Admin QA exposes loading, retry, refresh and evidence-status filters. Governance pages link to the scoped assignment, delivery and evidence views. | Missing peer acceptance or physical commissioning remains visible. A successful UI action supplies no physical evidence. |

## Priorities and design decisions

**Highest consequence:** prevent unsupported release claims, edits against an unauthorized or still-loading workspace, loss of unsaved work, and action on the wrong revision or package. These changes were prioritized over cosmetic changes.

**Frequent interactions:** bring factory destinations into view, preserve scope across linked tasks, keep selected properties and controls accessible on smaller displays, and provide a keyboard path through navigation, editable tables, validation findings and dialogs.

The restored visual language uses the original Engineering Portal type, dark/light tokens, compact engineering tables and cyan accents. Three-dimensional graphics serve spatial placement. Revision identity, permission, decision history, alarms and delivery evidence remain readable as text or tables. Wide tables can scroll within their own region.

## Visual evidence and verification

The final browser sweep visited all 34 sidebar destinations at 1280 and 390 CSS pixels, plus seven layout, process, studio and governance screens at 1024 pixels. All 75 samples showed a page heading. No uncaught page exceptions or page-level horizontal overflow above one pixel were observed. The final run passed four Chromium journey tests, 116 unit and component tests, TypeScript and the targeted EMS lint checks.

The desktop comparison uses the same training factory and fixture account. The factory workspace group now appears directly below Overview. The main panel separates the selected line, workspace issues and engineering tasks. [Restored dark theme](overview-after.png) · [Light theme](overview-light.png)

On the 390 × 844 layout editor, revision status stays visible. Save and recovery tools expand on demand. View settings also expand independently of the active 3D view. The interaction test checks that the canvas begins within the first 600 CSS pixels and verifies that the grid controls can still be opened. [Mobile factory layout](factory-layout-mobile.png)

Verification includes failure and recovery paths. Tests cover rejected sign-in with focus recovery, keyboard navigation from a mobile drawer, independent application steps, weight settings and screen ownership, delayed engineering access, process save conflicts, Studio reload failure, and preservation of a release decision reason during retry. Both the native Node and Lovable builds compiled.

## Coverage boundaries

The browser and interaction tests use a training identity and fixture data. They do not establish glove usability, physical terminal performance, screen-reader conformance, live AMS registration, peer acceptance, or successful plant commissioning. The original design tools and the executable Application Studio have separate revision histories. Saving an engineering screen does not publish it as an executable package.
