import type { UploadProgress, UploadProgressObserver } from "./progress.js";
import { randomUUID } from "node:crypto";
import * as path from "node:path";
import { Cause, Effect, Exit, FileSystem, Schema } from "effect";
import { canonical, decode, Destination, digest, fail, text, UploadError } from "./common.js";
import type { UploadConfig } from "./config.js";
import { Entry, hashFile, inspectAsset, readArtifact, readPlan, safePath, within } from "./plan.js";
import { publicHead, remoteDigest, remoteHead, remotePut } from "./r2.js";

const Transfer = Schema.Literals([
  "not_sent",
  "sending",
  "uploaded",
  "conflict",
  "failed",
  "unknown",
]);
const PublicCheck = Schema.Struct({
  outcome: Schema.Literals(["not_attempted", "reachable", "unreachable", "unknown"]),
  status: Schema.optional(Schema.Number),
  observedAt: Schema.optional(text),
});
export const Receipt = Schema.Struct({
  kind: Schema.Literal("file-forge.upload-receipt"),
  schemaVersion: Schema.Literal(1),
  planId: text,
  planHash: digest,
  project: text,
  destination: Destination,
  createdAt: text,
  updatedAt: text,
  status: Schema.Literals(["succeeded", "partial", "failed", "cancelled"]),
  entries: Schema.Array(
    Schema.Struct({
      ...Entry.fields,
      transfer: Transfer,
      publicCheck: PublicCheck,
      errorCode: Schema.optional(text),
    }),
  ),
});
type Receipt = {
  -readonly [K in keyof typeof Receipt.Type]: K extends "entries"
    ? Array<{
        -readonly [
          P in keyof (typeof Receipt.Type)["entries"][number]
        ]: (typeof Receipt.Type)["entries"][number][P];
      }>
    : (typeof Receipt.Type)[K];
};
export const receiptPathFor = (plan: string) =>
  path.join(path.dirname(path.resolve(plan)), "receipt.json");
const journal = (file: string, receipt: Receipt) =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      receipt.updatedAt = new Date().toISOString();
      const temporary = `${file}.${randomUUID()}.tmp`;
      yield* Effect.acquireRelease(Effect.succeed(temporary), (name) =>
        fs.remove(name, { force: true }).pipe(Effect.orDie),
      );
      const handle = yield* fs.open(temporary, { flag: "wx", mode: 0o600 });
      yield* handle.writeAll(new TextEncoder().encode(JSON.stringify(receipt, null, 2) + "\n"));
      yield* handle.sync;
      yield* fs.rename(temporary, file);
      const directory = yield* fs.open(path.dirname(file), { flag: "r" });
      yield* directory.sync;
    }),
  ).pipe(
    Effect.mapError(
      () =>
        new UploadError({
          code: "RECEIPT_WRITE_FAILED",
          receiptPath: file,
          ...(receipt.entries.some((entry) =>
            ["sending", "uploaded", "unknown"].includes(entry.transfer),
          )
            ? { remoteOutcome: "unknown" as const }
            : {}),
        }),
    ),
  );
