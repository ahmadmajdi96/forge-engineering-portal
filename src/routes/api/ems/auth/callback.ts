import { createFileRoute } from "@tanstack/react-router";
import { finishSignIn } from "@/lib/production/auth.server";
import { requestError } from "@/lib/production/db.server";

export const Route = createFileRoute("/api/ems/auth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          return await finishSignIn(request);
        } catch (error) {
          return requestError(error);
        }
      },
    },
  },
});
