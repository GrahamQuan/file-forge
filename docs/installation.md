# Installation and Codex setup

A project skill, the Codex plugin, and the executable runtime are separate artifacts. To copy the reusable setup/workflow skill into another project, use [skill distribution](skill-distribution.md). That copy does not install the runtime or plugin.

Check [current source capabilities](current-capabilities.md) against the selected release; folder compression, no-size preservation and source-folder renaming may require a newer build than an existing installation.

## Requirements

The released archive supports macOS Apple Silicon (`uname -m` returns `arm64`). Install Node.js 24 (minimum 22.13) and FFmpeg separately. Sharp and the vector tracer are bundled. Archive users do not need pnpm or the development checkout.

Check prerequisites before changing anything:

```sh
uname -m
node --version
command -v node
ffmpeg -version
command -v ffmpeg
```

If a prerequisite is missing or Node is too old, report it. Do not silently install dependencies or change the user's system Node version. An explicitly selected compatible Node directory can be prepended to PATH for the operation.

## Install a published runtime

The official repository is [GrahamQuan/file-forge](https://github.com/GrahamQuan/file-forge). Get an exact published version from [GitHub Releases](https://github.com/GrahamQuan/file-forge/releases). The example below installs the first release, `0.0.1`; it is not a claim about the latest version.

Download these assets from the same release into Downloads:

- `file-forge-0.0.1-darwin-arm64.tar.gz`
- `file-forge-0.0.1-darwin-arm64.tar.gz.sha256`
- `file-forge-plugin-0.0.1.zip`
- `file-forge-plugin-0.0.1.zip.sha256`

Then verify and install:

```sh
cd "$HOME/Downloads"
shasum -a 256 -c file-forge-0.0.1-darwin-arm64.tar.gz.sha256
shasum -a 256 -c file-forge-plugin-0.0.1.zip.sha256
# Continue only if both checks succeed.
tar -xzf file-forge-0.0.1-darwin-arm64.tar.gz
cd file-forge-0.0.1-darwin-arm64
./install.js --prefix "$HOME/.local" --json
export PATH="$HOME/.local/bin:$PATH"
file-forge --version
```

Checksums detect corruption; download both files from the trusted repository. The release is not signed. The installer validates the payload and prerequisites, preserves previous managed builds, and refuses unrelated existing commands. It does not use sudo, install Node/FFmpeg, or edit shell startup files. Use the absolute executable path if you do not want to change PATH. Adding PATH to shell startup files is a separate persistent configuration change.

The installed executable is `~/.local/bin/file-forge`. Managed builds live under `~/.local/lib/file-forge/`.

## Install the plugin in Codex

Installing the runtime does not install the plugin. Use a matching plugin release and a dedicated authorized asset workspace:

```sh
mkdir -p "$HOME/Downloads/file-forge/inputs" "$HOME/Downloads/file-forge/outputs"
```

All plugin MCP input and output paths must be inside `FILE_FORGE_ROOT`. A file directly in Downloads is outside `~/Downloads/file-forge`; copy it into `inputs` with the user's authorization or use the CLI on the explicitly authorized original path. Do not widen the root to the entire home directory to work around a path error.

Extract the verified plugin ZIP into a persistent local marketplace directory, for example `~/.local/share/file-forge/plugin-marketplace`. The ZIP contains a `file-forge/` folder. Do not overwrite an existing source directory without checking its ownership and configuration.

In that extracted plugin's `mcp.json` and `.mcp.json`, add the same `env` object to `mcpServers.file-forge`, preserving the existing command and arguments:

```json
{
  "FILE_FORGE_EXECUTABLE": "/Users/YOUR_NAME/.local/bin/file-forge",
  "FILE_FORGE_ROOT": "/Users/YOUR_NAME/Downloads/file-forge",
  "FFMPEG_PATH": "/opt/homebrew/bin/ffmpeg",
  "PATH": "/absolute/directory-containing-node:/opt/homebrew/bin:/usr/bin:/bin"
}
```

Replace every placeholder with actual absolute paths; JSON does not expand `~` or `$HOME`. Resolve Node and FFmpeg using `command -v`. Keep this machine-specific configuration outside the repository. Edit the marketplace source, never the installed plugin cache.

At the marketplace root, create `.agents/plugins/marketplace.json` (merge with existing entries if present):

```json
{
  "name": "file-forge-local",
  "interface": { "displayName": "FileForge Local" },
  "plugins": [
    {
      "name": "file-forge",
      "source": { "source": "local", "path": "./file-forge" },
      "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
      "category": "Developer Tools"
    }
  ]
}
```

Use the installed Codex CLI's supported commands; inspect help first because versions differ:

```sh
codex plugin --help
codex plugin marketplace add "$HOME/.local/share/file-forge/plugin-marketplace" --json
codex plugin add file-forge@file-forge-local --json
codex plugin list --marketplace file-forge-local --json
```

This CLI supports `plugin add`, not `plugin install`. Use supported configuration commands to preserve unrelated settings. Do not add a duplicate standalone FileForge MCP server alongside the plugin.

Fully quit and reopen the desktop app after installation or marketplace changes. In the Plugins directory, select **FileForge Local** and check FileForge. Start a fresh chat. Local plugin discovery and marketplace behavior are documented in the [official plugin guide](https://developers.openai.com/plugins/build/plugins).

## Verify the connection

Ask Codex:

> Call FileForge's file_forge_info tool. Report its version and authorized root. Then inspect the files in inputs without modifying them.

Check these separately:

1. CLI: `file-forge --version` returns the intended version.
2. Plugin configuration: `codex plugin list --marketplace file-forge-local --json` reports installed and enabled.
3. Current chat: FileForge tools are actually available and `file_forge_info` succeeds.
4. Processing: a requested small operation succeeds, its job reaches a terminal status, and its output exists.

CLI processing or a separately spawned MCP test does not prove the current chat loaded the plugin. If tools are absent, state that accurately; do not describe CLI fallback as a plugin call. If the desktop listing remains empty after restart, inspect the marketplace source, plugin manifests, and the host's configuration scope instead of repeatedly reinstalling blindly.

## Upgrade and rollback

Download and verify the newer runtime and matching plugin from one release. Run the new archive's installer using the same prefix. It activates the new build and preserves prior builds. Then update the plugin through the supported Codex flow, preserving its local environment configuration, and reconnect MCP after active jobs finish.

Automatic `file-forge --upgrade` is not implemented. Do not claim that downloading an archive updates the active runtime or plugin. Verify the version and tool connection after installing.

For an explicit rollback, find the retained desired managed build and run its `install.js --prefix "$HOME/.local"`. Do not delete old builds used by live processes. Runtime rollback may also require a compatible plugin version.

## Source development alternative

From this checkout, use Node.js 24, pnpm 10.33.0, and FFmpeg:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test:e2e
pnpm --silent file-forge --version
```

Source execution uses `packages/cli/dist/launcher.js`; rebuild after changes. For source-plugin setup, follow [SETUP.md](../packages/file-forge-plugin/SETUP.md). Development version `0.0.0` is distinct from release versions stamped by CI. Do not mix a release plugin with an incompatible source runtime.
