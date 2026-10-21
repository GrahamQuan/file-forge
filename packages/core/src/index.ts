import { lstat } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { Cause, Data, Effect, Exit, FileSystem, Option, Path, Schema } from "effect";
import {
  compressVideo,
  validateCompressionOptions,
  type CompressionOptions,
  renderFavicons,
  validateFaviconSize,
  inspectImage,
  processImage,
  validateImageOptions,
  type ImageOptions,
} from "@file-forge/media";

export class OperationError extends Data.TaggedError("OperationError")<{
  readonly code: "INVALID_INPUT" | "IO_FAILED" | "UNSUPPORTED_SCHEMA";
  readonly detail: string;
}> {}
// Effect 4.0.2 FileSystem.stat follows links and has no lstat operation.
export const isSymlink = (file: string) =>
  Effect.tryPromise({
    try: () => lstat(file).then((stat) => stat.isSymbolicLink()),
    catch: () => new OperationError({ code: "IO_FAILED", detail: "Cannot inspect file identity" }),
  });
const invalid = (detail: string) => new OperationError({ code: "INVALID_INPUT", detail });
export const AssetSchema = Schema.Struct({
  assetId: Schema.String,
  source: Schema.String,
  originalName: Schema.String,
  status: Schema.Literals(["inspected", "succeeded", "failed", "skipped"]),
  kind: Schema.Literals(["image", "video", "audio", "model", "unsupported"]),
  size: Schema.optional(Schema.Number),
  width: Schema.optional(Schema.Number),
  height: Schema.optional(Schema.Number),
  format: Schema.optional(Schema.String),
  output: Schema.optional(Schema.String),
  outputSize: Schema.optional(Schema.Number),
  outputWidth: Schema.optional(Schema.Number),
  outputHeight: Schema.optional(Schema.Number),
  outputFormat: Schema.optional(Schema.String),
  sizeChange: Schema.optional(Schema.Number),
  lossless: Schema.optional(Schema.Boolean),
  optimization: Schema.optional(Schema.String),
  note: Schema.optional(Schema.String),
  sampleRate: Schema.optional(Schema.Number),
  channels: Schema.optional(Schema.Number),
  bitsPerSample: Schema.optional(Schema.Number),
  view: Schema.optional(Schema.Literals(["front", "back", "left", "right", "top", "bottom"])),
  camera: Schema.optional(
    Schema.Struct({
      position: Schema.Array(Schema.Number),
      target: Schema.Array(Schema.Number),
      up: Schema.Array(Schema.Number),
      orthographicScale: Schema.Number,
    }),
  ),
  errorCode: Schema.optional(Schema.String),
});
export type Asset = typeof AssetSchema.Type;
const LegacyManifestSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  taskId: Schema.String,
  createdAt: Schema.String,
  operation: Schema.Literals(["inspect", "image", "video", "export"]),
  status: Schema.Literals(["succeeded", "partial", "failed", "empty", "cancelled"]),
  parameters: Schema.Struct({
    recursive: Schema.Boolean,
    poster: Schema.optional(
      Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Number])),
    ),
    video: Schema.optional(
      Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Number])),
    ),
    image: Schema.optional(
      Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Number])),
    ),
  }),
  assets: Schema.Array(AssetSchema),
});
export const FolderRenameEntrySchema = Schema.Struct({
  source: Schema.String,
  output: Schema.String,
  current: Schema.String,
  status: Schema.Literals(["planned", "succeeded", "failed"]),
  errorCode: Schema.optional(Schema.String),
});
export const ManifestSchema = Schema.Union([
  LegacyManifestSchema,
  Schema.Struct({
    ...LegacyManifestSchema.fields,
    schemaVersion: Schema.Literal(6),
    operation: Schema.Literals(["model", "folder"]),
  }),
  Schema.Struct({
    ...LegacyManifestSchema.fields,
    schemaVersion: Schema.Literal(5),
    operation: Schema.Literal("model-posters"),
  }),
  Schema.Struct({
    ...LegacyManifestSchema.fields,
    schemaVersion: Schema.Literal(4),
    operation: Schema.Literals(["audio", "model", "folder"]),
  }),
  Schema.Struct({
    ...LegacyManifestSchema.fields,
    schemaVersion: Schema.Literal(2),
    operation: Schema.Literal("folder"),
  }),
  Schema.Struct({
    ...LegacyManifestSchema.fields,
    schemaVersion: Schema.Literal(3),
    operation: Schema.Literal("folder-rename"),
    apply: Schema.Boolean,
    renames: Schema.Array(FolderRenameEntrySchema),
  }),
]);
export type Manifest = typeof ManifestSchema.Type;
export { renameFolders } from "./rename-folders.js";
export { compressFolder } from "./folder.js";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const outputName = (name: string, identity: string, format: string) => {
  const stem =
    name
      .replace(/\.[^.]*$/, "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "asset";
  return `${stem}-${hash(identity).slice(0, 16)}.${format}`;
};
export const imageExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".avif",
  ".tif",
  ".tiff",
  ".gif",
  ".heif",
  ".heic",
]);
const status = (assets: readonly Asset[]): Manifest["status"] => {
  if (!assets.length) return "empty";
  const good = assets.filter(
    (asset) => asset.status === "succeeded" || asset.status === "inspected",
  ).length;
  return good === assets.length ? "succeeded" : good ? "partial" : "failed";
};

