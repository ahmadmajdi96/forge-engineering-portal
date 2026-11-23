import { AssetRegister } from "@/components/engineering/asset-register";
import { z } from "zod";
import { registryQuery } from "@/lib/engineering/asset-search";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/registry")({
  validateSearch: registryQuery
    .omit({ line: true })
    .partial()
    .extend({
      engAsset: z.string().max(250).optional(),
      registryLine: z.string().max(160).optional(),
    })
    .catch({}),
  head: () => ({
    meta: [
      { title: "Asset registry · Engineering Portal" },
      {
        name: "description",
        content: "Stable scoped identities, equipment assignments and legacy crosswalk review.",
      },
      { property: "og:title", content: "Asset registry · Engineering Portal" },
      {
        property: "og:description",
        content: "Stable scoped identities, equipment assignments and legacy crosswalk review.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AssetRegister,
});
