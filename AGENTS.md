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

- Access checks go through `checkAccess` server fn calling Command Access Hub with ACCESS_HUB_URL + ACCESS_HUB_API_KEY secrets — the key must never reach the browser.
- Asset configuration collections/details use the canonical engineering asset projection and revision model; MES runtime previews remain in MesProvider so simulated operations never overwrite engineering definitions.
- Copied MES runtime UI binds to `src/lib/mes-disconnected.ts` until a real MES integration is authorized and verified; unavailable writes must refuse rather than simulate operational success.
- Role→module rules live in `src/lib/permissions.ts` (tested); hub "module:action" permissions override.
- App chrome (sidebar, top bar, sign-in) lives in src/components/Shell.tsx and mirrors MES Command Center's layout using shadcn ui/sidebar; why: one consistent look across MES apps.
- Canonical engineering sandbox projections use src/lib/engineering; immutable Cloud revisions and append-only audit are separate from legacy assembly fixtures and MES execution previews to prevent unsafe data promotion.
- Engineering production approval and activation require server-verified Hub scope permissions and external MES/edge commissioning evidence; sandbox owner authentication never grants production authority.

- Reference-screen presentation lives in reference-ui, reference-assets and reference-process modules and reads engineering sandbox context; keep presentation-only edits separate from production authority and copied MES preview state.

- Engineering design records are schema-validated revision payloads with stable IDs and archive semantics; snapshot saving preserves history and cannot confer MES acknowledgement, edge activation or approval authority.
- Docker builds use vite.docker.config.ts (nitro node-server preset) via Dockerfile/docker-compose.yml; why: run anywhere with `docker compose up --build` without changing Lovable's Cloudflare build.
- Asset Engineering flow projects existing operation records as production steps and existing station identities as their assignments; why: organize the design journey without creating a second asset store or changing production authority.

- Engineering workspace revisions contain line identities and station machine configuration; scoped selectors preserve unrelated line records, and equipment records project into station profiles so all asset/process pages share one draft authority.