export const inspectFiles = (inputs: readonly string[], recursive = false) =>
  Effect.gen(function* () {
    if (!inputs.length || inputs.some((input) => !input))
      return yield* invalid("At least one input is required");
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const assets: Asset[] = [];
    const seen = new Set<string>();
    const visit = (
      input: string,
      selectedRoot = false,
    ): Effect.Effect<
      void,
      never,
      FileSystem.FileSystem | Path.Path | import("@file-forge/media").ImageEngine
    > =>
      Effect.gen(function* () {
        const absolute = path.resolve(input);
        let base = {
          assetId: hash(absolute),
          source: absolute,
          originalName: path.basename(absolute),
        };
        // Symlinks are deliberately excluded; their targets are outside the selected scope.
        if (yield* isSymlink(absolute)) {
          assets.push({
            ...base,
            kind: "unsupported",
            status: "skipped",
            errorCode: "SYMLINK_SKIPPED",
          });
          return;
        }
        const info = yield* fs.stat(absolute);
        const real = yield* fs.realPath(absolute);
        base = { ...base, assetId: hash(real), source: real };
        if (seen.has(real)) return;
        seen.add(real);
        if (info.type === "Directory") {
          if (!recursive && !selectedRoot) {
            assets.push({
              ...base,
              kind: "unsupported",
              status: "skipped",
              errorCode: "RECURSION_DISABLED",
            });
            return;
          }
          for (const entry of (yield* fs.readDirectory(real)).sort())
            yield* visit(path.join(real, entry));
          return;
        }
        if (info.type !== "File") {
          assets.push({
            ...base,
            kind: "unsupported",
            status: "skipped",
            errorCode: "UNSUPPORTED_FILE",
          });
          return;
        }
        yield* fs.access(real, { readable: true });
        if (!imageExtensions.has(path.extname(real).toLowerCase())) {
          assets.push({
            ...base,
            size: Number(info.size),
            kind: "unsupported",
            status: "skipped",
            errorCode: "UNSUPPORTED_FORMAT",
          });
          return;
        }
        const metadata = yield* inspectImage(real);
        if ((metadata.pages ?? 1) > 1) {
          assets.push({
            ...base,
            size: Number(info.size),
            kind: "image",
            status: "skipped",
            errorCode: "ANIMATED_IMAGE_UNSUPPORTED",
          });
          return;
        }
        assets.push({
          ...base,
          kind: "image",
          status: "inspected",
          size: Number(info.size),
          width: metadata.width,
          height: metadata.height,
          format: metadata.format,
        });
      }).pipe(
        Effect.catch(() =>
          Effect.sync(() => {
            const absolute = path.resolve(input);
            assets.push({
              assetId: hash(absolute),
              source: absolute,
              originalName: path.basename(absolute),
              kind: "unsupported",
              status: "failed",
              errorCode: "INSPECTION_FAILED",
            });
          }),
        ),
      );
    for (const input of inputs) yield* visit(input, true);
    return {
      schemaVersion: 1 as const,
      taskId: randomUUID(),
      createdAt: new Date().toISOString(),
      operation: "inspect" as const,
      status: status(assets),
      parameters: { recursive },
      assets,
    } satisfies Manifest;
  });

