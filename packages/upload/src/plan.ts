import { createHash, randomUUID } from "node:crypto";
import * as native from "node:fs/promises";
import * as path from "node:path";
import { Effect, FileSystem, Schema, Stream } from "effect";
import {
  canonical,
  decode,
  Destination,
  digest,
  encodeKey,
  fail,
  parseJson,
  safeRelative,
  sha256,
  text,
  UploadError,
} from "./common.js";
import { configFilename, type UploadConfig } from "./config.js";

export const mimeTypes: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".glb": "model/gltf-binary",
};
export const limits = {
  files: 1000,
  fileBytes: 512 * 1024 * 1024,
  totalBytes: 10 * 1024 ** 3,
} as const;
export const Entry = Schema.Struct({
  source: text,
  relativePath: text,
  size: Schema.Number.check(
    Schema.isInt(),
    Schema.isGreaterThanOrEqualTo(0),
    Schema.isLessThanOrEqualTo(limits.fileBytes),
  ),
  sha256: digest,
  mime: text,
  key: text,
  url: text,
  intent: Schema.Literals(["create", "replace"]),
});
export type Entry = typeof Entry.Type;
export const Plan = Schema.Struct({
  kind: Schema.Literal("file-forge.upload-plan"),
  schemaVersion: Schema.Literal(1),
  id: text,
  project: text,
  createdAt: text,
  directory: text,
  source: text,
  sourceType: Schema.Literals(["file", "directory"]),
  destination: Destination,
  entries: Schema.Array(Entry).check(Schema.isMinLength(1), Schema.isMaxLength(limits.files)),
  excluded: Schema.Array(
    Schema.Struct({ path: text, reason: Schema.Literals(["hidden", "protected", "non_asset"]) }),
  ),
  planHash: digest,
});
export type Plan = typeof Plan.Type;
export const within = (root: string, target: string) => {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  );
};
const io = <A>(run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: () => new UploadError({ code: "UPLOAD_INPUT_CHANGED" }) });
export const safePath = (file: string) =>
  Effect.gen(function* () {
    const absolute = path.resolve(file);
    let current = path.parse(absolute).root;
    for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
      current = path.join(current, part);
      const info = yield* io(() => native.lstat(current));
      if (info.isSymbolicLink()) return yield* fail("UPLOAD_INPUT_CHANGED");
    }
    return absolute;
  });
export const inspectAsset = (file: string, config: UploadConfig) =>
  Effect.gen(function* () {
    yield* safePath(file);
    const info = yield* io(() => native.lstat(file));
    if (!info.isFile() || (info.dev === config.identity.dev && info.ino === config.identity.ino))
      return yield* fail("UPLOAD_INPUT_CHANGED");
    if (info.size > limits.fileBytes) return yield* fail("UPLOAD_LIMIT_EXCEEDED");
    return info;
  });
export const hashFile = (file: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const hash = createHash("sha256");
    let size = 0;
    yield* fs.stream(file).pipe(
      Stream.runForEach((chunk) =>
        Effect.gen(function* () {
          size += chunk.length;
          if (size > limits.fileBytes) return yield* fail("UPLOAD_LIMIT_EXCEEDED");
          hash.update(chunk);
        }),
      ),
    );
    return { sha256: hash.digest("hex"), size };
  });
const excludedReason = (relative: string): "hidden" | "protected" | "non_asset" | undefined => {
  if (relative.split("/").some((part) => part.startsWith("."))) return "hidden";
  if (
    relative
      .split("/")
      .some(
        (part) =>
          part.toLowerCase() === "prompts" || /^log(?:\.|$)/i.test(part) || part === configFilename,
      )
  )
    return "protected";
  if (!mimeTypes[path.extname(relative).toLowerCase()]) return "non_asset";
};
export const mapped = (destination: Destination, relative: string) => {
  const key = destination.prefix + relative;
  if (!safeRelative(relative) || !safeRelative(key) || Buffer.byteLength(key) > 1024)
    throw new UploadError({ code: "UPLOAD_PLAN_INVALID" });
  return { key, url: `${destination.publicBaseUrl}/${encodeKey(key)}` };
};
export const readArtifact = (file: string) =>
  Effect.gen(function* () {
    yield* safePath(file);
    const fs = yield* FileSystem.FileSystem;
    const stat = yield* fs.stat(file);
    if (stat.type !== "File" || stat.size > 16 * 1024 * 1024)
      return yield* fail("UPLOAD_PLAN_INVALID");
    const source = yield* fs.readFileString(file);
    return yield* Effect.try({
      try: () => parseJson(source),
      catch: () => new UploadError({ code: "UPLOAD_PLAN_INVALID" }),
    });
  });
