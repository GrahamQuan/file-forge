import { homedir } from "node:os";
import { Data, Effect, FileSystem, Path, Schedule, Schema } from "effect";
import type { Locale } from "./messages.js";

export class SettingsError extends Data.TaggedError("SettingsError")<{
  readonly code: "SETTINGS_INVALID" | "SETTINGS_WRITE_FAILED";
}> {}
const SettingsSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  language: Schema.Literals(["en", "zh-CN"]),
});
export const settingsPath = () =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    // Explicit override supports isolated local installations and E2E; never changes process.env.
    if (process.env.FILE_FORGE_CONFIG_DIR)
      return path.join(path.resolve(process.env.FILE_FORGE_CONFIG_DIR), "config.json");
    if (process.platform !== "darwin")
      return yield* new SettingsError({ code: "SETTINGS_INVALID" });
    return path.join(homedir(), "Library", "Application Support", "file-forge", "config.json");
  });
export const readSettings = (file: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    if (!(yield* fs.exists(file)))
      return { language: "en" as Locale, source: "default", raw: {} as Record<string, unknown> };
    const text = yield* fs.readFileString(file);
    const raw = yield* Effect.try({
      try: () => JSON.parse(text) as Record<string, unknown>,
      catch: () => new SettingsError({ code: "SETTINGS_INVALID" }),
    });
    const parsed = yield* Schema.decodeUnknownEffect(SettingsSchema)(raw);
    return { language: parsed.language, source: "saved", raw };
  }).pipe(Effect.mapError(() => new SettingsError({ code: "SETTINGS_INVALID" })));
export const saveLanguage = (file: string, language: Locale) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.makeDirectory(path.dirname(file), { recursive: true });
    return yield* Effect.scoped(
      Effect.gen(function* () {
        const lock = `${file}.lock`;
        yield* Effect.acquireRelease(
          fs
            .makeDirectory(lock)
            .pipe(Effect.retry({ times: 40, schedule: Schedule.spaced("50 millis") })),
          () => fs.remove(lock, { recursive: true }).pipe(Effect.orDie),
        );
        const current = yield* readSettings(file);
        const staging = yield* fs.makeTempDirectoryScoped({
          directory: path.dirname(file),
          prefix: ".settings-",
        });
        const temporary = path.join(staging, "config.json");
        yield* fs.writeFileString(
          temporary,
          JSON.stringify({ ...current.raw, schemaVersion: 1, language }, null, 2) + "\n",
          { flag: "wx", mode: 0o600 },
        );
        yield* fs.rename(temporary, file);
      }),
    );
  }).pipe(Effect.mapError(() => new SettingsError({ code: "SETTINGS_WRITE_FAILED" })));