export const applyUpload = (
  request: { project: string; plan: string; planHash: string },
  config: UploadConfig,
  executionToken: string,
  onProgress?: UploadProgressObserver,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const plan = yield* readPlan(request.plan);
      if (
        plan.project !== request.project ||
        plan.planHash !== request.planHash ||
        canonical(plan.destination) !== canonical(config.destination)
      )
        return yield* fail("UPLOAD_PLAN_STALE");
      const receiptPath = receiptPathFor(request.plan);
      yield* safePath(path.dirname(receiptPath));
      if (within(plan.source, receiptPath)) return yield* fail("UPLOAD_PLAN_INVALID");
      for (const entry of plan.entries) {
        yield* inspectAsset(entry.source, config);
        const hash = yield* hashFile(entry.source);
        if (hash.sha256 !== entry.sha256 || hash.size !== entry.size)
          return yield* fail("UPLOAD_INPUT_CHANGED");
      }
      // Keep the durable claim forever; an interrupted plan must never be replayed.
      const claim = yield* fs
        .open(`${request.plan}.execution`, { flag: "wx", mode: 0o600 })
        .pipe(Effect.mapError(() => new UploadError({ code: "UPLOAD_ALREADY_STARTED" })));
      yield* claim.writeAll(
        new TextEncoder().encode(
          JSON.stringify({ planId: plan.id, planHash: plan.planHash, receiptPath }),
        ),
      );
      yield* claim.sync;
      const claimDirectory = yield* fs.open(path.dirname(path.resolve(request.plan)), {
        flag: "r",
      });
      yield* claimDirectory.sync;
      if (yield* fs.exists(receiptPath)) return yield* fail("UPLOAD_ALREADY_STARTED");
      const receipt: Receipt = {
        kind: "file-forge.upload-receipt",
        schemaVersion: 1,
        planId: plan.id,
        planHash: plan.planHash,
        project: plan.project,
        destination: plan.destination,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "partial",
        entries: plan.entries.map((entry) => ({
          ...entry,
          transfer: "not_sent",
          publicCheck: { outcome: "not_attempted" },
        })),
      };
      yield* journal(receiptPath, receipt);
      const overallTotal = plan.entries.reduce((sum, entry) => sum + entry.size, 0);
      let overallBytes = 0;
      const work = Effect.gen(function* () {
        for (const [index, entry] of receipt.entries.entries()) {
          let fileBytes = 0;
          const report = (phase: UploadProgress["phase"]) =>
            onProgress
              ? onProgress({
                  key: entry.key,
                  fileIndex: index + 1,
                  fileCount: receipt.entries.length,
                  fileBytes,
                  fileTotal: entry.size,
                  overallBytes,
                  overallTotal,
                  filePercent: entry.size
                    ? Math.floor((fileBytes * 100) / entry.size)
                    : phase === "sending"
                      ? 0
                      : 100,
                  overallPercent: overallTotal
                    ? Math.floor((overallBytes * 100) / overallTotal)
                    : Math.floor(
                        ((index + (phase === "sending" ? 0 : 1)) * 100) / receipt.entries.length,
                      ),
                  phase,
                  publicOutcome: phase === "public_result" ? entry.publicCheck.outcome : undefined,
                })
              : Effect.void;
          const outcome = yield* Effect.scoped(
            Effect.gen(function* () {
              yield* inspectAsset(entry.source, config);
              const staging = yield* fs.makeTempDirectoryScoped({
                directory: path.dirname(receiptPath),
                prefix: `.upload-stage-${executionToken}-`,
              });
              yield* fs.chmod(staging, 0o700);
              const snapshot = path.join(staging, "asset");
              yield* fs.copyFile(entry.source, snapshot);
              yield* fs.chmod(snapshot, 0o600);
              const copied = yield* hashFile(snapshot);
              if (copied.sha256 !== entry.sha256 || copied.size !== entry.size)
                return yield* fail("UPLOAD_INPUT_CHANGED");
              let condition: Record<string, string> = { "if-none-match": "*" };
              if (entry.intent === "replace") {
                const head = yield* remoteHead(config, entry);
                if (head.status === 200 && head.etag) condition = { "if-match": head.etag };
                else if (head.status !== 404) return yield* fail("UPLOAD_OUTCOME_UNKNOWN");
              }
              yield* Effect.uninterruptible(
                Effect.gen(function* () {
                  entry.transfer = "sending";
                  yield* journal(receiptPath, receipt);
                }),
              );
              yield* report("sending");
              if (entry.size === 0) yield* report("awaiting_confirmation");
              const status = yield* remotePut(config, entry, snapshot, condition, (bytes) =>
                Effect.gen(function* () {
                  fileBytes += bytes;
                  overallBytes += bytes;
                  yield* report(fileBytes === entry.size ? "awaiting_confirmation" : "sending");
                }),
              );
              entry.transfer =
                status >= 200 && status < 300
                  ? "uploaded"
                  : status === 412
                    ? "conflict"
                    : status === 401 || status === 403
                      ? "failed"
                      : "unknown";
              if (entry.transfer !== "uploaded")
                entry.errorCode =
                  entry.transfer === "conflict"
                    ? "UPLOAD_CONFLICT"
                    : entry.transfer === "unknown"
                      ? "UPLOAD_OUTCOME_UNKNOWN"
                      : "UPLOAD_DENIED";
              yield* journal(receiptPath, receipt);
              if (entry.transfer === "uploaded") {
                yield* report("confirmed");
                yield* report("public_check");
                entry.publicCheck = yield* publicHead(entry.url);
                yield* journal(receiptPath, receipt);
                yield* report("public_result");
              }
            }),
          ).pipe(Effect.result);
          if (outcome._tag === "Failure") {
            if (
              outcome.failure instanceof UploadError &&
              outcome.failure.code === "RECEIPT_WRITE_FAILED"
            )
              return yield* Effect.fail(outcome.failure);
            entry.errorCode =
              outcome.failure instanceof UploadError ? outcome.failure.code : "UPLOAD_IO_FAILED";
            if (entry.transfer === "sending") entry.transfer = "unknown";
            else if (entry.transfer === "not_sent") entry.transfer = "failed";
            yield* journal(receiptPath, receipt);
            break;
          }
          if (entry.transfer !== "uploaded") break;
        }
        receipt.status = receipt.entries.every(
          (entry) => entry.transfer === "uploaded" && entry.publicCheck.outcome === "reachable",
        )
          ? "succeeded"
          : receipt.entries.some(
                (entry) =>
                  entry.transfer === "uploaded" ||
                  entry.transfer === "unknown" ||
                  entry.transfer === "sending",
              )
            ? "partial"
            : "failed";
      }).pipe(
        Effect.onExit((exit) =>
          Effect.gen(function* () {
            if (Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause)) {
              for (const entry of receipt.entries)
                if (entry.transfer === "sending") entry.transfer = "unknown";
              receipt.status = "cancelled";
              yield* journal(receiptPath, receipt).pipe(Effect.orDie);
            }
          }),
        ),
      );
      yield* work;
      yield* journal(receiptPath, receipt);
      return { status: receipt.status, receiptPath, receipt };
    }),
  );
