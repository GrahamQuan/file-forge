# Local FileForge plugin setup

This private source preview supports local POSIX execution (validated on macOS), not web-hosted execution.
The plugin requires FileForge **0.0.0**. It does not contain the runtime or install dependencies.

## Prepare the runtime

On macOS Apple Silicon, you can instead extract the runtime archive and run `./install.js`.
Node.js and FFmpeg remain user-installed; Sharp and the tracer are included. No npm/pnpm or checkout is
needed for this option. Set `FILE_FORGE_EXECUTABLE` below to your installed absolute
`~/.local/bin/file-forge` path (expand `~`). See [the archive guide](../cli/distribution/README.md).

For source development:

In the FileForge checkout, use Node.js 24 (minimum 22.13) and pnpm 10, install FFmpeg yourself, then run:

```sh
pnpm install
pnpm build
pnpm --silent file-forge --version
pnpm check
pnpm test:e2e
```

The executable is the absolute path to `packages/cli/dist/launcher.js`. Keep the checkout and its dependencies
available while using this source preview. Sharp and the vector tracer are installed by pnpm. FFmpeg is
external; select it through PATH or an absolute `FFMPEG_PATH`. No network is required during processing.

## Configure the plugin

Before importing a local copy, add an `env` object to the `file-forge` server in **both** `mcp.json` and
`.mcp.json`. Replace the example values with your actual paths:

```json
{
  "FILE_FORGE_EXECUTABLE": "/absolute/file-forge/packages/cli/dist/launcher.js",
  "FILE_FORGE_ROOT": "/absolute/authorized-assets-workspace",
  "FFMPEG_PATH": "/absolute/path/to/ffmpeg",
  "PATH": "/absolute/node/bin:/usr/local/bin:/usr/bin:/bin"
}
```

Keep the existing command and arguments. The authorized root must already exist; input and output locations
must resolve within it. Do not choose your entire home directory just to avoid a path error. On macOS the
Node/FFmpeg locations can be found with `command -v node` and `command -v ffmpeg` in your configured shell.
Environment inheritance varies by host, so explicit configuration is preferred. Do not commit machine-specific
paths or secrets. Rebuild/reimport the local package after changing its source configuration.

For a repo marketplace, add this entry to `.agents/plugins/marketplace.json` at the repository root,
merging with existing entries instead of replacing them:

```json
{
  "name": "file-forge-local",
  "interface": { "displayName": "FileForge Local" },
  "plugins": [
    {
      "name": "file-forge",
      "source": { "source": "local", "path": "./packages/file-forge-plugin" },
      "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
      "category": "Developer Tools"
    }
  ]
}
```

Refresh/restart the desktop host, find **FileForge Local** in Plugins, and install/enable FileForge.
Start a fresh chat in the trusted workspace and select the FileForge skill/plugin. Hosts may namespace
its tools differently. Installing the plugin does not prove the runtime is ready: call `file_forge_info`.
Follow the [official local plugin guidance](https://developers.openai.com/plugins/build/plugins).
No marketplace or global configuration is installed automatically by this repository.

## Direct MCP alternative

To test the tools before installing the skill, add a server entry to your chosen Codex configuration
(merge with existing configuration; do not enable this and the plugin server simultaneously):

```toml
[mcp_servers.file_forge]
command = "/absolute/file-forge/packages/cli/dist/launcher.js"
args = ["mcp"]

[mcp_servers.file_forge.env]
FILE_FORGE_ROOT = "/absolute/authorized-assets-workspace"
FFMPEG_PATH = "/absolute/path/to/ffmpeg"
PATH = "/absolute/node/bin:/usr/local/bin:/usr/bin:/bin"
```

See [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).
Restart/reconnect after configuration changes. STDIO carries protocol messages; do not run the server
as a background web server or expect terminal prompts. Closing the connection stops its owned jobs.

## Test through Codex

Ask: “Use FileForge to inspect the images in my `inputs` folder, resize them to width 800 as WebP under
`outputs`, generate 64-pixel ICO/PNG/traced-SVG favicons from `inputs/logo.png`, and export a manifest.
Poll each job to completion, verify the output files, and report per-file failures. Preserve all sources.”

Then ask it to cancel a running batch and verify terminal status. Check that status remains responsive,
no worker survives disconnect, and the agent does not retry uncertain writes through another route.
The CLI additionally supports language settings, help, and version; these are setup commands rather than
media MCP tools. Automated `e2e/mcp.test.js` drives the actual packaged bootstrap over STDIO, checks
implemented operations and lifecycle behavior. Installing/selecting this plugin in a Codex chat is a separate
manual acceptance step, not an automated test claim.

Jobs are session-only, one at a time, with 128 retained records. Keep each accepted request ID for polling
and cancellation. After reconnection, `UNKNOWN_JOB` cannot tell you whether files were written previously.
Inspect known destinations before retrying. Cancellation normally retains completed files; forced cleanup
after 30 seconds may leave incomplete artifacts that require inspection. Never delete source data.

## Reusable setup skill

The full setup and operation map is maintained at `skills/file-forge` in the FileForge source repository. Use `pnpm skill:copy --project /absolute/project` after building to copy it into a consuming project. This is separate from installing this plugin. The plugin ZIP ships its compact `skills/file-forge/SKILL.md`, MCP configuration and bootstrap; it does not include the full reusable skill references.

The source plugin includes folder compression and explicit source-directory rename tools. `rename_folders` previews by default; `apply: true` requires an authorized mapping. It cannot rename the configured MCP workspace root. No-size compression keeps original dimensions. Check the installed version’s schemas rather than assuming source changes are already in a published build.

Audio processing additionally requires FFprobe beside an absolute FFmpeg executable or on PATH; set an absolute `FFPROBE_PATH` in the CLI environment or both plugin MCP configurations when needed. No separate GLB optimizer is required for JSON compaction. Source tools `compress_audio` and `compress_model` require a matching runtime; inspect schemas before assuming release availability.
