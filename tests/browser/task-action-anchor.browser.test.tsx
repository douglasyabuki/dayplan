import { useState } from "react";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";

import { useWorkspaceTaskActions } from "@/hooks/workspace/use-workspace-task-actions";
import { newTask } from "@/lib/tasks/factory";
import { asOccurrence } from "@/lib/tasks/recurrence";
import { seedWorkspace } from "@/lib/workspace/seed";

const task = newTask("Task");
const state = { ...seedWorkspace(), tasks: [task] };

function Harness() {
  const actions = useWorkspaceTaskActions({ state, routeKey: "inbox" });
  const [visible, setVisible] = useState(true);
  return (
    <>
      {visible && (
        <button
          onClick={(event) =>
            actions.showQuickAction(
              asOccurrence(task),
              "tags",
              event.currentTarget,
            )
          }
        >
          Open tags
        </button>
      )}
      <button onClick={() => setVisible(!visible)}>Toggle anchor</button>
      <output aria-label="Quick action">
        {actions.quickAction ? "Open" : "Closed"}
      </output>
    </>
  );
}

test("removing a quick-action anchor dismisses it even when the task still exists", async () => {
  const screen = await render(<Harness />);
  await screen.getByRole("button", { name: "Open tags" }).click();
  await expect
    .element(screen.getByRole("status", { name: "Quick action" }))
    .toHaveTextContent("Open");
  await screen.getByRole("button", { name: "Toggle anchor" }).click();
  await expect
    .element(screen.getByRole("status", { name: "Quick action" }))
    .toHaveTextContent("Closed");
  await screen.getByRole("button", { name: "Toggle anchor" }).click();
  await expect
    .element(screen.getByRole("button", { name: "Open tags" }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("status", { name: "Quick action" }))
    .toHaveTextContent("Closed");
});
