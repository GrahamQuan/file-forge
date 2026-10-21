import { test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("directory rename previews and applies root/subfolder mappings without changing files", async () => {
  const root = await mkdtemp(join(tmpdir(), "file-forge-rename-"));
  const input = join(root, "Example.COM");
  const plan = join(root, "plan.json");
  const cli = (...args) =>
    spawnSync(process.execPath, [resolve("packages/cli/bin/file-forge.js"), ...args, "--json"], {
      encoding: "utf8",
      timeout: 30000,
      env: { ...process.env, FILE_FORGE_CONFIG_DIR: join(root, "config") },
    });
  const rename = (...args) =>
    cli("folder", "rename", input, "--renames", plan, "--output", join(root, "receipts"), ...args);
  try {
    await mkdir(join(input, "Some Route", "Child Dir"), { recursive: true });
    const bytes = Buffer.from([0, 17, 255, 42]);
    await writeFile(join(input, "Some Route", "Child Dir", "Untouched_File.bin"), bytes);
    const changes = [
      { path: ".", name: "example-com" },
      { path: "Some Route", name: "Custom Route" },
      { path: "Some Route/Child Dir", name: "child-dir" },
    ];
    await writeFile(plan, JSON.stringify(changes));
    let result = rename();
    assert.equal(result.status, 0, result.stderr);
    const preview = JSON.parse(result.stdout);
    assert.equal(preview.apply, false);
    assert.ok(preview.renames.every((entry) => entry.status === "planned"));
    assert.deepEqual(
      await readFile(join(input, "Some Route", "Child Dir", "Untouched_File.bin")),
      bytes,
    );
    result = rename("--apply");
    assert.equal(result.status, 0, result.stderr);
    const applied = JSON.parse(result.stdout);
    assert.equal(applied.schemaVersion, 3);
    assert.ok(
      applied.renames.every(
        (entry) => entry.status === "succeeded" && entry.current === entry.output,
      ),
    );
    const finalRoot = join(root, "example-com");
    assert.deepEqual(
      await readFile(join(finalRoot, "Custom Route", "child-dir", "Untouched_File.bin")),
      bytes,
    );
    assert.equal((await readdir(root)).includes("Example.COM"), false);
    const exported = cli(
      "manifest",
      "export",
      "--manifest",
      join(applied.directory, "manifest.json"),
      "--output",
      join(root, "exports"),
    );
    assert.equal(exported.status, 0, exported.stderr);
    assert.deepEqual(JSON.parse(exported.stdout).renames, applied.renames);
    await mkdir(input);
    await mkdir(join(input, "Alpha"));
    await mkdir(join(input, "existing"));
    await symlink(join(input, "Alpha"), join(input, "link"));
    for (const invalid of [
      [{ path: "Alpha", name: "existing" }],
      [{ path: "../example-com", name: "escape" }],
      [{ path: "Alpha", name: "../escape" }],
      [{ path: "link", name: "renamed" }],
      [
        { path: "Alpha", name: "same" },
        { path: "existing", name: "same" },
      ],
      [
        { path: "Alpha", name: "one" },
        { path: "Alpha", name: "two" },
      ],
    ]) {
      await writeFile(plan, JSON.stringify(invalid));
      result = rename("--apply");
      assert.equal(result.status, 2, result.stderr);
      assert.ok((await readdir(input)).includes("Alpha"));
    }
    await writeFile(plan, JSON.stringify([{ path: "Alpha", name: "alpha" }]));
    result = rename("--apply");
    assert.equal(result.status, 0, result.stderr);
    assert.ok((await readdir(input)).includes("alpha"));
    assert.ok(!(await readdir(input)).includes("Alpha"));
    await writeFile(plan, JSON.stringify([{ path: ".", name: "other" }]));
    result = cli(
      "folder",
      "rename",
      input,
      "--renames",
      plan,
      "--output",
      join(input, "receipts"),
      "--apply",
    );
    assert.equal(result.status, 2, result.stderr);
    assert.ok((await readdir(root)).includes("Example.COM"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
