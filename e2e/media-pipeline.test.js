import { Effect, Layer } from "effect";
import { NodeServices } from "@effect/platform-node";
import { ImageEngineLive, ffmpegLayer } from "@file-forge/media";
import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { processImage, inspectImage, runFfmpeg } from "@file-forge/media";

const live = Layer.mergeAll(
  NodeServices.layer,
  ImageEngineLive,
  ffmpegLayer(process.env.FFMPEG_PATH || "ffmpeg"),
);
const run = (effect) => Effect.runPromise(effect.pipe(Effect.provide(live)));

test("Sharp → FFmpeg media pipeline", async () => {
  // Non-UI E2E: real files → Sharp image → FFmpeg video composition → extracted audio.
  const directory = await mkdtemp(join(tmpdir(), "file-forge-e2e-"));
  try {
    const source = join(directory, "input.svg");
    const image = join(directory, "image.webp");
    const music = join(directory, "music.wav");
    const video = join(directory, "video.mp4");
    const audio = join(directory, "audio.wav");
    await writeFile(
      source,
      '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" fill="#285fc2"/></svg>',
    );
    await run(processImage(source, image, { width: 160 }));
    const metadata = await run(inspectImage(image));
    assert.equal(metadata.width, 160);
    assert.equal(metadata.height, 120);
    assert.equal(metadata.format, "webp");
    await run(runFfmpeg(["-n", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", music]));
    await run(
      runFfmpeg([
        "-n",
        "-loop",
        "1",
        "-i",
        image,
        "-i",
        music,
        "-t",
        "1",
        "-c:v",
        "mpeg4",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-shortest",
        video,
      ]),
    );
    await run(runFfmpeg(["-n", "-i", video, "-vn", "-c:a", "pcm_s16le", audio]));
    await run(runFfmpeg(["-v", "error", "-i", video, "-f", "null", "-"]));
    await run(runFfmpeg(["-v", "error", "-i", audio, "-f", "null", "-"]));
    for (const file of [image, music, video, audio]) {
      assert.ok((await stat(file)).size > 0);
    }
    console.log("E2E passed: Sharp image + FFmpeg music/video/audio");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
