import "@/app/globals.css";

import { useEffect } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";

import { AuthControls } from "@/components/account/auth-controls";
import { WorkspaceFeedback } from "@/components/workspace/workspace-feedback";
import { WorkspaceOwnerBoundary } from "@/components/workspace/workspace-owner";
import { emptyWorkspace } from "@/lib/workspace/empty";
import { registerDeparture } from "@/stores/session/departure";
import {
  SessionProvider,
  useSession,
  useSessionActions,
} from "@/stores/session/provider";
import { accountDataSources } from "@/stores/workspace/account-data-source";
import { useWorkspace } from "@/stores/workspace/provider";

const auth = vi.hoisted(() => ({
  query: {
    isPending: false,
    data: null as null | { user: { id: string }; session: { id: string } },
    error: null as null | { message: string },
    refetch: vi.fn(async () => undefined),
  },
  signOut: vi.fn(async () => ({ error: null as null | { message: string } })),
  navigate: vi.fn(),
  link: vi.fn(async () => ({ error: null })),
  social: vi.fn(async (...args: unknown[]) => {
    void args;
    return {
      error: null as null | { message: string },
    };
  }),
}));

vi.mock("@/lib/auth-navigation", () => ({ navigateToSignIn: auth.navigate }));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => auth.query,
    signOut: auth.signOut,
    signIn: { social: auth.social },
    linkSocial: auth.link,
  },
}));

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  auth.query.data = null;
  auth.query.error = null;
  auth.query.isPending = false;
  auth.query.refetch.mockClear();
  auth.signOut.mockReset().mockResolvedValue({ error: null });
  auth.social.mockReset().mockResolvedValue({ error: null });
  auth.navigate.mockReset();
  auth.link.mockReset().mockResolvedValue({ error: null });
});

function Harness({ departed }: { departed?: () => void }) {
  const session = useSession();
  return (
    <>
      <p>
        {session.status === "authenticated"
          ? `${session.userId}:${session.sessionId}`
          : session.status}
      </p>
      <AuthControls
        authenticated={session.status === "authenticated"}
        destination="https://external.test/"
      />
      {session.status === "authenticated" && (
        <AccountScope departed={departed} />
      )}
    </>
  );
}

function AccountScope({ departed }: { departed?: () => void }) {
  useEffect(() => () => departed?.(), [departed]);
  return <p>Account mounted</p>;
}

test("session restoration distinguishes errors from guests and restores identity after refresh", async () => {
  auth.query.isPending = true;
  const view = () => (
    <SessionProvider>
      <Harness />
    </SessionProvider>
  );
  const screen = await render(view());
  await expect
    .element(screen.getByText("loading", { exact: true }))
    .toBeVisible();
  auth.query.isPending = false;
  auth.query.error = { message: "Offline" };
  await screen.rerender(view());
  await expect
    .element(screen.getByText("error", { exact: true }))
    .toBeVisible();
  auth.query.error = null;
  auth.query.data = { user: { id: "a" }, session: { id: "restored-session" } };
  await screen.rerender(view());
  await expect.element(screen.getByText("a:restored-session")).toBeVisible();
});

test("account scope closes before sign-out, and a failed sign-out restores the original identity", async () => {
  auth.query.data = { user: { id: "a" }, session: { id: "session-a" } };
  const departed = vi.fn();
  auth.signOut.mockImplementation(async () => {
    expect(departed).toHaveBeenCalledOnce();
    return { error: { message: "Disconnected" } };
  });
  const screen = await render(
    <SessionProvider>
      <Harness departed={departed} />
    </SessionProvider>,
  );
  await screen.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect.element(screen.getByText("a:session-a")).toBeVisible();
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("Sign-out failed");
});

test("sign-out runs the navigation callback only after authentication succeeds", async () => {
  auth.query.data = { user: { id: "a" }, session: { id: "session-a" } };
  const navigate = vi.fn();
  function SignOut() {
    const actions = useSessionActions();
    return (
      <button onClick={() => void actions?.signOut(navigate)}>Sign out</button>
    );
  }
  const screen = await render(
    <SessionProvider>
      <SignOut />
    </SessionProvider>,
  );
  auth.signOut.mockResolvedValueOnce({ error: { message: "Disconnected" } });
  await screen.getByRole("button", { name: "Sign out", exact: true }).click();
  expect(navigate).not.toHaveBeenCalled();
  await screen.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect.poll(() => navigate.mock.calls.length).toBe(1);
  expect(auth.query.refetch).toHaveBeenCalledOnce();
});

