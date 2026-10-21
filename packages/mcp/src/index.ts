import { fileURLToPath } from "node:url";
import {
  Cause,
  Effect,
  Exit,
  Fiber,
  FileSystem,
  Logger,
  Path,
  Result,
  Schema,
  Scope,
  Stream,
} from "effect";
import { McpProtocol, McpServer, Tool, Toolkit } from "effect/ai";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { NodeServices } from "@effect/platform-node";
import {
  ImageCompressionRequest,
  VideoCompressionRequest,
  InspectRequest,
  ImageRequest,
  FaviconRequest,
  ExportRequest,
} from "@file-forge/core";
import { ffmpegLayer, getFfmpegStatus } from "@file-forge/media";
import { scopeRequest } from "./scope.js";
const requestId = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128));
const success = Schema.Record(Schema.String, Schema.Unknown);
const failure = Schema.Struct({ code: Schema.String });
const submission = <S extends Schema.Struct.Fields>(fields: S) =>
  Schema.Struct({ ...fields, requestId });
const tools = Toolkit.make(
  Tool.make("file_forge_info", {
    description: "Read runtime compatibility and session limits without processing assets.",
    success,
  }),
  Tool.make("inspect_files", {
    description: "Submit a local file inspection job. Poll job_status using the same requestId.",
    parameters: submission(InspectRequest.fields),
    success,
    failure,
  }).annotate(Tool.Strict, true),
  Tool.make("process_images", {
    description:
      "Submit image resize/compression/conversion. Preserves sources and writes a new delivery directory. Poll job_status.",
    parameters: submission(ImageRequest.fields),
    success,
    failure,
  }).annotate(Tool.Strict, true),
  Tool.make("compress_images", {
    description:
      "Resize and compress images to WebP. Ask the user for missing width or height before submitting. Poll job_status.",
    parameters: submission(ImageCompressionRequest.fields),
    success,
    failure,
  }).annotate(Tool.Strict, true),
  Tool.make("compress_video", {
    description:
      "Resize and compress one video to MP4 and create a first-frame WebP cover matching the resulting video dimensions. Ask for missing width or height first. Poll job_status.",
    parameters: submission(VideoCompressionRequest.fields),
    success,
    failure,
  }).annotate(Tool.Strict, true),
  Tool.make("generate_favicons", {
    description:
      "Submit static PNG to ICO, PNG and traced vector SVG (default 64 pixels). Tracing approximates colors and edges. Poll job_status.",
    parameters: submission(FaviconRequest.fields),
    success,
    failure,
  }).annotate(Tool.Strict, true),
  Tool.make("export_manifest", {
    description:
      "Submit generic manifest/report export from files or an existing manifest. Poll job_status.",
    parameters: submission(ExportRequest.fields),
    success,
    failure,
  }).annotate(Tool.Strict, true),
  Tool.make("job_status", {
    description:
      "Read a job in this server session; unknown after reconnect does not imply that no outputs were written.",
    parameters: Schema.Struct({ requestId }),
    success,
    failure,
  }).annotate(Tool.Strict, true),
  Tool.make("job_cancel", {
    description:
      "Request cancellation. Poll until terminal; active media cleanup can take up to 30 seconds. Completed outputs remain.",
    parameters: Schema.Struct({ requestId }),
    success,
    failure,
  }).annotate(Tool.Strict, true),
);
type Job = {
  requestId: string;
  fingerprint: string;
  status: string;
  result?: unknown;
  error?: { code: string };
  fiber?: Fiber.Fiber<void, never>;
  workerPid?: number;
};
const snapshot = (job: Job) => ({
  schemaVersion: 1,
  requestId: job.requestId,
  status: job.status,
  ...(job.result ? { result: job.result } : {}),
  ...(job.error ? { error: job.error } : {}),
  ...(job.workerPid ? { workerPid: job.workerPid } : {}),
});
const handlers = (root: string) =>
  tools.toLayer(
    Effect.gen(function* () {
      const scope = yield* Scope.Scope;
      const paths = yield* Effect.context<FileSystem.FileSystem | Path.Path>();
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const jobs = new Map<string, Job>();
      let active = false;
      const lookup = (id: string) => {
        const job = jobs.get(id);
        return job ? Effect.succeed(job) : Effect.fail({ code: "UNKNOWN_JOB" });
      };
      const submit = (input: { requestId: string }) =>
        Effect.gen(function* () {
          const { requestId: id, ...payload } = input;
          const request = yield* scopeRequest(payload, root).pipe(
            Effect.provideContext(paths),
            Effect.mapError((error) => ({
              code: "code" in error ? String(error.code) : "INVALID_INPUT",
            })),
          );
          // Acceptance and attaching its worker are atomic with respect to request cancellation.
          return yield* Effect.uninterruptible(
            Effect.gen(function* () {
              const fingerprint = JSON.stringify(request);
              const existing = jobs.get(id);
              if (existing) {
                if (existing.fingerprint !== fingerprint)
                  return yield* Effect.fail({ code: "REQUEST_ID_CONFLICT" });
                return snapshot(existing);
              }
              if (active) return yield* Effect.fail({ code: "BUSY" });
              if (jobs.size >= 128) return yield* Effect.fail({ code: "SESSION_FULL" });
              const job: Job = { requestId: id, fingerprint, status: "running" };
              jobs.set(id, job);
              active = true;
              const work = Effect.scoped(
                Effect.gen(function* () {
                  const child = yield* spawner.spawn(
                    ChildProcess.make(
                      process.execPath,
                      [fileURLToPath(new URL("./worker.js", import.meta.url))],
                      {
                        cwd: root,
                        shell: false,
                        stdin: Stream.make(new TextEncoder().encode(JSON.stringify(request))),
                        stdout: "pipe",
                        stderr: "pipe",
                        killSignal: "SIGINT",
                        forceKillAfter: "30 seconds",
                      },
                    ),
                  );
                  job.workerPid = child.pid;
                  const [code, output] = yield* Effect.all(
                    [
                      child.exitCode,
                      child.stdout.pipe(
                        Stream.decodeText(),
                        Stream.runFold(
                          () => "",
                          (all, chunk) => all + chunk,
                        ),
                      ),
                      child.stderr.pipe(Stream.runDrain),
                    ],
                    { concurrency: "unbounded" },
                  );
                  const data = yield* Effect.try(
                    () =>
                      JSON.parse(output) as {
                        result?: { status: string };
                        error?: { code: string };
                      },
                  );
                  if (data.result && code === 0) {
                    job.result = data.result;
                    job.status = data.result.status;
                  } else {
                    job.status = code === 130 ? "cancelled" : "failed";
                    job.error = data.error ?? { code: "WORKER_FAILED" };
                  }
                }),
              ).pipe(
                Effect.onExit((exit) =>
                  Effect.sync(() => {
                    if (Exit.isFailure(exit)) {
                      job.status = Cause.hasInterrupts(exit.cause) ? "cancelled" : "failed";
                      job.error = {
                        code: job.status === "cancelled" ? "CANCELLED" : "WORKER_FAILED",
                      };
                    }
                    active = false;
                  }),
                ),
                Effect.catchCause(() => Effect.void),
              );
              job.fiber = yield* Effect.forkIn(Effect.interruptible(work), scope);
              return snapshot(job);
            }),
          );
        });
      return {
        file_forge_info: () =>
          Effect.succeed({
            schemaVersion: 1,
            version: "0.0.0",
            root,
            jobPersistence: "session",
            concurrency: 1,
            maxJobs: 128,
          }),
        inspect_files: submit,
        process_images: submit,
        compress_images: submit,
        compress_video: submit,
        generate_favicons: submit,
        export_manifest: submit,
        job_status: ({ requestId }: { requestId: string }) =>
          lookup(requestId).pipe(Effect.map(snapshot)),
        job_cancel: ({ requestId }: { requestId: string }) =>
          Effect.gen(function* () {
            const job = yield* lookup(requestId);
            if (job.status === "running" && job.fiber) {
              job.status = "cancelling";
              yield* Effect.forkIn(Fiber.interrupt(job.fiber), scope);
            }
            return snapshot(job);
          }),
      };
    }),
  );
