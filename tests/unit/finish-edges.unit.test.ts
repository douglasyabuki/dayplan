import { expect, test } from "vitest";

import { supportDestination } from "@/lib/support";

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
