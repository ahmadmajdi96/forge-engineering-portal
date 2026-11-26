<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Legacy Cloud sandbox access lookup uses `checkAccess`. Native factory requests require an opaque server session and current exact AMS action at the mapped site. Runtime credentials stay server-side.
- Asset configuration collections/details use the canonical engineering asset projection and revision model; MES runtime previews remain in MesProvider so simulated operations never overwrite engineering definitions.
- Copied MES runtime UI binds to `src/lib/mes-disconnected.ts` until a real MES integration is authorized and verified; unavailable writes must refuse rather than simulate operational success.
- Role→module rules live in `src/lib/permissions.ts` (tested); hub "module:action" permissions override.
- App chrome (sidebar, top bar, sign-in) lives in src/components/Shell.tsx and mirrors MES Command Center's layout using shadcn ui/sidebar; why: one consistent look across MES apps.
- Canonical engineering sandbox projections use src/lib/engineering; immutable Cloud revisions and append-only audit are separate from legacy assembly fixtures and MES execution previews to prevent unsafe data promotion.
- Engineering production approval and activation require server-verified Hub scope permissions and external MES/edge commissioning evidence; sandbox owner authentication never grants production authority.

- Reference-screen presentation lives in reference-ui, reference-assets and reference-process modules and reads engineering sandbox context; keep presentation-only edits separate from production authority and copied MES preview state.

- Engineering design records are schema-validated revision payloads with stable IDs and archive semantics; snapshot saving preserves history and cannot confer MES acknowledgement, edge activation or approval authority.
- Docker builds the Nitro Node server with a frozen lock and private PostgreSQL, migrations and delivery worker. Preserve the Cloudflare Lovable build. Start local fixtures through `scripts/bootstrap-local.sh` and Compose.
- Asset Engineering flow projects existing operation records as production steps and existing station identities as their assignments; why: organize the design journey without creating a second asset store or changing production authority.

- Engineering workspace revisions contain line identities and station machine configuration; scoped selectors preserve unrelated line records, and equipment records project into station profiles so all asset/process pages share one draft authority.
- Native partner delivery uses `ems.outbox` and `ems.inbox`. Acknowledge the exact published event through a per-peer signed callback transaction. Local fixtures have outbound publishers disabled.

- Historical Drizzle SQL is canonical for the Cloud sandbox. Native migrations and checksums live in `database/migrations`. Never regenerate production SQL from the empty Drizzle schema.
- Production release signing and assignments remain fail-closed while the live AMS step-up and quality-policy contracts are unverified. Maintain staged, active, and authenticated observation evidence separately. Physical devices and site commissioning require independent evidence.
