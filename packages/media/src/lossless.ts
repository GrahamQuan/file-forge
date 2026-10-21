import { Effect, FileSystem, Path, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { FfmpegConfig, MediaError, runFfmpeg } from "./index.js";

export const audioExtensions = new Set([
  ".wav",
  ".wave",
  ".aif",
  ".aiff",
  ".flac",
  ".mp3",
  ".m4a",
  ".aac",
  ".ogg",
  ".opus",
  ".wma",
]);
export type LosslessResult = {
  output: string;
  format: string;
  size: number;
  optimization: "lossless-flac" | "glb-json-compaction" | "original-retained";
  reason?: string;
  sampleRate?: number;
  channels?: number;
  bitsPerSample?: number;
};
const invalid = (detail: string) => new MediaError({ code: "INVALID_INPUT", detail });

const probeAudio = (input: string) =>
  Effect.scoped(
    Effect.gen(function* () {
      const config = yield* FfmpegConfig;
      const path = yield* Path.Path;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const executable =
        config.probeExecutable ??
        (path.isAbsolute(config.executable)
          ? path.join(path.dirname(config.executable), "ffprobe")
          : "ffprobe");
      const child = yield* spawner.spawn(
        ChildProcess.make(
          executable,
          [
            "-v",
            "error",
            "-protocol_whitelist",
            "file,pipe",
            "-show_streams",
            "-show_format",
            "-show_chapters",
            "-of",
            "json",
            input,
          ],
          {
            shell: false,
            stdin: "ignore",
            stdout: "pipe",
            stderr: "pipe",
            killSignal: "SIGTERM",
            forceKillAfter: "2 seconds",
          },
        ),
      );
      const [code, text] = yield* Effect.all(
        [
          child.exitCode,
          child.stdout.pipe(
            Stream.decodeText(),
            Stream.runFold(
              () => "",
              (a, b) => (a + b).slice(-1024 * 1024),
            ),
          ),
          child.stderr.pipe(Stream.runDrain),
        ],
        { concurrency: "unbounded" },
      );
      if (code !== 0) return yield* invalid("Cannot probe audio");
      return yield* Effect.try({
        try: () =>
          JSON.parse(text) as {
            streams: {
              codec_type?: string;
              codec_name?: string;
              sample_rate?: string;
              channels?: number;
              channel_layout?: string;
              bits_per_raw_sample?: string;
              bits_per_sample?: number;
              tags?: Record<string, string>;
            }[];
            chapters?: unknown[];
            format?: { tags?: Record<string, string> };
          },
        catch: () => invalid("Invalid audio probe output"),
      });
    }),
  ).pipe(
    Effect.mapError((error) =>
      error instanceof MediaError
        ? error
        : new MediaError({
            code: "FFPROBE_FAILED",
            detail: "FFprobe is unavailable or cannot run; configure FFPROBE_PATH",
            cause: error,
          }),
    ),
    Effect.timeoutOrElse({
      duration: "30 seconds",
      orElse: () => Effect.fail(invalid("Audio probe timed out")),
    }),
  );

/** No lossy transcode: only eligible integer PCM/FLAC is encoded; verify samples before publishing. */
export const compressAudio = (input: string, directory: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const extension = path.extname(input).toLowerCase();
    if (!audioExtensions.has(extension)) return yield* invalid("Unsupported audio extension");
    const probe = yield* probeAudio(input);
    const audio = probe.streams?.filter((s) => s.codec_type === "audio") ?? [];
    if (!audio.length) return yield* invalid("Input has no audio stream");
    const stream = audio[0]!;
    const bits = Number(stream.bits_per_raw_sample || stream.bits_per_sample || 0);
    const originalSize = Number((yield* fs.stat(input)).size);
    const details = {
      sampleRate: Number(stream.sample_rate),
      channels: stream.channels,
      ...(bits ? { bitsPerSample: bits } : {}),
    };
    const retain = (reason: string) =>
      Effect.gen(function* () {
        const output = path.join(directory, `audio${extension}`);
        yield* fs.copyFile(input, output);
        return {
          output,
          format: extension.slice(1),
          size: originalSize,
          optimization: "original-retained" as const,
          reason,
          ...details,
        };
      });
    if (
      probe.streams.length !== 1 ||
      probe.chapters?.length ||
      ![16, 24].includes(bits) ||
      !["pcm_s16le", "pcm_s16be", "pcm_s24le", "pcm_s24be", "flac"].includes(
        stream.codec_name ?? "",
      )
    )
      return yield* retain(
        "Encoding, precision or additional streams require retaining the original",
      );
    const candidate = path.join(directory, "candidate.flac");
    yield* runFfmpeg([
      "-v",
      "error",
      "-n",
      "-protocol_whitelist",
      "file,pipe",
      "-i",
      input,
      "-map",
      "0:a:0",
      "-map_metadata",
      "0",
      "-c:a",
      "flac",
      "-compression_level",
      "12",
      "-sample_fmt",
      bits === 16 ? "s16" : "s32",
      candidate,
    ]);
    const result = yield* probeAudio(candidate);
    const outputStream = result.streams[0]!;
    const hash = (file: string) =>
      runFfmpeg([
        "-v",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-i",
        file,
        "-map",
        "0:a:0",
        "-c:a",
        "pcm_s32le",
        "-f",
        "hash",
        "-hash",
        "sha256",
        "-",
      ]).pipe(Effect.map((text) => text.trim()));
    const hashes = yield* Effect.all([hash(input), hash(candidate)], { concurrency: 2 });
    if (
      hashes[0] !== hashes[1] ||
      !/^SHA256=[a-f0-9]{64}$/.test(hashes[0]!) ||
      stream.sample_rate !== outputStream.sample_rate ||
      stream.channels !== outputStream.channels ||
      (stream.channel_layout &&
        outputStream.channel_layout &&
        stream.channel_layout !== outputStream.channel_layout)
    )
      return yield* new MediaError({
        code: "AUDIO_VERIFICATION_FAILED",
        detail: "Lossless audio verification failed",
      });
    const tags = (probe: {
      format?: { tags?: Record<string, string> };
      streams: { tags?: Record<string, string> }[];
    }) =>
      Object.fromEntries(
        Object.entries({ ...probe.format?.tags, ...probe.streams?.[0]?.tags }).map(
          ([key, value]) => [key.toLowerCase(), value],
        ),
      );
    const before = tags(probe),
      after = tags(result);
    if (Object.entries(before).some(([key, value]) => key !== "encoder" && after[key] !== value))
      return yield* retain("Metadata cannot be preserved by the lossless encoding");
    const size = Number((yield* fs.stat(candidate)).size);
    if (size >= originalSize) return yield* retain("Lossless encoding is not smaller");
    return {
      output: candidate,
      format: "flac",
      size,
      optimization: "lossless-flac" as const,
      ...details,
    };
  });

