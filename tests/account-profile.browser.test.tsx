import { useRef } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";

import {
  type AccountEditHandle,
  AccountPanel,
} from "@/components/account/account-panel";
import type { ProfileDataSource } from "@/stores/account/persistence";
import { AccountProvider, useAccount } from "@/stores/account/provider";

afterEach(() => vi.restoreAllMocks());

function Harness() {
  const { ready } = useAccount();
  const edit = useRef<AccountEditHandle>(null);
  return ready ? (
    <>
      <AccountPanel ref={edit} />
      <button onClick={() => edit.current?.cancel()}>Cancel draft</button>
    </>
  ) : (
    <p>Loading profile</p>
  );
}

test("remote profile name updates expose pending, failure, and retry without replacing the panel", async () => {
  let reject!: (cause: unknown) => void;
  const pending = new Promise<void>((_, no) => {
    reject = no;
  });
  const save = vi
    .fn()
    .mockImplementationOnce(() => pending)
    .mockReturnValue(undefined);
  const source: ProfileDataSource = {
    owner: { kind: "account", userId: "a" },
    load: () => ({ name: "Account A", email: "a@example.com" }),
    save,
  };
  const screen = await render(
    <AccountProvider dataSource={source}>
      <Harness />
    </AccountProvider>,
  );
  const input = screen.getByRole("textbox", { name: "Name", exact: true });
  await input.fill("Updated A");
  await input.click();
  // Trigger blur with a focusable control outside the field.
  await screen.getByRole("button", { name: "Cancel draft" }).click();
  await expect
    .element(screen.getByText("Saving name…", { exact: true }))
    .toBeVisible();
  await expect.element(input).toBeDisabled();
  reject(new Error("Network failed"));
  await expect
    .element(
      screen.getByText("Your name could not be saved. Please try again.", {
        exact: true,
      }),
    )
    .toBeVisible();
  await expect.element(input).toBeEnabled();
  await input.fill("Updated A");
  // Enter commits without closing the panel.
  input
    .element()
    .dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  await expect
    .element(screen.getByText("Name saved.", { exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByText("a@example.com", { exact: true }))
    .toBeVisible();
  expect(save).toHaveBeenCalledTimes(2);
});
