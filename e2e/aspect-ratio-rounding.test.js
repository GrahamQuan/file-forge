import { test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import sharp from "sharp";

// Exercise decimal arithmetic through actual CLI encoders and persisted outputs.
test("decimal ratios preserve integer crop and scale boundaries", async () => {
  const root = await mkdtemp(join(tmpdir(), "file-forge-ratio-rounding-"));
  try {
    for (const [width, height, bounds] of [
      [58, 100, []],
      [100, 100, []],
      [174, 300, ["--width", "58", "--height", "100"]],
    ]) {
      const input = join(root, `source-${width}.png`);
      await sharp({ create: { width, height, channels: 3, background: "red" } })
        .png()
        .toFile(input);
      const video = join(root, `source-${width}.mp4`);
      const fixture = spawnSync(
        process.env.FFMPEG_PATH || "ffmpeg",
        [
          "-nostdin",
          "-n",
          "-loop",
          "1",
          "-i",
          input,
          "-t",
          "0.2",
          "-r",
          "10",
          "-c:v",
          "libx264",
          "-pix_fmt",
          "yuv420p",
          video,
        ],
        { encoding: "utf8", timeout: 30000 },
      );
      assert.equal(fixture.status, 0, fixture.stderr);
      for (const [kind, source] of [
        ["image", input],
        ["video", video],
      ]) {
        const original = await readFile(source);
        const result = spawnSync(
          process.execPath,
          [
            resolve("packages/cli/bin/file-forge.js"),
            kind,
            "compress",
            source,
            "--ratio",
            "0.58:1",
            ...bounds,
            "--output",
            root,
            "--json",
          ],
          {
            cwd: root,
            encoding: "utf8",
            timeout: 30000,
            env: { ...process.env, FILE_FORGE_CONFIG_DIR: join(root, "config") },
          },
        );
        assert.equal(result.status, 0, result.stdout + result.stderr);
        const manifest = JSON.parse(result.stdout);
        for (const asset of manifest.assets)
          assert.deepEqual([asset.outputWidth, asset.outputHeight], [58, 100]);
        const decoded = await sharp(
          manifest.assets.find((asset) => asset.kind === "image").output,
        ).metadata();
        assert.deepEqual([decoded.width, decoded.height], [58, 100]);
        assert.deepEqual(await readFile(source), original);
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