test("guest account controls link to auth screens without starting authentication", async () => {
  const screen = await render(
    <SessionProvider>
      <Harness />
    </SessionProvider>,
  );
  await expect
    .element(screen.getByRole("link", { name: "Sign in", exact: true }))
    .toHaveAttribute("href", "/sign-in?next=https%3A%2F%2Fexternal.test%2F");
  await expect
    .element(screen.getByRole("link", { name: "Sign up", exact: true }))
    .toHaveAttribute("href", "/sign-up?next=https%3A%2F%2Fexternal.test%2F");
  expect(auth.social).not.toHaveBeenCalled();
});

test("departure finishes before the account boundary closes or credentials change", async () => {
  auth.query.data = { user: { id: "departure" }, session: { id: "session" } };
  let finish!: (allowed: boolean) => void;
  const departed = vi.fn();
  const prepare = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
  );
  const unregister = registerDeparture("departure", {
    prepare,
    resume: vi.fn(),
    discard: vi.fn(),
  });
  try {
    const screen = await render(
      <SessionProvider>
        <Harness departed={departed} />
      </SessionProvider>,
    );
    await screen.getByRole("button", { name: "Sign out", exact: true }).click();
    expect(prepare).toHaveBeenCalledOnce();
    expect(departed).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
    finish(true);
    await expect.poll(() => auth.signOut.mock.calls.length).toBe(1);
    expect(departed).toHaveBeenCalledOnce();
  } finally {
    unregister();
  }
});

test("unprotected work blocks switching, and discarding requires an explicit confirmation", async () => {
  auth.query.data = { user: { id: "blocked" }, session: { id: "session" } };
  const discard = vi.fn().mockResolvedValue(undefined);
  const unregister = registerDeparture("blocked", {
    prepare: vi.fn().mockResolvedValue(false),
    resume: vi.fn(),
    discard,
  });
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({ google: true }),
  );
  try {
    const screen = await render(
      <SessionProvider>
        <Harness />
      </SessionProvider>,
    );
    await screen.getByRole("button", { name: "Switch account" }).click();
    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("neither confirmed");
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(auth.social).not.toHaveBeenCalled();
    await screen
      .getByRole("alert")
      .getByRole("button", { name: "Discard edits and leave", exact: true })
      .click();
    expect(discard).not.toHaveBeenCalled();
    await screen.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(discard).not.toHaveBeenCalled();
    await screen
      .getByRole("alert")
      .getByRole("button", { name: "Discard edits and leave", exact: true })
      .click();
    await screen
      .getByRole("dialog")
      .getByRole("button", { name: "Discard edits and leave" })
      .click();
    await expect.poll(() => auth.signOut.mock.calls.length).toBe(1);
    expect(discard).toHaveBeenCalledOnce();
    expect(auth.navigate).toHaveBeenCalledWith("/today");
  } finally {
    unregister();
  }
});

test("connecting prepares departure without unmounting the account or changing credentials", async () => {
  auth.query.data = { user: { id: "connecting" }, session: { id: "session" } };
  let finish!: (value: { error: null }) => void;
  auth.link.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const departed = vi.fn();
  const prepare = vi.fn().mockResolvedValue(true);
  const unregister = registerDeparture("connecting", {
    prepare,
    resume: vi.fn(),
    discard: vi.fn(),
  });
  function Connect() {
    const actions = useSessionActions();
    return (
      <button
        onClick={() =>
          void actions?.connect(
            "github",
            "/inbox?settings=account",
            "/inbox?settings=account&connection=error",
          )
        }
      >
        Connect provider
      </button>
    );
  }
  try {
    const screen = await render(
      <SessionProvider>
        <Harness departed={departed} />
        <Connect />
      </SessionProvider>,
    );
    await screen.getByRole("button", { name: "Connect provider" }).click();
    await expect.poll(() => auth.link.mock.calls.length).toBe(1);
    expect(prepare).toHaveBeenCalledOnce();
    expect(departed).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
    await expect.element(screen.getByText("connecting:session")).toBeVisible();
    finish({ error: null });
  } finally {
    unregister();
  }
});

function EditingAccount() {
  const workspace = useWorkspace();
  const session = useSession();
  if (!workspace.ready) return <p>Loading workspace</p>;
  return (
    <>
      <button onClick={() => workspace.act({ type: "theme", theme: "dark" })}>
        Edit account
      </button>
      <AuthControls authenticated={session.status === "authenticated"} />
      <WorkspaceFeedback />
    </>
  );
}

