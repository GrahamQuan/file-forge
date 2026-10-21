import { Cause, Console, Effect, Exit } from "effect";
import { CliConfig, CliError, Command } from "effect/cli";
import { NodeServices } from "@effect/platform-node";
import { messages, type Locale } from "./messages.js";
import { readSettings, saveLanguage, settingsPath } from "./settings.js";

const isLocale = (value: unknown): value is Locale => value === "en" || value === "zh-CN";
// Presentation flags are resolved before framework parsing so even parser failures use the selected locale.
const presentation = (input: readonly string[]) => {
  const args: string[] = [];
  let locale: Locale | undefined;
  let json = false;
  let help = false;
  let invalid = false;
  for (let index = 0; index < input.length; index++) {
    const arg = input[index]!;
    if (arg === "--") {
      args.push(...input.slice(index));
      break;
    }
    if (arg === "--json") {
      if (json) invalid = true;
      json = true;
    } else if (arg === "--help" || arg === "-h") help = true;
    else if (arg === "--language" || arg.startsWith("--language=")) {
      const value = arg === "--language" ? input[++index] : arg.slice(11);
      if (!isLocale(value) || locale) invalid = true;
      else locale = value;
    } else args.push(arg);
  }
  return { args, locale, json, help, invalid };
};
export async function main(input: readonly string[]): Promise<void> {
  if (input.length === 1 && input[0] === "mcp") {
    const server = await import("@file-forge/mcp");
    return server.main();
  }
  const flags = presentation(input);
  let locale: Locale = flags.locale ?? "en";
  let code = 0;
  const print = (result: unknown, human: string) =>
    Effect.sync(() => {
      process.stdout.write((flags.json ? JSON.stringify(result) : human) + "\n");
    });
  const fail = (errorCode: string, human: string, exitCode = 2) =>
    Effect.sync(() => {
      code = exitCode;
      if (flags.json)
        process.stdout.write(
          JSON.stringify({ schemaVersion: 1, status: "failed", error: { code: errorCode } }) + "\n",
        );
      else process.stderr.write(human + "\n");
    });
  const program = Effect.gen(function* () {
    const file = yield* settingsPath();
    const settings = yield* readSettings(file).pipe(
      Effect.catch(() =>
        Effect.sync(() => {
          process.stderr.write(messages.en.settingsInvalid(file) + "\n");
          return { language: "en" as Locale, source: "default" };
        }),
      ),
    );
    locale = flags.locale ?? settings.language;
    if (flags.invalid || flags.args.some((arg) => arg === "-v" || arg === "--version"))
      return yield* fail("INVALID_ARGUMENT", messages[locale].invalid);
    if (flags.args.includes("--upgrade")) {
      return yield* fail(
        flags.args.length === 1 ? "UNSUPPORTED_INSTALLATION" : "INVALID_ARGUMENT",
        flags.args.length === 1 ? messages[locale].unsupportedUpgrade : messages[locale].invalid,
        flags.args.length === 1 ? 1 : 2,
      );
    }
    if (flags.help || flags.args.length === 0)
      return yield* print({ schemaVersion: 1, help: messages[locale].help }, messages[locale].help);
    if (flags.args[0] === "config") {
      if (flags.args.length === 3 && flags.args[1] === "get" && flags.args[2] === "language") {
        return yield* print(
          { language: settings.language, source: settings.source },
          messages[locale].language(settings.language, settings.source),
        );
      }
      const selected = flags.args[3];
      if (
        flags.args.length !== 4 ||
        flags.args[1] !== "set" ||
        flags.args[2] !== "language" ||
        !isLocale(selected) ||
        (flags.locale && flags.locale !== selected)
      )
        return yield* fail("INVALID_ARGUMENT", messages[locale].invalid);
      yield* saveLanguage(file, selected);
      locale = selected;
      return yield* print(
        { language: selected, source: "saved" },
        messages[selected].saved(selected),
      );
    }
    const media = yield* Effect.promise(() => import("@file-forge/media"));
    const ffmpeg = yield* media
      .getFfmpegStatus()
      .pipe(Effect.provide(media.ffmpegLayer(process.env.FFMPEG_PATH || "ffmpeg")));
    if (!ffmpeg.available)
      return yield* fail("FFMPEG_REQUIRED", messages[locale].ffmpegRequired, 1);
    // Configuration, help, and version paths never load Sharp or the processing core.
    const business = yield* Effect.promise(() => import("./commands.js"));
    const root = Command.make("file-forge").pipe(
      Command.withSubcommands(
        business.commands(
          (result) => {
            code = result.status === "partial" || result.status === "failed" ? 1 : 0;
            return print(
              result,
              messages[locale].summary(result.status, result.assets.length, result.directory),
            );
          },
          Effect.sync(() => {
            process.stderr.write(messages[locale].progress + "\n");
          }),
          Effect.sync(() => {
            process.stderr.write(messages[locale].faviconProgress + "\n");
          }),
        ),
      ),
    );
    yield* Command.runWith(root, { version: "0.0.0", renderErrors: false })(flags.args).pipe(
      // Effect CLI 4.0.2 prints help even with renderErrors=false. Translate errors here and suppress its renderer.
      Effect.provideService(Console.Console, { ...console, log: () => {}, error: () => {} }),
      Effect.provide(business.MediaLive),
      Effect.provide(CliConfig.layer({ builtIns: [] })),
    );
  }).pipe(
    Effect.catch((error) => {
      if (CliError.isCliError(error)) return fail("INVALID_ARGUMENT", messages[locale].invalid);
      const errorCode = "code" in error ? String(error.code) : "IO_FAILED";
      return fail(
        errorCode,
        errorCode.startsWith("SETTINGS")
          ? messages[locale].settingsFailed
          : messages[locale].failed(errorCode),
        errorCode === "INVALID_INPUT" || errorCode.startsWith("SETTINGS") ? 2 : 1,
      );
    }),
    Effect.provide(NodeServices.layer),
  );
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  try {
    const result = await Effect.runPromiseExit(program, { signal: controller.signal });
    if (Exit.isFailure(result)) {
      if (Cause.hasInterrupts(result.cause)) {
        code = 130;
        if (flags.json)
          process.stdout.write(JSON.stringify({ schemaVersion: 1, status: "cancelled" }) + "\n");
        else process.stderr.write(messages[locale].cancelled + "\n");
      } else {
        code = 1;
        if (flags.json)
          process.stdout.write(
            JSON.stringify({
              schemaVersion: 1,
              status: "failed",
              error: { code: "INTERNAL_ERROR" },
            }) + "\n",
          );
        else process.stderr.write(messages[locale].failed("INTERNAL_ERROR") + "\n");
      }
    }
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    process.exitCode = code;
  }
}
