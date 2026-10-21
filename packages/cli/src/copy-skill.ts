import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Cause, Effect, Exit, FileSystem, Path, Result } from "effect";
import { NodeServices } from "@effect/platform-node";
import { DistributionError, problem, sha256, statLink } from "./distribution.js";

const source = fileURLToPath(new URL("../../../skills/file-forge", import.meta.url));
type Item = { path: string; hash?: string };
type CopyError = DistributionError | import("effect/PlatformError").PlatformError;

/** Contributor helper: copy the canonical skill, preserving differing target copies as backups. */
export const copySkill = (projectInput: string, dryRun = false) =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = (value: string) =>
        Effect.gen(function* () {
          const info = yield* statLink(value);
          if (!info.isDirectory() || info.isSymbolicLink())
            return yield* problem("UNSAFE_DIRECTORY");
        });
      const exists = (value: string) =>
        statLink(value).pipe(
          Effect.as(true),
          Effect.catch(() => Effect.succeed(false)),
        );
      const tree = (root: string) =>
        Effect.gen(function* () {
          yield* directory(root);
          const items: Item[] = [];
          const visit = (relative: string): Effect.Effect<void, CopyError> =>
            Effect.gen(function* () {
              for (const name of (yield* fs.readDirectory(path.join(root, relative))).sort()) {
                const key = relative ? `${relative}/${name}` : name;
                const file = path.join(root, key);
                const info = yield* statLink(file);
                if (info.isSymbolicLink()) return yield* problem("UNSAFE_LINK");
                if (info.isDirectory()) {
                  items.push({ path: key });
                  yield* visit(key);
                } else if (info.isFile())
                  items.push({ path: key, hash: sha256(yield* fs.readFile(file)) });
                else return yield* problem("UNSAFE_FILE");
              }
            });
          yield* visit("");
          return items;
        });
      yield* directory(projectInput);
      const project = yield* fs.realPath(projectInput);
      const agents = path.join(project, ".agents");
      const skills = path.join(agents, "skills");
      const target = path.join(skills, "file-forge");
      const backups = path.join(agents, "skill-backups");
      for (const value of [agents, skills, backups])
        if (yield* exists(value)) yield* directory(value);
      const expected = yield* tree(source);
      const sourceText = yield* fs.readFileString(path.join(source, "SKILL.md"));
      if (!/^---\r?\nname: file-forge\r?\n/.test(sourceText))
        return yield* problem("INVALID_SKILL_SOURCE");
      const current = (yield* exists(target)) ? yield* tree(target) : undefined;
      const equal = (a: Item[], b: Item[]) => JSON.stringify(a) === JSON.stringify(b);
      const result = { schemaVersion: 1, source, project, target };
      if (current && equal(current, expected)) return { ...result, status: "unchanged" };
      if (dryRun)
        return { ...result, status: "planned", action: current ? "replace-with-backup" : "copy" };
      yield* fs.makeDirectory(agents, { recursive: true });
      const lock = path.join(agents, ".file-forge-copy.lock");
      yield* Effect.acquireRelease(
        fs.makeDirectory(lock).pipe(Effect.mapError(() => problem("SKILL_COPY_LOCKED"))),
        () => fs.remove(lock, { recursive: true }).pipe(Effect.orDie),
      );
      yield* fs.writeFileString(
        path.join(lock, "owner.json"),
        JSON.stringify({ pid: process.pid, project }),
      );
      yield* fs.makeDirectory(skills, { recursive: true });
      const staging = yield* fs.makeTempDirectoryScoped({
        directory: agents,
        prefix: ".file-forge-copy-",
      });
      const prepared = path.join(staging, "file-forge");
      yield* fs.makeDirectory(prepared);
      for (const item of expected) {
        const dest = path.join(prepared, item.path);
        if (item.hash === undefined) yield* fs.makeDirectory(dest);
        else yield* fs.copyFile(path.join(source, item.path), dest);
      }
      if (!equal(yield* tree(prepared), expected)) return yield* problem("SKILL_SOURCE_CHANGED");
      const latest = (yield* exists(target)) ? yield* tree(target) : undefined;
      if (JSON.stringify(latest) !== JSON.stringify(current))
        return yield* problem("SKILL_TARGET_CHANGED");
      let backup: string | undefined;
      yield* Effect.uninterruptible(
        Effect.gen(function* () {
          if (current) {
            yield* fs.makeDirectory(backups, { recursive: true });
            backup = path.join(backups, `file-forge-${randomUUID()}`);
            yield* fs.rename(target, backup);
          }
          yield* fs.rename(prepared, target).pipe(
            Effect.tapError(() =>
              Effect.gen(function* () {
                if (backup && !(yield* exists(target))) yield* fs.rename(backup, target);
              }),
            ),
          );
        }),
      );
      return { ...result, status: current ? "updated" : "copied", ...(backup ? { backup } : {}) };
    }),
  );

const args = process.argv.slice(2);
let project: string | undefined;
let legacyReplace = false;
let dryRun = false;
let valid = true;
for (let i = 0; i < args.length; i++) {
  if (
    args[i] === "--project" &&
    project === undefined &&
    args[i + 1] &&
    !args[i + 1]!.startsWith("--")
  )
    project = args[++i];
  else if (args[i] === "--replace" && !legacyReplace) legacyReplace = true;
  else if (args[i] === "--dry-run" && !dryRun) dryRun = true;
  else valid = false;
}
const abort = new AbortController();
const stop = () => abort.abort();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
const outcome = await Effect.runPromiseExit(
  (valid && project ? copySkill(project, dryRun) : Effect.fail(problem("INVALID_ARGUMENT"))).pipe(
    Effect.provide(NodeServices.layer),
  ),
  { signal: abort.signal },
);
process.removeListener("SIGINT", stop);
process.removeListener("SIGTERM", stop);
if (Exit.isSuccess(outcome)) console.log(JSON.stringify(outcome.value));
else {
  const failure = Cause.findFail(outcome.cause);
  const error = Result.isSuccess(failure) ? failure.success.error : undefined;
  console.error(
    JSON.stringify({
      error: {
        code:
          typeof error === "object" && error !== null && "code" in error
            ? String(error.code)
            : "SKILL_COPY_FAILED",
      },
    }),
  );
  process.exitCode = Cause.hasInterrupts(outcome.cause) ? 130 : 1;
}
