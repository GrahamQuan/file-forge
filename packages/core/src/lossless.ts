import { createHash, randomUUID } from "node:crypto";
import { Cause, Effect, Exit, FileSystem, Path } from "effect";
import { audioExtensions, compressAudio, compressGlb } from "@file-forge/media";
import {
  createDeliveryDirectory,
  generateModelPosters,
  isSymlink,
  OperationError,
  outputName,
  writeManifest,
  type Manifest,
} from "./index.js";

export const compressLosslessFile = (input: string, kind: "audio" | "model", parent: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    if (yield* isSymlink(input))
      return yield* new OperationError({ code: "INVALID_INPUT", detail: "Select a regular file" });
    const source = yield* fs.realPath(input);
    const info = yield* fs.stat(source);
    const extension = path.extname(source).toLowerCase();
    if (
      info.type !== "File" ||
      (kind === "model" ? extension !== ".glb" : !audioExtensions.has(extension))
    )
      return yield* new OperationError({
        code: "INVALID_INPUT",
        detail: "Unsupported input format",
      });
    const taskId = randomUUID();
    const directory = yield* createDeliveryDirectory(parent, taskId);
    const asset = {
      assetId: createHash("sha256").update(source).digest("hex"),
      source,
      originalName: path.basename(source),
      kind,
      size: Number(info.size),
      status: "failed" as const,
    };
    let manifest: Manifest = {
      ...(kind === "model"
        ? { schemaVersion: 6 as const, operation: "model" as const }
        : { schemaVersion: 4 as const, operation: "audio" as const }),
      taskId,
      createdAt: new Date().toISOString(),
      status: "failed",
      parameters: { recursive: false },
      assets: [asset],
    };
    return yield* Effect.scoped(
      Effect.gen(function* () {
        const staging = yield* fs.makeTempDirectoryScoped({ directory, prefix: ".lossless-" });
        const result = yield* kind === "audio"
          ? compressAudio(source, staging)
          : compressGlb(source, staging);
        const output = path.join(directory, outputName(asset.originalName, source, result.format));
        const completed = yield* Effect.uninterruptible(
          Effect.gen(function* () {
            yield* fs.link(result.output, output);
            const completed: Manifest = {
              ...manifest,
              status: "succeeded",
              assets: [
                {
                  ...asset,
                  status: "succeeded",
                  output,
                  outputSize: result.size,
                  outputFormat: result.format,
                  sizeChange: result.size - asset.size,
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
                },
              ],
            };
            manifest = completed;
            yield* writeManifest(directory, completed);
            return { ...completed, directory };
          }),
        );
        if (kind === "model") {
          const posters = yield* generateModelPosters(source, {}, directory);
          manifest = {
            ...completed,
            status: posters.status === "succeeded" ? "succeeded" : "partial",
            parameters: { ...completed.parameters, ...posters.parameters },
            assets: [...completed.assets, ...posters.assets],
          };
          yield* writeManifest(directory, manifest);
          return { ...manifest, directory };
        }
        return completed;
      }),
    ).pipe(
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