const safeText = (value: string) =>
  value.replace(/[&<>|`[\]\\\r\n]/g, (char) => `&#${char.charCodeAt(0)};`);
export const renderReport = (manifest: Manifest, includePaths = false) =>
  [
    "# FileForge delivery",
    "",
    `Status: ${manifest.status}`,
    `Task: ${safeText(manifest.taskId)}`,
    "",
    "| Asset | Source | Status | Output | Error |",
    "| --- | --- | --- | --- | --- |",
    ...("renames" in manifest
      ? [
          `Apply: ${manifest.apply}`,
          "",
          "| Original folder | Final folder | Current folder | Status | Error |",
          "| --- | --- | --- | --- | --- |",
          ...manifest.renames.map(
            (entry) =>
              `| ${safeText(entry.source)} | ${safeText(entry.output)} | ${safeText(entry.current)} | ${entry.status} | ${safeText(entry.errorCode ?? "")} |`,
          ),
          "",
        ]
      : []),
    ...manifest.assets.map(
      (asset) =>
        `| ${safeText(asset.assetId)} | ${safeText(includePaths ? asset.source : asset.originalName)} | ${asset.status} | ${safeText(asset.output ? (includePaths ? asset.output : asset.output.split(/[\\/]/).pop()!) : "")} | ${safeText(asset.errorCode ?? "")} |`,
    ),
    "",
  ].join("\n");

export const writeManifest = (directory: string, manifest: Manifest, includePaths = false) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const decoded = yield* Schema.decodeUnknownEffect(ManifestSchema)(manifest);
    // Only the owning task writes this exclusively created directory.
    for (const [name, content] of [
      ["manifest.json", JSON.stringify(decoded, null, 2) + "\n"],
      ["report.md", renderReport(decoded, includePaths)],
    ]) {
      yield* Effect.scoped(
        Effect.gen(function* () {
          const staging = yield* fs.makeTempDirectoryScoped({ directory, prefix: ".manifest-" });
          const temp = path.join(staging, name!);
          yield* fs.writeFileString(temp, content!, { flag: "wx" });
          yield* fs.rename(temp, path.join(directory, name!));
        }),
      );
    }
  }).pipe(
    Effect.mapError(
      () => new OperationError({ code: "IO_FAILED", detail: "Cannot persist delivery files" }),
    ),
  );

export const readManifest = (file: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const text = yield* fs.readFileString(file);
    const value = yield* Effect.try({
      try: () => JSON.parse(text) as unknown,
      catch: () => invalid("Malformed manifest JSON"),
    });
    return yield* Schema.decodeUnknownEffect(ManifestSchema)(value);
  }).pipe(
    Effect.mapError(
      () =>
        new OperationError({
          code: "UNSUPPORTED_SCHEMA",
          detail: "Invalid or unsupported manifest",
        }),
    ),
  );

export const createDeliveryDirectory = (parent: string, taskId: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.makeDirectory(parent, { recursive: true });
    const directory = path.join(yield* fs.realPath(parent), `file-forge-${taskId}`);
    yield* fs.makeDirectory(directory);
    return directory;
  });

