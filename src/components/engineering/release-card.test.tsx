import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { ReleaseCard } from "./release-card";
import { updateFactoryRelease } from "@/lib/production/release.functions";
vi.mock("@/lib/production/release.functions", () => ({ updateFactoryRelease: vi.fn() }));

afterEach(cleanup);

test("requires a reason for the selected revision and retains it after a failed approval", async () => {
  const fail = new Error("Reviewer access required.");
  vi.mocked(updateFactoryRelease).mockRejectedValueOnce(fail);
  const record = {
    id: "first",
    application_id: "Mixer",
    workspace_revision: 1,
    content_hash: "a".repeat(64),
    status: "submitted" as const,
    published_at: null,
    created_at: new Date(),
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ReleaseCard site="training-north" record={record} />
      <ReleaseCard
        site="training-north"
        record={{ ...record, id: "second", workspace_revision: 2 }}
      />
    </QueryClientProvider>,
  );
  const first = within(screen.getByRole("article", { name: "Mixer revision 1" }));
  const second = within(screen.getByRole("article", { name: "Mixer revision 2" }));
  fireEvent.change(second.getByLabelText("Approval reason"), {
    target: { value: "Reviewed second revision" },
  });
  expect(first.getByRole("button", { name: "Approve" })).toBeDisabled();
  fireEvent.click(second.getByRole("button", { name: "Approve" }));
  expect(await second.findByRole("alert")).toHaveTextContent(fail.message);
  expect(updateFactoryRelease).toHaveBeenCalledWith({
    data: {
      site: "training-north",
      id: "second",
      action: "approve",
      expected: "submitted",
      reason: "Reviewed second revision",
    },
  });
  expect(second.getByLabelText("Approval reason")).toHaveValue("Reviewed second revision");
  expect(second.getByRole("button", { name: "Approve" })).toBeEnabled();
});
