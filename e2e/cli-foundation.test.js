import { test } from "vitest";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect, Layer } from "effect";
import { NodeServices } from "@effect/platform-node";
import { ImageEngineLive, processImage, inspectImage } from "@file-forge/media";

const bin = fileURLToPath(new URL("../packages/cli/bin/file-forge.js", import.meta.url));
const live = Layer.mergeAll(NodeServices.layer, ImageEngineLive);
const runMedia = (effect) => Effect.runPromise(effect.pipe(Effect.provide(live)));
function cli(args, config, cwd, onChild) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [bin, ...args], {
      cwd,
      env: { ...process.env, FILE_FORGE_CONFIG_DIR: config },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (data) => {
      stdout += data;
    });
    child.stderr.on("data", (data) => {
      stderr += data;
      onChild?.(child, String(data));
    });
    child.once("error", reject);
    child.once("close", (code, signal) =>
      resolveResult({ code, signal, stdout, stderr, pid: child.pid }),
    );
  });
}
const json = (result) => JSON.parse(result.stdout);

test("CLI settings persist across projects, preserve malformed data, and keep machine output stable", async () => {
  const root = await mkdtemp(join(tmpdir(), "file-forge-cli-settings-"));
  try {
    const config = join(root, "config"),
      project = join(root, "project");
    await mkdir(project);
    const version = await cli(["-v"], config, root);
    assert.equal(version.stdout, "file-forge 0.0.0\n");
    assert.equal((await cli(["--version"], config, root)).stdout, version.stdout);
    assert.deepEqual(await readdir(root), ["project"]);
    assert.deepEqual(json(await cli(["config", "get", "language", "--json"], config, root)), {
      language: "en",
      source: "default",
    });
    assert.equal((await cli(["config", "set", "language", "zh-CN"], config, root)).code, 0);
    assert.match((await cli(["--help"], config, project)).stdout, /\u7528\u6cd5/);
    assert.match((await cli(["--language", "en", "--help"], config, project)).stdout, /Usage/);
    assert.deepEqual(json(await cli(["config", "get", "language", "--json"], config, project)), {
      language: "zh-CN",
      source: "saved",
    });
    const settingsFile = join(config, "config.json");
    await writeFile(
      settingsFile,
      JSON.stringify({ schemaVersion: 1, language: "zh-CN", preserved: { value: 42 } }),
    );
    const parallel = await Promise.all([
      cli(["config", "set", "language", "en", "--json"], config, root),
      cli(["config", "set", "language", "zh-CN", "--json"], config, project),
    ]);
    assert.ok(parallel.every((result) => result.code === 0));
    assert.deepEqual(JSON.parse(await readFile(settingsFile, "utf8")).preserved, { value: 42 });
    const before = await readFile(settingsFile, "utf8");
    for (const args of [
      ["config", "set", "language", "fr"],
      ["--language", "fr", "--help"],
      ["--language", "en", "config", "set", "language", "zh-CN"],
      ["--version", "inspect"],
    ]) {
      assert.equal((await cli([...args, "--json"], config, root)).code, 2);
      assert.equal(await readFile(settingsFile, "utf8"), before);
    }
    await writeFile(settingsFile, "{invalid");
    const malformed = await cli(["--help"], config, root);
    assert.match(malformed.stderr, /Using English/);
    assert.match(malformed.stdout, /Usage/);
    assert.equal((await cli(["config", "set", "language", "en"], config, root)).code, 2);
    assert.equal(await readFile(settingsFile, "utf8"), "{invalid");
    await writeFile(settingsFile, JSON.stringify({ schemaVersion: 1, language: "en" }));
    await mkdir(`${settingsFile}.lock`);
    assert.equal((await cli(["config", "set", "language", "zh-CN"], config, root)).code, 2);
    assert.equal(JSON.parse(await readFile(settingsFile, "utf8")).language, "en");
    await rm(`${settingsFile}.lock`, { recursive: true });
    await chmod(config, 0o500);
    try {
      assert.equal((await cli(["config", "set", "language", "zh-CN"], config, root)).code, 2);
    } finally {
      await chmod(config, 0o700);
    }
    for (const invalidSettings of [
      { schemaVersion: 2, language: "en" },
      { schemaVersion: 1, language: "fr" },
    ]) {
      await writeFile(settingsFile, JSON.stringify(invalidSettings));
      const invalidRead = await cli(["config", "get", "language", "--json"], config, root);
      assert.deepEqual(json(invalidRead), { language: "en", source: "default" });
      assert.match(invalidRead.stderr, /Using English/);
      assert.deepEqual(JSON.parse(await readFile(settingsFile, "utf8")), invalidSettings);
    }
    await writeFile(settingsFile, JSON.stringify({ schemaVersion: 1, language: "en" }));
    for (const locale of ["en", "zh-CN"]) {
      const bad = await cli(
        ["image", "process", "--unknown", "--language", locale, "--json"],
        config,
        root,
      );
      assert.equal(bad.code, 2);
      assert.equal(json(bad).error.code, "INVALID_ARGUMENT");
    }
    const upgrade = await cli(["--upgrade", "--json"], config, root);
    assert.equal(upgrade.code, 1);
    assert.equal(json(upgrade).error.code, "UNSUPPORTED_INSTALLATION");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("real CLI image batches preserve sources, aspect ratio and mappings; export existing assets", async () => {
  const root = await mkdtemp(join(tmpdir(), "file-forge-cli-assets-"));
  try {
    const config = join(root, "config"),
      inputs = join(root, "inputs"),
      outputs = join(root, "outputs");
    await mkdir(inputs);
    const svg = join(root, "source.svg");
    await writeFile(
      svg,
      '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="red"/></svg>',
    );
    for (const name of ["\u56fe\u7247.png", "A B.png", "a-b.png"])
      await runMedia(processImage(svg, join(inputs, name), { format: "png" }));
    const names = await readdir(inputs);
    const original = await Promise.all(names.map((name) => readFile(join(inputs, name))));
    await writeFile(join(inputs, "broken.png"), "invalid");
    await writeFile(join(inputs, "notes.txt"), "keep");
    await mkdir(join(inputs, "nested"));
    await symlink(join(root, "missing"), join(inputs, "link.png"));
    const args = [
      "image",
      "process",
      inputs,
      "--width",
      "200",
      "--height",
      "200",
      "--format",
      "webp",
      "--output",
      outputs,
      "--json",
    ];
    const result = await cli(args, config, root);
    assert.equal(result.code, 1, result.stderr);
    const manifest = json(result);
    assert.equal(manifest.status, "partial");
    assert.equal(manifest.assets.filter((asset) => asset.status === "succeeded").length, 3);
    const produced = manifest.assets.filter((asset) => asset.output);
    assert.equal(new Set(produced.map((asset) => asset.output)).size, 3);
    for (const asset of produced) {
      assert.match(asset.output.split("/").pop(), /^[a-z0-9-]+\.webp$/);
      const metadata = await runMedia(inspectImage(asset.output));
      assert.equal(metadata.width, 80);
      assert.equal(metadata.height, 40);
      assert.equal(asset.sizeChange, asset.outputSize - asset.size);
    }
    const persisted = JSON.parse(await readFile(join(manifest.directory, "manifest.json"), "utf8"));
    assert.deepEqual(persisted.assets, manifest.assets);
    const report = await readFile(join(manifest.directory, "report.md"), "utf8");
    assert.match(report, /partial/);
    assert.ok(!report.includes(root));
    assert.ok(manifest.assets.some((asset) => asset.errorCode === "SYMLINK_SKIPPED"));
    for (let index = 0; index < names.length; index++)
      assert.deepEqual(await readFile(join(inputs, names[index])), original[index]);
    const second = json(await cli([...args, "--language", "zh-CN"], config, root));
    assert.deepEqual(
      second.assets.map((asset) => asset.assetId),
      manifest.assets.map((asset) => asset.assetId),
    );
    assert.deepEqual(
      second.assets.filter((asset) => asset.output).map((asset) => asset.output.split("/").pop()),
      produced.map((asset) => asset.output.split("/").pop()),
    );
    const selected = join(inputs, names[0]);
    const ready = json(
      await cli(["manifest", "export", selected, "--output", outputs, "--json"], config, root),
    );
    assert.equal(ready.assets[0].status, "inspected");
    assert.equal(
      ready.assets[0].assetId,
      manifest.assets.find((asset) => asset.originalName === names[0]).assetId,
    );
    assert.deepEqual((await readdir(ready.directory)).sort(), ["manifest.json", "report.md"]);
    const exported = json(
      await cli(
        [
          "manifest",
          "export",
          "--manifest",
          join(manifest.directory, "manifest.json"),
          "--output",
          outputs,
          "--json",
        ],
        config,
        root,
      ),
    );
    assert.deepEqual(exported.assets, manifest.assets);
    const empty = json(await cli(["inspect", join(inputs, "nested"), "--json"], config, root));
    assert.equal(empty.status, "empty");
    const invalid = await cli(
      [
        "image",
        "process",
        selected,
        "--width",
        "-1",
        "--output",
        join(root, "never-created"),
        "--json",
      ],
      config,
      root,
    );
    assert.equal(invalid.code, 2);
    assert.ok(!(await readdir(root)).includes("never-created"));
    await assert.rejects(runMedia(processImage(selected, selected, { width: 10 })));
    await assert.rejects(runMedia(processImage(selected, produced[0].output, { width: 10 })));
    const nestedOutput = await cli(
      ["image", "process", inputs, "--width", "10", "--output", join(inputs, "outputs"), "--json"],
      config,
      root,
    );
    assert.equal(nestedOutput.code, 2);
    assert.ok(!(await readdir(inputs)).includes("outputs"));
    // Actual invocation can be interrupted without leaving its process alive.
    const cancelled = await cli(
      ["image", "process", inputs, "--width", "10", "--output", outputs, "--json"],
      config,
      root,
      (child, text) => {
        if (text.includes("Processing images")) child.kill("SIGINT");
      },
    );
    assert.equal(cancelled.code, 130);
    assert.equal(json(cancelled).status, "cancelled");
    assert.throws(() => process.kill(cancelled.pid, 0), { code: "ESRCH" });
    // Cancel after publication begins, then verify the durable partial mapping and staged-file cleanup.
    const batch = join(root, "batch");
    await mkdir(batch);
    for (let index = 0; index < 100; index++)
      await writeFile(join(batch, `image-${index}.png`), original[0]);
    const prior = new Set(await readdir(outputs));
    let polling;
    let stopped = false;
    let cancelledDirectory;
    try {
      const activeCancellation = await cli(
        ["image", "process", batch, "--width", "20", "--output", outputs, "--json"],
        config,
        root,
        (child, text) => {
          if (!text.includes("Processing images") || polling) return;
          polling = setInterval(async () => {
            if (stopped) return;
            const created = (await readdir(outputs)).find((name) => !prior.has(name));
            if (!created) return;
            const directory = join(outputs, created);
            if (!(await readdir(directory)).some((name) => name.endsWith(".webp"))) return;
            if (stopped) return;
            stopped = true;
            cancelledDirectory = directory;
            child.kill("SIGINT");
          }, 5);
        },
      );
      assert.equal(activeCancellation.code, 130);
      assert.equal(json(activeCancellation).status, "cancelled");
      assert.throws(() => process.kill(activeCancellation.pid, 0), { code: "ESRCH" });
    } finally {
      clearInterval(polling);
    }
    assert.ok(cancelledDirectory);
    const cancelledManifest = JSON.parse(
      await readFile(join(cancelledDirectory, "manifest.json"), "utf8"),
    );
    assert.equal(cancelledManifest.status, "cancelled");
    assert.equal(cancelledManifest.assets.length, 100);
    assert.ok(cancelledManifest.assets.some((asset) => asset.status === "succeeded"));
    assert.ok(cancelledManifest.assets.some((asset) => asset.errorCode === "CANCELLED"));
    assert.ok((await readdir(cancelledDirectory)).every((name) => !name.startsWith(".")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
