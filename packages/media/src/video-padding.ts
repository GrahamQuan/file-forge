import { Effect, Schema } from "effect";
import { runFfprobe } from "./ffprobe.js";
import { MediaError } from "./index.js";

const VideoProbe = Schema.Struct({
  streams: Schema.Array(
    Schema.Struct({
      width: Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0)),
      height: Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0)),
      pix_fmt: Schema.String,
      color_space: Schema.optional(Schema.String),
      color_primaries: Schema.optional(Schema.String),
      color_transfer: Schema.optional(Schema.String),
      color_range: Schema.optional(Schema.String),
      sample_aspect_ratio: Schema.optional(Schema.String),
      side_data_list: Schema.optional(
        Schema.Array(Schema.Struct({ rotation: Schema.optional(Schema.Number) })),
      ),
    }),
  ),
  pixel_formats: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      flags: Schema.optional(Schema.Struct({ rgb: Schema.optional(Schema.Number) })),
      components: Schema.optional(Schema.Array(Schema.Struct({ bit_depth: Schema.Number }))),
    }),
  ),
});

const supportedMatrices = new Set([
  "bt709",
  "fcc",
  "bt470bg",
  "smpte170m",
  "smpte240m",
  "ycgco",
  "bt2020nc",
]);
const supportedPrimaries = new Set([
  "bt709",
  "bt470m",
  "bt470bg",
  "smpte170m",
  "smpte240m",
  "film",
  "bt2020",
  "smpte428",
  "smpte431",
  "smpte432",
]);
const supportedTransfers = new Set([
  "bt709",
  "bt470m",
  "bt470bg",
  "smpte170m",
  "smpte240m",
  "linear",
  "iec61966-2-1",
  "iec61966-2-4",
  "bt2020-10",
  "bt2020-12",
]);
const colorTag = (value: string | undefined, fallback: string) =>
  value === undefined || value === "unknown" || value === "unspecified" ? fallback : value;

