import { useEffect } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";

import { AuthControls } from "@/components/account/auth-controls";
import {
  SessionProvider,
  useSession,
  useSessionActions,
} from "@/stores/session/provider";

const auth = vi.hoisted(() => ({
  query: {
    isPending: false,
    data: null as null | { user: { id: string }; session: { id: string } },
    error: null as null | { message: string },
    refetch: vi.fn(async () => undefined),
  },
  signOut: vi.fn(async () => ({ error: null as null | { message: string } })),
  social: vi.fn(async (...args: unknown[]) => {
    void args;
    return {
      error: null as null | { message: string },
    };
  }),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => auth.query,
    signOut: auth.signOut,
    signIn: { social: auth.social },
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
  auth.query.data = null;
  auth.query.error = null;
  auth.query.isPending = false;
  auth.query.refetch.mockClear();
  auth.signOut.mockReset().mockResolvedValue({ error: null });
  auth.social.mockReset().mockResolvedValue({ error: null });
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
