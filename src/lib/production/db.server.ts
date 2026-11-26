import postgres from "postgres";
import { createHash } from "node:crypto";
import type { EmsMode } from "./contracts";

let sql: ReturnType<typeof postgres> | undefined;

export class EmsError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "EmsError";
  }
}

export function mode(): EmsMode {
  const value = process.env["EMS_MODE"];
  if (value === "local" || value === "production") return value;
  return !value || value === "sandbox" ? "sandbox" : "blocked";
}

export function database() {
  if (!sql) {
    const url = process.env["EMS_DATABASE_URL"];
    if (!url) throw new EmsError(503, "Factory database is unavailable.");
    sql = postgres(url, {
      max: 8,
      idle_timeout: 25,
      connect_timeout: 5,
      connection: { statement_timeout: 12000 },
    });
  }
  return sql;
}

export function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function requestError(error: unknown) {
  if (error instanceof EmsError) {
    return Response.json(
      { error: error.message },
      { status: error.status, headers: { "cache-control": "no-store" } },
    );
  }
  return Response.json(
    { error: "Factory service is unavailable." },
    { status: 503, headers: { "cache-control": "no-store" } },
  );
}
