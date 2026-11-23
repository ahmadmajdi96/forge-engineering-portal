import { EmsError } from "./db.server";

export async function jsonInput(request: Request, maximumBytes: number): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    throw new EmsError(415, "Send an application/json request.");
  const reader = request.body?.getReader();
  if (!reader) throw new EmsError(400, "Request body is required.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      throw new EmsError(413, "Request body is too large.");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
  } catch {
    throw new EmsError(400, "Request JSON is invalid.");
  }
}
