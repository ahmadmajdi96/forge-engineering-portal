import { database } from "../src/lib/production/db.server";
import { dispatchBatch } from "../src/lib/production/delivery.server";

const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => controller.abort());
const sql = database();

async function heartbeat(state: "idle" | "working" | "error") {
  await sql`insert into ems.worker_heartbeat (service, checked_at, state) values ('delivery', now(), ${state})
    on conflict (service) do update set checked_at = excluded.checked_at, state = excluded.state`;
}

try {
  while (!controller.signal.aborted) {
    try {
      const count = await dispatchBatch();
      await heartbeat(count ? "working" : "idle");
    } catch {
      process.stderr.write("EMS delivery worker dependency or transport failed.\n");
      await heartbeat("error").catch(() => {});
    }
    if (!controller.signal.aborted) {
      await new Promise<void>((resolve) => {
        const complete = () => {
          clearTimeout(timer);
          controller.signal.removeEventListener("abort", complete);
          resolve();
        };
        const timer = setTimeout(complete, 4000);
        controller.signal.addEventListener("abort", complete, { once: true });
      });
    }
  }
} finally {
  await sql.end({ timeout: 5 });
}
