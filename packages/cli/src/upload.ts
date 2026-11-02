import { messages, type Locale } from "./messages.js";
import { uploadReporter } from "./upload-progress.js";
import { Effect } from "effect";
import { NodeHttpClient } from "@effect/platform-node";
import { configPath, executeUploadRequest } from "@file-forge/upload";

export const runUpload = (args: readonly string[], locale: Locale) =>
  Effect.gen(function* () {
    const operation =
      args[1] === "config" && args[2] === "check"
        ? "upload-check"
        : args[1] === "plan"
          ? "upload-plan"
          : args[1] === "apply"
            ? "upload-apply"
            : args[1] === "verify"
              ? "upload-verify"
              : args[1] === "folders"
                ? "upload-folders"
                : undefined;
    if (!operation) return yield* Effect.fail({ code: "INVALID_INPUT" });
    const input: Record<string, unknown> = { operation };
    let config: string | undefined;
    let progressMode: "auto" | "table" | "lines" | undefined;
    const names: Record<string, string> = {
      "--project": "project",
      "--prefix": "prefix",
      "--input": "input",
      "--output": "output",
      "--plan": "plan",
      "--plan-hash": "planHash",
      "--receipt": "receipt",
      "--recursive": "recursive",
      "--overwrite-key": "overwriteKeys",
      "--config": "config",
      "--progress": "progress",
    };
    for (let index = operation === "upload-check" ? 3 : 2; index < args.length; index++) {
      const flag = args[index]!;
      const name = names[flag];
      if (!name) return yield* Effect.fail({ code: "INVALID_INPUT" });
      const value = name === "recursive" ? true : args[++index];
      if (value === undefined || (typeof value === "string" && value.startsWith("--")))
        return yield* Effect.fail({ code: "INVALID_INPUT" });
      if (name === "progress") {
        if (
          operation !== "upload-apply" ||
          progressMode ||
          (value !== "auto" && value !== "table" && value !== "lines")
        )
          return yield* Effect.fail({ code: "INVALID_INPUT" });
        progressMode = value;
      } else if (name === "config") {
        if (config) return yield* Effect.fail({ code: "INVALID_INPUT" });
        config = String(value);
      } else if (name === "overwriteKeys")
        input[name] = [...((input[name] as string[] | undefined) ?? []), String(value)];
      else {
        if (name in input) return yield* Effect.fail({ code: "INVALID_INPUT" });
        input[name] = value;
      }
    }
    const file = configPath(config);
    const reporter = uploadReporter(locale, progressMode ?? "auto");
    const result = yield* executeUploadRequest(input, file, undefined, reporter.progress).pipe(
      Effect.provide(NodeHttpClient.layerNodeHttp),
      Effect.tapError((error) =>
        Effect.sync(() => {
          const setup = messages[locale].uploadSetup[error.code];
          if (setup) process.stderr.write(setup(JSON.stringify(file)) + "\n");
        }),
      ),
    );
    yield* reporter.finish(result);
    return result;
  });
