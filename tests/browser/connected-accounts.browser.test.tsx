import "@/app/globals.css";

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";

import { ConnectedAccounts } from "@/components/account/connected-accounts";

const auth = vi.hoisted(() => ({
  list: vi.fn(),
  unlink: vi.fn(),
  connect: vi.fn(),
  switchAccount: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { listAccounts: auth.list, unlinkAccount: auth.unlink },
}));
vi.mock("@/stores/session/provider", () => ({
  useSessionActions: () => ({
    busy: false,
    connect: auth.connect,
    switchAccount: auth.switchAccount,
  }),
}));

const google = { id: "google-record", providerId: "google" };
const github = { id: "github-record", providerId: "github" };

beforeEach(() => {
  auth.list.mockReset().mockResolvedValue({ data: [google], error: null });
  auth.unlink
    .mockReset()
    .mockResolvedValue({ data: { status: true }, error: null });
  auth.connect.mockReset().mockResolvedValue(undefined);
  auth.switchAccount.mockReset().mockResolvedValue(undefined);
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({ google: true, github: true }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(window.history.state, "", "/");
});

test("last sign-in method is disabled and connecting waits for the profile save", async () => {
  let finish!: (success: boolean) => void;
  const save = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
  );
  const screen = await render(<ConnectedAccounts beforeDeparture={save} />);
  await expect
    .element(screen.getByRole("button", { name: "Disconnect Google" }))
    .toBeDisabled();
  await screen.getByRole("button", { name: "Connect GitHub" }).click();
  expect(save).toHaveBeenCalledOnce();
  expect(auth.connect).not.toHaveBeenCalled();
  finish(true);
  await expect.poll(() => auth.connect.mock.calls.length).toBe(1);
  expect(auth.connect.mock.calls[0][0]).toBe("github");
  expect(auth.connect.mock.calls[0][1]).toContain(
    "settings=account&connection=success&provider=github",
  );
});

test("failed profile saves prevent a connection redirect", async () => {
  const screen = await render(
    <ConnectedAccounts beforeDeparture={async () => false} />,
  );
  await screen.getByRole("button", { name: "Connect GitHub" }).click();
  expect(auth.connect).not.toHaveBeenCalled();
  await expect
    .element(screen.getByRole("button", { name: "Connect GitHub" }))
    .toBeEnabled();
});

test("disconnection requires confirmation, uses the record ID, and refreshes the list", async () => {
  auth.list.mockResolvedValueOnce({ data: [google, github], error: null });
  const screen = await render(
    <ConnectedAccounts beforeDeparture={async () => true} />,
  );
  await screen.getByRole("button", { name: "Disconnect GitHub" }).click();
  expect(auth.unlink).not.toHaveBeenCalled();
  await screen.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(auth.unlink).not.toHaveBeenCalled();
  await screen.getByRole("button", { name: "Disconnect GitHub" }).click();
  await screen
    .getByRole("dialog")
    .getByRole("button", { name: "Disconnect", exact: true })
    .click();
  await expect.poll(() => auth.unlink.mock.calls.length).toBe(1);
  expect(auth.unlink).toHaveBeenCalledWith({ accountId: github.id });
  await expect.element(screen.getByText("GitHub disconnected.")).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Disconnect Google" }))
    .toBeDisabled();
  expect(auth.list).toHaveBeenCalledTimes(2);
});

test("callback success is confirmed from account data and temporary parameters are removed", async () => {
  window.history.replaceState(
    window.history.state,
    "",
    "/inbox?sort=title&settings=account&connection=success&provider=github#task",
  );
  auth.list.mockResolvedValue({ data: [google, github], error: null });
  const screen = await render(
    <ConnectedAccounts beforeDeparture={async () => true} />,
  );
  await expect
    .element(
      screen.getByText(
        "GitHub connected. You can now sign in with Google or GitHub.",
      ),
    )
    .toBeVisible();
  expect(
    window.location.pathname + window.location.search + window.location.hash,
  ).toBe("/inbox?sort=title#task");
});

test("a success parameter without a linked account is not announced as success", async () => {
  window.history.replaceState(
    window.history.state,
    "",
    "/inbox?settings=account&connection=success&provider=github",
  );
  const screen = await render(
    <ConnectedAccounts beforeDeparture={async () => true} />,
  );
  await expect
    .element(screen.getByRole("alert"))
    .toMatchTextContent("connection could not be confirmed");
});

test("unverified callback emails provide recovery instructions", async () => {
  window.history.replaceState(
    window.history.state,
    "",
    "/inbox?settings=account&connection=error&provider=github&error=unable_to_link_account",
  );
  const screen = await render(
    <ConnectedAccounts beforeDeparture={async () => true} />,
  );
  await expect
    .element(screen.getByRole("alert"))
    .toMatchTextContent("Verify your email with GitHub");
  expect(auth.connect).not.toHaveBeenCalled();
});

test("stale-session unlink failures offer protected reauthentication", async () => {
  auth.list.mockResolvedValue({ data: [google, github], error: null });
  auth.unlink.mockResolvedValue({
    data: null,
    error: { status: 403, code: "SESSION_NOT_FRESH" },
  });
  const save = vi.fn().mockResolvedValue(true);
  const screen = await render(<ConnectedAccounts beforeDeparture={save} />);
  await screen.getByRole("button", { name: "Disconnect GitHub" }).click();
  await screen
    .getByRole("dialog")
    .getByRole("button", { name: "Disconnect", exact: true })
    .click();
  await screen.getByRole("button", { name: "Sign in again" }).click();
  expect(save).toHaveBeenCalledOnce();
  expect(auth.switchAccount).toHaveBeenCalledWith(
    expect.stringContaining("settings=account"),
    save,
  );
});
