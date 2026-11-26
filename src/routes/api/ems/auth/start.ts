import { createFileRoute } from "@tanstack/react-router";
import { startSignIn } from "@/lib/production/auth.server";
import { requestError } from "@/lib/production/db.server";

export const Route = createFileRoute("/api/ems/auth/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          return await startSignIn(request);
        } catch (error) {
          return requestError(error);
        }
      },
    },
  },
});
