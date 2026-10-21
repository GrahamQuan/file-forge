import { createHash } from "node:crypto";
import { lstat } from "node:fs/promises";
import { Data, Effect, FileSystem, Path, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
export class DistributionError extends Data.TaggedError("DistributionError")<{ code: string }> {}
export const problem = (code: string) => new DistributionError({ code });
export const sha256 = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
export const Entry = Schema.Struct({
  path: Schema.String,
  kind: Schema.Literals(["file", "link", "directory"]),
  hash: Schema.optional(Schema.String),
  target: Schema.optional(Schema.String),
  mode: Schema.optional(Schema.Number),
});
export const Distribution = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  version: Schema.String,
  platform: Schema.String,
  arch: Schema.String,
  nodeMinimum: Schema.Literal("22.13.0"),
  entries: Schema.Array(Entry),
});
export type Distribution = typeof Distribution.Type;
export const statLink = (path: string) =>
  Effect.tryPromise({ try: () => lstat(path), catch: () => problem("IO_FAILED") });
export const present = (path: string) =>
  statLink(path).pipe(
    Effect.as(true),
    Effect.catch(() => Effect.succeed(false)),
  );
export const supported = () => process.platform === "darwin" && process.arch === "arm64";
export const command = (executable: string, args: readonly string[], cwd?: string) =>
  Effect.scoped(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const child = yield* spawner.spawn(
        ChildProcess.make(executable, args, {
          cwd,
          shell: false,
          stdin: "ignore",
          stdout: "pipe",
          stderr: "pipe",
          killSignal: "SIGTERM",
          forceKillAfter: "2 seconds",
        }),
      );
      const [code, output] = yield* Effect.all(
        [
          child.exitCode,
          child.all.pipe(
            Stream.decodeText(),
            Stream.runFold(
              () => "",
              (all, chunk) => (all + chunk).slice(-8192),
            ),
          ),
        ],
        { concurrency: "unbounded" },
      );
      if (code !== 0) return yield* problem("COMMAND_FAILED");
      return output.trim();
    }),
  );
export const inventory = (root: string, installed = false) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    root = yield* fs.realPath(root);
    const result: Array<typeof Entry.Type> = [];
    const walk = (
      relative: string,
    ): Effect.Effect<void, DistributionError | import("effect/PlatformError").PlatformError> =>
      Effect.gen(function* () {
        for (const name of (yield* fs.readDirectory(path.join(root, relative))).sort()) {
          const key = relative ? `${relative}/${name}` : name;
          if (key === "distribution.json" || (installed && key === ".file-forge-install.json"))
            continue;
          const file = path.join(root, key);
          const info = yield* statLink(file);
          if (info.isSymbolicLink()) {
            const target = yield* fs.readLink(file);
            const resolved = path.resolve(path.dirname(file), target);
            const local = path.relative(root, resolved);
            if (
              path.isAbsolute(target) ||
              local === ".." ||
              local.startsWith(`..${path.sep}`) ||
              path.isAbsolute(local)
            )
              return yield* problem("UNSAFE_LINK");
            const real = yield* fs.realPath(file);
            const realLocal = path.relative(root, real);
            if (
              realLocal === ".." ||
              realLocal.startsWith(`..${path.sep}`) ||
              path.isAbsolute(realLocal)
            )
              return yield* problem("UNSAFE_LINK");
            result.push({ path: key, kind: "link", target });
          } else if (info.isDirectory()) {
            result.push({ path: key, kind: "directory" });
            yield* walk(key);
          } else if (info.isFile())
            result.push({
              path: key,
              kind: "file",
              hash: sha256(yield* fs.readFile(file)),
              mode: info.mode & 0o777,
            });
          else return yield* problem("UNSAFE_FILE");
        }
      });
    yield* walk("");
    return result;
  });
export const verify = (root: string, installed = false) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    if (!(yield* statLink(`${root}/distribution.json`)).isFile())
      return yield* problem("INVALID_DISTRIBUTION");
    const text = yield* fs.readFileString(`${root}/distribution.json`);
    const json = yield* Effect.try({
      try: () => JSON.parse(text) as unknown,
      catch: () => problem("INVALID_DISTRIBUTION"),
    });
    const metadata = yield* Schema.decodeUnknownEffect(Distribution)(json).pipe(
      Effect.mapError(() => problem("INVALID_DISTRIBUTION")),
    );
    if (!/^\d+\.\d+\.\d+$/.test(metadata.version)) return yield* problem("INVALID_DISTRIBUTION");
    if (!supported() || metadata.platform !== process.platform || metadata.arch !== process.arch)
      return yield* problem("UNSUPPORTED_TARGET");
    const actual = yield* inventory(root, installed);
    if (JSON.stringify(actual) !== JSON.stringify(metadata.entries))
      return yield* problem("INTEGRITY_FAILED");
    return { metadata, digest: sha256(text) };
  });
export const copyPayload = (
  source: string,
  destination: string,
  entries: Distribution["entries"],
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.makeDirectory(destination, { recursive: true });
    for (const entry of entries) {
      const output = path.join(destination, entry.path);
      if (entry.kind === "directory") yield* fs.makeDirectory(output, { recursive: true });
      else if (entry.kind === "link") yield* fs.symlink(entry.target!, output);
      else {
        yield* fs.copyFile(path.join(source, entry.path), output);
        yield* fs.chmod(output, entry.mode!);
      }
    }
    yield* fs.copyFile(
      path.join(source, "distribution.json"),
      path.join(destination, "distribution.json"),
    );
  });
