import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { Cause, Effect, Exit, FileSystem, Path, Result } from "effect";
import { NodeServices } from "@effect/platform-node";
import { command, copyPayload, present, problem, statLink, verify } from "./distribution.js";
import { messages, type Locale } from "./messages.js";
export const install = (source: string, selectedPrefix: string) =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const { metadata, digest } = yield* verify(source, true);
      const media = yield* Effect.promise(() => import("@file-forge/media"));
      if (
        !(yield* media
          .getFfmpegStatus()
          .pipe(Effect.provide(media.ffmpegLayer(process.env.FFMPEG_PATH || "ffmpeg")))).available
      )
        return yield* problem("FFMPEG_REQUIRED");
      const prefix = path.resolve(selectedPrefix);
      const managed = path.join(prefix, "lib", "file-forge");
      const bin = path.join(prefix, "bin");
      const launcher = path.join(bin, "file-forge");
      yield* fs.makeDirectory(managed, { recursive: true });
      const lock = path.join(managed, ".install.lock");
      yield* Effect.acquireRelease(
        fs
          .writeFileString(lock, JSON.stringify({ pid: process.pid }), { flag: "wx" })
          .pipe(Effect.mapError(() => problem("INSTALL_BUSY"))),
        () => fs.remove(lock).pipe(Effect.orDie),
      );
      const checkLauncher = Effect.gen(function* () {
        if (!(yield* present(launcher))) return;
        if (!(yield* statLink(launcher)).isSymbolicLink())
          return yield* problem("COMMAND_CONFLICT");
        const target = path.resolve(bin, yield* fs.readLink(launcher));
        const parent = path.dirname(target);
        if (path.dirname(parent) !== managed || path.basename(target) !== "file-forge.js")
          return yield* problem("COMMAND_CONFLICT");
        const record = yield* fs
          .readFileString(path.join(parent, ".file-forge-install.json"))
          .pipe(Effect.mapError(() => problem("COMMAND_CONFLICT")));
        const expected = yield* Effect.try({
          try: () => JSON.parse(record) as { schemaVersion?: number; owner?: string },
          catch: () => problem("COMMAND_CONFLICT"),
        });
        if (expected.schemaVersion !== 1 || expected.owner !== "file-forge")
          return yield* problem("COMMAND_CONFLICT");
      });
      yield* checkLauncher;
      const destination = path.join(
        managed,
        `${metadata.version}-${metadata.platform}-${metadata.arch}-${digest.slice(0, 16)}`,
      );
      if (yield* present(destination)) {
        if (!(yield* statLink(destination)).isDirectory())
          return yield* problem("INSTALL_CONFLICT");
        const existing = yield* verify(destination, true);
        const marker = yield* fs.readFileString(path.join(destination, ".file-forge-install.json"));
        if (
          existing.digest !== digest ||
          marker !== JSON.stringify({ schemaVersion: 1, owner: "file-forge", digest })
        )
          return yield* problem("INSTALL_CONFLICT");
      } else {
        const staging = yield* fs.makeTempDirectoryScoped({
          directory: managed,
          prefix: ".stage-",
        });
        const payload = path.join(staging, "payload");
        yield* copyPayload(source, payload, metadata.entries);
        yield* verify(payload);
        yield* fs.writeFileString(
          path.join(payload, ".file-forge-install.json"),
          JSON.stringify({ schemaVersion: 1, owner: "file-forge", digest }),
          { flag: "wx" },
        );
        yield* command(process.execPath, [path.join(payload, "file-forge.js"), "--version"]);
        yield* fs.rename(payload, destination);
      }
      yield* fs.makeDirectory(bin, { recursive: true });
      const temporary = path.join(bin, `.file-forge-${randomUUID()}`);
      yield* Effect.acquireRelease(
        fs.symlink(path.relative(bin, path.join(destination, "file-forge.js")), temporary),
        () => fs.remove(temporary).pipe(Effect.catch(() => Effect.void)),
      );
      yield* checkLauncher;
      yield* fs.rename(temporary, launcher);
      return {
        schemaVersion: 1,
        status: "installed",
        executable: launcher,
        directory: destination,
        version: metadata.version,
      };
    }),
  );
export async function main(source: string, args: readonly string[]) {
  let prefix = `${homedir()}/.local`,
    locale: Locale = "en",
    json = false,
    help = false,
    invalid = false;
  const used = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (used.has(arg)) invalid = true;
    used.add(arg);
    if (arg === "--prefix" && args[i + 1]) prefix = args[++i]!;
    else if (arg === "--language" && (args[i + 1] === "en" || args[i + 1] === "zh-CN"))
      locale = args[++i] as Locale;
    else if (arg === "--json") json = true;
    else if (arg === "--help") help = true;
    else invalid = true;
  }
  if (!prefix || invalid) {
    process.stderr.write(messages[locale].installUsage + "\n");
    process.exitCode = 2;
    return;
  }
  if (help) {
    process.stdout.write(messages[locale].installUsage + "\n");
    return;
  }
  const abort = new AbortController();
  const stop = () => abort.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const result = await Effect.runPromiseExit(
    install(source, prefix).pipe(Effect.provide(NodeServices.layer)),
    { signal: abort.signal },
  );
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
  if (Exit.isSuccess(result))
    process.stdout.write(
      (json
        ? JSON.stringify(result.value)
        : messages[locale].installComplete(result.value.executable)) + "\n",
    );
  else {
    const failure = Cause.findFail(result.cause);
    const error = Result.isSuccess(failure) ? failure.success.error : undefined;
    const code = Cause.hasInterrupts(result.cause)
      ? "CANCELLED"
      : typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "INSTALL_FAILED";
    process.exitCode = code === "CANCELLED" ? 130 : 1;
    if (json)
      process.stdout.write(
        JSON.stringify({ schemaVersion: 1, status: "failed", error: { code } }) + "\n",
      );
    else
      process.stderr.write(
        (code === "FFMPEG_REQUIRED"
          ? messages[locale].ffmpegRequired
          : messages[locale].installFailed(code)) + "\n",
      );
  }
}
