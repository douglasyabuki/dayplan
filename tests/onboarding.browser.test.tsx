import { type ReactNode } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";

import { Welcome } from "@/components/welcome/welcome";
import { WorkspaceAccess } from "@/components/workspace/workspace-access";
import {
  ONBOARDING_KEY,
  OnboardingProvider,
} from "@/stores/onboarding/provider";
import type { Session } from "@/stores/session/model";
import { SessionProvider } from "@/stores/session/provider";

const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
  params: new URLSearchParams("sort=title"),
}));
vi.mock("next/navigation", () => {
  const hooks = {
    useRouter: () => navigation,
    usePathname: () => "/inbox",
    useSearchParams: () => navigation.params,
  };
  return { ...hooks, default: hooks };
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  navigation.replace.mockClear();
});

function Root({
  session,
  children,
}: {
  session: Session;
  children: ReactNode;
}) {
  return (
    <SessionProvider value={session}>
      <OnboardingProvider>{children}</OnboardingProvider>
    </SessionProvider>
  );
}

test("pending session never redirects or mounts the workspace; missing marker requires entry", async () => {
  const mounted = vi.fn();
  function Workspace() {
    mounted();
    return <p>Workspace entered</p>;
  }
  const view = (session: Session) => (
    <Root session={session}>
      <WorkspaceAccess>
        <Workspace />
      </WorkspaceAccess>
    </Root>
  );
  const screen = await render(view({ status: "loading" }));
  expect(navigation.replace).not.toHaveBeenCalled();
  expect(mounted).not.toHaveBeenCalled();
  await screen.rerender(view({ status: "guest" }));
  expect(navigation.replace).toHaveBeenCalledWith(
    "/welcome?next=%2Finbox%3Fsort%3Dtitle",
  );
  expect(mounted).not.toHaveBeenCalled();
});

test("existing or malformed workspace data cannot substitute for the onboarding marker", async () => {
  localStorage.setItem("dayplan.workspace.v2", "existing data");
  localStorage.setItem(ONBOARDING_KEY, "invalid marker");
  await render(
    <Root session={{ status: "guest" }}>
      <WorkspaceAccess>
        <p>Workspace entered</p>
      </WorkspaceAccess>
    </Root>,
  );
  expect(navigation.replace).toHaveBeenCalledOnce();
  expect(localStorage.getItem("dayplan.workspace.v2")).toBe("existing data");
});

test("a valid marker allows returning guests without an automatic redirect", async () => {
  localStorage.setItem(ONBOARDING_KEY, "complete");
  const screen = await render(
    <Root session={{ status: "guest" }}>
      <WorkspaceAccess>
        <p>Workspace entered</p>
      </WorkspaceAccess>
    </Root>,
  );
  await expect.element(screen.getByText("Workspace entered")).toBeVisible();
  expect(navigation.replace).not.toHaveBeenCalled();
});

test("failed marker writes still grant guest access in the same root provider lifetime", async () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Blocked");
  });
  const view = (welcome: boolean) => (
    <Root session={{ status: "guest" }}>
      {welcome ? (
        <Welcome />
      ) : (
        <WorkspaceAccess>
          <p>Workspace entered</p>
        </WorkspaceAccess>
      )}
    </Root>
  );
  const screen = await render(view(true));
  await screen
    .getByRole("button", { name: "Continue without an account" })
    .click();
  await screen.rerender(view(false));
  await expect.element(screen.getByText("Workspace entered")).toBeVisible();
  expect(navigation.replace).toHaveBeenCalledTimes(1);
  expect(navigation.replace).toHaveBeenCalledWith("/today");
});
