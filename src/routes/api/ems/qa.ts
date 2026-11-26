import { createFileRoute } from "@tanstack/react-router";
import { siteKey } from "@/lib/production/contracts";
import { qaReport } from "@/lib/production/qa.server";
import { requestError } from "@/lib/production/db.server";

export const Route = createFileRoute("/api/ems/qa")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const scope = siteKey.safeParse(new URL(request.url).searchParams.get("site"));
        if (!scope.success) return Response.json({ error: "Choose a factory." }, { status: 400 });
        try {
          return Response.json(await qaReport(request, scope.data), {
            headers: { "cache-control": "no-store" },
          });
        } catch (error) {
          return requestError(error);
        }
      },
    },
  },
});
