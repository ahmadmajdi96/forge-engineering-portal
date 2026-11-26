# ADR 0001 — Factory authority and deployment boundary

**Decision** · Maintain one modular EMS backend and one private PostgreSQL database per environment. Run leased delivery in a separate process. Run the edge kiosk in a separate appliance with independent device identity and durable state.

## Drivers and tradeoffs

Factory engineers need responsive 3D selection and repeatable authoring. Reviewers need exact content and non-overlapping authorization. Operators need the current approved release and recoverable work. Operations needs stable IDs, bounded recovery, and explicit external failure states.

Use append-only per-site revisions with bound metadata and optimistic head changes. Keep availability of browser authoring independent of the renderer and make geometry a projection of stable IDs. Use a typed Studio schema, named capabilities, and an interpreter shared by preview and kiosk. This makes extension work explicit and allows sandbox and runtime adapters to differ.

Retaining all Supabase services for the native runtime would preserve SDK conveniences and add a broker interop dependency. Replacing the native paths explicitly allows direct AMS federation and transactional scope checks while preserving existing Lovable and sandbox behavior. That creates a separate historical migration surface. Use a controlled crosswalk and approved ownership review for any legacy data movement.

A shared database simplifies scoped revision and audit transactions. The separate sender permits retry and outages without making a user edit wait for peer uptime. PostgreSQL enforces narrow service grants. The web service authorizes every route with exact AMS actions. Device SQLite persists state when the web service is unreachable.

## Verification scenarios

1. A North grant cannot read South, with HTTP and process logs identifying a denial without revealing records.
2. Two saves at one expected revision produce one increment and one conflict.
3. An integrity failure denies installation before the kiosk changes.
4. Runs use the release pinned at start while device state may proceed independently.
5. An acknowledgement can retry under the same event identity, and its recorded decision changes atomically.
6. A backup restores in isolation with delivery and device access disabled.

Site-scope AMS grants and browser preview remain distinct from hardware commissioning and release promotion. Documented native fixture and hosted evidence use separate statuses.
