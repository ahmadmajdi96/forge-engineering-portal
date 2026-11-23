import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SYSTEMS } from "./adapters";

export const systemStatus = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async () =>
  SYSTEMS.map((system) => ({ ...system, state: "Unknown" as const, detail: "No verified sandbox transport." })),
);

export const listOutbox = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase.from("integration_outbox")
    .select("id,event_id,consumer,event_type,revision,content_hash,technical_status,business_status,business_reason,attempts,last_error,created_at")
    .order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error("Outbox unavailable");
  return data ?? [];
});
