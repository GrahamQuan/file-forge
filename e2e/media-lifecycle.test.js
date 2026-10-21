import { test } from "vitest";
import assert from "node:assert/strict";
import { Effect, Layer, Fiber, Exit, Cause } from "effect";
import { ChildProcessSpawner } from "effect/process";
import { NodeServices } from "@effect/platform-node";
import { ffmpegLayer, runFfmpeg, getFfmpegStatus } from "@file-forge/media";

test("real FFmpeg failure, timeout, and interruption release their processes", async () => {
  const pids = [];
  let suspendProcess = false;
  const observed = Layer.effect(
    ChildProcessSpawner.ChildProcessSpawner,
    Effect.gen(function* () {
      const live = yield* ChildProcessSpawner.ChildProcessSpawner;
      return ChildProcessSpawner.make((command) =>
        live.spawn(command).pipe(
          Effect.tap((child) =>
            Effect.sync(() => {
              pids.push(child.pid);
              if (suspendProcess && process.platform !== "win32")
                process.kill(child.pid, "SIGSTOP");
            }),
          ),
        ),
      );
    }),
  ).pipe(Layer.provide(NodeServices.layer));
  const live = Layer.mergeAll(observed, ffmpegLayer(process.env.FFMPEG_PATH || "ffmpeg"));
  const run = (effect) => Effect.runPromise(effect.pipe(Effect.provide(live)));
  assert.equal((await run(getFfmpegStatus())).available, true);
  const bad = await run(Effect.exit(runFfmpeg(["-file-forge-invalid-option"])));
  assert.ok(Exit.isFailure(bad));
  const args = ["-re", "-f", "lavfi", "-i", "sine=frequency=440", "-f", "null", "-"];
  suspendProcess = true;
  const timeout = await run(Effect.exit(runFfmpeg(args, { timeoutMs: 150 })));
  suspendProcess = false;
  assert.ok(Exit.isFailure(timeout));
  assert.ok(
    timeout.cause.reasons.some(
      (reason) => reason._tag === "Fail" && reason.error.code === "FFMPEG_TIMEOUT",
    ),
  );
  const interrupted = await run(
    Effect.scoped(
      Effect.gen(function* () {
        const fiber = yield* runFfmpeg(args).pipe(Effect.forkChild);
        yield* Effect.sleep("150 millis");
        yield* Fiber.interrupt(fiber);
        return yield* Fiber.await(fiber);
      }),
    ),
  );
  assert.ok(Exit.isFailure(interrupted));
  assert.ok(Cause.hasInterrupts(interrupted.cause));
  for (const pid of pids) assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  const absent = await Effect.runPromise(
    getFfmpegStatus().pipe(
      Effect.provide(Layer.mergeAll(NodeServices.layer, ffmpegLayer("/file-forge-missing-ffmpeg"))),
    ),
  );
  assert.equal(absent.available, false);
});
