import { constants } from "node:fs";
import * as native from "node:fs/promises";
import { homedir } from "node:os";
import * as path from "node:path";
import { Effect, Redacted } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import {
  UploadError,
  fail,
  hasControls,
  parseJson,
  safeRelative,
  type Destination,
} from "./common.js";

export const configFilename = "file-forge.upload.local.json";
export const configPath = (explicit?: string) =>
  path.resolve(
    explicit ??
      process.env.FILE_FORGE_UPLOAD_CONFIG ??
      path.join(
        process.env.FILE_FORGE_CONFIG_DIR ??
          path.join(homedir(), "Library", "Application Support", "file-forge"),
        configFilename,
      ),
  );
export const validProject = (value: string) =>
  value.length <= 128 &&
  /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(value) &&
  !["constructor", "prototype", "__proto__"].includes(value);
const fields = [
  "CONFIG_VERSION",
  "R2_ENDPOINT",
  "R2_BUCKET",
  "R2_REGION",
  "R2_PUBLIC_BASE_URL",
  "FILE_PATH",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
] as const;
type Field = (typeof fields)[number];
const invalid = (field?: Field): never => {
  throw new UploadError({ code: "UPLOAD_CONFIG_INVALID", ...(field ? { field } : {}) });
};
const origin = (value: string, field: Field): URL => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return invalid(field);
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    !/^https:\/\/[^/:?#]+\/?$/.test(value)
  )
    return invalid(field);
  return url;
};
export type UploadConfig = {
  destination: Destination;
  file: string;
  accessKey: Redacted.Redacted<string>;
  secretKey: Redacted.Redacted<string>;
  identity: { dev: number; ino: number };
};
const validate = (
  raw: unknown,
  project: string,
  identity: UploadConfig["identity"],
  file: string,
): UploadConfig => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) invalid();
  const projects = Object.entries(raw as Record<string, unknown>);
  if (projects.length > 100) invalid();
  let selected: UploadConfig | undefined;
  for (const [key, value] of projects) {
    if (!validProject(key) || !value || typeof value !== "object" || Array.isArray(value))
      invalid();
    const entry = value as Record<string, unknown>;
    if (Object.keys(entry).some((field) => !fields.includes(field as Field))) invalid();
    if (entry.CONFIG_VERSION !== 1) invalid("CONFIG_VERSION");
    for (const field of fields.slice(1)) if (typeof entry[field] !== "string") invalid(field);
    const config = entry as Record<Field, string>;
    const endpoint = origin(config.R2_ENDPOINT, "R2_ENDPOINT");
    if (
      !/^[a-f0-9]{32}(?:\.(?:eu|fedramp|us))?\.r2\.cloudflarestorage\.com$/.test(endpoint.hostname)
    )
      invalid("R2_ENDPOINT");
    if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(config.R2_BUCKET)) invalid("R2_BUCKET");
    if (config.R2_REGION !== "auto") invalid("R2_REGION");
    const publicUrl = origin(config.R2_PUBLIC_BASE_URL, "R2_PUBLIC_BASE_URL");
    if (
      config.FILE_PATH !== "" &&
      (!config.FILE_PATH.endsWith("/") || !safeRelative(config.FILE_PATH.slice(0, -1)))
    )
      invalid("FILE_PATH");
    for (const field of ["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"] as const)
      if (
        !config[field] ||
        /[\s<>]/u.test(config[field]) ||
        hasControls(config[field]) ||
        /ENTER_LOCALLY|PLACEHOLDER/i.test(config[field])
      )
        invalid(field);
    if (key === project)
      selected = {
        file,
        destination: {
          endpoint: endpoint.origin,
          bucket: config.R2_BUCKET,
          region: "auto",
          prefix: config.FILE_PATH,
          publicBaseUrl: publicUrl.origin,
        },
        accessKey: Redacted.make(config.R2_ACCESS_KEY_ID),
        secretKey: Redacted.make(config.R2_SECRET_ACCESS_KEY),
        identity,
      };
  }
  if (!selected) throw new UploadError({ code: "UPLOAD_PROJECT_UNKNOWN" });
  return selected;
};

