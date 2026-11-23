import { createFileRoute } from "@tanstack/react-router";
import { receiveAcknowledgement } from "@/lib/production/delivery.server";
import { requestError } from "@/lib/production/db.server";

export const Route = createFileRoute("/api/public/integrations/ack")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          return await receiveAcknowledgement(request);
        } catch (error) {
          return requestError(error);
        }
      },
    },
  },
});
