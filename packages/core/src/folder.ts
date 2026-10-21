import { randomUUID, createHash } from "node:crypto";
import { Effect, FileSystem, Path } from "effect";
import {
  compressVideo,
  imageQuality,
  videoEncoding,
  compressAudio,
  compressGlb,
  audioExtensions,
  inspectImage,
  processImage,
  validateCompressionOptions,
  type CompressionOptions,
} from "@file-forge/media";
import {
  createDeliveryDirectory,
  generateModelPosters,
  imageExtensions,
  isSymlink,
  OperationError,
  writeManifest,
  type Asset,
  type Manifest,
} from "./index.js";

const videos = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"]);
const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const invalid = (detail: string) => new OperationError({ code: "INVALID_INPUT", detail });
type Planned = { asset: Asset; relative: string; cover?: string; selected: boolean };

/** Plan every destination before creating output, then process serially in scoped staging. */
export const compressFolder = (
  input: string,
  options: CompressionOptions,
  outputParent: string,
  media: "all" | "images" | "videos" = "all",
) =>
  Effect.gen(function* () {
    if (!["all", "images", "videos"].includes(media))
      return yield* invalid("Invalid media selection");
    const validated = yield* validateCompressionOptions(options);
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    if (yield* isSymlink(input)) return yield* invalid("Select a directory, not a symlink");
    const source = yield* fs.realPath(input);
    if ((yield* fs.stat(source)).type !== "Directory") return yield* invalid("Select a directory");
    let ancestor = path.resolve(outputParent);
    const suffix: string[] = [];
    while (!(yield* fs.exists(ancestor))) {
      suffix.unshift(path.basename(ancestor));
      ancestor = path.dirname(ancestor);
    }
    const destination = path.join(yield* fs.realPath(ancestor), ...suffix);
    const relative = path.relative(source, destination);
    if (
      !relative ||
      (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
    )
      return yield* invalid("Output must be outside the input directory");
    const rootName = normalize(path.basename(source));
    if (!rootName) return yield* invalid("Folder name has no ASCII letters or digits");
    const planned: Planned[] = [];
    const assets: Asset[] = [];
    const directories = [rootName];
    const reserved = new Set<string>(directories);
    const reserve = (name: string) =>
      Effect.gen(function* () {
        if (reserved.has(name)) return yield* invalid(`Normalized output collision: ${name}`);
        reserved.add(name);
      });
    const walk = (
      directory: string,
      target: string,
    ): Effect.Effect<void, OperationError, FileSystem.FileSystem> =>
      Effect.gen(function* () {
        for (const name of (yield* fs.readDirectory(directory)).sort()) {
          const file = path.join(directory, name);
          const asset: Asset = {
            assetId: createHash("sha256").update(file).digest("hex"),
            source: file,
            originalName: name,
            kind: "unsupported",
            status: "inspected",
          };
          if (name === ".DS_Store" || (yield* isSymlink(file))) {
            assets.push({
              ...asset,
              status: "skipped",
              errorCode: name === ".DS_Store" ? "METADATA_SKIPPED" : "SYMLINK_SKIPPED",
            });
            continue;
          }
          const info = yield* fs.stat(file);
          if (info.type === "Directory") {
            const segment = normalize(name);
            if (!segment) return yield* invalid("Folder name has no ASCII letters or digits");
            const next = path.join(target, segment);
            yield* reserve(next);
            directories.push(next);
            yield* walk(file, next);
          } else if (info.type === "File") {
            const extension = path.extname(name).toLowerCase();
            const kind = imageExtensions.has(extension)
              ? "image"
              : videos.has(extension)
                ? "video"
                : audioExtensions.has(extension)
                  ? "audio"
                  : extension === ".glb"
                    ? "model"
                    : "unsupported";
            const selected =
              media === "all" ||
              (media === "images" && kind === "image") ||
              (media === "videos" && kind === "video");
            const stem = normalize(extension ? name.slice(0, -extension.length) : name);
            const outputExtension =
              selected && kind === "image"
                ? "webp"
                : selected && kind === "video"
                  ? "mp4"
                  : normalize(extension);
            if (!stem) return yield* invalid("File name has no ASCII letters or digits");
            const output = path.join(target, stem + (outputExtension ? `.${outputExtension}` : ""));
            yield* reserve(output);
            const cover =
              selected && kind === "video" ? path.join(target, `${stem}.webp`) : undefined;
            if (cover) yield* reserve(cover);
            // Reserve both possible audio outcomes before any output is written.
            if (selected && kind === "audio" && extension !== ".flac")
              yield* reserve(path.join(target, `${stem}.flac`));
            planned.push({
              asset: { ...asset, kind, size: Number(info.size) },
              relative: output,
              selected,
              ...(cover ? { cover } : {}),
            });
          } else assets.push({ ...asset, status: "skipped", errorCode: "UNSUPPORTED_FILE" });
        }
      }).pipe(
        Effect.mapError((error) =>
          error instanceof OperationError
            ? error
            : new OperationError({ code: "IO_FAILED", detail: "Cannot inspect folder" }),
        ),
      );
    yield* walk(source, rootName);
    if (
      planned.some(({ asset, selected }) => selected && asset.kind === "video") &&
      ((validated.width ?? 2) < 2 || (validated.height ?? 2) < 2)
    )
      return yield* invalid("Video dimensions must be at least 2 pixels");
    const taskId = randomUUID();
    const directory = yield* createDeliveryDirectory(destination, taskId);
    const createdAt = new Date().toISOString();
    const manifest = (): Manifest => ({
      schemaVersion: planned.some((p) => p.selected && p.asset.kind === "model")
        ? 6
        : planned.some((p) => p.asset.kind === "audio")
          ? 4
          : 2,
      taskId,
      createdAt,
      operation: "folder",
      status: assets.some((a) => a.status === "failed")
        ? assets.some((a) => a.status === "succeeded")
          ? "partial"
          : "failed"
        : assets.some((a) => a.status === "succeeded")
          ? "succeeded"
          : "empty",
      parameters: {
        recursive: true,
        video: {
          ...videoEncoding(validated),
          coverQuality: imageQuality(validated),
          preset: validated.preset ?? "standard",
        },
        image: {
          ...Object.fromEntries(
            Object.entries(validated).filter(([, value]) => value !== undefined),
          ),
          namingPolicy: 1,
          media,
          ...(validated.preset === "clarity"
            ? { quality: imageQuality(validated), effort: 6, smartSubsample: "true" }
            : {}),
        },
      },
      assets: [...assets],
    });
    return yield* Effect.gen(function* () {
      for (const dir of directories)
        yield* fs.makeDirectory(path.join(directory, dir), { recursive: true });
      for (const item of planned) {
        const { asset } = item;
        const output = path.join(directory, item.relative);
        yield* Effect.scoped(
          Effect.gen(function* () {
            const staging = yield* fs.makeTempDirectoryScoped({ directory, prefix: ".folder-" });
            if (!item.selected) {
              const temp = path.join(staging, "copy");
              yield* fs.copyFile(asset.source, temp);
              yield* Effect.uninterruptible(
                Effect.gen(function* () {
                  yield* fs.link(temp, output);
                  assets.push({
                    ...asset,
                    status: "succeeded",
                    output,
                    outputSize: asset.size,
                    sizeChange: 0,
                    note: "Not selected; copied unchanged",
                  });
                }),
              );
            } else if (asset.kind === "audio" || asset.kind === "model") {
              const result = yield* asset.kind === "audio"
                ? compressAudio(asset.source, staging)
                : compressGlb(asset.source, staging);
              const destination =
                output.slice(0, -path.extname(output).length) + `.${result.format}`;
              yield* Effect.uninterruptible(
                Effect.gen(function* () {
                  yield* fs.link(result.output, destination);
                  assets.push({
                    ...asset,
                    status: "succeeded",
                    output: destination,
                    outputFormat: result.format,
                    outputSize: result.size,
                    sizeChange: result.size - asset.size!,
                    lossless: true,
                    optimization: result.optimization,
                    ...("reason" in result && result.reason ? { note: result.reason } : {}),
                    ...("sampleRate" in result
                      ? {
                          sampleRate: result.sampleRate,
                          channels: result.channels,
                          bitsPerSample: result.bitsPerSample,
                        }
                      : {}),
                  });
                }),
              );
              if (asset.kind === "model") {
                yield* writeManifest(directory, manifest());
                const posters = yield* generateModelPosters(
                  asset.source,
                  {},
                  path.dirname(destination),
                );
                assets.push(...posters.assets);
                yield* writeManifest(directory, manifest());
              }
            } else if (asset.kind === "video") {
              const result = yield* compressVideo(asset.source, staging, validated);
              yield* Effect.uninterruptible(
                Effect.gen(function* () {
                  const cover = path.join(directory, item.cover!);
                  yield* fs.rename(result.output, output);
                  yield* fs.rename(result.cover, cover);
                  assets.push({
                    ...asset,
                    status: "succeeded",
                    output,
                    outputSize: result.size,
                    outputWidth: result.width,
                    outputHeight: result.height,
                    outputFormat: "mp4",
                    sizeChange: result.size - asset.size!,
                  });
                  assets.push({
                    ...asset,
                    assetId: `${asset.assetId}-cover`,
                    kind: "image",
                    status: "succeeded",
                    output: cover,
                    outputSize: result.coverSize,
                    outputWidth: result.width,
                    outputHeight: result.height,
                    outputFormat: "webp",
                  });
                }),
              );
            } else {
              yield* Effect.uninterruptible(
                Effect.gen(function* () {
                  const temp = path.join(staging, "asset");
                  if (asset.kind === "image") {
                    const metadata = yield* inspectImage(asset.source);
                    if ((metadata.pages ?? 1) > 1) {
                      assets.push({
                        ...asset,
                        status: "skipped",
                        errorCode: "ANIMATED_IMAGE_UNSUPPORTED",
                      });
                      return;
                    }
                    const result = yield* processImage(asset.source, temp, {
                      ...validated,
                      format: "webp",
                    });
                    yield* fs.rename(temp, output);
                    assets.push({
                      ...asset,
                      status: "succeeded",
                      output,
                      width: metadata.width,
                      height: metadata.height,
                      outputSize: result.size,
                      outputWidth: result.width,
                      outputHeight: result.height,
                      outputFormat: result.format,
                      sizeChange: result.size - asset.size!,
                    });
                  } else {
                    yield* fs.copyFile(asset.source, temp);
                    yield* fs.rename(temp, output);
                    assets.push({
                      ...asset,
                      status: "succeeded",
                      output,
                      outputSize: asset.size,
                      sizeChange: 0,
                    });
                  }
                }),
              );
            }
          }),
        ).pipe(
          Effect.catch(() =>
            Effect.sync(() =>
              assets.push({ ...asset, status: "failed", errorCode: "PROCESSING_FAILED" }),
            ),
          ),
        );
      }
      const result = manifest();
      yield* writeManifest(directory, result);
      return { ...result, directory };
    }).pipe(
      Effect.onInterrupt(() =>
        writeManifest(directory, {
          ...manifest(),
          status: "cancelled",
          assets: [
            ...assets,
            ...planned
              .filter((p) => !assets.some((a) => a.assetId === p.asset.assetId))
              .map((p) => ({ ...p.asset, status: "skipped" as const, errorCode: "CANCELLED" })),
          ],
        }),
      ),
    );
  });