export const readPlan = (file: string) =>
  Effect.gen(function* () {
    const plan = yield* decode(Plan, yield* readArtifact(file));
    const { planHash, ...contents } = plan;
    if (
      sha256(canonical(contents)) !== planHash ||
      !path.isAbsolute(plan.source) ||
      !path.isAbsolute(plan.directory) ||
      path.resolve(file) !== path.join(plan.directory, "plan.json")
    )
      return yield* fail("UPLOAD_PLAN_INVALID");
    const keys = new Set<string>();
    let total = 0;
    for (const entry of plan.entries) {
      const mapping = yield* Effect.try({
        try: () => mapped(plan.destination, entry.relativePath),
        catch: () => new UploadError({ code: "UPLOAD_PLAN_INVALID" }),
      });
      const source =
        plan.sourceType === "file" ? plan.source : path.join(plan.source, entry.relativePath);
      if (
        source !== entry.source ||
        (plan.sourceType === "file" && entry.relativePath !== path.basename(source)) ||
        excludedReason(entry.relativePath) ||
        entry.mime !== mimeTypes[path.extname(entry.relativePath).toLowerCase()] ||
        entry.key !== mapping.key ||
        entry.url !== mapping.url ||
        keys.has(entry.key)
      )
        return yield* fail("UPLOAD_PLAN_INVALID");
      keys.add(entry.key);
      total += entry.size;
    }
    if (total > limits.totalBytes) return yield* fail("UPLOAD_LIMIT_EXCEEDED");
    return plan;
  });
export const planUpload = (
  request: {
    project: string;
    input: string;
    output: string;
    recursive?: boolean;
    overwriteKeys?: readonly string[];
  },
  config: UploadConfig,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const source = yield* safePath(request.input);
    const output = yield* safePath(request.output);
    const sourceInfo = yield* io(() => native.lstat(source));
    if (
      (!sourceInfo.isFile() && !sourceInfo.isDirectory()) ||
      (sourceInfo.isDirectory() && !request.recursive) ||
      within(source, output) ||
      within(output, source)
    )
      return yield* fail("UPLOAD_PLAN_INVALID");
    if ((yield* fs.stat(output)).type !== "Directory") return yield* fail("UPLOAD_PLAN_INVALID");
    const entries: Entry[] = [];
    const excluded: Array<{ path: string; reason: "hidden" | "protected" | "non_asset" }> = [];
    let total = 0;
    const walk = (
      file: string,
      relative: string,
    ): Effect.Effect<
      void,
      UploadError | import("effect/PlatformError").PlatformError,
      FileSystem.FileSystem
    > =>
      Effect.gen(function* () {
        const info = yield* io(() => native.lstat(file));
        if (
          file === config.file &&
          info.dev === config.identity.dev &&
          info.ino === config.identity.ino
        ) {
          if (sourceInfo.isFile()) return yield* fail("UPLOAD_PLAN_INVALID");
          excluded.push({ path: relative, reason: "protected" });
          return;
        }
        if (
          info.isSymbolicLink() ||
          (!info.isFile() && !info.isDirectory()) ||
          (info.dev === config.identity.dev && info.ino === config.identity.ino)
        )
          return yield* fail("UPLOAD_INPUT_CHANGED");
        const reason = excludedReason(relative);
        if (reason && (reason !== "non_asset" || !info.isDirectory())) {
          if (sourceInfo.isFile()) return yield* fail("UPLOAD_PLAN_INVALID");
          excluded.push({ path: relative, reason });
          return;
        }
        if (info.isDirectory()) {
          for (const name of (yield* fs.readDirectory(file)).sort())
            yield* walk(path.join(file, name), relative ? `${relative}/${name}` : name);
          return;
        }
        yield* inspectAsset(file, config);
        const hash = yield* hashFile(file);
        total += hash.size;
        if (entries.length >= limits.files || total > limits.totalBytes)
          return yield* fail("UPLOAD_LIMIT_EXCEEDED");
        const mapping = yield* Effect.try({
          try: () => mapped(config.destination, relative),
          catch: () => new UploadError({ code: "UPLOAD_PLAN_INVALID" }),
        });
        if (entries.some((entry) => entry.key === mapping.key))
          return yield* fail("UPLOAD_PLAN_INVALID");
        entries.push({
          source: file,
          relativePath: relative,
          ...hash,
          mime: mimeTypes[path.extname(file).toLowerCase()]!,
          ...mapping,
          intent: request.overwriteKeys?.includes(mapping.key) ? "replace" : "create",
        });
      });
    if (sourceInfo.isDirectory()) {
      for (const name of (yield* fs.readDirectory(source)).sort())
        yield* walk(path.join(source, name), name);
    } else yield* walk(source, path.basename(source));
    if (
      !entries.length ||
      request.overwriteKeys?.some((key) => !entries.some((entry) => entry.key === key))
    )
      return yield* fail("UPLOAD_PLAN_INVALID");
    const id = randomUUID();
    const directory = path.join(output, `file-forge-upload-${id}`);
    const contents = {
      kind: "file-forge.upload-plan" as const,
      schemaVersion: 1 as const,
      id,
      directory,
      project: request.project,
      createdAt: new Date().toISOString(),
      source,
      sourceType: sourceInfo.isDirectory() ? ("directory" as const) : ("file" as const),
      destination: config.destination,
      entries,
      excluded,
    };
    const plan: Plan = { ...contents, planHash: sha256(canonical(contents)) };
    yield* fs.makeDirectory(directory, { mode: 0o700 });
    const planPath = path.join(directory, "plan.json");
    yield* fs.writeFileString(planPath, JSON.stringify(plan, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    return { status: "succeeded", planPath, plan };
  });
