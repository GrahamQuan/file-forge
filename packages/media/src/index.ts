import { Context, Data, Effect, FileSystem, Layer, Path, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import sharp, { type Metadata, type OutputInfo } from "sharp";

export class MediaError extends Data.TaggedError("MediaError")<{
  readonly code:
    | "INVALID_INPUT"
    | "IMAGE_FAILED"
    | "FFMPEG_FAILED"
    | "FFMPEG_TIMEOUT"
    | "FFPROBE_FAILED"
    | "AUDIO_VERIFICATION_FAILED";
  readonly detail: string;
  readonly cause?: unknown;
}> {}

const dimension = Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0));
export const CompressionPresetSchema = Schema.Literals(["standard", "clarity"]);
export const ImageOptionsSchema = Schema.Struct({
  preset: Schema.optional(CompressionPresetSchema),
  width: Schema.optional(dimension),
  height: Schema.optional(dimension),
  quality: Schema.optional(
    Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 100 })),
  ),
  format: Schema.optional(Schema.Literals(["webp", "jpeg", "png", "avif"])),
});
export type ImageOptions = typeof ImageOptionsSchema.Type;
export const imageQuality = (options: ImageOptions) =>
  options.quality ?? (options.preset === "clarity" ? 90 : 80);
export const videoEncoding = (options: { preset?: "standard" | "clarity" }) =>
  options.preset === "clarity"
    ? { crf: 18, encoderPreset: "slow" as const }
    : { crf: 23, encoderPreset: "medium" as const };
export const validateImageOptions = (value: unknown) =>
  Schema.decodeUnknownEffect(ImageOptionsSchema)(value).pipe(
    Effect.mapError(
      () => new MediaError({ code: "INVALID_INPUT", detail: "Invalid image options" }),
    ),
  );

// Internal workflow policy; CLI/MCP image options retain their existing defaults.
export type ImageEncodingPolicy = "standard" | "lossless-webp";

export class ImageEngine extends Context.Service<
  ImageEngine,
  {
    readonly inspect: (input: string) => Effect.Effect<Metadata, MediaError>;
    readonly process: (
      input: string,
      output: string,
      options: ImageOptions,
      encoding?: ImageEncodingPolicy,
    ) => Effect.Effect<OutputInfo, MediaError>;
  }
>()("@file-forge/media/ImageEngine") {}

// Sharp has no reliable hard cancellation API. Await its active operation before releasing files.
const sharpEffect = <A>(run: () => Promise<A>) =>
  Effect.uninterruptible(
    Effect.tryPromise({
      try: run,
      catch: (cause) =>
        new MediaError({
          code: "IMAGE_FAILED",
          detail: "Image decoding or processing failed",
          cause,
        }),
    }),
  );
export const ImageEngineLive = Layer.succeed(ImageEngine, {
  inspect: (input) => sharpEffect(() => sharp(input).metadata()),
  process: (input, output, options, encoding = "standard") =>
    sharpEffect(() => {
      let image = sharp(input).rotate();
      if (options.width !== undefined || options.height !== undefined) {
        image = image.resize({
          width: options.width,
          height: options.height,
          fit: "inside",
          withoutEnlargement: true,
        });
      }
      if (encoding === "lossless-webp")
        return image.webp({ lossless: true, effort: 6 }).toFile(output);
      if (options.preset === "clarity" && (options.format ?? "webp") === "webp")
        return image
          .webp({ quality: imageQuality(options), effort: 6, smartSubsample: true })
          .toFile(output);
      return image
        .toFormat(options.format ?? "webp", { quality: imageQuality(options) })
        .toFile(output);
    }),
});
export const inspectImage = (input: string) =>
  Effect.flatMap(ImageEngine, (engine) => engine.inspect(input));
export const processImage = (
  input: string,
  output: string,
  options: ImageOptions = {},
  encoding: ImageEncodingPolicy = "standard",
) =>
  Effect.gen(function* () {
    const validated = yield* validateImageOptions(options);
    if (
      encoding === "lossless-webp" &&
      (validated.quality !== undefined ||
        (validated.format !== undefined && validated.format !== "webp"))
    )
      return yield* new MediaError({
        code: "INVALID_INPUT",
        detail: "Lossless WebP processing cannot use a different format or lossy quality setting",
      });
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const source = yield* fs.realPath(input);
    yield* fs.makeDirectory(path.dirname(output), { recursive: true });
    const parent = yield* fs.realPath(path.dirname(output));
    const destination = path.join(parent, path.basename(output));
    if (source === destination || (yield* fs.exists(destination))) {
      return yield* new MediaError({
        code: "INVALID_INPUT",
        detail: "Output already exists or aliases the source",
      });
    }
    // Publish through an exclusive hard link so a concurrent writer cannot be overwritten.
    return yield* Effect.scoped(
      Effect.gen(function* () {
        const staging = yield* fs.makeTempDirectoryScoped({
          directory: parent,
          prefix: ".file-forge-",
        });
        const temporary = path.join(staging, "image");
        const engine = yield* ImageEngine;
        const result = yield* engine.process(source, temporary, validated, encoding);
        yield* engine.inspect(temporary);
        yield* fs.link(temporary, destination);
        return result;
      }),
    );
  }).pipe(
    Effect.mapError((error) =>
      error instanceof MediaError
        ? error
        : new MediaError({
            code: "IMAGE_FAILED",
            detail: "Image filesystem operation failed",
            cause: error,
          }),
    ),
  );

export class FfmpegConfig extends Context.Service<
  FfmpegConfig,
  { readonly executable: string; readonly probeExecutable?: string }
>()("@file-forge/media/FfmpegConfig") {}
export const ffmpegLayer = (executable: string, probeExecutable?: string) =>
  Layer.succeed(FfmpegConfig, { executable, probeExecutable });
