import { retainSearchParams, useRouterState } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import { StoreProvider } from "@/lib/store";
import { MesProvider } from "@/lib/mes-store";
import { Toaster } from "@/components/ui/sonner";
import { FactoryShell } from "@/components/engineering/factory-shell";
import { emsSession } from "@/lib/production/session.functions";
import { Shell } from "@/components/Shell";
import { EngineeringProvider } from "@/lib/engineering/context";
import { FactorySetupProvider } from "@/components/engineering/setup-wizard";
import { isSetupRoute } from "@/components/engineering/setup-wizard-state";
import { loadFactoryWorkspace } from "@/lib/production/workspace.functions";
import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

type EngineeringSearch = {
  site?: string | undefined;
  engLine?: string | undefined;
  engStation?: string | undefined;
  engAsset?: string | undefined;
  setup?: string | undefined;
  setupSite?: string | undefined;
  setupItem?: string | undefined;
  setupType?: string | undefined;
};

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "ManuQube EMS · Engineering Portal" },
      {
        name: "description",
        content:
          "ManuQube Engineering Management System for factory layout, equipment, and process engineering.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "preload",
        href: "/brand/fonts/instrument-sans-latin.woff2",
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
      { rel: "icon", href: "/brand/manuqube-emblem.png", type: "image/png" },
    ],
  }),
  validateSearch: (params): EngineeringSearch =>
    Object.fromEntries(
      ["site", "engLine", "engStation", "engAsset", "setup", "setupSite", "setupItem", "setupType"].flatMap((key) =>
        typeof params[key] === "string" && params[key].length <= (key === "engAsset" ? 250 : 180) ? [[key, params[key]]] : [],
      ),
    ),
  search: {
    middlewares: [retainSearchParams<EngineeringSearch>(["site", "engLine", "engStation", "engAsset", "setup", "setupSite", "setupItem", "setupType"])],
  },
  beforeLoad: async () => ({ ems: await emsSession() }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark" data-ems-mode={Route.useRouteContext().ems?.mode}>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient, ems } = Route.useRouteContext();

  const search = useRouterState({ select: (state) => state.location.searchStr });
  const router = useRouter();
  const params = new URLSearchParams(search);
  const requested = params.get("site");
  const authorizedSite = requested
    ? ems.identity?.sites.find((s) => s.key === requested)
    : ems.identity?.sites[0];
  const site = authorizedSite?.key;
  if (ems.mode !== "sandbox" && !ems.identity) {
    return (
      <QueryClientProvider client={queryClient}>
        <FactoryShell session={ems} />
        <Toaster />
      </QueryClientProvider>
    );
  }

  if (ems.identity && requested && !authorizedSite)
    return (
      <main className="mx-auto max-w-lg space-y-3 p-8">
        <h1>Factory access unavailable</h1>
        <p>Your session has no access to this factory.</p>
        <a href="/" className="text-primary underline">
          Choose an authorized factory
        </a>
      </main>
    );
  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <StoreProvider key={site} nativeName={ems.identity?.name} site={site}>
        <MesProvider>
          <EngineeringProvider
            key={site}
            actions={authorizedSite?.actions}
            scopeLine={params.get("engLine")}
            scopeStation={params.get("engStation")}
            scopeAsset={params.get("engAsset")}
            strictScope={params.get("setup") === "guided" && params.get("setupSite") === site && isSetupRoute(router.state.location.pathname)}
            onScopeChange={(engLine, engStation) => {
              if (params.get("setup") === "guided" && isSetupRoute(router.state.location.pathname)) return;
              if (
                (params.get("engLine") ?? "") === engLine &&
                (params.get("engStation") ?? "") === engStation
              )
                return;
              void router.navigate({
                to: router.state.location.pathname,
                replace: true,
                resetScroll: false,
                search: (prev) => {
                  const { step, signal, engAsset, ...scope } = prev;
                  return {
                    ...scope,
                    engLine: engLine || undefined,
                    engStation: engStation || undefined,
                  };
                },
              });
            }}
            fixture={ems.mode === "local"}
            native={!!ems.identity}
            site={site}
          >
            <FactorySetupProvider site={site} actions={authorizedSite?.actions ?? []}
              readLayout={(factory) => loadFactoryWorkspace({ data: { site: factory, workspace: "spatial" } })}>
              <Shell identity={ems.identity ?? undefined} site={site} />
              <Toaster />
            </FactorySetupProvider>
          </EngineeringProvider>
        </MesProvider>
      </StoreProvider>
    </QueryClientProvider>
  );
}
