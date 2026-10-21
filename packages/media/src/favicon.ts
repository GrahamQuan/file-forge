import { Context, Data, Effect, Layer, Schema } from "effect";
import sharp from "sharp";

export class FaviconError extends Data.TaggedError("FaviconError")<{
  readonly code: "INVALID_INPUT" | "FAVICON_FAILED";
  readonly detail: string;
  readonly cause?: unknown;
}> {}

export const FaviconSizeSchema = Schema.Number.check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 16, maximum: 256 }),
);
export const validateFaviconSize = (size: unknown) =>
  Schema.decodeUnknownEffect(FaviconSizeSchema)(size).pipe(
    Effect.mapError(
      () =>
        new FaviconError({
          code: "INVALID_INPUT",
          detail: "Favicon size must be an integer from 16 through 256",
        }),
    ),
  );
export interface FaviconBundle {
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly size: number;
  readonly png: Buffer;
  readonly ico: Buffer;
  readonly svg: Buffer;
}
export class FaviconEngine extends Context.Service<
  FaviconEngine,
  {
    readonly render: (
      input: Uint8Array,
      size: number,
    ) => Effect.Effect<FaviconBundle, FaviconError>;
  }
>()("@file-forge/media/FaviconEngine") {}

// Await each native operation before releasing its buffers; the raster is at most 256 x 256 for tracing.
const native = <A>(run: () => Promise<A>) =>
  Effect.uninterruptible(
    Effect.tryPromise({
      try: run,
      catch: (cause) =>
        new FaviconError({
          code: "FAVICON_FAILED",
          detail: "Favicon encoding or vector tracing failed",
          cause,
        }),
    }),
  );
const invalid = (detail: string) => new FaviconError({ code: "INVALID_INPUT", detail });

/** One PNG-compressed ICO frame. The byte value zero denotes the 256-pixel dimension. */
const encodeIco = (png: Buffer, size: number): Buffer => {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header[6] = size === 256 ? 0 : size;
  header[7] = size === 256 ? 0 : size;
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(header.length, 18);
  return Buffer.concat([header, png]);
};

const render = (input: Uint8Array, size: number) =>
  Effect.gen(function* () {
    yield* validateFaviconSize(size);
    const source = Buffer.from(input);
    // libpng may expose only APNG's default frame. Reject the animation-control chunk explicitly.
    for (let offset = 8; offset + 12 <= source.length;) {
      const length = source.readUInt32BE(offset);
      if (source.toString("ascii", offset + 4, offset + 8) === "acTL")
        return yield* invalid("Animated PNG is not supported");
      if (length > source.length - offset - 12) break;
      offset += length + 12;
    }
    const metadata = yield* native(() => sharp(source).metadata()).pipe(
      Effect.mapError(() => invalid("Input must be a readable static PNG")),
    );
    if (
      metadata.format !== "png" ||
      (metadata.pages ?? 1) !== 1 ||
      !metadata.width ||
      !metadata.height
    ) {
      return yield* invalid("Input must be a static PNG");
    }
    const resized = yield* native(() =>
      sharp(source)
        .rotate()
        .resize({
          width: size,
          height: size,
          fit: "inside",
          withoutEnlargement: true,
        })
        .toColourspace("srgb")
        .ensureAlpha()
        .png()
        .toBuffer({ resolveWithObject: true }),
    );
    const left = Math.floor((size - resized.info.width) / 2);
    const top = Math.floor((size - resized.info.height) / 2);
    const png = yield* native(() =>
      sharp(resized.data)
        .extend({
          left,
          top,
          right: size - resized.info.width - left,
          bottom: size - resized.info.height - top,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer(),
    );
    const raw = yield* native(() => sharp(png).ensureAlpha().raw().toBuffer());
    let visible = false;
    for (let index = 3; index < raw.length; index += 4) {
      if (raw[index] !== 0) {
        visible = true;
        break;
      }
    }
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"></svg>\n`;
    if (visible) {
      const tracer = yield* native(() => import("@neplex/vectorizer"));
      const traced = yield* native(() =>
        tracer.vectorize(png, {
          colorMode: tracer.ColorMode.Color,
          hierarchical: tracer.Hierarchical.Stacked,
          filterSpeckle: 0,
          colorPrecision: 8,
          layerDifference: 16,
          mode: tracer.PathSimplifyMode.Spline,
          cornerThreshold: 60,
          lengthThreshold: 4,
          maxIterations: 10,
          spliceThreshold: 45,
          pathPrecision: 3,
        }),
      );
      // VTracer emits only SVG geometry; enforce that expectation before decoding or delivering it.
      if (
        !/<svg\b/.test(traced) ||
        !/<path\b/.test(traced) ||
        /<(?:image|script|foreignObject)\b|\b(?:href|on\w+)\s*=|data:|<!DOCTYPE|<!ENTITY/i.test(
          traced,
        )
      ) {
        return yield* new FaviconError({
          code: "FAVICON_FAILED",
          detail: "Tracer did not produce standalone vector geometry",
        });
      }
      svg = traced.replace(
        /<svg\b[^>]*>/,
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
      );
    }
    const svgBytes = Buffer.from(svg);
    const decoded = yield* native(() =>
      sharp(svgBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    );
    if (decoded.info.width !== size || decoded.info.height !== size) {
      return yield* new FaviconError({
        code: "FAVICON_FAILED",
        detail: "Unexpected SVG dimensions",
      });
    }
    return {
      sourceWidth: metadata.width,
      sourceHeight: metadata.height,
      size,
      png,
      ico: encodeIco(png, size),
      svg: svgBytes,
    };
  });
export const FaviconEngineLive = Layer.succeed(FaviconEngine, { render });
export const renderFavicons = (input: Uint8Array, size = 64) =>
  Effect.flatMap(FaviconEngine, (engine) => engine.render(input, size));
