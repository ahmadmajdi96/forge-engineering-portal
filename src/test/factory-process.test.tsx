import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { useBlocker } from "@tanstack/react-router";
import { Route } from "@/routes/factory-process";
import { loadFactoryWorkspace, saveFactoryWorkspace } from "@/lib/production/workspace.functions";

vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  useBlocker: vi.fn(),
}));
vi.mock("@/lib/production/workspace.functions", () => ({
  loadFactoryWorkspace: vi.fn(),
  saveFactoryWorkspace: vi.fn(),
}));

describe("process route revision feedback", () => {
  it("keeps edits made during a save, reports conflicts and reloads the current head", async () => {
    vi.spyOn(Route, "useSearch").mockReturnValue({ site: "training-north" });
    vi.spyOn(Route, "useRouteContext").mockReturnValue({
      ems: { mode: "local", identity: { name: "Test", sites: [] } },
      queryClient: new QueryClient(),
    });
    vi.mocked(loadFactoryWorkspace)
      .mockRejectedValueOnce(new Error("Process service unavailable"))
      .mockResolvedValue({ revision: 0, payload: null });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Page = Route.options.component!;
    const view = render(
      <QueryClientProvider client={client}>
        <Page />
      </QueryClientProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Loading process routes…");
    expect(await screen.findByRole("alert")).toHaveTextContent("Process service unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry loading routes" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add route" }));
    const reason = screen.getByLabelText("Revision reason");
    const save = screen.getByRole("button", { name: "Save draft" });
    expect(save).toBeDisabled();
    fireEvent.change(reason, { target: { value: "Configure the first route" } });
    let finish!: (result: { revision: number }) => void;
    vi.mocked(saveFactoryWorkspace).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    fireEvent.click(save);
    await waitFor(() => expect(saveFactoryWorkspace).toHaveBeenCalledOnce());
    fireEvent.change(screen.getByLabelText("Route name"), {
      target: { value: "Updated while saving" },
    });
    finish({ revision: 1 });
    await screen.findByText(/training-north · Revision 1/);
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    expect(screen.queryByText("Saved revision 1.")).toBeNull();
    expect(useBlocker).toHaveBeenLastCalledWith(
      expect.objectContaining({ enableBeforeUnload: true }),
    );
    vi.mocked(saveFactoryWorkspace).mockRejectedValueOnce(new Error("A newer revision exists."));
    fireEvent.change(reason, { target: { value: "Change route name" } });
    fireEvent.click(save);
    await screen.findByText("A newer revision exists.");
    expect(screen.getByLabelText("Route name")).toHaveValue("Updated while saving");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(loadFactoryWorkspace).mockResolvedValue({
      revision: 2,
      payload: { version: 1, routes: [] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reload saved revision" }));
    await screen.findByText(/training-north · Revision 2/);
    expect(screen.queryByText("Unsaved changes")).toBeNull();
    expect(screen.queryByLabelText("Route name")).toBeNull();
    view.unmount();
    client.clear();
    vi.restoreAllMocks();
  });
});
