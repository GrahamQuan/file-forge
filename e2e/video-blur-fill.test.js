import { test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import sharp from "sharp";

test("video CLI blur-fills each frame and delivers a preview-compatible H.264 MP4", async () => {
  const root = await mkdtemp(join(tmpdir(), "file-forge-video-blur-"));
  const run = (program, args) =>
    spawnSync(program, args, { cwd: root, encoding: "utf8", timeout: 30000, env: process.env });
  const ffmpeg = (...args) => {
    const result = run(process.env.FFMPEG_PATH || "ffmpeg", [
      "-nostdin",
      "-v",
      "error",
      "-n",
      ...args,
    ]);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  const probe = (input) => {
    const result = run(process.env.FFPROBE_PATH || "ffprobe", [
      "-v",
      "error",
      "-show_streams",
      "-of",
      "json",
      input,
    ]);
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout).streams;
  };
  const cli = (...args) =>
    run(process.execPath, [resolve("packages/cli/bin/file-forge.js"), "video", ...args, "--json"]);
  const success = (...args) => {
    const result = cli(...args, "--output", root);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const manifest = JSON.parse(result.stdout);
    assert.equal(manifest.status, "succeeded");
    return manifest;
  };
  const frames = (input, filter) =>
    ffmpeg("-i", input, "-map", "0:v:0", ...(filter ? ["-vf", filter] : []), "-f", "framemd5", "-")
      .split("\n")
      .filter((line) => /^\d/.test(line))
      .map((line) => line.split(",").at(-1).trim());
  const assertMatchingForeground = (output, input, crop, referenceFilter = "null") => {
    // Compare luma so odd crop offsets and 4:2:0 chroma sampling do not skew alignment.
    const graph = [
      `[0:v]format=gray,crop=${crop}:exact=1,settb=AVTB,setpts=PTS-STARTPTS[foreground]`,
      `[1:v]${referenceFilter},format=gray,settb=AVTB,setpts=PTS-STARTPTS[reference]`,
      "[foreground][reference]psnr=shortest=1",
    ].join(";");
    const result = run(process.env.FFMPEG_PATH || "ffmpeg", [
      "-nostdin",
      "-i",
      output,
      "-i",
      input,
      "-filter_complex",
      graph,
      "-an",
      "-f",
      "null",
      "-",
    ]);
    assert.equal(result.status, 0, result.stderr);
    const score = Number(
      result.stderr.match(/average:([\d.]+|inf)/)?.[1]?.replace("inf", "Infinity"),
    );
    assert.ok(score > 32, `foreground luminance differs from the source (PSNR ${score})`);
  };
  try {
    const source = join(root, "wide.mkv");
    ffmpeg(
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=96x54:rate=10:duration=0.4,negate=enable='gte(t,0.2)'",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=0.4",
      "-c:v",
      "ffv1",
      "-pix_fmt",
      "yuv444p",
      "-c:a",
      "pcm_s16le",
      source,
    );
    const before = await readFile(source);
    const filled = success("process", source, "--blur-fill");
    const [video, cover] = filled.assets;
    assert.deepEqual([video.outputFormat, cover.outputFormat], ["mp4", "png"]);
    assert.deepEqual([video.outputWidth, video.outputHeight], [96, 96]);
    assert.equal(filled.parameters.video.padding, "blur");
    assert.equal(filled.parameters.video.ratio, "1:1");
    assert.equal(filled.parameters.video.encoding, "lossy");
    assert.deepEqual(
      [
        filled.parameters.video.codec,
        filled.parameters.video.profile,
        filled.parameters.video.pixelFormat,
      ],
      ["h264", "high", "yuv420p"],
    );
    assert.deepEqual(
      [filled.parameters.video.crf, filled.parameters.video.encoderPreset],
      [18, "slow"],
    );
    assert.equal(filled.parameters.video.crop, undefined);
    const [videoStream, audioStream] = probe(video.output);
    assert.equal(videoStream.codec_name, "h264");
    assert.equal(videoStream.profile, "High");
    assert.equal(videoStream.pix_fmt, "yuv420p");
    assert.equal(videoStream.sample_aspect_ratio, "1:1");
    assert.deepEqual(
      [
        videoStream.color_space,
        videoStream.color_primaries,
        videoStream.color_transfer,
        videoStream.color_range,
      ],
      ["bt709", "bt709", "iec61966-2-1", "tv"],
    );
    assert.equal(filled.parameters.video.coverColorSpace, "srgb");
    assert.equal(audioStream.codec_name, "pcm_s16le");
    const audioHash = (input) =>
      ffmpeg("-i", input, "-map", "0:a:0", "-c:a", "copy", "-f", "hash", "-");
    assert.equal(audioHash(source), audioHash(video.output));
    assertMatchingForeground(video.output, source, "96:54:0:21");
    const topPadding = frames(video.output, "crop=96:20:0:0:exact=1");
    assert.equal(topPadding.length, 4);
    assert.ok(new Set(topPadding).size > 1, "blur background must follow the input frames");
    const decoded = join(root, "decoded.png");
    ffmpeg(
      "-i",
      video.output,
      "-vf",
      "colorspace=all=bt709:trc=iec61966-2-1:range=pc:format=yuv444p,scale=in_color_matrix=bt709:in_range=full:out_range=full,format=rgb24",
      "-frames:v",
      "1",
      decoded,
    );
    assert.equal((await sharp(cover.output).metadata()).hasProfile, true);
    assert.deepEqual(
      await sharp(cover.output).raw().toBuffer(),
      await sharp(decoded).raw().toBuffer(),
    );

    const compressed = success("compress", source, "--blur-fill");
    const [mp4, webp] = compressed.assets;
    assert.deepEqual([mp4.outputFormat, webp.outputFormat], ["mp4", "webp"]);
    assert.deepEqual([mp4.outputWidth, mp4.outputHeight], [96, 96]);
    assert.equal(compressed.parameters.video.encoding, "lossy");
    assert.equal(compressed.parameters.video.crf, 23);
    const streams = probe(mp4.output);
    assert.deepEqual(
      streams.map((stream) => stream.codec_name),
      ["h264", "aac"],
    );
    assert.equal(streams[0].profile, "High");
    assert.equal(streams[0].pix_fmt, "yuv420p");
    assert.equal(streams[0].color_transfer, "iec61966-2-1");
    assert.equal((await sharp(webp.output).metadata()).hasProfile, true);
    assertMatchingForeground(mp4.output, source, "96:54:0:21");

    const rotated = join(root, "rotated.mp4");
    const unrotated = join(root, "unrotated.mp4");
    ffmpeg("-i", source, "-an", "-c:v", "libx264", unrotated);
    ffmpeg("-display_rotation", "90", "-i", unrotated, "-c", "copy", rotated);
    assert.ok(probe(rotated)[0].side_data_list.some(({ rotation }) => rotation === 90));
    const rotatedFill = success(
      "process",
      rotated,
      "--blur-fill",
      "--ratio",
      "4:3",
      "--width",
      "72",
    );
    assert.deepEqual(
      [rotatedFill.assets[0].outputWidth, rotatedFill.assets[0].outputHeight],
      [72, 54],
    );
    const rotatedSquare = success("process", rotated, "--blur-fill", "--audio", "remove");
    assert.deepEqual(
      [rotatedSquare.assets[0].outputWidth, rotatedSquare.assets[0].outputHeight],
      [96, 96],
    );
    assert.equal(probe(rotatedSquare.assets[0].output).length, 1);
    assertMatchingForeground(rotatedSquare.assets[0].output, rotated, "54:96:21:0");

    const anamorphic = join(root, "anamorphic.mkv");
    ffmpeg(
      "-i",
      source,
      "-an",
      "-vf",
      "setsar=2",
      "-c:v",
      "ffv1",
      "-pix_fmt",
      "yuv444p10le",
      anamorphic,
    );
    const normalized = success("process", anamorphic, "--blur-fill");
    const normalizedStream = probe(normalized.assets[0].output)[0];
    assert.deepEqual(
      [
        normalizedStream.width,
        normalizedStream.height,
        normalizedStream.sample_aspect_ratio,
        normalizedStream.pix_fmt,
      ],
      [96, 96, "1:1", "yuv420p"],
    );
    assertMatchingForeground(
      normalized.assets[0].output,
      anamorphic,
      "96:27:0:34",
      "scale=96:27,setsar=1",
    );

    const crop = success("compress", source, "--ratio", "1:1");
    assert.deepEqual([crop.assets[0].outputWidth, crop.assets[0].outputHeight], [54, 54]);
    assert.equal(crop.parameters.video.crop, "center");
    const invalid = join(root, "invalid");
    for (const args of [
      ["process", source],
      ["process", source, "--blur-fill", "--width", "96", "--height", "54"],
      ["compress", source, "--blur-fill", "--ratio", "0:1"],
    ]) {
      const rejected = cli(...args, "--output", invalid);
      assert.equal(rejected.status, 2, rejected.stdout + rejected.stderr);
    }
    assert.ok(!(await readdir(root)).includes("invalid"));
    assert.deepEqual(await readFile(source), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
