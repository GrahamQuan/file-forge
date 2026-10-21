import { Effect, Schema } from "effect";
import { CompressionOptionsSchema, ImageOptionsSchema, FaviconSizeSchema } from "@file-forge/media";
import {
  compressImages,
  compressFolder,
  renameFolders,
  compressVideoFile,
  exportManifest,
  generateFavicons,
  inspectFiles,
  OperationError,
  processImages,
  readManifest,
} from "./index.js";
const text = Schema.String.check(Schema.isMinLength(1));
const files = Schema.Array(text).check(Schema.isMinLength(1));
export const InspectRequest = Schema.Struct({
  operation: Schema.Literal("inspect"),
  files,
  recursive: Schema.optional(Schema.Boolean),
});
export const ImageRequest = Schema.Struct({
  operation: Schema.Literal("image"),
  files,
  options: ImageOptionsSchema,
  output: text,
  recursive: Schema.optional(Schema.Boolean),
});
export const ImageCompressionRequest = Schema.Struct({
  operation: Schema.Literal("image-compress"),
  files,
  options: CompressionOptionsSchema,
  output: text,
  recursive: Schema.optional(Schema.Boolean),
});
export const VideoCompressionRequest = Schema.Struct({
  operation: Schema.Literal("video-compress"),
  input: text,
  options: CompressionOptionsSchema,
  output: text,
});
export const FolderCompressionRequest = Schema.Struct({
  operation: Schema.Literal("folder-compress"),
  input: text,
  options: CompressionOptionsSchema,
  output: text,
});
export const FolderRenameRequest = Schema.Struct({
  operation: Schema.Literal("folder-rename"),
  input: text,
  output: text,
  renames: Schema.Array(Schema.Struct({ path: text, name: text })).check(Schema.isMinLength(1)),
  apply: Schema.optional(Schema.Boolean),
});
export const FaviconRequest = Schema.Struct({
  operation: Schema.Literal("favicon"),
  input: text,
  output: text,
  size: Schema.optional(FaviconSizeSchema),
});
export const ExportRequest = Schema.Struct({
  operation: Schema.Literal("export"),
  files: Schema.optional(files),
  manifest: Schema.optional(text),
  output: text,
  recursive: Schema.optional(Schema.Boolean),
  includePaths: Schema.optional(Schema.Boolean),
});
export const OperationRequest = Schema.Union([
  InspectRequest,
  ImageCompressionRequest,
  VideoCompressionRequest,
  FolderCompressionRequest,
  FolderRenameRequest,
  ImageRequest,
  FaviconRequest,
  ExportRequest,
]);
export type OperationRequest = typeof OperationRequest.Type;
export const validateRequest = (input: unknown) =>
  Schema.decodeUnknownEffect(OperationRequest)(input, { onExcessProperty: "error" }).pipe(
    Effect.mapError(
      () => new OperationError({ code: "INVALID_INPUT", detail: "Invalid operation request" }),
    ),
    Effect.tap((request) => {
      if (
        request.operation === "image" &&
        !Object.values(request.options).some((value) => value !== undefined)
      )
        return Effect.fail(
          new OperationError({
            code: "INVALID_INPUT",
            detail: "Explicit image options are required",
          }),
        );
      if (
        request.operation === "export" &&
        Boolean(request.files?.length) === Boolean(request.manifest)
      )
        return Effect.fail(
          new OperationError({ code: "INVALID_INPUT", detail: "Choose files or a manifest" }),
        );
      return Effect.void;
    }),
  );
export const executeRequest = (input: unknown) =>
  Effect.gen(function* () {
    const request = yield* validateRequest(input);
    switch (request.operation) {
      case "image-compress":
        return yield* compressImages(
          request.files,
          request.options,
          request.output,
          request.recursive,
        );
      case "folder-rename":
        return yield* renameFolders(request.input, request.renames, request.output, request.apply);
      case "folder-compress":
        return yield* compressFolder(request.input, request.options, request.output);
      case "video-compress":
        return yield* compressVideoFile(request.input, request.options, request.output);
      case "inspect":
        return yield* inspectFiles(request.files, request.recursive);
      case "image":
        return yield* processImages(
          request.files,
          request.options,
          request.output,
          request.recursive,
        );
      case "favicon":
        return yield* generateFavicons(request.input, request.output, request.size);
      case "export": {
        const source = request.manifest
          ? yield* readManifest(request.manifest)
          : yield* inspectFiles(request.files!, request.recursive);
        return yield* exportManifest(source, request.output, request.includePaths);
      }
    }
  });
