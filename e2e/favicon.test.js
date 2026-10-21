import { test } from "vitest";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { Effect, Layer } from "effect";
import { NodeServices } from "@effect/platform-node";
import { ffmpegLayer, runFfmpeg } from "@file-forge/media";

const executable = fileURLToPath(new URL("../packages/cli/bin/file-forge.js", import.meta.url));
const cli = (root, args, onProgress) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [executable, ...args], {
      cwd: root,
      env: { ...process.env, FILE_FORGE_CONFIG_DIR: join(root, "settings") },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (data) => {
      stdout += data;
    });
    child.stderr.on("data", (data) => {
      stderr += data;
      onProgress?.(child, String(data));
    });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr, pid: child.pid }));
  });
const pixel = (decoded, x, y) => [
  ...decoded.data.subarray((y * decoded.info.width + x) * 4, (y * decoded.info.width + x) * 4 + 4),
];
const decode = (input) => sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

async function checkBundle(root, result, size, source, original) {
  assert.equal(result.code, 0, result.stdout + result.stderr);
  const manifest = JSON.parse(result.stdout);
  assert.equal(manifest.parameters.image.preset, "favicon");
  assert.equal(manifest.parameters.image.svg, "vector-trace");
  assert.equal(manifest.parameters.image.size, size);
  assert.equal(manifest.assets.length, 3);
  const directory = manifest.directory;
  assert.deepEqual((await readdir(directory)).sort(), [
    "favicon.ico",
    "favicon.png",
    "favicon.svg",
    "manifest.json",
    "report.md",
  ]);
  const png = await readFile(join(directory, "favicon.png"));
  const ico = await readFile(join(directory, "favicon.ico"));
  const svg = await readFile(join(directory, "favicon.svg"), "utf8");
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 1);
  assert.equal(ico[6] || 256, size);
  assert.equal(ico[7] || 256, size);
  assert.equal(ico[8], 0);
  assert.equal(ico[9], 0);
  assert.equal(ico.readUInt16LE(10), 1);
  assert.equal(ico.readUInt16LE(12), 32);
  const length = ico.readUInt32LE(14),
    offset = ico.readUInt32LE(18);
  assert.equal(offset, 22);
  assert.equal(length + offset, ico.length);
  assert.deepEqual(ico.subarray(offset), png);
  const raster = await decode(png),
    vector = await decode(Buffer.from(svg));
  for (const decoded of [raster, vector]) {
    assert.equal(decoded.info.width, size);
    assert.equal(decoded.info.height, size);
    assert.equal(pixel(decoded, 0, 0)[3], 0);
  }
  assert.match(svg, new RegExp(`viewBox="0 0 ${size} ${size}"`));
  assert.doesNotMatch(svg, /<(?:image|script|foreignObject)\b|data:|\b(?:href|on\w+)\s*=/i);
  for (const asset of manifest.assets) {
    assert.equal(asset.outputWidth, size);
    assert.equal(asset.outputHeight, size);
    assert.equal(asset.outputSize, (await readFile(asset.output)).length);
    assert.equal(asset.sizeChange, asset.outputSize - original.length);
    assert.equal(asset.status, "succeeded");
  }
  assert.deepEqual(await readFile(source), original);
  const persisted = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
  assert.deepEqual(persisted.assets, manifest.assets);
  assert.ok(!(await readFile(join(directory, "report.md"), "utf8")).includes(root));
  assert.throws(() => process.kill(result.pid, 0), { code: "ESRCH" });
  return { manifest, raster, vector, svg };
}

