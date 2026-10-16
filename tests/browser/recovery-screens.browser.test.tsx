import "@/app/globals.css";

import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";

import WorkspaceError from "@/app/(workspace)/error";
import AppError from "@/app/error";

test("failure screens sanitize exceptions, focus the heading, and offer retry", async () => {
  const retry = vi.fn();
  const screen = await render(
    <AppError
      error={Object.assign(new Error("private token and database URL"), {
        digest: "safe-reference",
      })}
      retry={retry}
    />,
  );
  await expect
    .element(
      screen.getByRole("heading", { name: "Dayplan could not open this page" }),
    )
    .toHaveFocus();
  await expect
    .element(screen.getByText("private token and database URL"))
    .not.toBeInTheDocument();
  await expect
    .element(screen.getByText("Error reference: safe-reference"))
    .toBeVisible();
  await screen.getByRole("button", { name: "Try again" }).click();
  expect(retry).toHaveBeenCalledOnce();
  await screen.rerender(
    <WorkspaceError error={new Error("secret")} retry={retry} />,
  );
  await expect
    .element(
      screen.getByRole("heading", {
        name: "This workspace view could not load",
      }),
    )
    .toHaveFocus();
  await expect
    .element(screen.getByRole("link", { name: "Back to Today" }))
    .toHaveAttribute("href", "/today");
});
