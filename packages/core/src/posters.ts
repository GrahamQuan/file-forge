import { createHash, randomUUID } from "node:crypto";
import { Effect, FileSystem, Path } from "effect";
import {
  openPosterRenderer,
  processImage,
  posterViews,
  validatePosterOptions,
  type PosterOptions,
} from "@file-forge/media";
import {
  createDeliveryDirectory,
  isSymlink,
  OperationError,
  writeManifest,
  type Asset,
  type Manifest,
} from "./index.js";

export const generateModelPosters = (input: string, options: PosterOptions, parent: string) =>
  Effect.gen(function* () {
    const dimensions = yield* validatePosterOptions(options);
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    if (yield* isSymlink(input))
      return yield* new OperationError({
        code: "INVALID_INPUT",
        detail: "Select a regular GLB file",
      });
    const source = yield* fs.realPath(input);
    if ((yield* fs.stat(source)).type !== "File" || path.extname(source).toLowerCase() !== ".glb")
      return yield* new OperationError({
        code: "INVALID_INPUT",
        detail: "Select a regular GLB file",
      });
    const stem =
      path
        .basename(source, path.extname(source))
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 180)
        .replace(/-$/, "") || "model";
    const taskId = randomUUID();
    const directory = yield* createDeliveryDirectory(parent, taskId);
    let manifest: Manifest = {
      schemaVersion: 5,
      taskId,
      createdAt: new Date().toISOString(),
      operation: "model-posters",
      status: "failed",
      parameters: {
        recursive: false,
        image: { format: "webp", encoding: "lossless", resize: "none", workflow: "process-image" },
        poster: {
          ...dimensions,
          format: "webp",
          encoding: "lossless",
          projection: "orthographic",
          pose: "default-scene",
          background: "transparent",
          lighting: "room-environment",
          orientation: "gltf-y-up-front-positive-z",
        },
      },
      assets: posterViews.map((view) => ({
        assetId: createHash("sha256").update(`${source}:${view}`).digest("hex"),
        source,
        originalName: path.basename(source),
        kind: "image",
        view,
        status: "skipped",
        errorCode: "NOT_RENDERED",
      })),
    };
    yield* writeManifest(directory, manifest);
    return yield* Effect.scoped(
      Effect.gen(function* () {
        const staging = yield* fs.makeTempDirectoryScoped({ directory, prefix: ".posters-" });
        const renderer = yield* openPosterRenderer(source, staging, options);
        manifest = {
          ...manifest,
          parameters: {
            ...manifest.parameters,
            poster: {
              ...dimensions,
              ...renderer.renderer,
              format: "webp",
              encoding: "lossless",
              orientation: "gltf-y-up-front-positive-z",
            },
          },
        };
        for (let index = 0; index < posterViews.length; index++) {
          const view = posterViews[index]!;
          const result = yield* renderer.render(view, path.join(staging, `${view}.png`));
          const processedPath = path.join(staging, `${view}.webp`);
          const processed = yield* processImage(
            result.output,
            processedPath,
            { format: "webp" },
            "lossless-webp",
          );
          yield* Effect.uninterruptible(
            Effect.gen(function* () {
              const output = path.join(directory, `${stem}-${view}.webp`);
              yield* fs.link(processedPath, output);
              const assets: Asset[] = [...manifest.assets];
              assets[index] = {
                assetId: assets[index]!.assetId,
                source,
                originalName: path.basename(source),
                kind: "image",
                status: "succeeded",
                view,
                camera: result.camera,
                output,
                outputSize: processed.size,
                outputFormat: "webp",
                outputWidth: processed.width,
                outputHeight: processed.height,
                lossless: true,
                optimization: "rendered-poster",
              };
              manifest = {
                ...manifest,
                status: index === posterViews.length - 1 ? "succeeded" : "partial",
                assets,
              };
              yield* writeManifest(directory, manifest);
            }),
          );
        }
        return { ...manifest, directory };
      }),
    ).pipe(
      Effect.catch((error) =>
        Effect.gen(function* () {
          const assets = [...manifest.assets];
          const pending = assets.findIndex((asset) => asset.status === "skipped");
          if (pending >= 0)
            assets[pending] = {
              ...assets[pending]!,
              status: "failed",
              errorCode:
                typeof error === "object" && error !== null && "code" in error
                  ? String(error.code)
                  : "POSTER_RENDER_FAILED",
            };
          manifest = {
            ...manifest,
            assets,
            status: assets.some((asset) => asset.status === "succeeded") ? "partial" : "failed",
          };
          yield* writeManifest(directory, manifest);
          return { ...manifest, directory };
        }),
      ),
      Effect.onInterrupt(() => writeManifest(directory, { ...manifest, status: "cancelled" })),
    );
  });
