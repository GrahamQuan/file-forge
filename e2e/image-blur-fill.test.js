import { test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import sharp from "sharp";

test("image CLI fills from source pixels and compresses the result only when requested", async () => {
  const root = await mkdtemp(join(tmpdir(), "file-forge-blur-fill-"));
  const run = (...args) =>
    spawnSync(process.execPath, [resolve("packages/cli/bin/file-forge.js"), ...args, "--json"], {
      cwd: root,
      encoding: "utf8",
      timeout: 30000,
      env: { ...process.env, FILE_FORGE_CONFIG_DIR: join(root, "config") },
    });
  const success = (...args) => {
    const result = run(...args, "--output", root);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const manifest = JSON.parse(result.stdout);
    assert.equal(manifest.status, "succeeded");
    return manifest;
  };
  try {
    const wide = join(root, "wide.png");
    const portrait = join(root, "portrait.jpg");
    const pixels = Buffer.alloc(160 * 90 * 3);
    for (let y = 0; y < 90; y++)
      for (let x = 0; x < 160; x++) {
        const intensity = 250 + (x % 6);
        const green = y % 64;
        pixels.set(x < 80 ? [intensity, green, 0] : [0, green, intensity], (y * 160 + x) * 3);
      }
    await sharp(pixels, { raw: { width: 160, height: 90, channels: 3 } })
      .png()
      .toFile(wide);
    await sharp(wide).withMetadata({ orientation: 6 }).jpeg().toFile(portrait);
    const originals = await Promise.all([wide, portrait].map((input) => readFile(input)));

    for (const [input, landscape] of [
      [wide, true],
      [portrait, false],
    ]) {
      const filled = success("image", "process", input, "--blur-fill");
      const { output, outputWidth, outputHeight } = filled.assets[0];
      assert.deepEqual([outputWidth, outputHeight], [160, 160]);
      assert.equal(filled.parameters.image.padding, "blur");
      assert.equal(filled.parameters.image.ratio, "1:1");
      assert.equal(filled.parameters.image.crop, undefined);
      assert.equal(filled.parameters.image.encoding, "lossless");
      assert.equal(filled.parameters.image.format, "png");
      assert.equal(filled.parameters.image.quality, undefined);
      assert.equal(extname(output), ".png");
      assert.equal((await sharp(output).metadata()).isPalette, false);

      const foreground = await sharp(output)
        .extract({
          left: landscape ? 0 : 35,
          top: landscape ? 35 : 0,
          width: landscape ? 160 : 90,
          height: landscape ? 90 : 160,
        })
        .removeAlpha()
        .raw()
        .toBuffer();
      const oriented = await sharp(input).autoOrient().png().toBuffer();
      assert.ok(foreground.equals(await sharp(oriented).raw().toBuffer()), "foreground changed");

      const background = await sharp(output).removeAlpha().raw().toBuffer();
      const pixel = (x, y) => [...background.subarray((y * 160 + x) * 3, (y * 160 + x) * 3 + 3)];
      const paddingPixel = (along) => (landscape ? pixel(along, 5) : pixel(5, along));
      assert.ok(paddingPixel(15)[0] > 240);
      assert.ok(paddingPixel(145)[2] > 240);
      const [red, , blue] = paddingPixel(80);
      assert.ok(red > 50 && blue > 50, `expected a blurred color transition, got ${red}/${blue}`);

      const exported = success(
        "manifest",
        "export",
        "--manifest",
        join(filled.directory, "manifest.json"),
      );
      assert.deepEqual(exported.parameters, filled.parameters);

      const compressed = success("image", "compress", input, "--blur-fill");
      assert.equal(compressed.parameters.image.encoding, "lossy");
      assert.equal(compressed.parameters.image.quality, 80);
      assert.equal(extname(compressed.assets[0].output), ".webp");
      assert.deepEqual(
        await readFile(compressed.assets[0].output),
        await sharp(output).webp({ quality: 80 }).toBuffer(),
      );
    }

    const uncompressed = success("image", "process", wide, "--blur-fill");
    const fullRaster = await sharp(uncompressed.assets[0].output).ensureAlpha().raw().toBuffer();
    for (const format of ["webp", "avif"]) {
      const chosen = success("image", "process", wide, "--blur-fill", "--format", format);
      assert.equal(chosen.parameters.image.encoding, "lossless");
      assert.equal(extname(chosen.assets[0].output), `.${format}`);
      const raster = await sharp(chosen.assets[0].output).ensureAlpha().raw().toBuffer();
      assert.ok(raster.equals(fullRaster), `${format} changed the composed pixels`);
    }
    const jpeg = success(
      "image",
      "process",
      wide,
      "--blur-fill",
      "--format",
      "jpeg",
      "--quality",
      "90",
    );
    assert.equal(jpeg.parameters.image.encoding, "lossy");
    assert.equal((await sharp(jpeg.assets[0].output).metadata()).format, "jpeg");
    assert.equal(
      run(
        "image",
        "process",
        wide,
        "--blur-fill",
        "--format",
        "jpeg",
        "--output",
        join(root, "invalid"),
      ).status,
      2,
    );

    const cropped = success("image", "process", wide, "--ratio", "1:1", "--format", "png");
    assert.deepEqual([cropped.assets[0].outputWidth, cropped.assets[0].outputHeight], [90, 90]);
    assert.equal(cropped.parameters.image.crop, "center");
    assert.equal(cropped.parameters.image.padding, undefined);

    for (const [input, ratio, bounds, expected] of [
      [portrait, "3:4", [], [120, 160]],
      [wide, "4:3", ["--height", "60"], [80, 60]],
      [wide, "16:9", [], [160, 90]],
    ]) {
      const filled = success(
        "image",
        "compress",
        input,
        "--blur-fill",
        "--ratio",
        ratio,
        ...bounds,
      );
      const { width, height } = await sharp(filled.assets[0].output).metadata();
      assert.deepEqual([width, height], expected);
    }
    const rejected = run(
      "image",
      "compress",
      wide,
      "--blur-fill",
      "--width",
      "160",
      "--height",
      "90",
      "--output",
      join(root, "invalid"),
    );
    assert.equal(rejected.status, 2, rejected.stdout + rejected.stderr);
    assert.ok(!(await readdir(root)).includes("invalid"));
    assert.deepEqual(
      await Promise.all([wide, portrait].map((input) => readFile(input))),
      originals,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
