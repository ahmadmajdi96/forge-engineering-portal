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
- Engineering data currently lives in browser storage via `src/lib/store.tsx`; all modules share the generic `EntityModule` editor with lifecycle + change log.
- Role→module rules live in `src/lib/permissions.ts` (tested); hub "module:action" permissions override.
