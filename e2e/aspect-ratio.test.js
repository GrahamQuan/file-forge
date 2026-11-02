import { test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import sharp from "sharp";

// Real CLI -> core -> media adapters -> decoded files; no browser or UI validation.
test("aspect ratios center-crop images and videos before bounded resizing and preserve sources", async () => {
  const root = await mkdtemp(join(tmpdir(), "file-forge-ratio-"));
  const run = (executable, args) =>
    spawnSync(executable, args, {
      cwd: root,
      encoding: "utf8",
      timeout: 30000,
      env: { ...process.env, FILE_FORGE_CONFIG_DIR: join(root, "config") },
    });
  const cli = (...args) =>
    run(process.execPath, [resolve("packages/cli/bin/file-forge.js"), ...args, "--json"]);
  const success = (...args) => {
    const result = cli(...args, "--output", root);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const manifest = JSON.parse(result.stdout);
    assert.equal(manifest.status, "succeeded");
    return manifest;
  };
  const ffmpeg = (...args) => {
    const result = run(process.env.FFMPEG_PATH || "ffmpeg", [
      "-nostdin",
      "-hide_banner",
      "-n",
      ...args,
    ]);
    assert.equal(result.status, 0, result.stderr);
  };
  const probe = (path) => {
    const result = run(process.env.FFPROBE_PATH || "ffprobe", [
      "-v",
      "error",
      "-show_streams",
      "-of",
      "json",
      path,
    ]);
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout).streams;
  };
  try {
    const source = join(root, "wide.png");
    // Four unequal colors make shifted or edge-based crops detectable in decoded pixels.
    const data = Buffer.alloc(240 * 120 * 3);
    for (let y = 0; y < 120; y++)
      for (let x = 0; x < 240; x++) {
        const color =
          x < 60 ? [255, 0, 0] : x < 120 ? [0, 255, 0] : x < 180 ? [0, 0, 255] : [255, 255, 0];
        data.set(color, (y * 240 + x) * 3);
      }
    await sharp(data, { raw: { width: 240, height: 120, channels: 3 } })
      .png()
      .toFile(source);
    const tall = join(root, "tall.png");
    await sharp(source).rotate(90).png().toFile(tall);
    const oriented = join(root, "oriented.jpg");
    await sharp(source)
      .withMetadata({ orientation: 6 })
      .withIccProfile("srgb", { attach: false })
      .jpeg()
      .toFile(oriented);
    const alpha = join(root, "alpha.png");
    await sharp(source).ensureAlpha(0.5).png().toFile(alpha);
    const sources = [source, tall, oriented, alpha];
    const originals = await Promise.all(sources.map((path) => readFile(path)));
    for (const input of sources) {
      const result = success(
        "image",
        "process",
        input,
        "--ratio",
        "1:1",
        "--format",
        "png",
        "--quality",
        "100",
      );
      const output = result.assets[0].output;
      assert.deepEqual([result.assets[0].outputWidth, result.assets[0].outputHeight], [120, 120]);
      // Compare with a region of the fully oriented, decoded original, not compressed bytes.
      const displayed = await sharp(input).rotate().png().toBuffer();
      const metadata = await sharp(displayed).metadata();
      const expected = await sharp(displayed)
        .extract({
          left: (metadata.width - 120) / 2,
          top: (metadata.height - 120) / 2,
          width: 120,
          height: 120,
        })
        .raw()
        .toBuffer();
      const actual = await sharp(output).raw().toBuffer();
      assert.equal(actual.length, expected.length);
      // Decode and compare pixels so centering and orientation are checked independently of encoding.
      const tolerance = 0;
      const maxDifference = actual.reduce(
        (max, value, index) => Math.max(max, Math.abs(value - expected[index])),
        0,
      );
      assert.ok(maxDifference <= tolerance, `${input}: pixel difference ${maxDifference}`);
      assert.equal(result.parameters.image.ratio, "1:1");
      assert.equal(result.parameters.image.crop, "center");
    }
    for (const [args, expected] of [
      [
        ["--ratio", "1:1"],
        [120, 120],
      ],
      [
        ["--ratio", "2:1"],
        [240, 120],
      ],
      [
        ["--ratio", "1.5:1", "--width", "90"],
        [90, 60],
      ],
      [
        ["--ratio", "1:1", "--height", "50"],
        [50, 50],
      ],
      [
        ["--ratio", "1:1", "--width", "50", "--height", "50"],
        [50, 50],
      ],
      [
        ["--ratio", "1:1", "--width", "1000"],
        [120, 120],
      ],
      [[], [240, 120]],
      [
        ["--width", "80", "--height", "80"],
        [80, 40],
      ],
    ]) {
      const result = success("image", "compress", source, ...args);
      const metadata = await sharp(result.assets[0].output).metadata();
      assert.deepEqual([metadata.width, metadata.height], expected);
    }
    const ratioOnly = success("image", "process", source, "--ratio", "1:1");
    assert.equal(ratioOnly.assets[0].outputWidth, 120);
    const video = join(root, "clip.mp4");
    ffmpeg(
      "-loop",
      "1",
      "-i",
      source,
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=0.3",
      "-t",
      "0.3",
      "-r",
      "10",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      video,
    );
    const videoBytes = await readFile(video);
    for (const [args, expected] of [
      [
        ["--ratio", "1:1"],
        [120, 120],
      ],
      [
        ["--ratio", "1:1", "--width", "51"],
        [50, 50],
      ],
      [
        ["--ratio", "1:1", "--height", "50"],
        [50, 50],
      ],
      [
        ["--ratio", "1:1", "--width", "1000", "--height", "1000"],
        [120, 120],
      ],
      [
        ["--ratio", "16:9"],
        [212, 120],
      ],
      [
        ["--ratio", "1:1", "--preset", "clarity", "--audio", "remove"],
        [120, 120],
      ],
      [[], [240, 120]],
    ]) {
      const result = success("video", "compress", video, ...args);
      const [encoded, cover] = result.assets;
      const streams = probe(encoded.output);
      const stream = streams.find((s) => s.codec_type === "video");
      assert.deepEqual([stream.width, stream.height], expected);
      assert.equal(stream.sample_aspect_ratio, "1:1");
      assert.equal(
        streams.filter((s) => s.codec_type === "audio").length,
        args.includes("remove") ? 0 : 1,
      );
      const metadata = await sharp(cover.output).metadata();
      assert.deepEqual([metadata.width, metadata.height], expected);
      if (args.includes("1:1")) {
        const { data: pixels, info } = await sharp(cover.output)
          .removeAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const pixel = (x) => [
          ...pixels.subarray(
            (Math.floor(info.height / 2) * info.width + x) * 3,
            (Math.floor(info.height / 2) * info.width + x) * 3 + 3,
          ),
        ];
        const left = pixel(Math.floor(info.width / 4)),
          right = pixel(Math.floor((info.width * 3) / 4));
        assert.ok(left[1] > 200 && left[0] < 30 && left[2] < 30, String(left));
        assert.ok(right[2] > 200 && right[0] < 30 && right[1] < 30, String(right));
        assert.equal(result.parameters.video.crop, "center");
      }
      const frame = join(result.directory, "decoded.png");
      ffmpeg("-i", encoded.output, "-frames:v", "1", frame);
      assert.deepEqual(
        await readFile(cover.output),
        await sharp(frame)
          .rotate()
          .webp(
            args.includes("clarity")
              ? { quality: 90, effort: 6, smartSubsample: true }
              : { quality: 80 },
          )
          .toBuffer(),
      );
    }
    const anamorphic = join(root, "anamorphic.mp4");
    ffmpeg("-i", video, "-vf", "setsar=2", "-c:v", "libx264", "-an", anamorphic);
    const normalized = success("video", "compress", anamorphic, "--ratio", "1:1");
    assert.deepEqual(
      [normalized.assets[0].outputWidth, normalized.assets[0].outputHeight],
      [60, 60],
    );
    assert.equal(probe(normalized.assets[0].output)[0].sample_aspect_ratio, "1:1");
    const odd = join(root, "odd.mkv");
    ffmpeg(
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=101x79:duration=0.2,format=yuv444p",
      "-c:v",
      "ffv1",
      odd,
    );
    assert.notEqual(cli("video", "compress", odd, "--output", root).status, 0);
    const even = success("video", "compress", odd, "--ratio", "1:1");
    assert.deepEqual([even.assets[0].outputWidth, even.assets[0].outputHeight], [78, 78]);
    // Too-small results must fail, not trigger FFmpeg's scale=0 input-size sentinel.
    assert.notEqual(
      cli("video", "compress", video, "--ratio", "16:9", "--width", "2", "--output", root).status,
      0,
    );
    const mixed = join(root, "mixed");
    await mkdir(mixed);
    await copyFile(source, join(mixed, "image.png"));
    await copyFile(video, join(mixed, "video.mp4"));
    for (const media of ["all", "images", "videos"]) {
      const result = success(
        "folder",
        "compress",
        mixed,
        "--media",
        media,
        "--ratio",
        "1:1",
        "--width",
        "60",
      );
      for (const asset of result.assets) {
        const selected =
          media === "all" ||
          (asset.originalName === "image.png" ? media === "images" : media === "videos");
        if (selected) assert.deepEqual([asset.outputWidth, asset.outputHeight], [60, 60]);
        else
          assert.deepEqual(
            await readFile(asset.output),
            asset.originalName === "image.png" ? originals[0] : videoBytes,
          );
      }
      assert.equal(result.parameters.image.crop, "center");
      assert.equal(result.parameters.video.ratio, "1:1");
    }
    for (const [kind, operation, input] of [
      ["image", "process", source],
      ["image", "compress", source],
      ["video", "compress", video],
      ["folder", "compress", mixed],
    ]) {
      for (const args of [
        ...[
          "",
          "1",
          "1/1",
          "0:1",
          "1:0",
          "-1:1",
          "NaN:1",
          "1:Infinity",
          "1:1;bad",
          `${"9".repeat(400)}:1`,
        ].map((ratio) => ["--ratio", ratio]),
        ["--ratio", "1:1", "--width", "80", "--height", "60"],
      ]) {
        const result = cli(kind, operation, input, ...args, "--output", join(root, "invalid"));
        assert.equal(result.status, 2, result.stdout + result.stderr);
      }
    }
    assert.ok(!(await readdir(root)).includes("invalid"));
    for (let index = 0; index < sources.length; index++)
      assert.deepEqual(await readFile(sources[index]), originals[index]);
    assert.deepEqual(await readFile(video), videoBytes);
    const exported = success(
      "manifest",
      "export",
      "--manifest",
      join(ratioOnly.directory, "manifest.json"),
    );
    assert.deepEqual(exported.parameters, ratioOnly.parameters);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
