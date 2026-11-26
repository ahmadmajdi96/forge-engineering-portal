import { useQuery } from "@tanstack/react-query";
import { studioWorkspaceSchema } from "@/lib/studio/model";
import { modelSchema } from "./model";
import { getFactoryStructure } from "@/lib/production/engineering-relations.functions";
import { loadFactoryWorkspace } from "@/lib/production/workspace.functions";

export function useProcessCatalog(site: string, permissions: string[]) {
  const design = useQuery({
    queryKey: ["process-catalog", "engineering", site],
    retry: false,
    enabled: permissions.includes("ems.engineering.view"),
    queryFn: async () => {
      const record = await loadFactoryWorkspace({ data: { site, workspace: "engineering" } });
      return record.payload
        ? modelSchema.parse((record.payload as { model: unknown }).model)
        : null;
    },
  });
  const layout = useQuery({
    queryKey: ["factory-structure", site],
    retry: false,
    enabled: permissions.includes("ems.factory_layout.view"),
    queryFn: () => getFactoryStructure({ data: { site } }),
  });
  const studio = useProcessApplications(site, permissions.includes("ems.application_studio.view"));
  return {
    site,
    applications: permissions.includes("ems.application_studio.view") ? (studio.data ?? []) : [],
    studioStatus: !permissions.includes("ems.application_studio.view")
      ? "Studio access required."
      : studio.isError
        ? "Application catalog unavailable."
        : null,
    design: design.data,
    spaces: layout.data?.spaces ?? [],
    designStatus: !permissions.includes("ems.engineering.view")
      ? "Engineering catalog access is required."
      : design.isError
        ? "Engineering catalog unavailable."
        : design.isPending
          ? "Loading engineering catalog…"
          : null,
    layoutStatus: !permissions.includes("ems.factory_layout.view")
      ? "Layout access is required to choose a placed station."
      : layout.isError
        ? "Station catalog unavailable."
        : layout.isPending
          ? "Loading station catalog…"
          : null,
  };
}

export type ProcessCatalog = ReturnType<typeof useProcessCatalog>;

export function useProcessApplications(site: string, enabled: boolean) {
  return useQuery({
    queryKey: ["process-consumer-catalog", site],
    enabled: Boolean(site) && enabled,
    retry: false,
    queryFn: async () => {
      const result = await loadFactoryWorkspace({ data: { site, workspace: "studio" } });
      return result.payload ? studioWorkspaceSchema.parse(result.payload).applications : [];
    },
  });
}
