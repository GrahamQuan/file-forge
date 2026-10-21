import { createHash, randomUUID } from "node:crypto";
import { Cause, Effect, Exit, FileSystem, Path } from "effect";
import { audioExtensions, compressAudio, compressGlb } from "@file-forge/media";
import {
  createDeliveryDirectory,
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
    const manifest: Manifest = {
      schemaVersion: 4,
      taskId,
      createdAt: new Date().toISOString(),
      operation: kind,
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
        return yield* Effect.uninterruptible(
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
            yield* writeManifest(directory, completed);
            return { ...completed, directory };
          }),
        );
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
