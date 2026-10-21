import { Effect, FileSystem, Path } from "effect";
import { type OperationRequest, validateRequest } from "@file-forge/core";
export const scopeRequest = (input: unknown, root: string) =>
  Effect.gen(function* () {
    const request = yield* validateRequest(input);
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const within = (candidate: string) => {
      const relative = path.relative(root, candidate);
      return (
        relative === "" ||
        (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
      );
    };
    const resolve = (value: string) =>
      Effect.gen(function* () {
        const absolute = path.resolve(root, value);
        let ancestor = absolute;
        while (!(yield* fs.exists(ancestor))) {
          const parent = path.dirname(ancestor);
          if (parent === ancestor) return yield* Effect.fail({ code: "PATH_OUTSIDE_ROOT" });
          ancestor = parent;
        }
        if (!within(yield* fs.realPath(ancestor)))
          return yield* Effect.fail({ code: "PATH_OUTSIDE_ROOT" });
        return absolute;
      });
    const result = { ...request };
    if ("files" in result && result.files)
      result.files = yield* Effect.forEach(result.files, resolve);
    if ("input" in result) result.input = yield* resolve(result.input);
    if ("manifest" in result && result.manifest) result.manifest = yield* resolve(result.manifest);
    if ("output" in result) result.output = yield* resolve(result.output);
    return result as OperationRequest;
  });
