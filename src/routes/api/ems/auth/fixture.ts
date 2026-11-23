import { createFileRoute } from "@tanstack/react-router";
import { fixtureSignIn } from "@/lib/production/auth.server";
import { requestError } from "@/lib/production/db.server";

export const Route = createFileRoute("/api/ems/auth/fixture")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          return await fixtureSignIn(request);
        } catch (error) {
          return requestError(error);
        }
      },
    },
  },
});
