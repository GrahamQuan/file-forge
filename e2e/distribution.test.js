import { test } from "vitest";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  readdir,
  readlink,
  rm,
  symlink,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import sharp from "sharp";
const runtimeVersion = JSON.parse(
  await readFile(new URL("../packages/cli/package.json", import.meta.url), "utf8"),
).version;
const gone = (pid) => {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return error.code === "ESRCH";
  }
};
const run = (command, args, env, cwd) =>
  new Promise((resolveResult, reject) => {
    const child = spawn(command, args, { env, cwd, stdio: ["ignore", "pipe", "pipe"] });
    // This test owns child.pid, cwd and its pipes; no listening port or separate service session.
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (data) => (stdout += data));
    child.stderr.on("data", (data) => (stderr += data));
    child.once("error", reject);
    child.once("close", (code) => {
      assert.ok(gone(child.pid));
      resolveResult({ code, stdout, stderr });
    });
  });
const successful = (result) => {
  assert.equal(result.code, 0, result.stderr + result.stdout);
  return JSON.parse(result.stdout);
};
test("downloadable runtime installs offline and runs native CLI/MCP without checkout or package managers", async () => {
  const root = await mkdtemp("/private/tmp/file-forge-distribution-");
  let server;
  try {
    const packed = successful(
      await run(
        process.execPath,
        [resolve("packages/cli/dist/archive.js"), "--output", join(root, "archives")],
        process.env,
        process.cwd(),
      ),
    );
    const pluginBytes = await readFile(packed.plugin);
    assert.equal(createHash("sha256").update(pluginBytes).digest("hex"), packed.pluginSha256);
    const pluginManifest = await run(
      "/usr/bin/unzip",
      ["-p", packed.plugin, "file-forge/plugin.json"],
      process.env,
      root,
    );
    assert.equal(pluginManifest.code, 0);
    assert.equal(JSON.parse(pluginManifest.stdout).version, runtimeVersion);
    const pluginCompatibility = await run(
      "/usr/bin/unzip",
      ["-p", packed.plugin, "file-forge/.codex-plugin/plugin.json"],
      process.env,
      root,
    );
    assert.equal(JSON.parse(pluginCompatibility.stdout).version, runtimeVersion);
    const bytes = await readFile(packed.archive);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), packed.sha256);
    assert.ok((await readFile(`${packed.archive}.sha256`, "utf8")).startsWith(packed.sha256));
    const extracted = join(root, "extracted runtime");
    await mkdir(extracted);
    assert.equal(
      (await run("/usr/bin/tar", ["-xzf", packed.archive, "-C", extracted], process.env, root))
        .code,
      0,
    );
    const source = join(extracted, `file-forge-${runtimeVersion}-darwin-arm64`);
    const bin = join(root, "external-bin");
    await mkdir(bin);
    await symlink(process.execPath, join(bin, "node"));
    const ffmpeg = execFileSync("/usr/bin/which", ["ffmpeg"], { encoding: "utf8" }).trim();
    const env = {
      ...process.env,
      PATH: `${bin}:/usr/bin:/bin`,
      FFMPEG_PATH: ffmpeg,
      FILE_FORGE_CONFIG_DIR: join(root, "settings"),
      NODE_PATH: "",
    };
    assert.notEqual((await run("/usr/bin/which", ["pnpm"], env, root)).code, 0);
    assert.notEqual((await run("/usr/bin/which", ["npm"], env, root)).code, 0);
    const prefix = join(root, "user prefix");
    const install = (...args) =>
      run(
        "/bin/sh",
        [join(source, "install.js"), "--prefix", prefix, "--json", ...args],
        env,
        root,
      );
    const installed = successful(await install());
    assert.equal(installed.status, "installed");
    const executable = join(prefix, "bin/file-forge");
    assert.equal(
      (await run(executable, ["--version"], env, root)).stdout,
      `file-forge ${runtimeVersion}\n`,
    );
    assert.equal((await run(join(source, "file-forge.js"), ["--help"], env, root)).code, 0);
    const originalTarget = await readlink(executable);
    const managed = join(prefix, "lib/file-forge");
    const originalDirs = await readdir(managed);
    assert.equal(successful(await install()).directory, installed.directory);
    assert.equal(await readlink(executable), originalTarget);
    assert.deepEqual(await readdir(managed), originalDirs);
    const input = join(root, "logo.png");
    await sharp({ create: { width: 128, height: 96, channels: 4, background: "red" } })
      .png()
      .toFile(input);
    const original = await readFile(input);
    const image = successful(
      await run(
        executable,
        ["image", "process", input, "--width", "32", "--output", join(root, "images"), "--json"],
        env,
        root,
      ),
    );
    assert.equal((await sharp(image.assets[0].output).metadata()).width, 32);
    const favicon = successful(
      await run(
        executable,
        ["favicon", "generate", input, "--output", join(root, "icons"), "--json"],
        env,
        root,
      ),
    );
    assert.equal(favicon.assets.length, 3);
    assert.equal((await sharp(join(favicon.directory, "favicon.svg")).metadata()).width, 64);
    assert.equal((await readFile(join(favicon.directory, "favicon.ico"))).readUInt16LE(2), 1);
    const { makePosterGlb } = await import("./poster-fixture.js");
    const model = join(root, "box.glb");
    await writeFile(model, makePosterGlb());
    const posters = successful(
      await run(
        executable,
        ["model", "posters", model, "--width", "64", "--output", join(root, "posters"), "--json"],
        env,
        root,
      ),
    );
    assert.equal(posters.assets.length, 6);
    assert.equal(posters.schemaVersion, 5);
    assert.ok(posters.assets.every((asset) => asset.status === "succeeded" && asset.lossless));
    // Start the installed runtime with an authorized root. PID and STDIO are owned by this test.
    server = spawn(executable, ["mcp"], {
      cwd: root,
      env: { ...env, FILE_FORGE_ROOT: root },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const closed = once(server, "close");
    const pending = new Map();
    let id = 0,
      buffer = "",
      invalid;
    server.stderr.resume();
    server.stdout.on("data", (data) => {
      buffer += data;
      while (buffer.includes("\n")) {
        const index = buffer.indexOf("\n"),
          line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        try {
          const msg = JSON.parse(line);
          pending.get(msg.id)?.(msg);
          pending.delete(msg.id);
        } catch (error) {
          invalid = error;
        }
      }
    });
    const request = async (method, params = {}) => {
      const requestId = ++id;
      let timer;
      try {
        return await Promise.race([
          new Promise((resolveResponse) => {
            pending.set(requestId, resolveResponse);
            server.stdin.write(
              JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }) + "\n",
            );
          }),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error("installed MCP timeout")), 10000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
        pending.delete(requestId);
      }
    };
    assert.equal(
      (
        await request("initialize", {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "archive-e2e", version: "0.0.0" },
        })
      ).result.serverInfo.name,
      "file-forge",
    );
    server.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n",
    );
    const call = async (name, args = {}) => {
      const response = await request("tools/call", { name, arguments: args });
      assert.equal(response.error, undefined);
      assert.ok(!response.result.isError, JSON.stringify(response));
      return JSON.parse(response.result.content[0].text);
    };
    await call("generate_favicons", {
      operation: "favicon",
      requestId: "installed",
      input,
      output: join(root, "mcp-output"),
    });
    let job;
    for (let i = 0; i < 200; i++) {
      job = await call("job_status", { requestId: "installed" });
      if (job.status !== "running") break;
      await delay(50);
    }
    assert.equal(job.status, "succeeded", JSON.stringify(job));
    assert.ok(gone(job.workerPid));
    server.stdin.end();
    await closed;
    assert.ok(gone(server.pid));
    assert.equal(invalid, undefined);
    server = undefined;
    assert.deepEqual(await readFile(input), original);
    await writeFile(join(managed, ".install.lock"), JSON.stringify({ pid: process.pid }));
    assert.equal(JSON.parse((await install()).stdout).error.code, "INSTALL_BUSY");
    await rm(join(managed, ".install.lock"));
    const readme = join(source, "README.md"),
      content = await readFile(readme);
    await writeFile(readme, "corrupted");
    assert.equal(JSON.parse((await install()).stdout).error.code, "INTEGRITY_FAILED");
    await writeFile(readme, content);
    const metadataPath = join(source, "distribution.json"),
      metadataText = await readFile(metadataPath, "utf8");
    await writeFile(metadataPath, JSON.stringify({ ...JSON.parse(metadataText), arch: "x64" }));
    assert.equal(JSON.parse((await install()).stdout).error.code, "UNSUPPORTED_TARGET");
    await writeFile(metadataPath, metadataText);
    await writeFile(metadataPath, "{}");
    assert.equal(JSON.parse((await install()).stdout).error.code, "INVALID_DISTRIBUTION");
    await writeFile(metadataPath, metadataText);
    await symlink(root, join(source, "outside"));
    assert.equal(JSON.parse((await install()).stdout).error.code, "UNSAFE_LINK");
    await rm(join(source, "outside"));

    const missing = await run(
      "/bin/sh",
      [join(source, "install.js"), "--prefix", prefix, "--json"],
      { ...env, FFMPEG_PATH: join(root, "missing") },
      root,
    );
    assert.equal(JSON.parse(missing.stdout).error.code, "FFMPEG_REQUIRED");
    const noNode = await run(
      "/bin/sh",
      [join(source, "install.js")],
      { ...env, PATH: join(root, "empty") },
      root,
    );
    assert.equal(noNode.code, 1);
    assert.match(noNode.stderr, /Install Node.js/);
    const chinese = await run(
      "/bin/sh",
      [join(source, "install.js"), "--language", "zh-CN"],
      { ...env, PATH: join(root, "empty") },
      root,
    );
    assert.match(chinese.stderr, /请安装 Node.js/);

    const conflict = join(root, "conflict");
    await mkdir(join(conflict, "bin"), { recursive: true });
    await writeFile(join(conflict, "bin/file-forge"), "preserved user command");
    const rejected = await run(
      "/bin/sh",
      [join(source, "install.js"), "--prefix", conflict, "--json"],
      env,
      root,
    );
    assert.equal(JSON.parse(rejected.stdout).error.code, "COMMAND_CONFLICT");
    assert.equal(
      await readFile(join(conflict, "bin/file-forge"), "utf8"),
      "preserved user command",
    );
    assert.equal(await readlink(executable), originalTarget);
    assert.equal((await run(executable, ["--version"], env, root)).code, 0);
    assert.deepEqual(await readdir(managed), originalDirs);
    // A second valid build activates atomically and retains the earlier runtime for rollback.
    const nextReadme = Buffer.concat([content, Buffer.from("\nSecond local build.\n")]);
    await writeFile(readme, nextReadme);
    const nextMetadata = JSON.parse(metadataText);
    nextMetadata.entries.find((entry) => entry.path === "README.md").hash = createHash("sha256")
      .update(nextReadme)
      .digest("hex");
    await writeFile(metadataPath, JSON.stringify(nextMetadata));
    const upgraded = successful(await install());
    assert.notEqual(upgraded.directory, installed.directory);
    assert.equal((await readdir(managed)).length, 2);
    const rolledBack = successful(
      await run(
        "/bin/sh",
        [join(installed.directory, "install.js"), "--prefix", prefix, "--json"],
        env,
        root,
      ),
    );
    assert.equal(rolledBack.directory, installed.directory);
    assert.equal(await readlink(executable), originalTarget);
    assert.equal((await readdir(managed)).length, 2);
  } finally {
    if (server && !gone(server.pid)) {
      const exited = once(server, "close");
      server.kill("SIGTERM");
      const timer = setTimeout(() => {
        if (!gone(server.pid)) server.kill("SIGKILL");
      }, 35000);
      await exited;
      clearTimeout(timer);
      assert.ok(gone(server.pid));
    }
    await rm(root, { recursive: true, force: true });
  }
});
