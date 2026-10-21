import { test } from "vitest";
import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, readFile, rm, symlink } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";

const run = (args, cwd) =>
  new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    // This test owns this foreground child and its pipes; it opens no port.
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => resolveResult({ code, stdout, stderr }));
  });

test("release staging stamps a real copied checkout and its runnable CLI without changing the source", async () => {
  const root = await mkdtemp("/private/tmp/file-forge-release-");
  const original = await readFile("packages/cli/package.json", "utf8");
  try {
    await cp("package.json", join(root, "package.json"));
    for (const name of ["cli", "core", "media", "mcp", "file-forge-plugin"]) {
      await mkdir(join(root, "packages"), { recursive: true });
      await cp(resolve("packages", name), join(root, "packages", name), {
        recursive: true,
        filter: (source) =>
          !source.split("/").some((part) => part === "node_modules" || part === ".turbo"),
      });
    }
    await symlink(resolve("node_modules"), join(root, "node_modules"));
    const script = join(root, "packages/cli/dist/release-version.js");
    const rejected = await run([script, "../invalid"], root);
    assert.notEqual(rejected.code, 0);
    assert.equal(await readFile(join(root, "packages/cli/package.json"), "utf8"), original);
    const stamped = await run([script, "0.0.987"], root);
    assert.equal(stamped.code, 0, stamped.stderr);
    const result = await run([join(root, "packages/cli/bin/file-forge.js"), "--version"], root);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, "file-forge 0.0.987\n");
    for (const name of ["cli", "core", "media", "mcp"])
      assert.equal(
        JSON.parse(await readFile(join(root, "packages", name, "package.json"), "utf8")).version,
        "0.0.987",
      );
    for (const name of ["plugin.json", ".codex-plugin/plugin.json"])
      assert.equal(
        JSON.parse(await readFile(join(root, "packages/file-forge-plugin", name), "utf8")).version,
        "0.0.987",
      );
    assert.match(
      await readFile(join(root, "packages/file-forge-plugin/scripts/start.sh"), "utf8"),
      /file-forge 0\.0\.987/,
    );
    assert.equal(await readFile("packages/cli/package.json", "utf8"), original);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
