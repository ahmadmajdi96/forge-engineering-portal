import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { reasonSchema, revisionNumber, siteScope } from "@/lib/production/contracts";
import { listReleases, submitRelease, transitionRelease } from "@/lib/production/releases.server";
import { jsonInput } from "@/lib/production/http.server";
import { requestError } from "@/lib/production/db.server";
import { sameOrigin } from "@/lib/production/auth.server";

const fields = { site: siteScope.shape.site, reason: reasonSchema };
const commandSchema = z.discriminatedUnion("action", [
  z.object({
    ...fields,
    action: z.literal("submit"),
    app: z.string().min(1).max(96),
    revision: revisionNumber,
  }),
  z.object({
    ...fields,
    action: z.literal("approve"),
    id: z.string().uuid(),
    expected: z.literal("submitted"),
  }),
  z.object({
    ...fields,
    action: z.literal("publish"),
    id: z.string().uuid(),
    expected: z.literal("approved"),
  }),
]);
const headers = { "cache-control": "no-store" };

export const Route = createFileRoute("/api/ems/releases")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const scope = siteScope.safeParse(Object.fromEntries(new URL(request.url).searchParams));
        if (!scope.success)
          return Response.json({ error: "Choose a factory." }, { status: 400, headers });
        try {
          return Response.json(await listReleases(request, scope.data.site), { headers });
        } catch (error) {
          return requestError(error);
        }
      },
      POST: async ({ request }) => {
        try {
          sameOrigin(request);
          const command = commandSchema.safeParse(await jsonInput(request, 4096));
          if (!command.success)
            return Response.json({ error: "Invalid release command." }, { status: 400, headers });
          const result =
            command.data.action === "submit"
              ? await submitRelease(request, command.data)
              : await transitionRelease(request, command.data);
          return Response.json(result, { headers });
        } catch (error) {
          return requestError(error);
        }
      },
    },
  },
});
