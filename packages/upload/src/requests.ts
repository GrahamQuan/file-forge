import { listFolders } from "./folders.js";
import type { UploadProgressObserver } from "./progress.js";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { Effect, FileSystem, Schema } from "effect";
import { decode, digest, fail, text, UploadError } from "./common.js";
import { configPath, loadConfig } from "./config.js";
import { applyUpload, verifyUpload } from "./execute.js";
import { planUpload, readPlan, within } from "./plan.js";

export const CheckUploadRequest = Schema.Struct({
  operation: Schema.Literal("upload-check"),
  project: text,
});
export const FolderListRequest = Schema.Struct({
  operation: Schema.Literal("upload-folders"),
  project: text,
  prefix: Schema.optional(text),
});
export const PlanUploadRequest = Schema.Struct({
  operation: Schema.Literal("upload-plan"),
  project: text,
  input: text,
  output: text,
  recursive: Schema.optional(Schema.Boolean),
  overwriteKeys: Schema.optional(Schema.Array(text)),
});
export const ApplyUploadRequest = Schema.Struct({
  operation: Schema.Literal("upload-apply"),
  project: text,
  plan: text,
  planHash: digest,
});
export const VerifyUploadRequest = Schema.Struct({
  operation: Schema.Literal("upload-verify"),
  project: text,
  receipt: text,
});
export const UploadRequest = Schema.Union([
  CheckUploadRequest,
  FolderListRequest,
  PlanUploadRequest,
  ApplyUploadRequest,
  VerifyUploadRequest,
]);
export type UploadRequest = typeof UploadRequest.Type;
export const validateUploadRequest = (input: unknown) =>
  decode(UploadRequest, input, "INVALID_INPUT");
export const scopeUploadRequest = (input: unknown, root: string) =>
  Effect.gen(function* () {
    const request = yield* validateUploadRequest(input);
    const fs = yield* FileSystem.FileSystem;
    const resolve = (value: string) =>
      Effect.gen(function* () {
        const absolute = path.resolve(root, value);
        if (!within(root, absolute)) return yield* fail("PATH_OUTSIDE_ROOT");
        let ancestor = absolute;
        while (!(yield* fs.exists(ancestor))) ancestor = path.dirname(ancestor);
        if (!within(root, yield* fs.realPath(ancestor))) return yield* fail("PATH_OUTSIDE_ROOT");
        return absolute;
      });
    if (request.operation === "upload-plan")
      return {
        ...request,
        input: yield* resolve(request.input),
        output: yield* resolve(request.output),
      };
    if (request.operation === "upload-apply" || request.operation === "upload-verify") {
      const file = yield* resolve(
        request.operation === "upload-apply" ? request.plan : request.receipt,
      );
      const planFile =
        request.operation === "upload-apply"
          ? file
          : yield* resolve(path.join(path.dirname(file), "plan.json"));
      const plan = yield* readPlan(planFile);
      yield* resolve(plan.source);
      for (const entry of plan.entries) yield* resolve(entry.source);
      return request.operation === "upload-apply"
        ? { ...request, plan: file }
        : { ...request, receipt: file };
    }
    return request;
  });
export const executeUploadRequest = (
  input: unknown,
  privateConfig = configPath(),
  executionToken: string = randomUUID(),
  onProgress?: UploadProgressObserver,
) =>
  Effect.gen(function* () {
    if (!/^[a-f0-9-]{36}$/.test(executionToken)) return yield* fail("INVALID_INPUT");
    const request = yield* validateUploadRequest(input);
    const config = yield* loadConfig(privateConfig, request.project);
    switch (request.operation) {
      case "upload-check":
        return {
          status: "succeeded",
          project: request.project,
          readiness: "offline",
          protection: "checked",
          remoteConnectivity: "not_checked",
        };
      case "upload-folders":
        return yield* listFolders(config, request.project, request.prefix);
      case "upload-plan":
        return yield* planUpload(request, config);
      case "upload-apply":
        return yield* applyUpload(request, config, executionToken, onProgress);
      case "upload-verify":
        return yield* verifyUpload(request, config);
    }
  }).pipe(
    Effect.mapError((error) =>
      error instanceof UploadError ? error : new UploadError({ code: "UPLOAD_IO_FAILED" }),
    ),
  );
export type UploadResult = Effect.Success<ReturnType<typeof executeUploadRequest>>;
