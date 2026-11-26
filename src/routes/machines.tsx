import { EquipmentComponents } from '@/components/engineering/reference-assets';
import { createFileRoute } from "@tanstack/react-router";
import { EntityModule } from "@/components/EntityModule";
import { Field, Input, Select } from "@/components/ui-kit";

export const Route = createFileRoute("/machines")({
  validateSearch:(input):{engAsset?:string}=>typeof input['engAsset']==='string'?{engAsset:input['engAsset'].slice(0,250)}:{},
  head: () => ({ meta: [
    { name: "twitter:card", content: "summary" },
    { property: "og:type", content: "website" },
    { title: "Machines · Engineering Portal" },
    { name: "description", content: "Register machines, telemetry protocols, edge connections and calibration." },
    { property: "og:title", content: "Machines · Engineering Portal" },
    { property: "og:description", content: "Register machines, telemetry protocols, edge connections and calibration." },
  ] }),
  component: EquipmentComponents,
});
