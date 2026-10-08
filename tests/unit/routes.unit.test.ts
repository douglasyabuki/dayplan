import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import ts from "typescript";
import { afterAll, test } from "vitest";

const directory = mkdtempSync(join(tmpdir(), "dayplan-routes-"));
const source = readFileSync(
  new URL("../lib/tasks/routes.ts", import.meta.url),
  "utf8",
);
writeFileSync(
  join(directory, "routes.js"),
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
);
const {
  resolveWorkspaceRoute,
  workspaceHref,
  workspaceQueryHref,
  workspaceViews,
} = createRequire(import.meta.url)(join(directory, "routes.js"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

test("all known views preserve their existing URLs", () => {
  for (const view of workspaceViews) {
    assert.equal(workspaceHref({ view }), "/" + view);
    assert.deepEqual(resolveWorkspaceRoute("/" + view), { view });
    assert.deepEqual(resolveWorkspaceRoute("/" + view + "/"), { view });
  }
});

test("project and tag IDs round-trip as single encoded segments", () => {
  for (const view of ["projects", "tags"]) {
    for (const selectedId of [
      "p",
      "today",
      "a b",
      "a/b",
      "100%",
      "æ—¥æœ¬èªž",
    ]) {
      const route = { view, selectedId };
      assert.deepEqual(resolveWorkspaceRoute(workspaceHref(route)), route);
    }
  }
  assert.equal(
    workspaceHref({ view: "projects", selectedId: "p" }),
    "/projects/p",
  );
});

test("unsupported paths cannot masquerade as workspace views", () => {
  for (const pathname of [
    "/",
    "/unknown",
    "/lists/p",
    "/today/id",
    "/projects/p/nested",
    "/tags/t/nested",
    "/projects//",
    "/projects/%ZZ",
    "today",
    "//today",
  ]) {
    assert.equal(resolveWorkspaceRoute(pathname), null, pathname);
  }
});

test("query updates preserve filters, repeated values, and editor deep links", () => {
  const params = new URLSearchParams(
    "q=hello&sort=priority&tag=a&tag=b&task=series%402026-10-01",
  );
  const original = params.toString();
  const href = workspaceQueryHref("/projects/p", params, {
    group: "sections",
    sort: "deadline",
  });
  const url = new URL(href, "https://example.test");
  assert.equal(url.pathname, "/projects/p");
  assert.equal(url.searchParams.get("task"), "series@2026-10-01");
  assert.deepEqual(url.searchParams.getAll("tag"), ["a", "b"]);
  assert.equal(url.searchParams.get("q"), "hello");
  assert.equal(url.searchParams.get("sort"), "deadline");
  assert.equal(url.searchParams.get("group"), "sections");
  assert.equal(params.toString(), original);
});

test("closing an editor removes only task; empty queries omit the question mark", () => {
  assert.equal(
    workspaceQueryHref("/today", new URLSearchParams("task=new&q=test"), {
      task: null,
    }),
    "/today?q=test",
  );
  assert.equal(
    workspaceQueryHref("/today", new URLSearchParams("task=new"), {
      task: null,
    }),
    "/today",
  );
  assert.equal(
    workspaceQueryHref("/search", new URLSearchParams("q=test"), { q: "" }),
    "/search",
  );
});
