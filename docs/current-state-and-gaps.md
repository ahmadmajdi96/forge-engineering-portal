# Current state and gaps

## Repository audit

The authorized GitHub default branch was `e08467c` when inspected. The local main checkout was 33 commits behind with uncommitted EMS changes. The implementation uses the newer Lovable-synced source in an isolated worktree. The earlier local changes remain in their original checkout.

The baseline has React 19, TanStack Start, Supabase clients and middleware, Zod, XState, Vitest, and immutable owner-scoped Riyadh sandbox revisions. Historical SQL 0000–0002 provides sandbox snapshots, an inbox/outbox, and local approval roles. The Drizzle schema is empty by design. The original Node Dockerfile depended on Cloud services and allowed a dependency install fallback. The Studio was a set of reference screens with fixed examples and a shared step challenge. Legacy local storage provided shell/demo state. The copied MES pages use a disconnected provider and block live writes.

The release client used an email lookup and an unverified endpoint path. It could call an in-review payload a release. The acknowledgement receiver inserted a duplicate marker before applying business status. The old approval RPC could reach Effective using local roles. New work runs on the native factory boundary. Legacy speculative transport is unavailable, and the sandbox migration revokes direct speculative writes and production-like review milestones.

## WMS reference

The authorized `command-center-pro` checkout at `23bed1c` uses `src/components/warehouse-iso.tsx` for floor/zone/aisle/rack selection and occupancy. The EMS layout uses shared selection, hierarchy cues, focused floor views, and typed relationship overlays. WMS plan coordinates remain WMS-owned. A declared import maps width to +X and depth to +Z only when the source units, origin, and orientation are known.

## Remaining acceptance work

- Organization/site records are provisioned administratively. Production site bindings require AMS site UUIDs. Line-scoped permissions need an AMS contract and narrower data partitioning.
- Process editing supports steps, links, outcomes, station references, timing, and bounded rework. Parallel scheduling, authoritative partner references, and full commissioning exports require contract work.
- The 3D editor accepts small embedded glTF/GLB and PNG/JPEG floor references. The server verifies bounded source bytes, checksums and metadata consistency. The browser recomputes model bounds from geometry before rendering. Independent server-side geometry measurement, large supplier models, isolated CAD conversion, task-specific tablet budgets, and hardware-based scene limits remain open.
- Package approval, assignment, activation, and authenticated node readback work in isolated fixtures. Live artifact distribution, device enrollment, real signal drivers, offline operator authority, and peer delivery remain release blockers.
- Existing legacy Supabase records and auth IDs require an approved scope and actor crosswalk before import. The factory runtime protects its own site partitions and leaves the Cloud records available through their original sandbox.