export const videoBlurPaddingFilter = (
  input: string,
  aspect: number,
  bounds: { readonly width?: number; readonly height?: number },
) =>
  Effect.gen(function* () {
    const probe = yield* runFfprobe(input, [
      "-select_streams",
      "v:0",
      "-show_pixel_formats",
      "-show_entries",
      "stream=width,height,pix_fmt,sample_aspect_ratio,color_space,color_primaries,color_transfer,color_range:stream_side_data=rotation:pixel_format=name:pixel_format_components:pixel_format_flags=rgb",
    ]);
    const { streams, pixel_formats } = yield* Schema.decodeUnknownEffect(VideoProbe)(probe).pipe(
      Effect.mapError(
        () => new MediaError({ code: "INVALID_INPUT", detail: "Invalid video probe output" }),
      ),
    );
    const stream = streams[0];
    if (!stream)
      return yield* new MediaError({ code: "INVALID_INPUT", detail: "Input has no video stream" });
    const inputFormat = pixel_formats.find(({ name }) => name === stream.pix_fmt);
    const bitDepth = Math.max(
      8,
      ...(inputFormat?.components ?? []).map(({ bit_depth }) => bit_depth),
    );
    const pixelFormat = bitDepth > 8 ? "yuv444p10le" : "yuv444p";
    const overlayFormat = bitDepth > 8 ? "yuv444p10" : "yuv444";
    const rgb = inputFormat?.flags?.rgb === 1 || stream.color_space === "gbr";
    const matrix = rgb ? "bt709" : colorTag(stream.color_space, "bt709");
    const primaries = colorTag(stream.color_primaries, "bt709");
    const transfer = colorTag(stream.color_transfer, "iec61966-2-1");
    const range =
      !rgb && (stream.color_range === "pc" || stream.pix_fmt.startsWith("yuvj")) ? "pc" : "tv";
    const colorManaged =
      supportedMatrices.has(matrix) &&
      supportedPrimaries.has(primaries) &&
      supportedTransfers.has(transfer);
    // The same transfer and primaries can be used in the MP4 and its RGB cover.
    const colorFilter = colorManaged
      ? `,colorspace=ispace=${matrix}:iprimaries=${primaries}:itrc=${transfer}:irange=${range}:all=bt709:trc=iec61966-2-1:range=tv:format=yuv420p`
      : "";
    const scaleColors = !colorManaged
      ? ""
      : rgb
        ? ":out_color_matrix=bt709:out_range=tv"
        : `:in_range=${range}:out_range=${range}`;

    const [numerator, denominator] = (stream.sample_aspect_ratio ?? "").split(":").map(Number);
    const sampledAspect = numerator! / denominator!;
    const sar = Number.isFinite(sampledAspect) && sampledAspect > 0 ? sampledAspect : 1;
    const rotation =
      stream.side_data_list?.find(({ rotation }) => rotation !== undefined)?.rotation ?? 0;
    const transposed = Math.abs(Math.abs(rotation % 180) - 90) < 1;
    // Match FFmpeg autorotation and normalize non-square pixels by reducing one axis.
    const sourceWidth = Math.max(
      1,
      Math.round(
        (transposed ? stream.height : stream.width) * Math.min(transposed ? 1 / sar : sar, 1),
      ),
    );
    const sourceHeight = Math.max(
      1,
      Math.round(
        (transposed ? stream.width : stream.height) * Math.min(transposed ? sar : 1 / sar, 1),
      ),
    );

    const widthLimit = bounds.width === undefined ? Infinity : Math.floor(bounds.width / 2) * 2;
    const heightLimit = bounds.height === undefined ? Infinity : Math.floor(bounds.height / 2) * 2;
    const canvasWidth =
      Math.ceil(
        Math.min(Math.max(sourceWidth, sourceHeight * aspect), widthLimit, heightLimit * aspect) /
          2 -
          1e-9,
      ) * 2;
    const canvasHeight =
      Math.ceil(
        Math.min(Math.max(sourceHeight, sourceWidth / aspect), heightLimit, widthLimit / aspect) /
          2 -
          1e-9,
      ) * 2;
    if (canvasWidth < 2 || canvasHeight < 2 || !(canvasWidth * canvasHeight <= 67_108_864))
      return yield* new MediaError({
        code: "INVALID_INPUT",
        detail: "Blur fill produces an invalid video canvas size",
      });

    const scale = Math.min(1, canvasWidth / sourceWidth, canvasHeight / sourceHeight);
    const foregroundWidth = Math.max(1, Math.round(sourceWidth * scale));
    const foregroundHeight = Math.max(1, Math.round(sourceHeight * scale));
    const foreground = `scale=${foregroundWidth}:${foregroundHeight},setsar=1`;
    if (foregroundWidth === canvasWidth && foregroundHeight === canvasHeight)
      return {
        graph: `[0:v:0]scale=${foregroundWidth}:${foregroundHeight}${scaleColors},setsar=1,format=${pixelFormat}${colorFilter}[v]`,
        colorManaged,
      };

    const backgroundWidth = Math.max(2, canvasWidth / 2);
    const backgroundHeight = Math.max(2, canvasHeight / 2);
    const cropWidth = Math.max(
      1,
      Math.floor(Math.min(sourceWidth, (sourceHeight * canvasWidth) / canvasHeight)),
    );
    const cropHeight = Math.max(
      1,
      Math.floor(Math.min(sourceHeight, (sourceWidth * canvasHeight) / canvasWidth)),
    );
    const sigma = Math.max(1, Math.min(backgroundWidth, backgroundHeight) * 0.04);
    const x = Math.floor((canvasWidth - foregroundWidth) / 2);
    const y = Math.floor((canvasHeight - foregroundHeight) / 2);
    const graph = [
      `[0:v:0]scale=${sourceWidth}:${sourceHeight}${scaleColors},setsar=1,format=${pixelFormat},split[front][back]`,
      `[front]${foreground}[fg]`,
      `[back]crop=${cropWidth}:${cropHeight}:exact=1,scale=${backgroundWidth}:${backgroundHeight},gblur=sigma=${sigma},scale=${canvasWidth}:${canvasHeight},setsar=1[bg]`,
      `[bg][fg]overlay=x=${x}:y=${y}:format=${overlayFormat}:shortest=1${colorFilter}[v]`,
    ].join(";");
    return { graph, colorManaged };
  });
