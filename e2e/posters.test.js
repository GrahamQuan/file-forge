import { test } from "vitest";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, basename } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import sharp from "sharp";
import { makePosterGlb } from "./poster-fixture.js";
const dead = (pid) => {
  try {
    process.kill(pid, 0);
    return false;
  } catch (e) {
    return e.code === "ESRCH";
  }
};
import { posterOwner } from "./poster-owner.js";
test("CLI renders six lossless axis posters, preserves sources and cleans owned browsers", async () => {
  const root = await mkdtemp(join(tmpdir(), "file-forge-posters-"));
  const input = join(root, "My_Model + 1.glb");
  const output = join(root, "out");
  const original = makePosterGlb();
  const cli = resolve("packages/cli/bin/file-forge.js");
  const env = { ...process.env, FILE_FORGE_CONFIG_DIR: join(root, "config") };
  let child;
  try {
    await writeFile(input, original);
    child = spawn(
      process.execPath,
      [
        cli,
        "model",
        "posters",
        input,
        "--ratio",
        "3:2",
        "--width",
        "96",
        "--height",
        "64",
        "--output",
        output,
        "--json",
      ],
      { env, stdio: ["ignore", "pipe", "pipe"] },
    );
    // Owned CLI PID child.pid, cwd=repository, no port; browser owner receipt records its isolated child.
    const closed = once(child, "close");
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    let owner;
    for (let i = 0; i < 1000 && !owner && child.exitCode === null; i++) {
      owner = await posterOwner(output);
      if (!owner) await delay(20);
    }
    assert.equal((await closed)[0], 0, stdout + stderr);
    assert.ok(owner?.pid, "real browser ownership is recorded");
    assert.ok(dead(owner.pid));
    assert.ok(dead(child.pid));
    const result = JSON.parse(stdout);
    assert.equal(result.schemaVersion, 5);
    assert.equal(result.parameters.poster.ratio, "3:2");
    assert.deepEqual(result.parameters.image, {
      format: "webp",
      encoding: "lossless",
      resize: "none",
      workflow: "process-image",
    });
    assert.equal(result.status, "succeeded");
    const views = ["front", "back", "left", "right", "top", "bottom"];
    assert.deepEqual(
      result.assets.map((a) => a.view),
      views,
    );
    const colors = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [1, 1, 0],
      [1, 0, 1],
      [0, 1, 1],
    ];
    for (const [i, a] of result.assets.entries()) {
      assert.equal(basename(a.output), `my-model-1-${views[i]}.webp`);
      const bytes = await readFile(a.output);
      assert.equal(bytes.toString("ascii", 12, 16), "VP8L");
      const meta = await sharp(bytes).metadata();
      assert.deepEqual([meta.width, meta.height, meta.hasAlpha], [96, 64, true]);
      const { data, info } = await sharp(bytes)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      assert.equal(data[3], 0);
      const center = (32 * info.width + 48) * 4;
      assert.equal(data[center + 3], 255);
      for (let channel = 0; channel < 3; channel++)
        assert.equal(
          data[center + channel] > 190,
          Boolean(colors[i][channel]),
          `correct face color for ${views[i]}`,
        );
      assert.equal(a.lossless, true);
      assert.equal(a.camera.orthographicScale, result.assets[0].camera.orthographicScale);
    }
    assert.deepEqual(await readFile(input), original);
    assert.ok(!(await readdir(result.directory)).some((n) => n.startsWith(".posters-")));
    const exported = spawnSync(
      process.execPath,
      [
        cli,
        "manifest",
        "export",
        "--manifest",
        join(result.directory, "manifest.json"),
        "--output",
        output,
        "--include-paths",
        "--json",
      ],
      { env, encoding: "utf8", timeout: 30000 },
    );
    assert.equal(exported.status, 0, exported.stdout + exported.stderr);
    assert.deepEqual(JSON.parse(exported.stdout).assets, result.assets);
    for (const [extra, code] of [
      [
        { buffers: [{ uri: "https://example.com/a.bin", byteLength: 1 }] },
        "POSTER_UNSUPPORTED_MODEL",
      ],
      [{ extensionsUsed: ["KHR_texture_basisu"] }, "POSTER_UNSUPPORTED_MODEL"],
    ]) {
      await writeFile(input, makePosterGlb(extra));
      const r = spawnSync(
        process.execPath,
        [cli, "model", "posters", input, "--output", output, "--json"],
        { env, encoding: "utf8", timeout: 30000 },
      );
      assert.equal(r.status, 1);
      assert.equal(JSON.parse(r.stdout).assets[0].errorCode, code);
    }
    await writeFile(input, original);
    const missing = spawnSync(
      process.execPath,
      [cli, "model", "posters", input, "--output", output, "--json"],
      {
        env: { ...env, FILE_FORGE_CHROME_PATH: join(root, "missing") },
        encoding: "utf8",
        timeout: 30000,
      },
    );
    assert.equal(missing.status, 1);
    assert.equal(JSON.parse(missing.stdout).assets[0].errorCode, "POSTER_BROWSER_REQUIRED");
    for (const ratio of ["0:9", "16:0", "square", "1:999999", "16:9"]) {
      const rejected = spawnSync(
        process.execPath,
        [
          cli,
          "model",
          "posters",
          input,
          "--ratio",
          ratio,
          "--width",
          "96",
          "--height",
          "64",
          "--output",
          output,
          "--json",
        ],
        { env, encoding: "utf8", timeout: 30000 },
      );
      assert.equal(rejected.status, 2, `reject incompatible ratio ${ratio}`);
    }
    const bad = spawnSync(
      process.execPath,
      [cli, "model", "posters", input, "--width", "0", "--output", output, "--json"],
      { env, encoding: "utf8", timeout: 30000 },
    );
    assert.equal(bad.status, 2);
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      const closed = once(child, "close");
      child.kill("SIGTERM");
      await closed;
    }
    await rm(root, { recursive: true, force: true });
  }
});

