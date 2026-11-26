import { createFileRoute } from "@tanstack/react-router";
import { signOut } from "@/lib/production/auth.server";
import { requestError } from "@/lib/production/db.server";

export const Route = createFileRoute("/api/ems/auth/sign-out")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          return await signOut(request);
        } catch (error) {
          return requestError(error);
        }
      },
    },
  },
});