const serve = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const selected = process.env.FILE_FORGE_ROOT;
  if (!selected) return yield* Effect.fail({ code: "ROOT_REQUIRED" });
  const root = yield* fs.realPath(selected);
  if ((yield* fs.stat(root)).type !== "Directory")
    return yield* Effect.fail({ code: "ROOT_REQUIRED" });
  const ffmpeg = yield* getFfmpegStatus().pipe(
    Effect.provide(ffmpegLayer(process.env.FFMPEG_PATH || "ffmpeg")),
  );
  if (!ffmpeg.available) return yield* Effect.fail({ code: "FFMPEG_REQUIRED" });
  yield* McpServer.registerToolkit(tools).pipe(
    Effect.andThen(Effect.never),
    Effect.provide(handlers(root)),
    Effect.provide(
      McpServer.layerStdio({
        name: "file-forge",
        version: "0.0.0",
        protocols: [McpProtocol.v2025_11_25, McpProtocol.v2025_06_18],
      }),
    ),
  );
});
// Process boundary: EOF and signals close the session scope and await owned workers.
export async function main(): Promise<void> {
  const abort = new AbortController();
  const stop = () => abort.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  process.stdin.once("end", stop);
  const result = await Effect.runPromiseExit(
    serve.pipe(Effect.scoped, Effect.provide(NodeServices.layer), Effect.provide(Logger.layer([]))),
    { signal: abort.signal },
  );
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
  process.stdin.removeListener("end", stop);
  process.stdin.destroy();
  if (Exit.isFailure(result) && !Cause.hasInterrupts(result.cause)) {
    const reason = Cause.findFail(result.cause);
    const code =
      Result.isSuccess(reason) &&
      typeof reason.success.error === "object" &&
      reason.success.error !== null &&
      "code" in reason.success.error
        ? String(reason.success.error.code)
        : "MCP_STARTUP_FAILED";
    process.stderr.write(
      JSON.stringify({
        schemaVersion: 1,
        error: { code },
        guidance:
          "Set FILE_FORGE_ROOT to an accessible workspace and install FFmpeg on PATH or set FFMPEG_PATH.",
      }) + "\n",
    );
    process.exitCode = 1;
  }
}
