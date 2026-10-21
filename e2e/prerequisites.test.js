import { test } from "vitest";
import sharp from "sharp";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const launcher = fileURLToPath(new URL("../packages/cli/dist/launcher.js", import.meta.url));
const run = (args, env) =>
  new Promise((resolve, reject) => {
    const child = spawn("/bin/sh", [launcher, ...args], { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (data) => (stdout += data));
    child.stderr.on("data", (data) => (stderr += data));
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
test("launcher diagnoses external prerequisites before outputs and permits setup without FFmpeg", async () => {
  const root = await mkdtemp(join(tmpdir(), "file-forge-prerequisites-"));
  const env = {
    ...process.env,
    PATH: root,
    FILE_FORGE_CONFIG_DIR: join(root, "config"),
    FFMPEG_PATH: join(root, "missing-ffmpeg"),
  };
  try {
    const missingNode = await run(["inspect", "anything"], env);
    assert.equal(missingNode.code, 1);
    assert.match(missingNode.stderr, /Install Node.js/);
    assert.equal(missingNode.stdout, "");
    assert.match((await run(["--language=zh-CN"], env)).stderr, /请安装 Node.js/);
    assert.equal(JSON.parse((await run(["--json"], env)).stdout).error.code, "NODE_REQUIRED");
    await symlink(process.execPath, join(root, "node"));
    assert.equal((await run(["--version"], env)).code, 0);
    assert.equal((await run(["--help"], env)).code, 0);
    assert.equal((await run(["config", "set", "language", "zh-CN"], env)).code, 0);
    const input = join(root, "source.png");
    await sharp({ create: { width: 8, height: 8, channels: 4, background: "red" } })
      .png()
      .toFile(input);
    const before = await readdir(root);
    const missingFfmpeg = await run(["inspect", input], env);
    assert.equal(missingFfmpeg.code, 1);
    assert.match(missingFfmpeg.stderr, /请自行安装 FFmpeg/);
    const machine = await run(["inspect", input, "--json"], env);
    assert.equal(JSON.parse(machine.stdout).error.code, "FFMPEG_REQUIRED");
    assert.equal(machine.stderr, "");
    assert.deepEqual(await readdir(root), before);
    const success = await run(["inspect", input, "--json"], {
      ...env,
      PATH: process.env.PATH,
      FFMPEG_PATH: process.env.FFMPEG_PATH || "ffmpeg",
    });
    assert.equal(success.code, 0, success.stderr + success.stdout);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
