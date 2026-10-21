import { randomUUID } from "node:crypto";
import { Effect, FileSystem, Option, Path } from "effect";
import {
  createDeliveryDirectory,
  isSymlink,
  OperationError,
  writeManifest,
  type Manifest,
} from "./index.js";

type Rename = { readonly path: string; readonly name: string };
type Entry = {
  relative: string;
  name: string;
  source: string;
  target: string;
  status: "planned" | "succeeded" | "failed";
  errorCode?: string;
};
const invalid = (detail: string) => new OperationError({ code: "INVALID_INPUT", detail });

/** Explicit directory-only source mutation, with a durable plan and progress receipt. */
export const renameFolders = (
  input: string,
  renames: readonly Rename[],
  outputParent: string,
  apply = false,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const checkDirectory = (directory: string) =>
      Effect.gen(function* () {
        let current = path.resolve(directory);
        while (true) {
          if (yield* isSymlink(current)) return yield* invalid("Symlink paths cannot be renamed");
          if ((yield* fs.stat(current)).type !== "Directory")
            return yield* invalid("Rename paths must be directories");
          const parent = path.dirname(current);
          if (parent === current) break;
          current = parent;
        }
      });
    // Resolve the normal macOS /tmp alias through the selected parent's canonical identity.
    if (yield* isSymlink(input)) return yield* invalid("Select a directory, not a symlink");
    const source = yield* fs.realPath(input);
    yield* checkDirectory(source);
    if (path.dirname(source) === source) return yield* invalid("Cannot rename a filesystem root");
    if (!renames.length) return yield* invalid("Supply at least one directory rename");
    const entries: Entry[] = [];
    const selected = new Set<string>();
    const destinations = new Set<string>();
    const exists = (file: string) =>
      Effect.gen(function* () {
        if (yield* fs.exists(file)) return true;
        return yield* isSymlink(file).pipe(Effect.catch(() => Effect.succeed(false)));
      });
    const sameDirectory = (left: string, right: string) =>
      Effect.gen(function* () {
        const a = yield* fs.stat(left);
        const b = yield* fs.stat(right);
        return (
          a.dev === b.dev &&
          Option.isSome(a.ino) &&
          Option.isSome(b.ino) &&
          a.ino.value === b.ino.value
        );
      });
    for (const rename of renames) {
      if (
        rename.path !== "." &&
        (path.isAbsolute(rename.path) ||
          rename.path.includes("\\") ||
          rename.path.split("/").some((part) => !part || part === "." || part === ".."))
      )
        return yield* invalid(
          "Rename paths must be relative to the selected root without traversal",
        );
      if (
        !rename.name.trim() ||
        rename.name === "." ||
        rename.name === ".." ||
        rename.name.includes("/") ||
        rename.name.includes("\\") ||
        [...rename.name].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
      )
        return yield* invalid("Each target name must be one directory name");
      const from = path.resolve(source, rename.path);
      yield* checkDirectory(from);
      const to = path.join(path.dirname(from), rename.name);
      const key = to.normalize("NFC").toLowerCase();
      const identity = yield* fs.stat(from);
      const selectedKey = Option.isSome(identity.ino)
        ? `${identity.dev}:${identity.ino.value}`
        : from;
      if (selected.has(selectedKey) || destinations.has(key))
        return yield* invalid("Duplicate selection or destination collision");
      selected.add(selectedKey);
      destinations.add(key);
      if (yield* exists(to)) {
        if ((yield* isSymlink(to)) || !(yield* sameDirectory(to, from)))
          return yield* invalid(`Destination already exists: ${to}`);
      }
      entries.push({
        relative: rename.path,
        name: rename.name,
        source: from,
        target: to,
        status: "planned",
      });
    }
    const rootEntry = entries.find((entry) => entry.relative === ".");
    const finalRoot = rootEntry ? rootEntry.target : source;
    const mapped = (entry: Entry, final: boolean) => {
      const active = entries.filter((item) => final || item.status === "succeeded");
      const root = active.find((item) => item.relative === ".")?.target ?? source;
      if (entry.relative === ".") return root;
      const parts = entry.relative.split("/");
      return path.join(
        root,
        ...parts.map(
          (part, index) =>
            active.find((item) => item.relative === parts.slice(0, index + 1).join("/"))?.name ??
            part,
        ),
      );
    };
    let ancestor = path.resolve(outputParent);
    const suffix: string[] = [];
    while (!(yield* fs.exists(ancestor))) {
      suffix.unshift(path.basename(ancestor));
      ancestor = path.dirname(ancestor);
    }
    const parent = path.join(yield* fs.realPath(ancestor), ...suffix);
    for (const root of [source, finalRoot]) {
      const relative = path.relative(root, parent);
      if (
        !relative ||
        (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
      )
        return yield* invalid("Receipt output must be outside the original and renamed root");
    }
    const taskId = randomUUID();
    const directory = yield* createDeliveryDirectory(parent, taskId);
    const createdAt = new Date().toISOString();
    const manifest = (status: Manifest["status"] = "succeeded"): Manifest => ({
      schemaVersion: 3,
      operation: "folder-rename",
      taskId,
      createdAt,
      status,
      parameters: { recursive: false },
      assets: [],
      apply,
      renames: entries.map((entry) => ({
        source: entry.source,
        output: mapped(entry, true),
        current: mapped(entry, false),
        status: entry.status,
        ...(entry.errorCode ? { errorCode: entry.errorCode } : {}),
      })),
    });
    yield* writeManifest(directory, manifest());
    if (!apply) return { ...manifest(), directory };
    const ordered = [...entries].sort(
      (a, b) =>
        (b.relative === "." ? 0 : b.relative.split("/").length) -
        (a.relative === "." ? 0 : a.relative.split("/").length),
    );
    return yield* Effect.gen(function* () {
      for (const entry of ordered) {
        const ok = yield* Effect.uninterruptible(
          Effect.gen(function* () {
            yield* checkDirectory(entry.source);
            if (entry.source !== entry.target) {
              if (yield* exists(entry.target)) {
                if (
                  (yield* isSymlink(entry.target)) ||
                  !(yield* sameDirectory(entry.target, entry.source))
                )
                  return yield* invalid("Destination changed after preview");
                // Case-only rename of the same directory identity.
                yield* fs.rename(entry.source, entry.target);
              } else {
                // Reserve an absent directory exclusively, then replace only our empty reservation.
                yield* fs.makeDirectory(entry.target);
                yield* fs
                  .rename(entry.source, entry.target)
                  .pipe(
                    Effect.tapError(() =>
                      fs.remove(entry.target).pipe(Effect.catch(() => Effect.void)),
                    ),
                  );
              }
            }
            entry.status = "succeeded";
            return true;
          }).pipe(
            Effect.catch((error) =>
              Effect.sync(() => {
                entry.status = "failed";
                entry.errorCode = "code" in error ? String(error.code) : "IO_FAILED";
                return false;
              }),
            ),
          ),
        );
        const state = ok
          ? "succeeded"
          : entries.some((item) => item.status === "succeeded")
            ? "partial"
            : "failed";
        yield* writeManifest(directory, manifest(state));
        if (!ok) return { ...manifest(state), directory };
      }
      return { ...manifest(), directory };
    }).pipe(Effect.onInterrupt(() => writeManifest(directory, manifest("cancelled"))));
  });
