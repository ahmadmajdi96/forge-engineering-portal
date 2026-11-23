import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { reasonSchema, workspaceScope } from "@/lib/production/contracts";
import { readWorkspace, writeWorkspace } from "@/lib/production/workspace.server";
import { jsonInput } from "@/lib/production/http.server";
import { requestError } from "@/lib/production/db.server";
import { sameOrigin } from "@/lib/production/auth.server";

export const Route = createFileRoute("/api/ems/workspace")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const scope = workspaceScope.safeParse(
          Object.fromEntries(new URL(request.url).searchParams),
        );
        if (!scope.success)
          return Response.json({ error: "Choose a valid workspace and site." }, { status: 400 });
        try {
          return Response.json(await readWorkspace(request, scope.data), {
            headers: { "cache-control": "no-store" },
          });
        } catch (error) {
          return requestError(error);
        }
      },
      PUT: async ({ request }) => {
        try {
          sameOrigin(request);
          const input = await jsonInput(request, 9 * 1024 * 1024);
          const scope = workspaceScope
            .extend({
              expected: z.number().int().min(0).max(2147483646),
              payload: z.unknown(),
              reason: reasonSchema,
            })
            .safeParse(input);
          if (!scope.success)
            return Response.json({ error: "Invalid workspace save." }, { status: 400 });
          return Response.json(await writeWorkspace(request, scope.data), {
            headers: { "cache-control": "no-store" },
          });
        } catch (error) {
          return requestError(error);
        }
      },
    },
  },
});
