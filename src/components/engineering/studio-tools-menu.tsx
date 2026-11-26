import type { ReactNode } from "react";
import { Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function StudioToolsMenu({
  tools,
  native,
}: {
  tools: readonly { id: string; link: ReactNode }[];
  native: boolean;
}) {
  if (!tools.length) return null;
  return (
    <div className="mb-3 flex flex-wrap justify-end gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <Wrench size={16} aria-hidden="true" />
            Studio tools
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-w-[calc(100vw-2rem)] w-80">
          <DropdownMenuLabel>Studio tools</DropdownMenuLabel>
          {native && (
            <p className="px-2 py-2 text-sm text-muted-foreground">
              Native workflow and screens edit the current definition. Legacy editors use separate
              records; no matching identities are assumed.
            </p>
          )}
          <DropdownMenuSeparator />
          {tools.map((tool) => (
            <DropdownMenuItem key={tool.id} asChild>
              {tool.link}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
