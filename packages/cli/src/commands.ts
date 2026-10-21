import { homedir } from "node:os";
import { Effect, FileSystem, Layer, Option, Path } from "effect";
import { Argument, Command, Flag } from "effect/cli";
import { executeRequest, OperationError, type Manifest } from "@file-forge/core";
import { ffmpegLayer, FaviconEngineLive, ImageEngineLive, posterLayer } from "@file-forge/media";

export const MediaLive = Layer.mergeAll(
  ImageEngineLive,
  posterLayer(process.env.FILE_FORGE_CHROME_PATH),
  FaviconEngineLive,
  ffmpegLayer(process.env.FFMPEG_PATH || "ffmpeg", process.env.FFPROBE_PATH),
);
export const commands = (
  emit: (result: Manifest & { directory?: string }) => Effect.Effect<void>,
  progress: Effect.Effect<void>,
  faviconProgress: Effect.Effect<void>,
) => {
  const files = Argument.String("files").pipe(Argument.variadic());
  const output = Flag.String("output").pipe(Flag.optional);
  const recursive = Flag.Boolean("recursive").pipe(Flag.withDefault(false));
  const outputParent = (value: Option.Option<string>) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      if (Option.isSome(value)) return path.resolve(value.value);
      if (process.platform !== "darwin")
        return yield* new OperationError({
          code: "INVALID_INPUT",
          detail: "Explicit output is required outside macOS",
        });
      return path.join(homedir(), "Downloads");
    });
  const inspect = Command.make("inspect", { files, recursive }, ({ files, recursive }) =>
    executeRequest({ operation: "inspect", files, recursive }).pipe(Effect.flatMap(emit)),
  );
  const processCommand = Command.make(
    "process",
    {
      files,
      recursive,
      output,
      width: Flag.Int("width").pipe(Flag.optional),
      height: Flag.Int("height").pipe(Flag.optional),
      quality: Flag.Int("quality").pipe(Flag.optional),
      format: Flag.String("format").pipe(Flag.optional),
      preset: Flag.String("preset").pipe(Flag.optional),
    },
    (args) =>
      Effect.gen(function* () {
        const parent = yield* outputParent(args.output);
        yield* progress;
        // Shared core runtime schema validates the untrusted CLI format and numeric values.
        const options = Object.fromEntries(
          ["width", "height", "quality", "format", "preset"].flatMap((key) => {
            const value: Option.Option<string | number> =
              args[key as "width" | "height" | "quality" | "format" | "preset"];
            return Option.isSome(value) ? [[key, value.value]] : [];
          }),
        );
        const result = yield* executeRequest({
          operation: "image",
          files: args.files,
          options,
          output: parent,
          recursive: args.recursive,
        });
        yield* emit(result);
      }),
  );
  const compression = (kind: "image" | "video" | "folder") =>
    Command.make(
      "compress",
      {
        files,
        output,
        recursive,
        width: Flag.Int("width").pipe(Flag.optional),
        height: Flag.Int("height").pipe(Flag.optional),
        quality: Flag.Int("quality").pipe(Flag.optional),
        preset: Flag.String("preset").pipe(Flag.optional),
      },
      (args) =>
        Effect.gen(function* () {
          if (kind !== "image" && args.files.length !== 1)
            return yield* new OperationError({
              code: "INVALID_INPUT",
              detail: "Supply one input path",
            });
          const result = yield* executeRequest({
            operation: `${kind}-compress`,
            ...(kind !== "image"
              ? { input: args.files[0] }
              : { files: args.files, recursive: args.recursive }),
            options: {
              ...(Option.isSome(args.width) ? { width: args.width.value } : {}),
              ...(Option.isSome(args.height) ? { height: args.height.value } : {}),
              ...(Option.isSome(args.quality) ? { quality: args.quality.value } : {}),
              ...(Option.isSome(args.preset) ? { preset: args.preset.value } : {}),
            },
            output: yield* outputParent(args.output),
          });
          yield* emit(result);
        }),
    );
  const rename = Command.make(
    "rename",
    {
      input: Argument.String("input"),
      renames: Flag.String("renames"),
      output,
      apply: Flag.Boolean("apply").pipe(Flag.withDefault(false)),
    },
    (args) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const content = yield* fs.readFileString(args.renames);
        const renames = yield* Effect.try({
          try: () => JSON.parse(content) as unknown,
          catch: () =>
            new OperationError({ code: "INVALID_INPUT", detail: "Invalid rename plan JSON" }),
        });
        yield* executeRequest({
          operation: "folder-rename",
          input: args.input,
          renames,
          apply: args.apply,
          output: yield* outputParent(args.output),
        }).pipe(Effect.flatMap(emit));
      }),
  );
  const image = Command.make("image").pipe(
    Command.withSubcommands([processCommand, compression("image")]),
  );
  const video = Command.make("video").pipe(Command.withSubcommands([compression("video")]));
  const delivery = Command.make(
    "export",
    {
      files,
      recursive,
      output,
      manifest: Flag.String("manifest").pipe(Flag.optional),
      includePaths: Flag.Boolean("include-paths").pipe(Flag.withDefault(false)),
    },
    (args) =>
      Effect.gen(function* () {
        if (Option.isSome(args.manifest) && args.files.length)
          return yield* new OperationError({
            code: "INVALID_INPUT",
            detail: "Choose files or a manifest",
          });
        const result = yield* executeRequest({
          operation: "export",
          ...(Option.isSome(args.manifest)
            ? { manifest: args.manifest.value }
            : { files: args.files }),
          output: yield* outputParent(args.output),
          recursive: args.recursive,
          includePaths: args.includePaths,
        });
        yield* emit(result);
      }),
  );
  const favicon = Command.make(
    "generate",
    {
      input: Argument.String("input"),
      output,
      size: Flag.Int("size").pipe(Flag.withDefault(64)),
    },
    (args) =>
      Effect.gen(function* () {
        yield* faviconProgress;
        const result = yield* executeRequest({
          operation: "favicon",
          input: args.input,
          output: yield* outputParent(args.output),
          size: args.size,
        });
        yield* emit(result);
      }),
  );
  const lossless = (kind: "audio" | "model") =>
    Command.make(kind).pipe(
      Command.withSubcommands([
        ...(kind === "model"
          ? [
              Command.make(
                "posters",
                {
                  input: Argument.String("input"),
                  output,
                  width: Flag.Int("width").pipe(Flag.optional),
                  height: Flag.Int("height").pipe(Flag.optional),
                  ratio: Flag.String("ratio").pipe(Flag.optional),
                },
                (args) =>
                  Effect.gen(function* () {
                    yield* executeRequest({
                      operation: "model-posters",
                      input: args.input,
                      output: yield* outputParent(args.output),
                      options: {
                        ...(Option.isSome(args.width) ? { width: args.width.value } : {}),
                        ...(Option.isSome(args.height) ? { height: args.height.value } : {}),
                        ...(Option.isSome(args.ratio) ? { ratio: args.ratio.value } : {}),
                      },
                    }).pipe(Effect.flatMap(emit));
                  }),
              ),
            ]
          : []),
        Command.make("compress", { input: Argument.String("input"), output }, (args) =>
          Effect.gen(function* () {
            yield* executeRequest({
              operation: `${kind}-compress`,
              input: args.input,
              output: yield* outputParent(args.output),
            }).pipe(Effect.flatMap(emit));
          }),
        ),
      ]),
    );
  return [
    lossless("audio"),
    lossless("model"),
    inspect,
    Command.make("favicon").pipe(Command.withSubcommands([favicon])),
    image,
    video,
    Command.make("folder").pipe(Command.withSubcommands([compression("folder"), rename])),
    Command.make("manifest").pipe(Command.withSubcommands([delivery])),
  ] as const;
};