export const processImages = (
  inputs: readonly string[],
  options: ImageOptions,
  outputParent: string,
  recursive = false,
) =>
  Effect.gen(function* () {
    const validated = yield* validateImageOptions(options);
    if (!Object.values(validated).some((value) => value !== undefined))
      return yield* invalid("Explicit image options are required");
    const fs = yield* FileSystem.FileSystem;
    const paths = yield* Path.Path;
    let ancestor = paths.resolve(outputParent);
    const suffix: string[] = [];
    while (!(yield* fs.exists(ancestor))) {
      suffix.unshift(paths.basename(ancestor));
      const parent = paths.dirname(ancestor);
      if (parent === ancestor) return yield* invalid("Cannot resolve output location");
      ancestor = parent;
    }
    const canonicalOutput = paths.join(yield* fs.realPath(ancestor), ...suffix);
    for (const input of inputs) {
      const info = yield* fs.stat(input).pipe(Effect.option);
      if (Option.isSome(info) && info.value.type === "Directory") {
        const source = yield* fs.realPath(input);
        const relative = paths.relative(source, canonicalOutput);
        if (
          relative === "" ||
          (!relative.startsWith(`..${paths.sep}`) &&
            relative !== ".." &&
            !paths.isAbsolute(relative))
        ) {
          return yield* invalid("Output must be outside input directories");
        }
      }
    }
    // Complete inspection before making the exclusively owned task directory.
    const inspected = yield* inspectFiles(inputs, recursive);
    const directory = yield* createDeliveryDirectory(outputParent, inspected.taskId);
    const path = yield* Path.Path;
    const assets: Asset[] = [];
    const manifest = (): Manifest => ({
      ...inspected,
      operation: "image",
      status: status(assets),
      parameters: {
        recursive,
        image: Object.fromEntries(
          Object.entries(validated).filter(([, value]) => value !== undefined),
        ),
      },
      assets: [...assets],
    });
    const work = Effect.gen(function* () {
      // Serial dispatch bounds Sharp concurrency and makes cancellation boundaries explicit.
      for (const asset of inspected.assets) {
        if (asset.status !== "inspected") {
          assets.push(asset);
          continue;
        }
        const output = path.join(
          directory,
          outputName(asset.originalName, asset.source, validated.format ?? "webp"),
        );
        yield* Effect.uninterruptible(
          Effect.gen(function* () {
            const result = yield* processImage(asset.source, output, validated);
            assets.push({
              ...asset,
              status: "succeeded",
              output,
              outputSize: result.size,
              outputWidth: result.width,
              outputHeight: result.height,
              outputFormat: result.format,
              sizeChange: result.size - (asset.size ?? 0),
            });
          }).pipe(
            Effect.catch((error) =>
              Effect.sync(() => {
                assets.push({ ...asset, status: "failed", errorCode: error.code });
              }),
            ),
          ),
        );
      }
      const result = manifest();
      yield* writeManifest(directory, result);
      return { ...result, directory };
    });
    return yield* work.pipe(
      Effect.onInterrupt(() =>
        writeManifest(directory, {
          ...manifest(),
          status: "cancelled",
          assets: [
            ...assets,
            ...inspected.assets
              .filter((asset) => !assets.some((done) => done.assetId === asset.assetId))
              .map((asset): Asset => ({ ...asset, status: "skipped", errorCode: "CANCELLED" })),
          ],
        }),
      ),
    );
  });

export const exportManifest = (manifest: Manifest, outputParent: string, includePaths = false) =>
  Effect.gen(function* () {
    const validated = yield* Schema.decodeUnknownEffect(ManifestSchema)(manifest);
    const directory = yield* createDeliveryDirectory(outputParent, randomUUID());
    yield* writeManifest(directory, validated, includePaths);
    return { ...validated, directory };
  });

export const generateFavicons = (input: string, outputParent: string, size = 64) =>
  Effect.gen(function* () {
    yield* validateFaviconSize(size);
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    if (!input || (yield* isSymlink(input)))
      return yield* invalid("Favicon input must be a regular PNG file");
    const source = yield* fs.realPath(input);
    const info = yield* fs.stat(source);
    if (info.type !== "File") return yield* invalid("Favicon input must be a regular PNG file");
    const bytes = yield* fs.readFile(source);
    const bundle = yield* renderFavicons(bytes, size);
    const taskId = randomUUID();
    // The directory is owned exclusively by this request; failure or interruption removes incomplete output only.
    return yield* Effect.acquireUseRelease(
      createDeliveryDirectory(outputParent, taskId),
      (directory) =>
        Effect.gen(function* () {
          const assets: Asset[] = [];
          for (const format of ["png", "ico", "svg"] as const) {
            const output = path.join(directory, `favicon.${format}`);
            const data = bundle[format];
            yield* fs.writeFile(output, data, { flag: "wx" });
            assets.push({
              assetId: hash(`${source}:favicon:${format}`),
              source,
              originalName: path.basename(input),
              kind: "image",
              status: "succeeded",
              size: bytes.length,
              width: bundle.sourceWidth,
              height: bundle.sourceHeight,
              format: "png",
              output,
              outputFormat: format,
              outputWidth: size,
              outputHeight: size,
              outputSize: data.length,
              sizeChange: data.length - bytes.length,
            });
          }
          const manifest: Manifest = {
            schemaVersion: 1,
            taskId,
            createdAt: new Date().toISOString(),
            operation: "image",
            status: "succeeded",
            parameters: {
              recursive: false,
              image: { preset: "favicon", size, svg: "vector-trace" },
            },
            assets,
          };
          yield* writeManifest(directory, manifest);
          return { ...manifest, directory };
        }),
      (directory, exit) =>
        Exit.isSuccess(exit)
          ? Effect.void
          : fs.remove(directory, { recursive: true }).pipe(Effect.orDie),
    );
  });

