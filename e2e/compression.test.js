import { test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import sharp from "sharp";

// Real CLI → shared core → Sharp/FFmpeg → decoded output files. No UI.
test("compression accepts optional dimensions and produces resized WebP and video-matched covers", async () => {
  const root = await mkdtemp(join(tmpdir(), "file-forge-compression-"));
  const cli = (...args) =>
    spawnSync(process.execPath, [resolve("packages/cli/bin/file-forge.js"), ...args, "--json"], {
      cwd: root,
      encoding: "utf8",
      timeout: 30000,
      env: { ...process.env, FILE_FORGE_CONFIG_DIR: join(root, "config") },
    });
  const ffmpeg = (...args) => {
    const result = spawnSync(
      process.env.FFMPEG_PATH || "ffmpeg",
      ["-nostdin", "-hide_banner", ...args],
      { cwd: root, encoding: "utf8", timeout: 30000 },
    );
    assert.equal(result.status, 0, result.stderr);
    return result;
  };
  try {
    const input = join(root, "source.png");
    await sharp({ create: { width: 800, height: 600, channels: 3, background: "red" } })
      .png()
      .toFile(input);
    const original = await readFile(input);
    for (const dimensions of [
      ["--width", "0"],
      ["--height", "-1"],
    ]) {
      const result = cli(
        "image",
        "compress",
        input,
        ...dimensions,
        "--output",
        join(root, "missing"),
      );
      assert.equal(result.status, 2, result.stderr);
    }
    assert.ok(!(await readdir(root)).includes("missing"));
    const image = cli(
      "image",
      "compress",
      input,
      "--width",
      "160",
      "--height",
      "100",
      "--output",
      root,
    );
    assert.equal(image.status, 0, image.stderr);
    const imageMeta = await sharp(JSON.parse(image.stdout).assets[0].output).metadata();
    assert.equal(imageMeta.format, "webp");
    assert.equal(imageMeta.height, 100);
    assert.ok(imageMeta.width <= 160);
    assert.deepEqual(await readFile(input), original);
    const video = join(root, "source.mp4");
    ffmpeg(
      "-n",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=800x600:rate=10:duration=0.5",
      "-c:v",
      "libx264",
      video,
    );
    const sourceBytes = await readFile(video);
    for (const kind of ["image", "video"]) {
      const source = kind === "image" ? input : video;
      const result = cli(kind, "compress", source, "--preset", "clarity", "--output", root);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const manifest = JSON.parse(result.stdout);
      const settings = manifest.parameters[kind];
      assert.equal(settings.preset, "clarity");
      if (kind === "image") {
        assert.equal(settings.quality, 90);
        assert.deepEqual(
          await readFile(manifest.assets[0].output),
          await sharp(input)
            .rotate()
            .webp({ quality: 90, effort: 6, smartSubsample: true })
            .toBuffer(),
        );
      } else {
        assert.equal(settings.crf, 18);
        assert.equal(settings.encoderPreset, "slow");
        assert.equal(settings.coverQuality, 90);
        const baseline = JSON.parse(cli("video", "compress", source, "--output", root).stdout);
        const distortion = (path) => {
          const report = ffmpeg("-i", source, "-i", path, "-lavfi", "psnr", "-f", "null", "-");
          return Number(report.stderr.match(/average:([0-9.]+)/)[1]);
        };
        assert.ok(distortion(manifest.assets[0].output) > distortion(baseline.assets[0].output));
      }
      const overridden = JSON.parse(
        cli(kind, "compress", source, "--preset", "clarity", "--quality", "72", "--output", root)
          .stdout,
      );
      assert.equal(overridden.parameters[kind][kind === "image" ? "quality" : "coverQuality"], 72);
      assert.equal(
        cli(kind, "compress", source, "--preset", "unknown", "--output", root).status,
        2,
      );
    }
    const mixed = join(root, "mixed");
    await mkdir(mixed);
    await copyFile(input, join(mixed, "image.png"));
    await copyFile(video, join(mixed, "video.mp4"));
    const folderResult = cli("folder", "compress", mixed, "--preset", "clarity", "--output", root);
    assert.equal(folderResult.status, 0, folderResult.stdout + folderResult.stderr);
    const folderManifest = JSON.parse(folderResult.stdout);
    assert.equal(folderManifest.parameters.image.quality, 90);
    assert.equal(folderManifest.parameters.video.crf, 18);
    assert.equal(folderManifest.assets.length, 3);

    for (const dimensions of [
      ["--width", "0"],
      ["--height", "-1"],
      ["--width", "1", "--height", "1"],
    ]) {
      assert.equal(cli("video", "compress", video, ...dimensions, "--output", root).status, 2);
    }
    for (const [width, height] of [
      [161, 101],
      [640, 480],
    ]) {
      const result = cli(
        "video",
        "compress",
        video,
        "--width",
        String(width),
        "--height",
        String(height),
        "--output",
        root,
      );
      assert.equal(result.status, 0, result.stderr);
      const manifest = JSON.parse(result.stdout);
      assert.equal(manifest.status, "succeeded");
      const [encoded, cover] = manifest.assets;
      assert.equal(cover.output, encoded.output.replace(/\.mp4$/, ".webp"));
      const frame = join(manifest.directory, "verify.png");
      ffmpeg("-n", "-i", encoded.output, "-frames:v", "1", frame);
      const frameMeta = await sharp(frame).metadata();
      const coverMeta = await sharp(cover.output).metadata();
      assert.equal(coverMeta.format, "webp");
      assert.equal(coverMeta.width, frameMeta.width);
      assert.equal(coverMeta.height, frameMeta.height);
      assert.equal(frameMeta.width % 2, 0);
      assert.equal(frameMeta.height % 2, 0);
      assert.ok(frameMeta.width <= Math.min(width, 800));
      assert.ok(frameMeta.height <= Math.min(height, 600));
      assert.equal((await readFile(join(manifest.directory, "manifest.json"))).length > 0, true);
    }
    for (const [dimensions, expected] of [
      [[], [800, 600]],
      [
        ["--width", "160"],
        [160, 120],
      ],
      [
        ["--height", "120"],
        [160, 120],
      ],
    ]) {
      for (const [kind, source] of [
        ["image", input],
        ["video", video],
      ]) {
        const result = cli(kind, "compress", source, ...dimensions, "--output", root);
        assert.equal(result.status, 0, result.stderr);
        const asset = JSON.parse(result.stdout).assets[0];
        assert.deepEqual([asset.outputWidth, asset.outputHeight], expected);
      }
    }
    assert.deepEqual(await readFile(video), sourceBytes);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