// Native descriptor checks are needed for O_NOFOLLOW, device/inode identity and effective ownership.
const inspect = (file: string) =>
  Effect.tryPromise({
    try: async () => {
      const parent = await native.realpath(path.dirname(file));
      const resolved = path.join(parent, path.basename(file));
      if (
        /(?:^|\/)(?:skills|\.skills|file-forge-upload-[^/]*|file-forge-[a-f0-9-]{8,}|rollback)(?:\/|$)/.test(
          resolved,
        ) ||
        resolved.includes("/share/file-forge/") ||
        resolved.includes("/lib/file-forge/") ||
        path.basename(resolved) === "config.json"
      )
        throw new Error();
      const directory = await native.stat(parent);
      if ((directory.mode & 0o022) !== 0) throw new Error();
      const before = await native.lstat(resolved);
      if (
        !before.isFile() ||
        before.uid !== process.geteuid?.() ||
        (before.mode & 0o077) !== 0 ||
        before.size > 1024 * 1024
      )
        throw new Error();
      return { resolved, before };
    },
    catch: (error) =>
      new UploadError({
        code:
          typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"
            ? "UPLOAD_CONFIG_MISSING"
            : "UPLOAD_CONFIG_UNSAFE",
      }),
  });
export const loadConfig = (file: string, project: string) =>
  Effect.scoped(
    Effect.gen(function* () {
      if (!validProject(project)) return yield* fail("UPLOAD_PROJECT_UNKNOWN");
      const { resolved, before } = yield* inspect(file);
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const run = (command: string, args: string[]) =>
        spawner.string(
          ChildProcess.make(command, args, {
            cwd: path.dirname(resolved),
            shell: false,
            stderr: "pipe",
          }),
        );
      if (process.platform === "darwin") {
        const acl = yield* run("/bin/ls", ["-lde", resolved, path.dirname(resolved)]).pipe(
          Effect.mapError(() => new UploadError({ code: "UPLOAD_CONFIG_UNSAFE" })),
        );
        if (/^\s*\d+: /m.test(acl)) return yield* fail("UPLOAD_CONFIG_UNSAFE");
      }
      let ancestor = path.dirname(resolved);
      let gitRoot: string | undefined;
      while (true) {
        const exists = yield* Effect.tryPromise({
          try: () =>
            native
              .lstat(path.join(ancestor, ".git"))
              .then(() => true)
              .catch((error: NodeJS.ErrnoException) => {
                if (error.code === "ENOENT") return false;
                throw error;
              }),
          catch: () => new UploadError({ code: "UPLOAD_CONFIG_UNSAFE" }),
        });
        if (exists) {
          gitRoot = ancestor;
          break;
        }
        const parent = path.dirname(ancestor);
        if (parent === ancestor) break;
        ancestor = parent;
      }
      if (gitRoot) {
        const relative = path.relative(gitRoot, resolved);
        const tracked = yield* run("git", ["-C", gitRoot, "ls-files", "--", relative]).pipe(
          Effect.mapError(() => new UploadError({ code: "UPLOAD_CONFIG_UNSAFE" })),
        );
        if (tracked.trim()) return yield* fail("UPLOAD_CONFIG_UNSAFE");
        const ignored = yield* spawner
          .exitCode(
            ChildProcess.make("git", ["-C", gitRoot, "check-ignore", "--quiet", "--", relative], {
              shell: false,
            }),
          )
          .pipe(Effect.mapError(() => new UploadError({ code: "UPLOAD_CONFIG_UNSAFE" })));
        if (ignored !== 0) return yield* fail("UPLOAD_CONFIG_UNSAFE");
      }
      const handle = yield* Effect.acquireRelease(
        Effect.tryPromise({
          try: () => native.open(resolved, constants.O_RDONLY | constants.O_NOFOLLOW),
          catch: () => new UploadError({ code: "UPLOAD_CONFIG_UNSAFE" }),
        }),
        (opened) => Effect.promise(() => opened.close()),
      );
      const source = yield* Effect.tryPromise({
        try: async () => {
          const stat = await handle.stat();
          if (
            stat.dev !== before.dev ||
            stat.ino !== before.ino ||
            stat.mode !== before.mode ||
            stat.size !== before.size
          )
            throw new Error();
          const buffer = Buffer.alloc(1024 * 1024 + 1);
          const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
          const after = await handle.stat();
          const current = await native.lstat(resolved);
          if (
            bytesRead > 1024 * 1024 ||
            after.size !== bytesRead ||
            after.mtimeMs !== stat.mtimeMs ||
            current.ino !== stat.ino ||
            current.dev !== stat.dev ||
            current.isSymbolicLink()
          )
            throw new Error();
          return buffer.subarray(0, bytesRead).toString("utf8");
        },
        catch: () => new UploadError({ code: "UPLOAD_CONFIG_UNSAFE" }),
      });
      return yield* Effect.try({
        try: () =>
          validate(parseJson(source), project, { dev: before.dev, ino: before.ino }, resolved),
        catch: (error) =>
          error instanceof UploadError ? error : new UploadError({ code: "UPLOAD_CONFIG_INVALID" }),
      });
    }),
  );
