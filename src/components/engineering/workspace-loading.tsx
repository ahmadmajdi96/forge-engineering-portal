import { Skeleton } from "@/components/ui/skeleton";

export function WorkspaceLoading({ message }: { message: string }) {
  return (
    <div className="eng-panel grid min-h-36 content-center gap-4">
      <p role="status" className="text-sm font-medium">
        {message}
      </p>
      <div aria-hidden="true" className="grid max-w-md gap-2">
        <Skeleton className="h-3 w-3/4 motion-reduce:animate-none" />
        <Skeleton className="h-3 w-1/2 motion-reduce:animate-none" />
      </div>
    </div>
  );
}
