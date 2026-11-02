import { Cause, Effect, Exit, Layer, Result, Stdio, Stream } from "effect";
import { NodeServices } from "@effect/platform-node";
import { NodeHttpClient } from "@effect/platform-node";
import { executeUploadRequest, scopeUploadRequest, UploadError } from "@file-forge/upload";
const abort = new AbortController();
const stop = () => abort.abort();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
const program = Effect.gen(function* () {
  const stdio = yield* Stdio.Stdio;
  const text = yield* stdio.stdin.pipe(
    Stream.decodeText(),
    Stream.runFold(
      () => "",
      (all, chunk) => all + chunk,
    ),
  );
  const input = yield* Effect.try(() => JSON.parse(text) as unknown);
  return yield* executeUploadRequest(
    yield* scopeUploadRequest(input, process.cwd()),
    process.argv[2],
    process.argv[3],
  );
}).pipe(Effect.provide(Layer.mergeAll(NodeServices.layer, NodeHttpClient.layerNodeHttp)));
const result = await Effect.runPromiseExit(program, { signal: abort.signal });
process.removeListener("SIGINT", stop);
process.removeListener("SIGTERM", stop);
if (Exit.isSuccess(result)) process.stdout.write(JSON.stringify({ result: result.value }) + "\n");
else {
  const reason = Cause.findFail(result.cause);
  const error = Result.isSuccess(reason) ? reason.success.error : undefined;
  const code = Cause.hasInterrupts(result.cause)
    ? "CANCELLED"
    : typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "OPERATION_FAILED";
  process.stdout.write(
    JSON.stringify({
      error: {
        code,
        ...(error instanceof UploadError
          ? {
              field: error.field,
              receiptPath: error.receiptPath,
              remoteOutcome: error.remoteOutcome,
            }
          : {}),
      },
    }) + "\n",
  );
  process.exitCode = code === "CANCELLED" ? 130 : 1;
}