/** Compact JSON tokens only. Never parse/re-serialize numbers, rewrite BIN data or add decoder extensions. */
export const compressGlb = (input: string, directory: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const source = Buffer.from(yield* fs.readFile(input));
    const optimized = yield* Effect.try({
      try: () => {
        if (
          source.length < 20 ||
          source.readUInt32LE(0) !== 0x46546c67 ||
          source.readUInt32LE(4) !== 2 ||
          source.readUInt32LE(8) !== source.length
        )
          throw new Error("Invalid GLB header");
        const chunks: Buffer[] = [];
        let cursor = 12,
          index = 0;
        while (cursor < source.length) {
          if (cursor + 8 > source.length) throw new Error("Truncated chunk");
          const length = source.readUInt32LE(cursor),
            type = source.readUInt32LE(cursor + 4);
          const end = cursor + 8 + length;
          if (
            length % 4 ||
            end > source.length ||
            (index === 0 && type !== 0x4e4f534a) ||
            (index > 0 && type === 0x4e4f534a)
          )
            throw new Error("Invalid chunk");
          if (index === 0) {
            const text = new TextDecoder("utf-8", { fatal: true }).decode(
              source.subarray(cursor + 8, end),
            );
            const json = JSON.parse(text);
            if (json?.asset?.version !== "2.0") throw new Error("Unsupported glTF version");
            const visit = (value: unknown): void => {
              if (!value || typeof value !== "object") return;
              for (const [key, child] of Object.entries(value)) {
                if (key === "uri" && typeof child === "string" && !child.startsWith("data:"))
                  throw new Error("External GLB resources are unsupported");
                visit(child);
              }
            };
            visit(json);
            let quoted = false,
              escaped = false,
              compact = "";
            for (const char of text) {
              if (quoted || !/[\t\n\r ]/.test(char)) compact += char;
              if (quoted) {
                if (escaped) escaped = false;
                else if (char === "\\") escaped = true;
                else if (char === '"') quoted = false;
              } else if (char === '"') quoted = true;
            }
            const payload = Buffer.from(compact);
            const padded = Buffer.alloc(Math.ceil(payload.length / 4) * 4, 0x20);
            payload.copy(padded);
            const header = Buffer.alloc(8);
            header.writeUInt32LE(padded.length);
            header.writeUInt32LE(type, 4);
            chunks.push(header, padded);
          } else chunks.push(source.subarray(cursor, end));
          cursor = end;
          index++;
        }
        const header = Buffer.from(source.subarray(0, 12));
        header.writeUInt32LE(12 + chunks.reduce((sum, chunk) => sum + chunk.length, 0), 8);
        return Buffer.concat([header, ...chunks]);
      },
      catch: () =>
        invalid("Invalid or externally referenced GLB; select a self-contained GLB 2.0 file"),
    });
    const smaller = optimized.length < source.length;
    const output = path.join(directory, "model.glb");
    yield* fs.writeFile(output, smaller ? optimized : source, { flag: "wx" });
    return {
      output,
      format: "glb",
      size: smaller ? optimized.length : source.length,
      optimization: smaller ? "glb-json-compaction" : "original-retained",
      ...(smaller ? {} : { reason: "GLB JSON is already compact; binary data is preserved" }),
    } satisfies LosslessResult;
  });
