import { createFileRoute } from "@tanstack/react-router";
import { database, mode, requestError } from "@/lib/production/db.server";

export const Route = createFileRoute("/api/ems/health")({
  server: {
    handlers: {
      GET: async () => {
        const runtime = mode();
        if (runtime !== "local" && runtime !== "production")
          return new Response("Unavailable", { status: 503 });
        try {
          const [migration] =
            await database()`select 1 from public.ems_migration_ledger where name = '0004_assignments.sql'`;
          const [worker] =
            await database()`select 1 from ems.worker_heartbeat where service = 'delivery' and state <> 'error'
        and checked_at > now() - interval '45 seconds'`;
          return Response.json(
            { status: migration && worker ? "ready" : "initializing" },
            { status: migration && worker ? 200 : 503 },
          );
        } catch (error) {
          return requestError(error);
        }
      },
    },
  },
});
