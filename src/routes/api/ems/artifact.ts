import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { siteKey } from "@/lib/production/contracts";
import { releaseArtifact } from "@/lib/production/releases.server";
import { requestError } from "@/lib/production/db.server";

export const Route = createFileRoute("/api/ems/artifact")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const params = new URL(request.url).searchParams;
        const query = z
          .object({ site: siteKey, id: z.string().uuid() })
          .safeParse(Object.fromEntries(params));
        if (!query.success) return Response.json({ error: "Choose a release." }, { status: 400 });
        try {
          const artifact = await releaseArtifact(request, query.data.site, query.data.id);
          return Response.json(artifact, {
            headers: {
              "cache-control": "no-store",
              "content-disposition": `attachment; filename="ems-release-${query.data.id}.json"`,
            },
          });
        } catch (error) {
          return requestError(error);
        }
      },
    },
  },
});