export const verifyUpload = (request: { project: string; receipt: string }, config: UploadConfig) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const receipt = yield* decode(Receipt, yield* readArtifact(request.receipt));
    const plan = yield* readPlan(path.join(path.dirname(request.receipt), "plan.json"));
    if (
      receipt.project !== request.project ||
      plan.project !== request.project ||
      receipt.planId !== plan.id ||
      receipt.planHash !== plan.planHash ||
      canonical(receipt.destination) !== canonical(config.destination) ||
      canonical(plan.destination) !== canonical(config.destination) ||
      canonical(
        receipt.entries.map(
          ({ transfer: _transfer, publicCheck: _publicCheck, errorCode: _errorCode, ...entry }) =>
            entry,
        ),
      ) !== canonical(plan.entries)
    )
      return yield* fail("UPLOAD_PLAN_STALE");
    const entries = [];
    for (const entry of receipt.entries) {
      const head = yield* remoteHead(config, entry).pipe(Effect.result);
      const result =
        head._tag === "Failure"
          ? "unknown"
          : head.success.status === 404
            ? "absent_observed"
            : head.success.status === 200 && head.success.etag
              ? yield* remoteDigest(config, entry, head.success.etag)
              : "unknown";
      entries.push({ key: entry.key, result, observedAt: new Date().toISOString() });
    }
    const observation = {
      kind: "file-forge.upload-observation",
      schemaVersion: 1,
      planId: plan.id,
      planHash: plan.planHash,
      project: request.project,
      receiptPath: path.resolve(request.receipt),
      entries,
    };
    const observationPath = path.join(
      path.dirname(request.receipt),
      `observation-${randomUUID()}.json`,
    );
    yield* fs.writeFileString(observationPath, JSON.stringify(observation, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    return {
      status: entries.every((entry) => entry.result === "matches") ? "succeeded" : "partial",
      observationPath,
      observation,
    };
  });
