import { fileURLToPath } from "node:url";
import { Effect, FileSystem, Path } from "effect";
import { NodeServices } from "@effect/platform-node";
import { problem } from "./distribution.js";

// Build-time entrypoint only. Stamp the disposable CI checkout, never commit back to main.
const stamp = (version: string | undefined) =>
  Effect.gen(function* () {
    if (!version || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version))
      return yield* problem("INVALID_RELEASE_VERSION");
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = fileURLToPath(new URL("../../../", import.meta.url));
    const read = (name: string) => fs.readFileString(path.join(root, name));
    const cli = JSON.parse(yield* read("packages/cli/package.json")) as { version: string };
    const previous = cli.version;
    const changes: Array<[string, string]> = [];
    for (const name of [
      "package.json",
      ...["cli", "core", "media", "mcp"].map((p) => `packages/${p}/package.json`),
    ]) {
      const manifest = JSON.parse(yield* read(name));
      if (manifest.version !== previous) return yield* problem("VERSION_MISMATCH");
      changes.push([name, JSON.stringify({ ...manifest, version }, null, 2) + "\n"]);
    }
    for (const name of [
      "packages/file-forge-plugin/plugin.json",
      "packages/file-forge-plugin/.codex-plugin/plugin.json",
      "packages/file-forge-plugin/scripts/start.sh",
      "packages/file-forge-plugin/SETUP.md",
      "packages/file-forge-plugin/skills/file-forge/SKILL.md",
      "packages/cli/src/main.ts",
      "packages/mcp/src/index.ts",
      "packages/cli/distribution/README.md",
      "packages/cli/distribution/README.zh-CN.md",
    ]) {
      const text = yield* read(name);
      if (!text.includes(previous)) return yield* problem("VERSION_MISMATCH");
      changes.push([name, text.replaceAll(previous, version)]);
    }
    for (const [name, content] of changes)
      yield* fs.writeFileString(path.join(root, name), content);
  });
await Effect.runPromise(stamp(process.argv[2]).pipe(Effect.provide(NodeServices.layer)));
