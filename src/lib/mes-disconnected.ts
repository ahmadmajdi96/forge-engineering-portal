/** Explicitly disconnected runtime boundary: never contacts the source MES or reports successful writes. */
import { useQuery, useMutation } from "@tanstack/react-query";

export const MES_CONNECTION_MESSAGE = "MES is not connected. This action was not sent or saved.";
export async function refuseMesAction(..._args: unknown[]): Promise<never> {
  throw new Error(MES_CONNECTION_MESSAGE);
}
type Row = any;
export type StationHold = any;
export type WasteReason = any;
function emptyRows(key: string) {
  return useQuery<Row[]>({ queryKey: ["mes-disconnected", key], queryFn: async () => [] });
}
function emptyRow(key: string, id?: string) {
  return useQuery<Row | null>({ queryKey: ["mes-disconnected", key, id], queryFn: async () => null });
}
function unavailableMutation() { return useMutation<any, Error, any>({ mutationFn: refuseMesAction }); }
export type RecipeVariable = {
  key: string; label: string; direction: "input" | "output" | "reading";
  type: "number" | "text" | "boolean" | "select"; unit?: string; min?: number; max?: number;
  required?: boolean; options?: string[]; default?: string | number | boolean;
};
export const useUnit = (id?: string) => emptyRow("unit", id);
export const useProductionOrder = (id?: string) => emptyRow("order", id);
export const useProduct = (id?: string) => emptyRow("product", id);
export const useRecipe = (product?: string, station?: string) => emptyRow("recipe", `${product}/${station}`);
export const useOpenStationVisits = (_filters?: unknown) => emptyRows("visits");
export const useStationWasteReasons = (_id?: string) => emptyRows("station-waste");
export const useWasteReasons = () => emptyRows("waste");
export const useStationHolds = (_id?: string, _open?: boolean) => emptyRows("holds");
export const useLineRules = (id?: string) => emptyRow("line-rules", id);
export const useLotProgress = (..._args: unknown[]) => emptyRows("lot-progress");
export const useRows = <T = Row>(table: string, _options?: unknown) => useQuery<T[]>({ queryKey: ["mes-disconnected", table], queryFn: async () => [] });
export const useMyOrg = () => emptyRow("organization");
export const useCan = (_permission: string) => false;
export const useProcessUnitAtStation = unavailableMutation;
export const useSetStationWasteReasons = unavailableMutation;
export const useLogWaste = unavailableMutation;
export const useLogReading = unavailableMutation;
export const useOpenHold = unavailableMutation;
export const useCloseHold = unavailableMutation;
export const useRecordLotProgress = unavailableMutation;
export const useWrite = (_table: string) => ({ insert: unavailableMutation(), update: unavailableMutation() });
export const useUnitsRealtime = () => undefined;
export const useHmiRealtime = (_id?: string) => undefined;
export const errMsg = (error: unknown) => error instanceof Error ? error.message : String(error);
export const uploadEvidenceFile = refuseMesAction;
export const signedEvidenceUrl = async (_path: string): Promise<string> => refuseMesAction();
export const verifyOperatorPin = async (_input: unknown): Promise<{ ok: boolean; error?: string; name?: string }> => refuseMesAction();
export const setOperatorPin = refuseMesAction;
export const troubleshootIssue = async (_input: unknown): Promise<{ error?: string; guidance?: string }> => refuseMesAction();
export const submitOrQueue = async (..._args: unknown[]): Promise<{ queued: boolean }> => refuseMesAction();
export const flushQueue = async () => undefined;
export const retryItem = (_id: string) => undefined;
export const discardItem = (_id: string) => undefined;
export const useOfflineQueue = () => ({ items: [] as { id: string; label: string; status: string; error?: string; capturedAt: string }[], online: false });
// Only empty reads for copied auxiliary UI; mutation paths always refuse above.
export const supabase = {
  auth: { getUser: async () => ({ data: { user: null as Row | null } }) },
  from: (_table: string) => {
    const query: any = { then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve) };
    for (const method of ["select", "eq", "order", "in", "limit"]) query[method] = () => query;
    return query;
  },
};