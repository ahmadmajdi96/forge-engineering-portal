import { useQuery } from "@tanstack/react-query";
import { loadFactoryWorkspace } from "./workspace.functions";
import { processDocumentSchema } from "./process";

export function useProcessRevision(site: string, enabled: boolean) {
  return useQuery({
    queryKey: ["process", site],
    enabled: Boolean(site) && enabled,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const saved = await loadFactoryWorkspace({ data: { site, workspace: "process" } });
      return {
        revision: saved.revision,
        document: saved.payload
          ? processDocumentSchema.parse(saved.payload)
          : { version: 1 as const, routes: [] },
      };
    },
  });
}
