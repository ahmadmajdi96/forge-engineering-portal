import { createFileRoute } from "@tanstack/react-router";
import { sameOrigin } from "@/lib/production/auth.server";
import {
  createAssignmentInput,
  listAssignmentInput,
  resolveAssignmentInput,
} from "@/lib/production/assignment.contracts";
import {
  createAssignment,
  inspectAssignment,
  listAssignments,
} from "@/lib/production/assignment.server";
import { requestError } from "@/lib/production/db.server";
import { jsonInput } from "@/lib/production/http.server";

const headers = { "cache-control": "no-store" };
export const Route = createFileRoute("/api/ems/assignments")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const query = new URL(request.url).searchParams;
        const site = query.get("site");
        try {
          if (query.has("nodeId") || query.has("terminalId")) {
            const rawTime = query.get("at");
            const input = resolveAssignmentInput.safeParse({
              site,
              nodeId: query.get("nodeId") ?? undefined,
              terminalId: query.get("terminalId") ?? undefined,
              kind: query.get("kind"),
              at:
                rawTime === null
                  ? undefined
                  : /^\d{1,15}$/.test(rawTime)
                    ? Number(rawTime)
                    : Number.NaN,
            });
            if (!input.success)
              return Response.json(
                { error: "Invalid assignment resolution scope." },
                { status: 400, headers },
              );
            return Response.json(await inspectAssignment(request, input.data), { headers });
          }
          const input = listAssignmentInput.safeParse({
            site,
            after: query.get("after") ?? undefined,
          });
          if (!input.success)
            return Response.json(
              { error: "Invalid assignment list scope." },
              { status: 400, headers },
            );
          return Response.json(await listAssignments(request, input.data), { headers });
        } catch (error) {
          return requestError(error);
        }
      },
      POST: async ({ request }) => {
        try {
          sameOrigin(request);
          const input = createAssignmentInput.safeParse(await jsonInput(request, 4096));
          if (!input.success)
            return Response.json(
              { error: "Invalid assignment command." },
              { status: 400, headers },
            );
          return Response.json(await createAssignment(request, input.data), { headers });
        } catch (error) {
          return requestError(error);
        }
      },
    },
  },
});
