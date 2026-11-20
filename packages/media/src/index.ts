import { Context, Data, Effect, FileSystem, Layer, Path, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import sharp, { type Metadata, type OutputInfo, type Sharp } from "sharp";
import { videoBlurPaddingFilter } from "./video-padding.js";

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
const aspectRatio = Schema.String.check(Schema.isPattern(/^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/));
const ratioValue = (ratio: string) => {
  const [width, height] = ratio.split(":").map(Number) as [number, number];
  return { width, height, aspect: width / height };
};
/** Shared semantic validation, also run before CLI/MCP submission creates any output. */
export const validateAspectRatioOptions = (options: {
  readonly ratio?: string;
  readonly width?: number;
  readonly height?: number;
}) =>
  Effect.gen(function* () {
    if (options.ratio === undefined) return;
    const { width, height, aspect } = ratioValue(options.ratio);
    if (![width, height, aspect].every((value) => Number.isFinite(value) && value > 0))
      return yield* new MediaError({ code: "INVALID_INPUT", detail: "Ratio must be positive W:H" });
    if (
      options.width !== undefined &&
      options.height !== undefined &&
      Math.abs(options.width / options.height / aspect - 1) > 1e-12
    )
      return yield* new MediaError({
        code: "INVALID_INPUT",
        detail: "Explicit width and height must match the requested ratio",
      });
  });
export const CompressionPresetSchema = Schema.Literals(["standard", "clarity"]);
export const ImageOptionsSchema = Schema.Struct({
  preset: Schema.optional(CompressionPresetSchema),
  width: Schema.optional(dimension),
  height: Schema.optional(dimension),
  ratio: Schema.optional(aspectRatio),
  padding: Schema.optional(Schema.Literal("blur")),
  quality: Schema.optional(
    Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 100 })),
  ),
  format: Schema.optional(Schema.Literals(["webp", "jpeg", "png", "avif"])),
});
export type ImageOptions = typeof ImageOptionsSchema.Type;
const defaultBlurFillRatio = "1:1";
export const imageOutputSettings = (options: ImageOptions) => {
  const lossless =
    options.padding === "blur" && options.preset === undefined && options.quality === undefined;
  return { format: options.format ?? (lossless ? "png" : "webp"), lossless };
};
export const validateImageProcessingOptions = (options: ImageOptions) =>
  Effect.gen(function* () {
    yield* validateAspectRatioOptions({
      ...options,
      ratio: options.ratio ?? (options.padding === "blur" ? defaultBlurFillRatio : undefined),
    });
    const { format, lossless } = imageOutputSettings(options);
    if (lossless && format === "jpeg")
      return yield* new MediaError({
        code: "INVALID_INPUT",
        detail: "JPEG blur fill requires an explicit compression quality or preset",
      });
  });
export const imageQuality = (options: ImageOptions) =>
  options.quality ?? (options.preset === "clarity" ? 90 : 80);
export const videoEncoding = (options: { preset?: "standard" | "clarity" }, fillOnly = false) =>
  fillOnly || options.preset === "clarity"
    ? { crf: 18, encoderPreset: "slow" as const }
    : { crf: 23, encoderPreset: "medium" as const };
export const validateImageOptions = (value: unknown) =>
  Schema.decodeUnknownEffect(ImageOptionsSchema)(value).pipe(
    Effect.mapError(
      () => new MediaError({ code: "INVALID_INPUT", detail: "Invalid image options" }),
    ),
    Effect.map((options) =>
      options.padding === "blur" && options.ratio === undefined
        ? { ...options, ratio: defaultBlurFillRatio }
        : options,
    ),
    Effect.tap(validateImageProcessingOptions),
  );

// Internal workflow policy; CLI/MCP image options retain their existing defaults.
export type ImageEncodingPolicy = "standard" | "lossless-webp" | "lossless-png";