test("failed rendering closes its browser and retains a failure manifest", async () => {
  const root = await mkdtemp(join(tmpdir(), "file-forge-poster-failure-"));
  let child;
  try {
    const input = join(root, "empty.glb"),
      output = join(root, "out");
    await writeFile(input, makePosterGlb({ scenes: [{ nodes: [] }] }));
    child = spawn(
      process.execPath,
      [
        resolve("packages/cli/bin/file-forge.js"),
        "model",
        "posters",
        input,
        "--output",
        output,
        "--json",
      ],
      {
        env: { ...process.env, FILE_FORGE_CONFIG_DIR: join(root, "config") },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const closed = once(child, "close");
    let stdout = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.resume();
    let owner;
    for (let i = 0; i < 1000 && !owner && child.exitCode === null; i++) {
      owner = await posterOwner(output);
      if (!owner) await delay(10);
    }
    assert.equal((await closed)[0], 1);
    assert.ok(owner?.pid);
    assert.ok(dead(owner.pid));
    const result = JSON.parse(stdout);
    assert.equal(result.status, "failed");
    assert.equal(result.assets[0].errorCode, "POSTER_RENDER_FAILED");
    assert.ok(result.assets.slice(1).every((a) => a.status === "skipped"));
    assert.deepEqual(await readdir(result.directory), ["manifest.json", "report.md"]);
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      const closed = once(child, "close");
      child.kill("SIGTERM");
      await closed;
    }
    await rm(root, { recursive: true, force: true });
  }
});

test("rendered PNG passes through the shared image workflow without changing pixels", async () => {
  const { Effect, FileSystem, Layer } = await import("effect");
  const { NodeServices } = await import("@effect/platform-node");
  const { openPosterRenderer, posterLayer, ImageEngineLive, processImage } =
    await import("@file-forge/media");
  const root = await mkdtemp(join(tmpdir(), "file-forge-poster-image-"));
  try {
    const input = join(root, "box.glb"),
      frame = join(root, "front.png"),
      output = join(root, "front.webp");
    await writeFile(input, makePosterGlb());
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const staging = yield* fs.makeTempDirectoryScoped({
            directory: root,
            prefix: ".posters-",
          });
          const renderer = yield* openPosterRenderer(input, staging, { width: 80, height: 64 });
          yield* renderer.render("front", frame);
          const image = yield* processImage(frame, output, { format: "webp" }, "lossless-webp");
          return { pid: renderer.pid, image };
        }),
      ).pipe(Effect.provide(Layer.mergeAll(NodeServices.layer, ImageEngineLive, posterLayer()))),
    );
    assert.ok(dead(result.pid));
    assert.deepEqual(
      [result.image.width, result.image.height, result.image.format],
      [80, 64, "webp"],
    );
    assert.deepEqual(
      await sharp(output).ensureAlpha().raw().toBuffer(),
      await sharp(frame).ensureAlpha().raw().toBuffer(),
    );
    assert.equal((await readFile(output)).toString("ascii", 12, 16), "VP8L");
    assert.ok(
      !(await readdir(root)).some(
        (name) => name.startsWith(".posters-") || name.startsWith(".file-forge-"),
      ),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
