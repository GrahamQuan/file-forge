import { fileURLToPath } from "node:url";
import { Cause, Effect, Exit, FileSystem, Path, Result } from "effect";
import { NodeServices } from "@effect/platform-node";
import {
  command,
  inventory,
  present,
  problem,
  sha256,
  supported,
  statLink,
  DistributionError,
} from "./distribution.js";
const repository = fileURLToPath(new URL("../../../", import.meta.url));
export const buildArchive = (output: string) =>
  Effect.scoped(
    Effect.gen(function* () {
      if (!supported()) return yield* problem("UNSUPPORTED_TARGET");
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const pkg = JSON.parse(
        yield* fs.readFileString(path.join(repository, "packages/cli/package.json")),
      ) as { version: string };
      const name = `file-forge-${pkg.version}-${process.platform}-${process.arch}`;
      const destination = path.resolve(output);
      yield* fs.makeDirectory(destination, { recursive: true });
      const temporary = yield* fs.makeTempDirectoryScoped({
        directory: destination,
        prefix: ".package-",
      });
      const root = path.join(temporary, name);
      yield* fs.makeDirectory(root);
      yield* command(
        "pnpm",
        [
          "--filter",
          "@file-forge/cli",
          "deploy",
          "--legacy",
          "--prod",
          "--offline",
          path.join(root, "runtime"),
        ],
        repository,
      );
      // pnpm 10 legacy deploy leaves a development self-link and build-machine metadata.
      for (const relative of [
        "node_modules/.modules.yaml",
        "node_modules/.pnpm-workspace-state-v1.json",
        "node_modules/.pnpm/lock.yaml",
        "node_modules/.pnpm/node_modules/@file-forge/cli",
      ]) {
        const file = path.join(root, "runtime", relative);
        if (yield* present(file)) yield* fs.remove(file);
      }
      const stripBins = (
        directory: string,
      ): Effect.Effect<void, DistributionError | import("effect/PlatformError").PlatformError> =>
        Effect.gen(function* () {
          for (const name of yield* fs.readDirectory(directory)) {
            const child = path.join(directory, name);
            if (!(yield* statLink(child)).isDirectory()) continue;
            if (name === ".bin") yield* fs.remove(child, { recursive: true });
            else yield* stripBins(child);
          }
        });
      yield* stripBins(path.join(root, "runtime/node_modules"));
      const header = (yield* fs.readFileString(path.join(root, "runtime/dist/launcher.js")))
        .split("\n")
        .slice(0, 2)
        .join("\n");
      const bootstrap = (body: string) => `${header}\n${body}\n`;
      yield* fs.writeFileString(
        path.join(root, "package.json"),
        JSON.stringify({
          name: "file-forge-runtime",
          version: pkg.version,
          private: true,
          type: "module",
        }) + "\n",
      );
      yield* fs.writeFileString(
        path.join(root, "file-forge.js"),
        bootstrap("import './runtime/bin/file-forge.js';"),
      );
      yield* fs.writeFileString(
        path.join(root, "install.js"),
        bootstrap(`import { fileURLToPath } from 'node:url';
import { messages } from './runtime/dist/messages.js';
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) { const args = process.argv.slice(2); const locale = args[args.indexOf('--language') + 1] === 'zh-CN' ? 'zh-CN' : 'en'; if (args.includes('--json')) console.log(JSON.stringify({schemaVersion:1,status:'failed',error:{code:'NODE_REQUIRED'}})); else console.error(messages[locale].nodeRequired); process.exitCode = 1; }
else { const { main } = await import('./runtime/dist/install.js'); await main(fileURLToPath(new URL('.', import.meta.url)), process.argv.slice(2)); }`),
      );
      for (const name of ["file-forge.js", "install.js"])
        yield* fs.chmod(path.join(root, name), 0o755);
      for (const name of ["README.md", "README.zh-CN.md"])
        yield* fs.copyFile(
          path.join(repository, "packages/cli/distribution", name),
          path.join(root, name),
        );
      yield* fs.writeFileString(
        path.join(root, "distribution.json"),
        JSON.stringify(
          {
            schemaVersion: 1,
            version: pkg.version,
            platform: process.platform,
            arch: process.arch,
            nodeMinimum: "22.13.0",
            entries: yield* inventory(root),
          },
          null,
          2,
        ) + "\n",
      );
      const filename = `${name}.tar.gz`;
      const archive = path.join(temporary, filename);
      yield* command("tar", ["-czf", archive, "-C", temporary, name]);
      const digest = sha256(yield* fs.readFile(archive));
      const checksum = path.join(temporary, `${filename}.sha256`);
      yield* fs.writeFileString(checksum, `${digest}  ${filename}\n`);
      // Exclusive links publish only new artifacts, never replacing an earlier build.
      yield* fs.link(archive, path.join(destination, filename));
      yield* fs.link(checksum, path.join(destination, `${filename}.sha256`));
      const pluginRoot = path.join(temporary, "file-forge");
      for (const relative of [
        "plugin.json",
        ".codex-plugin/plugin.json",
        "mcp.json",
        ".mcp.json",
        "scripts/start.sh",
        "skills/file-forge/SKILL.md",
        "SETUP.md",
      ]) {
        const source = path.join(repository, "packages/file-forge-plugin", relative);
        if (!(yield* statLink(source)).isFile()) return yield* problem("INVALID_PLUGIN");
        if (relative.endsWith("plugin.json")) {
          const manifest = JSON.parse(yield* fs.readFileString(source));
          if (manifest.version !== pkg.version || manifest.name !== "file-forge")
            return yield* problem("PLUGIN_VERSION_MISMATCH");
        }
        if (relative === "mcp.json" || relative === ".mcp.json") {
          const configuration = JSON.parse(yield* fs.readFileString(source));
          delete configuration.$schema;
          if (
            JSON.stringify(configuration) !==
            JSON.stringify({
              mcpServers: {
                "file-forge": {
                  type: "stdio",
                  command: "/bin/sh",
                  args: ["${PLUGIN_ROOT}/scripts/start.sh"],
                },
              },
            })
          )
            return yield* problem("PLUGIN_CONFIGURATION_NOT_PORTABLE");
        }
        const target = path.join(pluginRoot, relative);
        yield* fs.makeDirectory(path.dirname(target), { recursive: true });
        yield* fs.copyFile(source, target);
      }
      const pluginName = `file-forge-plugin-${pkg.version}.zip`;
      yield* command("zip", ["-qr", path.join(temporary, pluginName), "file-forge"], temporary);
      const pluginDigest = sha256(yield* fs.readFile(path.join(temporary, pluginName)));
      yield* fs.writeFileString(
        path.join(temporary, `${pluginName}.sha256`),
        `${pluginDigest}  ${pluginName}\n`,
      );
      yield* fs.link(path.join(temporary, pluginName), path.join(destination, pluginName));
      yield* fs.link(
        path.join(temporary, `${pluginName}.sha256`),
        path.join(destination, `${pluginName}.sha256`),
      );
      return {
        archive: path.join(destination, filename),
        sha256: digest,
        plugin: path.join(destination, pluginName),
        pluginSha256: pluginDigest,
      };
    }),
  );
const args = process.argv.slice(2);
const valid = args.length === 0 || (args.length === 2 && args[0] === "--output");
const abort = new AbortController();
const stop = () => abort.abort();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
const result = await Effect.runPromiseExit(
  (valid ? buildArchive(args[1] ?? "release") : Effect.fail(problem("INVALID_ARGUMENT"))).pipe(
    Effect.provide(NodeServices.layer),
  ),
  { signal: abort.signal },
);
process.removeListener("SIGINT", stop);
process.removeListener("SIGTERM", stop);
if (Exit.isSuccess(result)) console.log(JSON.stringify(result.value));
else {
  const failure = Cause.findFail(result.cause);
  const error = Result.isSuccess(failure) ? failure.success.error : undefined;
  console.error(
    JSON.stringify({
      error: {
        code:
          typeof error === "object" && error !== null && "code" in error
            ? String(error.code)
            : "PACKAGE_FAILED",
      },
    }),
  );
  process.exitCode = 1;
}