/** Internal trusted primitive. CLI/MCP must expose constrained operations, never raw arguments. */
export const runFfmpeg = (args: readonly string[], options: { timeoutMs?: number } = {}) =>
  Effect.gen(function* () {
    const timeoutMs = options.timeoutMs ?? 300_000;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
      return yield* new MediaError({ code: "INVALID_INPUT", detail: "Invalid timeout" });
    const config = yield* FfmpegConfig;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    return yield* Effect.scoped(
      Effect.gen(function* () {
        const child = yield* spawner.spawn(
          ChildProcess.make(config.executable, ["-nostdin", "-hide_banner", ...args], {
            shell: false,
            stdin: "ignore",
            stdout: "pipe",
            stderr: "pipe",
            killSignal: "SIGTERM",
            forceKillAfter: "2 seconds",
          }),
        );
        const [code, output] = yield* Effect.all(
          [
            child.exitCode,
            child.all.pipe(
              Stream.decodeText(),
              Stream.runFold(
                () => "",
                (tail, chunk) => (tail + chunk).slice(-64 * 1024),
              ),
            ),
          ],
          { concurrency: "unbounded" },
        );
        if (code !== 0)
          return yield* new MediaError({
            code: "FFMPEG_FAILED",
            detail: `FFmpeg exited with code ${code}: ${output}`,
          });
        return output;
      }).pipe(
        Effect.timeoutOrElse({
          duration: timeoutMs,
          orElse: () =>
            Effect.fail(new MediaError({ code: "FFMPEG_TIMEOUT", detail: "FFmpeg timed out" })),
        }),
      ),
    );
  }).pipe(
    Effect.mapError((error) =>
      error instanceof MediaError
        ? error
        : new MediaError({
            code: "FFMPEG_FAILED",
            detail: "FFmpeg process operation failed",
            cause: error,
          }),
    ),
  );
export const getFfmpegStatus = () =>
  runFfmpeg(["-version"], { timeoutMs: 5_000 }).pipe(
    Effect.map((output) => ({
      available: true,
      detail: output.split("\n")[0] ?? "FFmpeg available",
    })),
    Effect.catch((error) => Effect.succeed({ available: false, detail: error.detail })),
  );

export {
  FaviconEngine,
  FaviconEngineLive,
  FaviconError,
  FaviconSizeSchema,
  renderFavicons,
  validateFaviconSize,
  type FaviconBundle,
} from "./favicon.js";

// A missing axis is automatic; omitting both axes leaves the original size unchanged.
export const CompressionOptionsSchema = Schema.Struct({
  preset: Schema.optional(CompressionPresetSchema),
  width: Schema.optional(dimension),
  height: Schema.optional(dimension),
  quality: ImageOptionsSchema.fields.quality,
});
export type CompressionOptions = typeof CompressionOptionsSchema.Type;
export const validateCompressionOptions = (input: unknown) =>
  Schema.decodeUnknownEffect(CompressionOptionsSchema)(input).pipe(
    Effect.mapError(
      () =>
        new MediaError({ code: "INVALID_INPUT", detail: "Dimensions must be positive integers" }),
    ),
  );

/** Resize and encode, then pass the first decoded output frame through the Sharp pipeline. */
export const compressVideo = (input: string, directory: string, options: CompressionOptions) =>
  Effect.scoped(
    Effect.gen(function* () {
      const validated = yield* validateCompressionOptions(options);
      if (
        (validated.width !== undefined && validated.width < 2) ||
        (validated.height !== undefined && validated.height < 2)
      )
        return yield* new MediaError({
          code: "INVALID_INPUT",
          detail: "Video dimensions must be at least 2 pixels",
        });
      const encoding = videoEncoding(validated);
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const source = yield* fs.realPath(input);
      const staging = yield* fs.makeTempDirectoryScoped({ directory, prefix: ".video-" });
      const temporary = path.join(staging, "video.mp4");
      const frame = path.join(staging, "frame.png");
      const cover = path.join(staging, "cover.webp");
      // Keep aspect ratio, never enlarge, and round down to even H.264 dimensions.
      const ratio = `min(1,min(${validated.width === undefined ? "1" : `${validated.width}/(iw*sar)`},${validated.height === undefined ? "1" : `${validated.height}/ih`}))`;
      const scale = `scale=w='trunc(iw*sar*${ratio}/2)*2':h='trunc(ih*${ratio}/2)*2',setsar=1`;
      yield* runFfmpeg([
        "-n",
        "-i",
        source,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        ...(validated.width !== undefined || validated.height !== undefined ? ["-vf", scale] : []),
        "-c:v",
        "libx264",
        "-crf",
        String(encoding.crf),
        "-preset",
        encoding.encoderPreset,
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        temporary,
      ]);
      yield* runFfmpeg(["-n", "-i", temporary, "-map", "0:v:0", "-frames:v", "1", frame]);
      const result = yield* processImage(frame, cover, {
        quality: validated.quality,
        preset: validated.preset,
        format: "webp",
      });
      const output = path.join(directory, "video.mp4");
      const coverOutput = path.join(directory, "video.webp");
      yield* fs.link(temporary, output);
      yield* fs.link(cover, coverOutput);
      return {
        output,
        cover: coverOutput,
        width: result.width,
        height: result.height,
        size: Number((yield* fs.stat(output)).size),
        coverSize: result.size,
      };
    }),
  );

export { compressAudio, compressGlb, audioExtensions, type LosslessResult } from "./lossless.js";

export {
  openPosterRenderer,
  posterLayer,
  PosterConfig,
  PosterError,
  PosterOptionsSchema,
  validatePosterOptions,
  posterViews,
  type PosterView,
  type PosterOptions,
} from "./posters.js";