test("PNG logos generate usable PNG, ICO and true-vector SVG favicons through the CLI", async () => {
  const root = await mkdtemp(join(tmpdir(), "file-forge-favicons-"));
  try {
    const source = join(root, "logo.png"),
      output = join(root, "output");
    const original = await sharp(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="64"><rect width="40" height="64" fill="#ff0000"/><rect x="64" width="64" height="64" fill="#0000ff"/></svg>',
      ),
    )
      .png()
      .toBuffer();
    await writeFile(source, original);
    const args = ["favicon", "generate", source, "--output", output, "--json"];
    const first = await checkBundle(root, await cli(root, args), 64, source, original);
    assert.match(first.svg, /<path\b/);
    for (const decoded of [first.raster, first.vector]) {
      assert.ok(
        pixel(decoded, 8, 32).every(
          (value, index) => Math.abs(value - [255, 0, 0, 255][index]) <= 2,
        ),
      );
      assert.ok(
        pixel(decoded, 48, 32).every(
          (value, index) => Math.abs(value - [0, 0, 255, 255][index]) <= 2,
        ),
      );
      assert.equal(pixel(decoded, 24, 32)[3], 0);
      assert.equal(pixel(decoded, 48, 15)[3], 0);
      assert.equal(pixel(decoded, 48, 48)[3], 0);
    }
    const concurrent = await Promise.all([
      cli(root, [...args, "--size", "32", "--language", "zh-CN"]),
      cli(root, [...args, "--size", "32", "--language", "en"]),
    ]);
    const smaller = await Promise.all(
      concurrent.map((result) => checkBundle(root, result, 32, source, original)),
    );
    assert.notEqual(smaller[0].manifest.directory, smaller[1].manifest.directory);
    assert.deepEqual(
      smaller[0].manifest.assets.map((asset) => asset.assetId),
      smaller[1].manifest.assets.map((asset) => asset.assetId),
    );
    assert.equal(smaller[0].svg, smaller[1].svg);
    const reexport = await cli(root, [
      "manifest",
      "export",
      "--manifest",
      join(first.manifest.directory, "manifest.json"),
      "--output",
      output,
      "--json",
    ]);
    assert.equal(reexport.code, 0);
    assert.deepEqual(JSON.parse(reexport.stdout).assets, first.manifest.assets);
    const tiny = join(root, "tiny.png");
    const tinyBytes = await sharp({
      create: { width: 8, height: 4, channels: 4, background: "#00ff00" },
    })
      .png()
      .toBuffer();
    await writeFile(tiny, tinyBytes);
    const tinyResult = await checkBundle(
      root,
      await cli(root, ["favicon", "generate", tiny, "--output", output, "--size", "256", "--json"]),
      256,
      tiny,
      tinyBytes,
    );
    assert.deepEqual(pixel(tinyResult.raster, 127, 127), [0, 255, 0, 255]);
    assert.equal(
      [...tinyResult.raster.data].filter((value, index) => index % 4 === 3 && value > 0).length,
      32,
    );
    const transparent = join(root, "transparent.png");
    const transparentBytes = await sharp({
      create: { width: 16, height: 16, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
    await writeFile(transparent, transparentBytes);
    const blank = await checkBundle(
      root,
      await cli(root, ["favicon", "generate", transparent, "--output", output, "--json"]),
      64,
      transparent,
      transparentBytes,
    );
    assert.doesNotMatch(blank.svg, /<path\b/);
    assert.ok([...blank.vector.data].every((value, index) => index % 4 !== 3 || value === 0));
    // Decode the actual ICO container through a second installed engine as well.
    await Effect.runPromise(
      runFfmpeg([
        "-v",
        "error",
        "-i",
        join(first.manifest.directory, "favicon.ico"),
        "-f",
        "null",
        "-",
      ]).pipe(
        Effect.provide(
          Layer.mergeAll(NodeServices.layer, ffmpegLayer(process.env.FFMPEG_PATH || "ffmpeg")),
        ),
      ),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("favicon input validation preserves sources and rejects invalid formats, sizes, and destinations", async () => {
  const root = await mkdtemp(join(tmpdir(), "file-forge-favicon-errors-"));
  try {
    const source = join(root, "source.png");
    const bytes = await sharp({ create: { width: 16, height: 16, channels: 4, background: "red" } })
      .png()
      .toBuffer();
    await writeFile(source, bytes);
    const invalidOutput = join(root, "must-not-exist");
    for (const size of ["0", "15", "257", "64.5", "abc"]) {
      const result = await cli(root, [
        "favicon",
        "generate",
        source,
        "--size",
        size,
        "--output",
        invalidOutput,
        "--json",
      ]);
      assert.equal(result.code, 2, result.stdout + result.stderr);
      assert.equal(JSON.parse(result.stdout).status, "failed");
    }
    const jpeg = join(root, "disguised.png"),
      broken = join(root, "broken.png"),
      link = join(root, "link.png"),
      animation = join(root, "animation.png");
    await writeFile(jpeg, await sharp(bytes).jpeg().toBuffer());
    await writeFile(broken, "broken png");
    await symlink(source, link);
    await Effect.runPromise(
      runFfmpeg([
        "-n",
        "-f",
        "lavfi",
        "-i",
        "testsrc=size=32x32:rate=2",
        "-frames:v",
        "2",
        "-f",
        "apng",
        animation,
      ]).pipe(
        Effect.provide(
          Layer.mergeAll(NodeServices.layer, ffmpegLayer(process.env.FFMPEG_PATH || "ffmpeg")),
        ),
      ),
    );
    for (const input of [jpeg, broken, link, animation, root]) {
      const result = await cli(root, [
        "favicon",
        "generate",
        input,
        "--output",
        invalidOutput,
        "--json",
      ]);
      assert.equal(result.code, 2, result.stdout + result.stderr);
      assert.equal(JSON.parse(result.stdout).error.code, "INVALID_INPUT");
    }
    assert.ok(!(await readdir(root)).includes("must-not-exist"));
    const occupied = join(root, "occupied");
    await writeFile(occupied, "user data");
    const conflict = await cli(root, [
      "favicon",
      "generate",
      source,
      "--output",
      occupied,
      "--json",
    ]);
    assert.equal(conflict.code, 1);
    assert.equal(await readFile(occupied, "utf8"), "user data");
    assert.deepEqual(await readFile(source), bytes);
    const output = join(root, "outputs");
    await mkdir(output);
    await writeFile(join(output, "favicon.png"), "existing output");
    const success = await cli(root, ["favicon", "generate", source, "--output", output, "--json"]);
    assert.equal(success.code, 0, success.stdout + success.stderr);
    assert.equal(await readFile(join(output, "favicon.png"), "utf8"), "existing output");
    const before = await readdir(output);
    const cancelled = await cli(
      root,
      ["favicon", "generate", source, "--output", output, "--json"],
      (child, text) => {
        if (text.includes("Generating favicons")) child.kill("SIGINT");
      },
    );
    assert.equal(cancelled.code, 130, cancelled.stdout + cancelled.stderr);
    assert.equal(JSON.parse(cancelled.stdout).status, "cancelled");
    assert.deepEqual(await readdir(output), before);
    assert.throws(() => process.kill(cancelled.pid, 0), { code: "ESRCH" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
