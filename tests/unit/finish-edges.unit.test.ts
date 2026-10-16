import { expect, test } from "vitest";

import { supportDestination } from "@/lib/support";
import { workspaceSaveFeedback } from "@/stores/workspace/save-feedback";

test("support configuration accepts only a supplied HTTPS destination or a single email", () => {
  expect(supportDestination(undefined)).toBeNull();
  expect(supportDestination("https://support.example.test/help")).toBe(
    "https://support.example.test/help",
  );
  expect(supportDestination("mailto:help@example.test")).toBe(
    "mailto:help@example.test",
  );
  for (const value of [
    "javascript:alert(1)",
    "http://example.test",
    "https://user:secret@example.test",
    "mailto:a@example.test?bcc=b@example.test",
    "mailto:a?bcc=b@example.test",
    "mailto:a#fragment@example.test",
    "mailto:a@example.test%0aBcc:b@example.test",
    "not a URL",
  ])
    expect(supportDestination(value)).toBeNull();
});

test("save feedback distinguishes confirmed storage, pending recovery, and memory-only edits", () => {
  const input = {
    database: true,
    ready: true,
    blocked: false,
    offline: false,
    pending: false,
    saving: false,
    deletionPaused: false,
    durableRecovery: false,
  };
  expect(workspaceSaveFeedback(input).label).toBe("Saved");
  expect(
    workspaceSaveFeedback({ ...input, database: false, offline: true }).label,
  ).toBe("Saved in this browser");
  expect(workspaceSaveFeedback({ ...input, pending: true }).status).toBe(
    "Pending",
  );
  expect(
    workspaceSaveFeedback({ ...input, pending: true, saving: true }).status,
  ).toBe("Saving");
  expect(
    workspaceSaveFeedback({ ...input, offline: true }).description,
  ).toContain("only be available in this session");
  expect(
    workspaceSaveFeedback({ ...input, offline: true, durableRecovery: true })
      .description,
  ).toContain("browser recovery protection");
  expect(
    workspaceSaveFeedback({ ...input, offline: true, blocked: true }).status,
  ).toBe("Needs attention");
  expect(
    workspaceSaveFeedback({ ...input, saving: true, deletionPaused: true })
      .label,
  ).toBe("Deletion paused");
});
