import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";

import { WorkspaceOwnerBoundary } from "@/components/workspace/workspace-owner";
import { emptyWorkspace } from "@/lib/workspace/empty";
import { useAccount } from "@/stores/account/provider";
import { SessionProvider } from "@/stores/session/provider";
import { useWorkspace } from "@/stores/workspace/provider";

afterEach(async () => {
  await cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

function LoadedAccount({ page }: { page: string }) {
  const account = useAccount();
  const workspace = useWorkspace();
  return (
    <p data-testid="loaded">
      {account.ready && workspace.ready
        ? `${page}:${account.profile.name}:${workspace.state.theme}`
        : "loading"}
    </p>
  );
}

function view(userId: string, sessionId: string, page = "today") {
  return (
    <SessionProvider value={{ status: "authenticated", userId, sessionId }}>
      <WorkspaceOwnerBoundary>
        <LoadedAccount page={page} />
      </WorkspaceOwnerBoundary>
    </SessionProvider>
  );
}

test("retained owner providers load once across child changes; remount reloads both reads", async () => {
  const reads: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    expect(init?.method).toBe("GET");
    expect(init?.cache).toBe("no-store");
    expect(new Headers(init?.headers).get("X-Dayplan-Session")).toBe("session");
    reads.push(String(input));
    if (String(input) === "/api/profile")
      return Response.json({ name: "Owner", email: "owner@example.com" });
    expect(String(input)).toBe("/api/workspace");
    return Response.json({ snapshot: emptyWorkspace(), revision: 1 });
  });
  const userId = crypto.randomUUID();
  const screen = await render(view(userId, "session"));
  await expect
    .element(screen.getByTestId("loaded"))
    .toHaveTextContent("today:Owner:system");
  expect(reads.toSorted()).toEqual(["/api/profile", "/api/workspace"]);
  await screen.rerender(view(userId, "session", "calendar"));
  await expect
    .element(screen.getByTestId("loaded"))
    .toHaveTextContent("calendar:Owner:system");
  expect(reads).toHaveLength(2);
  await screen.unmount();
  const reopened = await render(view(userId, "session"));
  await expect
    .element(reopened.getByTestId("loaded"))
    .toHaveTextContent("today:Owner:system");
  expect(reads.filter((path) => path === "/api/profile")).toHaveLength(2);
  expect(reads.filter((path) => path === "/api/workspace")).toHaveLength(2);
});

test.each(["same account", "different account"])(
  "a new session reloads the %s and ignores late responses from its predecessor",
  async (kind) => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const reads: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const session = new Headers(init?.headers).get("X-Dayplan-Session");
      reads.push(`${session}:${String(input)}`);
      // Deliberately ignore transport cancellation to exercise adoption guards.
      if (session === "old") await pending;
      if (String(input) === "/api/profile")
        return Response.json({
          name: session,
          email: `${session}@example.com`,
        });
      expect(String(input)).toBe("/api/workspace");
      return Response.json({
        snapshot: {
          ...emptyWorkspace(),
          theme: session === "old" ? "dark" : "light",
        },
        revision: 1,
      });
    });
    const userId = crypto.randomUUID();
    const screen = await render(view(userId, "old"));
    await expect.poll(() => reads.length).toBe(2);
    await screen.rerender(
      view(kind === "same account" ? userId : crypto.randomUUID(), "new"),
    );
    release();
    await expect
      .element(screen.getByTestId("loaded"))
      .toHaveTextContent("today:new:light");
    expect(reads.toSorted()).toEqual([
      "new:/api/profile",
      "new:/api/workspace",
      "old:/api/profile",
      "old:/api/workspace",
    ]);
  },
);