export {
  OperationRequest,
  InspectRequest,
  ImageRequest,
  ImageCompressionRequest,
  VideoCompressionRequest,
  AudioCompressionRequest,
  ModelCompressionRequest,
  ModelPostersRequest,
  FolderCompressionRequest,
  FolderRenameRequest,
  FaviconRequest,
  ExportRequest,
  executeRequest,
  validateRequest,
} from "./requests.js";

export const compressImages = (
  inputs: readonly string[],
  options: CompressionOptions,
  output: string,
  recursive = false,
) =>
  Effect.flatMap(validateCompressionOptions(options), (validated) =>
    processImages(inputs, { ...validated, format: "webp" }, output, recursive),
  );

export const compressVideoFile = (
  input: string,
  options: CompressionOptions,
  outputParent: string,
) =>
  Effect.gen(function* () {
    const validated = yield* validateCompressionOptions(options);
    if (
      (validated.width !== undefined && validated.width < 2) ||
      (validated.height !== undefined && validated.height < 2)
    )
      return yield* invalid("Video dimensions must be at least 2 pixels");
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    if (yield* isSymlink(input)) return yield* invalid("Video input must be a regular file");
    const source = yield* fs.realPath(input);
    if ((yield* fs.stat(source)).type !== "File")
      return yield* invalid("Video input must be a regular file");
    const taskId = randomUUID();
    const directory = yield* createDeliveryDirectory(outputParent, taskId);
    const manifest: Manifest = {
      schemaVersion: 1,
      taskId,
      createdAt: new Date().toISOString(),
      operation: "video",
      status: "failed",
      parameters: {
        recursive: false,
        video: {
          ...Object.fromEntries(
            Object.entries(validated).filter(([, value]) => value !== undefined),
          ),
          coverQuality: validated.quality ?? 80,
          crf: 23,
        },
      },
      assets: [
        {
          assetId: hash(source),
          source,
          originalName: path.basename(source),
          kind: "video",
          status: "failed",
        },
      ],
    };
    return yield* Effect.gen(function* () {
      const result = yield* compressVideo(source, directory, validated);
      const assets: Asset[] = [
        {
          assetId: hash(source),
          source,
          originalName: path.basename(source),
          kind: "video",
          status: "succeeded",
          output: result.output,
          outputWidth: result.width,
          outputHeight: result.height,
          outputSize: result.size,
          outputFormat: "mp4",
        },
        {
          assetId: hash(source + ":cover"),
          source,
          originalName: path.basename(source),
          kind: "image",
          status: "succeeded",
          output: result.cover,
          outputWidth: result.width,
          outputHeight: result.height,
          outputSize: result.coverSize,
          outputFormat: "webp",
        },
      ];
      const completed: Manifest = { ...manifest, status: "succeeded", assets };
      yield* writeManifest(directory, completed);
      return { ...completed, directory };
    }).pipe(
      Effect.onExit((exit) =>
        Exit.isFailure(exit)
          ? writeManifest(directory, {
              ...manifest,
              status: Cause.hasInterrupts(exit.cause) ? "cancelled" : "failed",
            })
          : Effect.void,
      ),
    );
  });

export { compressLosslessFile } from "./lossless.js";

export { generateModelPosters } from "./posters.js";
