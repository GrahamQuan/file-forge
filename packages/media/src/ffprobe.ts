import { Effect, Path, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { FfmpegConfig, MediaError } from "./index.js";

/** Run a bounded JSON probe for an already resolved, local input. */
export const runFfprobe = (input: string, args: readonly string[]) =>
  Effect.scoped(
    Effect.gen(function* () {
      const config = yield* FfmpegConfig;
      const path = yield* Path.Path;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const executable =
        config.probeExecutable ??
        (path.isAbsolute(config.executable)
          ? path.join(path.dirname(config.executable), "ffprobe")
          : "ffprobe");
      const child = yield* spawner.spawn(
        ChildProcess.make(
          executable,
          ["-v", "error", "-protocol_whitelist", "file,pipe", ...args, "-of", "json", input],
          {
            shell: false,
            stdin: "ignore",
            stdout: "pipe",
            stderr: "pipe",
            killSignal: "SIGTERM",
            forceKillAfter: "2 seconds",
          },
        ),
      );
      const [code, text] = yield* Effect.all(
        [
          child.exitCode,
          child.stdout.pipe(
            Stream.decodeText(),
            Stream.runFold(
              () => "",
              (a, b) => (a + b).slice(-1024 * 1024),
            ),
          ),
          child.stderr.pipe(Stream.runDrain),
        ],
        { concurrency: "unbounded" },
      );
      if (code !== 0)
        return yield* new MediaError({ code: "INVALID_INPUT", detail: "Cannot probe media" });
      return yield* Effect.try({
        try: () => JSON.parse(text) as unknown,
        catch: () =>
          new MediaError({ code: "INVALID_INPUT", detail: "Invalid media probe output" }),
      });
    }),
  ).pipe(
    Effect.mapError((error) =>
      error instanceof MediaError
        ? error
        : new MediaError({
            code: "FFPROBE_FAILED",
            detail: "FFprobe is unavailable or cannot run; configure FFPROBE_PATH",
            cause: error,
          }),
    ),
    Effect.timeoutOrElse({
      duration: "30 seconds",
      orElse: () =>
        Effect.fail(new MediaError({ code: "INVALID_INPUT", detail: "Media probe timed out" })),
    }),
  );