export class ImageEngine extends Context.Service<
  ImageEngine,
  {
    readonly inspect: (input: string) => Effect.Effect<Metadata, MediaError>;
    readonly process: (
      input: string,
      output: string,
      options: ImageOptions,
      encoding?: ImageEncodingPolicy,
      profile?: "srgb",
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

const makeBlurFilledImage = async (source: Sharp, options: ImageOptions) => {
  const { autoOrient } = await source.metadata();
  const { aspect } = ratioValue(options.ratio ?? defaultBlurFillRatio);
  const width = Math.round(
    Math.min(
      Math.max(autoOrient.width, autoOrient.height * aspect),
      options.width ?? Infinity,
      (options.height ?? Infinity) * aspect,
    ),
  );
  const height = Math.round(
    Math.min(
      Math.max(autoOrient.height, autoOrient.width / aspect),
      options.height ?? Infinity,
      (options.width ?? Infinity) / aspect,
    ),
  );
  // Bound the generated canvas as well as the decoded source (Sharp's default pixel limit).
  if (width < 1 || height < 1 || !(width * height <= 268_402_689))
    throw new Error("Blur fill produces an invalid canvas size");

  if (width === autoOrient.width && height === autoOrient.height) return source;

  const foreground = source.clone();
  if (autoOrient.width > width || autoOrient.height > height)
    foreground.resize({ width, height, fit: "inside", withoutEnlargement: true });

  const { data, info } = await foreground.png().toBuffer({ resolveWithObject: true });
  if (info.width === width && info.height === height) return sharp(data);
  const sigma = Math.max(1, Math.min(width, height) * 0.04);
  return source
    .resize({ width, height, fit: "cover" })
    .blur(sigma)
    .composite([{ input: data, gravity: "centre" }]);
};

export const ImageEngineLive = Layer.succeed(ImageEngine, {
  inspect: (input) => sharpEffect(() => sharp(input).metadata()),
  process: (input, output, options, encoding = "standard", profile) =>
    sharpEffect(async () => {
      let image = sharp(input).rotate();
      if (options.padding === "blur") {
        image = await makeBlurFilledImage(image, options);
      } else if (options.ratio !== undefined) {
        // Crop in displayed coordinates after EXIF orientation, before any resizing.
        const { autoOrient } = await image.metadata();
        const aspect = ratioValue(options.ratio).aspect;
        // Preserve integer boundaries despite floating-point noise (e.g. 100 * 0.58).
        const width = Math.floor(Math.min(autoOrient.width, autoOrient.height * aspect) + 1e-9);
        const height = Math.floor(Math.min(autoOrient.height, autoOrient.width / aspect) + 1e-9);
        if (width < 1 || height < 1) throw new Error("Ratio produces an empty image crop");
        image = image.extract({
          left: Math.floor((autoOrient.width - width) / 2),
          top: Math.floor((autoOrient.height - height) / 2),
          width,
          height,
        });
      }
      if (
        options.padding !== "blur" &&
        (options.width !== undefined || options.height !== undefined)
      ) {
        image = image.resize({
          width: options.width,
          height: options.height,
          fit: "inside",
          withoutEnlargement: true,
        });
      }
      if (profile !== undefined) image = image.withIccProfile(profile);
      if (encoding === "lossless-webp")
        return image.webp({ lossless: true, effort: 6 }).toFile(output);
      if (encoding === "lossless-png") return image.png().toFile(output);
      const { format, lossless } = imageOutputSettings(options);
      if (lossless) {
        if (format === "webp") return image.webp({ lossless: true }).toFile(output);
        if (format === "avif") return image.avif({ lossless: true }).toFile(output);
        return image.png().toFile(output);
      }
      if (options.preset === "clarity" && format === "webp")
        return image
          .webp({ quality: imageQuality(options), effort: 6, smartSubsample: true })
          .toFile(output);
      return image.toFormat(format, { quality: imageQuality(options) }).toFile(output);
    }),
});
export const inspectImage = (input: string) =>
  Effect.flatMap(ImageEngine, (engine) => engine.inspect(input));
export const processImage = (
  input: string,
  output: string,
  options: ImageOptions = {},
  encoding: ImageEncodingPolicy = "standard",
  profile?: "srgb",
) =>
  Effect.gen(function* () {
    const validated = yield* validateImageOptions(options);
    if (
      encoding !== "standard" &&
      (validated.quality !== undefined ||
        (validated.format !== undefined && encoding !== `lossless-${validated.format}`))
    )
      return yield* new MediaError({
        code: "INVALID_INPUT",
        detail: "Lossless image processing cannot use a different format or lossy quality setting",
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
        const result = yield* engine.process(source, temporary, validated, encoding, profile);
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
  audio: Schema.optional(Schema.Literals(["keep", "remove"])),
  preset: Schema.optional(CompressionPresetSchema),
  width: Schema.optional(dimension),
  height: Schema.optional(dimension),
  ratio: Schema.optional(aspectRatio),
  quality: ImageOptionsSchema.fields.quality,
});
export type CompressionOptions = typeof CompressionOptionsSchema.Type;
export const validateCompressionOptions = (input: unknown) =>
  Schema.decodeUnknownEffect(CompressionOptionsSchema)(input).pipe(
    Effect.mapError(
      () => new MediaError({ code: "INVALID_INPUT", detail: "Invalid compression options" }),
    ),
    Effect.tap(validateAspectRatioOptions),
  );

export const VideoOptionsSchema = Schema.Struct({
  ...CompressionOptionsSchema.fields,
  padding: ImageOptionsSchema.fields.padding,
});
export const VideoFillOptionsSchema = Schema.Struct({
  padding: Schema.Literal("blur"),
  audio: CompressionOptionsSchema.fields.audio,
  width: CompressionOptionsSchema.fields.width,
  height: CompressionOptionsSchema.fields.height,
  ratio: CompressionOptionsSchema.fields.ratio,
});
export type VideoOptions = typeof VideoOptionsSchema.Type;
export const validateVideoOptions = (input: unknown, fillOnly = false) =>
  Effect.gen(function* () {
    const options = yield* Schema.decodeUnknownEffect(VideoOptionsSchema)(input).pipe(
      Effect.mapError(
        () => new MediaError({ code: "INVALID_INPUT", detail: "Invalid video options" }),
      ),
    );
    if (
      fillOnly &&
      (options.padding !== "blur" || options.preset !== undefined || options.quality !== undefined)
    )
      return yield* new MediaError({
        code: "INVALID_INPUT",
        detail: "Video process requires blur fill and uses fixed encoding settings",
      });
    if (
      (options.width !== undefined && options.width < 2) ||
      (options.height !== undefined && options.height < 2)
    )
      return yield* new MediaError({
        code: "INVALID_INPUT",
        detail: "Video dimensions must be at least 2 pixels",
      });
    const ratio = options.ratio ?? (options.padding === "blur" ? defaultBlurFillRatio : undefined);
    yield* validateAspectRatioOptions({ ...options, ratio });
    return { ...options, ratio };
  });

/** Resize and encode, then pass the first decoded output frame through the Sharp pipeline. */
export const processVideo = (
  input: string,
  directory: string,
  options: VideoOptions,
  fillOnly: boolean,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const validated = yield* validateVideoOptions(options, fillOnly);
      const encoding = videoEncoding(validated, fillOnly);
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const source = yield* fs.realPath(input);
      const staging = yield* fs.makeTempDirectoryScoped({ directory, prefix: ".video-" });
      const format = "mp4";
      const coverFormat = fillOnly ? "png" : "webp";
      const temporary = path.join(staging, `video.${format}`);
      const frame = path.join(staging, "frame.png");
      const cover = path.join(staging, `cover.${coverFormat}`);
      // Keep aspect ratio, never enlarge, and round down to even H.264 dimensions.
      const ratio = `min(1,min(${validated.width === undefined ? "1" : `${validated.width}/(iw*sar)`},${validated.height === undefined ? "1" : `${validated.height}/ih`}))`;
      const scale = `scale=w='trunc(iw*sar*${ratio}/2)*2':h='trunc(ih*${ratio}/2)*2',setsar=1`;
      let filter =
        validated.width !== undefined || validated.height !== undefined ? scale : undefined;
      const padding =
        validated.padding === "blur" && validated.ratio !== undefined
          ? yield* videoBlurPaddingFilter(source, ratioValue(validated.ratio).aspect, validated)
          : undefined;
      if (padding === undefined && validated.ratio !== undefined) {
        const aspect = ratioValue(validated.ratio).aspect;
        const crop = `crop=w='floor(min(iw,ih*${aspect}/sar)+1e-9)':h='floor(min(ih,iw*sar/${aspect})+1e-9)':x='floor((iw-ow)/2)':y='floor((ih-oh)/2)':exact=1`;
        // Normalize non-square pixels by reducing an axis, never by enlarging it.
        const width = "iw*min(sar,1)";
        const height = "ih*min(1/sar,1)";
        const factor = `min(1,min(${validated.width === undefined ? "1" : `${validated.width}/(${width})`},${validated.height === undefined ? "1" : `${validated.height}/(${height})`}))`;
        // Never pass zero (FFmpeg's "use input size" sentinel). A sub-2 result fails H.264.
        filter = `${crop},scale=w='max(1,trunc(${width}*${factor}/2+1e-9)*2)':h='max(1,trunc(${height}*${factor}/2+1e-9)*2)',setsar=1`;
      }
      yield* runFfmpeg([
        "-n",
        ...(padding === undefined ? [] : ["-protocol_whitelist", "file,pipe"]),
        "-i",
        source,
        ...(padding === undefined ? [] : ["-filter_complex", padding.graph]),
        "-map",
        padding === undefined ? "0:v:0" : "[v]",
        ...(validated.audio === "remove" ? [] : ["-map", "0:a:0?"]),
        ...(padding !== undefined
          ? ["-fps_mode", "passthrough"]
          : filter === undefined
            ? []
            : ["-vf", filter]),
        "-c:v",
        "libx264",
        ...(padding === undefined ? [] : ["-profile:v", "high"]),
        "-crf",
        String(encoding.crf),
        "-preset",
        encoding.encoderPreset,
        "-pix_fmt",
        "yuv420p",
        ...(padding?.colorManaged
          ? [
              "-color_primaries",
              "bt709",
              "-colorspace",
              "bt709",
              "-color_trc",
              "iec61966-2-1",
              "-color_range",
              "tv",
            ]
          : []),
        ...(validated.audio === "remove"
          ? ["-an"]
          : fillOnly
            ? ["-c:a", "copy"]
            : ["-c:a", "aac", "-b:a", "128k"]),
        "-movflags",
        "+faststart",
        temporary,
      ]);
      // The video encoder and MP4 muxer have exited. Decode the cover from that final file.
      yield* runFfmpeg([
        "-n",
        "-i",
        temporary,
        "-map",
        "0:v:0",
        "-frames:v",
        "1",
        ...(padding?.colorManaged
          ? [
              "-vf",
              "colorspace=all=bt709:trc=iec61966-2-1:range=pc:format=yuv444p,scale=in_color_matrix=bt709:in_range=full:out_range=full,format=rgb24",
            ]
          : []),
        frame,
      ]);
      const result = yield* processImage(
        frame,
        cover,
        {
          quality: validated.quality,
          preset: validated.preset,
          format: coverFormat,
        },
        fillOnly ? "lossless-png" : "standard",
        padding?.colorManaged ? "srgb" : undefined,
      );
      const output = path.join(directory, `video.${format}`);
      const coverOutput = path.join(directory, `video.${coverFormat}`);
      yield* fs.link(temporary, output);
      yield* fs.link(cover, coverOutput);
      return {
        output,
        cover: coverOutput,
        format,
        coverFormat,
        colorManaged: padding?.colorManaged ?? false,
        width: result.width,
        height: result.height,
        size: Number((yield* fs.stat(output)).size),
        coverSize: result.size,
      };
    }),
  );
export const compressVideo = (input: string, directory: string, options: VideoOptions) =>
  processVideo(input, directory, options, false);

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