for (const method of ["retryDeparture", "discardAndLeave"] as const) {
  test(`blocked connections preserve the account and recheck profile saves on ${method}`, async () => {
    auth.query.data = {
      user: { id: "blocked-connection" },
      session: { id: "session" },
    };
    const departed = vi.fn();
    const saveProfile = vi.fn().mockResolvedValue(true);
    const unregister = registerDeparture("blocked-connection", {
      prepare: vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true),
      resume: vi.fn(),
      discard: vi.fn().mockResolvedValue(undefined),
    });
    function Connect() {
      const actions = useSessionActions();
      return (
        <>
          <button
            onClick={() =>
              void actions?.connect(
                "github",
                "/inbox",
                "/inbox?connection=error",
                saveProfile,
              )
            }
          >
            Start connection
          </button>
          <button onClick={() => void actions?.[method]()}>
            Resume connection
          </button>
        </>
      );
    }
    try {
      const screen = await render(
        <SessionProvider>
          <Harness departed={departed} />
          <Connect />
        </SessionProvider>,
      );
      await screen.getByRole("button", { name: "Start connection" }).click();
      await expect
        .element(screen.getByRole("alert"))
        .toHaveTextContent("neither confirmed");
      expect(auth.link).not.toHaveBeenCalled();
      await screen.getByRole("button", { name: "Resume connection" }).click();
      await expect.poll(() => auth.link.mock.calls.length).toBe(1);
      expect(saveProfile).toHaveBeenCalledTimes(2);
      expect(departed).not.toHaveBeenCalled();
      expect(auth.signOut).not.toHaveBeenCalled();
    } finally {
      unregister();
    }
  });
}

test("real departure bypasses debounce and sends frozen edits before sign-out", async () => {
  const userId = crypto.randomUUID();
  auth.query.data = { user: { id: userId }, session: { id: "verified" } };
  const puts: unknown[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    if (String(input) === "/api/profile")
      return Response.json({ name: "Account" });
    if (init?.method === "PUT") {
      puts.push(JSON.parse(String(init.body)));
      return Response.json({ committedRevision: 2, currentRevision: 2 });
    }
    return Response.json({ snapshot: emptyWorkspace(), revision: 1 });
  });
  auth.signOut.mockImplementation(async () => {
    expect(puts).toHaveLength(1);
    expect(puts[0]).toMatchObject({
      snapshot: { theme: "dark" },
      expectedRevision: 1,
    });
    auth.query.data = null;
    return { error: null };
  });
  const screen = await render(
    <SessionProvider>
      <WorkspaceOwnerBoundary>
        <EditingAccount />
      </WorkspaceOwnerBoundary>
    </SessionProvider>,
  );
  await screen.getByRole("button", { name: "Edit account" }).click();
  expect(puts).toEqual([]);
  await screen.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect.poll(() => auth.signOut.mock.calls.length).toBe(1);
});

test("real departure blocks unprotected work but proceeds after server confirmation despite storage failure", async () => {
  const userId = crypto.randomUUID();
  auth.query.data = { user: { id: userId }, session: { id: "verified" } };
  let offline = true;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    if (String(input) === "/api/profile")
      return Response.json({ name: "Account" });
    if (init?.method === "PUT") {
      if (offline) throw new TypeError("Offline");
      return Response.json({ committedRevision: 2, currentRevision: 2 });
    }
    return Response.json({ snapshot: emptyWorkspace(), revision: 1 });
  });
  const screen = await render(
    <SessionProvider>
      <WorkspaceOwnerBoundary>
        <EditingAccount />
      </WorkspaceOwnerBoundary>
    </SessionProvider>,
  );
  await expect
    .element(screen.getByRole("button", { name: "Edit account" }))
    .toBeVisible();
  vi.spyOn(IDBFactory.prototype, "open").mockImplementation(() => {
    throw new Error("Quota");
  });
  await screen.getByRole("button", { name: "Edit account" }).click();
  await screen.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect
    .poll(() => document.body.textContent?.includes("neither confirmed"))
    .toBe(true);
  expect(auth.signOut).not.toHaveBeenCalled();
  const source = accountDataSources(userId, "verified").workspace;
  expect(source.recoverySnapshot?.theme).toBe("dark");
  offline = false;
  await screen.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect.poll(() => auth.signOut.mock.calls.length).toBe(1);
  expect(source.recoveryStorageError).toBeTruthy();
});
