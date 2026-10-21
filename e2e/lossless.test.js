import { test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ffmpeg, makeGlb, glbContent } from "./lossless-fixtures.js";

test("audio and GLB CLI/folder deliveries preserve quality and report unchanged outcomes", async () => {
  const root = await mkdtemp(join(tmpdir(), "file-forge-lossless-"));
  const cli = (...args) =>
    spawnSync(process.execPath, [resolve("packages/cli/bin/file-forge.js"), ...args, "--json"], {
      encoding: "utf8",
      timeout: 30000,
      env: { ...process.env, FILE_FORGE_CONFIG_DIR: join(root, "config") },
    });
  const run = (...args) => {
    const result = cli(...args);
    assert.equal(result.status, 0, result.stderr + result.stdout);
    return JSON.parse(result.stdout);
  };
  const samples = (file) =>
    ffmpeg("-i", file, "-map", "0:a:0", "-c:a", "pcm_s32le", "-f", "hash", "-hash", "sha256", "-");
  try {
    const input = join(root, "Media Assets");
    await mkdir(input);
    const output = join(root, "out");
    for (const codec of ["pcm_s16le", "pcm_s24le", "pcm_f32le"]) {
      const source = join(input, `${codec}.wav`);
      ffmpeg(
        "-f",
        "lavfi",
        "-i",
        codec === "pcm_s24le"
          ? "anoisesrc=sample_rate=48000:duration=1:seed=42:amplitude=0.1"
          : "sine=frequency=440:sample_rate=48000:duration=1",
        "-ac",
        "2",
        "-c:a",
        codec,
        "-metadata",
        "title=Keep this title",
        source,
      );
      const original = await readFile(source);
      const result = run("audio", "compress", source, "--output", output);
      const asset = result.assets[0];
      assert.equal(result.schemaVersion, 4);
      assert.equal(asset.lossless, true);
      assert.equal(asset.sampleRate, 48000);
      assert.equal(asset.channels, 2);
      assert.equal(samples(source), samples(asset.output));
      assert.ok(asset.outputSize <= original.length);
      if (codec === "pcm_f32le") {
        assert.equal(asset.optimization, "original-retained");
        assert.deepEqual(await readFile(asset.output), original);
      } else {
        assert.equal(asset.optimization, "lossless-flac");
        assert.equal(asset.outputFormat, "flac");
      }
      assert.deepEqual(await readFile(source), original);
      const exported = run(
        "manifest",
        "export",
        "--manifest",
        join(result.directory, "manifest.json"),
        "--output",
        output,
      );
      assert.deepEqual(exported.assets, result.assets);
    }
    const tiny = join(root, "tiny.wav");
    ffmpeg(
      "-f",
      "lavfi",
      "-i",
      "anullsrc=r=48000:cl=mono",
      "-t",
      "0.01",
      "-c:a",
      "pcm_s16le",
      tiny,
    );
    const unchanged = run("audio", "compress", tiny, "--output", output).assets[0];
    assert.equal(unchanged.optimization, "original-retained");
    assert.deepEqual(await readFile(unchanged.output), await readFile(tiny));
    const missingProbe = spawnSync(
      process.execPath,
      [
        resolve("packages/cli/bin/file-forge.js"),
        "audio",
        "compress",
        tiny,
        "--output",
        output,
        "--json",
      ],
      {
        encoding: "utf8",
        timeout: 30000,
        env: {
          ...process.env,
          FFPROBE_PATH: join(root, "missing-ffprobe"),
          FILE_FORGE_CONFIG_DIR: join(root, "config"),
        },
      },
    );
    assert.notEqual(missingProbe.status, 0);
    assert.equal(JSON.parse(missingProbe.stdout).error.code, "FFPROBE_FAILED");
    const mp3 = join(input, "Song.mp3");
    ffmpeg("-f", "lavfi", "-i", "sine=duration=0.3", "-c:a", "libmp3lame", mp3);
    const preserved = run("audio", "compress", mp3, "--output", output).assets[0];
    assert.equal(preserved.optimization, "original-retained");
    assert.deepEqual(await readFile(preserved.output), await readFile(mp3));
    const model = join(input, "Scene.glb"),
      original = await makeGlb();
    await writeFile(model, original);
    const modelResult = run("model", "compress", model, "--output", output);
    const optimized = await readFile(modelResult.assets[0].output);
    assert.ok(optimized.length < original.length);
    assert.deepEqual(glbContent(optimized), glbContent(original));
    assert.deepEqual(await readFile(model), original);
    const repeated = run("model", "compress", modelResult.assets[0].output, "--output", output)
      .assets[0];
    assert.equal(repeated.optimization, "original-retained");
    assert.deepEqual(await readFile(repeated.output), optimized);
    const folder = run("folder", "compress", input, "--width", "50", "--output", output);
    assert.equal(folder.schemaVersion, 4);
    assert.equal(folder.assets.length, 5);
    assert.ok(folder.assets.every((a) => a.lossless && a.outputSize <= a.size));
    const malformed = join(root, "bad.glb");
    await writeFile(malformed, original.subarray(0, 30));
    assert.notEqual(cli("model", "compress", malformed, "--output", output).status, 0);
    await writeFile(
      malformed,
      await makeGlb({ buffers: [{ uri: "../outside.bin", byteLength: 12 }] }),
    );
    assert.notEqual(cli("model", "compress", malformed, "--output", output).status, 0);
    const badAudio = join(root, "bad.wav");
    await writeFile(badAudio, "not audio");
    assert.notEqual(cli("audio", "compress", badAudio, "--output", output).status, 0);
    assert.equal(cli("audio", "compress", mp3, "--quality", "80", "--output", output).status, 2);
    await writeFile(join(input, "pcm_s16le.flac"), await readFile(preserved.output));
    assert.equal(cli("folder", "compress", input, "--output", join(root, "collision")).status, 2);
    assert.equal((await readdir(root)).includes("collision"), false);
    for (const delivery of await readdir(output))
      assert.ok(
        !(await readdir(join(output, delivery))).some(
          (n) => n.startsWith(".lossless-") || n.startsWith(".folder-"),
        ),
      );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
