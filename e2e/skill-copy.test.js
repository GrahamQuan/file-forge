import { test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("skill copy previews, installs, detects drift and backs up replacements without touching other skills", async () => {
  const root = await mkdtemp(join(tmpdir(), "file-forge-skill-copy-"));
  const privateConfig = join(root, "file-forge.upload.local.json");
  const privateBytes = '{"dummy.example":{"R2_SECRET_ACCESS_KEY":"dummy-lifecycle-secret"}}\n';
  await writeFile(privateConfig, privateBytes, { mode: 0o600 });
  const source = resolve("skills/file-forge");
  const project = join(root, "Project With Spaces");
  const invoke = (...args) =>
    spawnSync(
      process.execPath,
      [resolve("packages/cli/dist/copy-skill.js"), "--project", project, ...args],
      {
        encoding: "utf8",
        timeout: 10000,
        cwd: root,
        env: { ...process.env, FILE_FORGE_UPLOAD_CONFIG: privateConfig },
      },
    );
  try {
    await mkdir(project);
    let result = invoke("--dry-run");
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, "planned");
    assert.deepEqual(await readdir(project), []);
    const target = join(project, ".agents", "skills", "file-forge");
    result = invoke();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, "copied");
    assert.deepEqual(
      await readFile(join(target, "SKILL.md")),
      await readFile(join(source, "SKILL.md")),
    );
    assert.deepEqual(
      await readFile(join(target, "references", "source-folder-renaming.md")),
      await readFile(join(source, "references", "source-folder-renaming.md")),
    );
    assert.equal(JSON.parse(invoke().stdout).status, "unchanged");
    await mkdir(join(project, ".agents", "skills", "other"));
    await writeFile(join(project, ".agents", "skills", "other", "keep.txt"), "untouched");
    await writeFile(join(target, "local-notes.md"), "user customization");
    await writeFile(join(target, "SKILL.md"), "outdated or incomplete consumer entrypoint");
    await mkdir(join(target, "obsolete"));
    await writeFile(join(target, "obsolete", "old.txt"), "stale");
    result = invoke("--dry-run");
    assert.equal(result.status, 0, result.stderr);
    assert.equal(await readFile(join(target, "local-notes.md"), "utf8"), "user customization");
    result = invoke();
    assert.equal(result.status, 0, result.stderr);
    const updated = JSON.parse(result.stdout);
    assert.equal(updated.status, "updated");
    assert.equal(
      await readFile(join(updated.backup, "local-notes.md"), "utf8"),
      "user customization",
    );
    assert.equal(
      await readFile(join(project, ".agents", "skills", "other", "keep.txt"), "utf8"),
      "untouched",
    );
    assert.ok(!(await readdir(target)).includes("local-notes.md"));
    assert.ok(!(await readdir(target)).includes("obsolete"));
    assert.deepEqual(
      await readFile(join(target, "SKILL.md")),
      await readFile(join(source, "SKILL.md")),
    );
    assert.ok(
      !(await readdir(join(project, ".agents"))).some((name) =>
        name.startsWith(".file-forge-copy"),
      ),
    );
    await symlink(join(root, "missing"), join(target, "unsafe"));
    result = invoke();
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stderr).error.code, "UNSAFE_LINK");
    await rm(join(target, "unsafe"));
    await writeFile(join(target, "local-notes.md"), "still here");
    await mkdir(join(project, ".agents", ".file-forge-copy.lock"));
    result = invoke();
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stderr).error.code, "SKILL_COPY_LOCKED");
    assert.equal(await readFile(join(target, "local-notes.md"), "utf8"), "still here");
  } finally {
    assert.equal(await readFile(privateConfig, "utf8"), privateBytes);
    await rm(root, { recursive: true, force: true });
  }
});
