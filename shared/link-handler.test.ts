import assert from "node:assert/strict";
import { test } from "node:test";
import { buildArgs, isLocalLink, splitArgs } from "./link-handler.ts";

test("paths, file URLs and line suffixes are local links", () => {
  const links = [
    "src/app.ts",
    "./notes.md",
    "../up.md",
    "/tmp/a.md",
    "~/notes.md",
    "src/app.ts:12",
    "src/app.ts:12-20",
    "README.md:12",
    "README.md:12:3",
    "app.ts#L3-L9",
    "my file.md",
    "file:///tmp/a.md",
    "C:\\work\\a.md",
    "C:/work/a.md",
  ];
  for (const link of links) assert.equal(isLocalLink(link), true, link);
});

test("URLs, anchors and empty links are not local links", () => {
  const links = [
    "https://paseo.sh",
    "http://localhost:3000/a",
    "mailto:me@example.com",
    "vscode://file/tmp/a.md",
    "#heading",
    "",
  ];
  for (const link of links) assert.equal(isLocalLink(link), false, link);
});

test("splitArgs splits on whitespace and groups double-quoted values", () => {
  assert.deepEqual(splitArgs(`-g  "{link}" --wait`), ["-g", "{link}", "--wait"]);
  assert.deepEqual(splitArgs(`"two words" C:\\dir\\x ""`), ["two words", "C:\\dir\\x", ""]);
});

test("buildArgs replaces tokens inside their argument and keeps unknown tokens", () => {
  const values = { link: "my file.ts:3", cwd: "/a b", workspace: "/w" };
  assert.deepEqual(buildArgs("--goto {link} --cwd={cwd} {workspace} {other}", values), [
    "--goto",
    "my file.ts:3",
    "--cwd=/a b",
    "/w",
    "{other}",
  ]);
});
