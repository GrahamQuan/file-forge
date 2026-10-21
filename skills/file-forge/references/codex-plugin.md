# Install and connect the Codex plugin

For a newly discovered missing or broken plugin, explain the blocker and recommend the concrete install/reconnect/repair step. Ask and wait before changing configuration or falling back to CLI, unless the user has explicitly authorized that same step under unchanged conditions.

Runtime installation and plugin installation are separate. First inspect `codex plugin --help`, marketplace list and plugin list; reuse a compatible installed FileForge plugin. A deliberately disabled plugin should not be silently re-enabled by a status check.

The locally verified CLI supports `plugin add`, not `plugin install`. Other clients may differ; use their actual help or supported plugin-management tools. The [official plugin guide](https://developers.openai.com/plugins/build/plugins) documents local marketplaces and host discovery. If automated installation is unavailable, prepare the source/catalog and explain the remaining host installation step.

## Prepare an owned marketplace source

Extract the verified matching plugin into a persistent location such as `~/.local/share/file-forge/plugin-marketplace/file-forge`. Check existing ownership/configuration before replacing files. Never edit the installed plugin cache.

Choose an existing authorized asset workspace for `FILE_FORGE_ROOT`. Prefer the current project when it covers the user's requested paths; otherwise create a dedicated `~/Downloads/file-forge` workspace. Do not broaden to the entire home directory to bypass scope errors. When input files lie outside the root, use CLI on the authorized path or obtain authorization for a suitable copy/root change.

In both plugin-source `mcp.json` and `.mcp.json`, merge this server `env` into `mcpServers.file-forge`, preserving command and args:

```json
{
  "FILE_FORGE_EXECUTABLE": "/absolute/path/to/file-forge",
  "FILE_FORGE_ROOT": "/absolute/authorized/workspace",
  "FFMPEG_PATH": "/absolute/path/to/ffmpeg",
  "PATH": "/absolute/node/bin:/opt/homebrew/bin:/usr/bin:/bin"
}
```

Resolve real host paths. JSON does not expand `~` or shell variables. Keep local paths out of shared skill/source commits.

At the marketplace root, create or merge `.agents/plugins/marketplace.json`:

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

Preserve unrelated marketplace entries. Adapt the relative source path if using a source checkout. Do not create a second standalone FileForge MCP server alongside the plugin.

## Register and verify

With the supported CLI inspected first:

```sh
codex plugin marketplace add "$HOME/.local/share/file-forge/plugin-marketplace" --json
codex plugin add file-forge@file-forge-local --json
codex plugin list --marketplace file-forge-local --json
```

Reuse existing registration rather than adding duplicates. Verify installed/enabled state. The host may need a restart and a fresh chat; do not quit the user's app yourself. Check the FileForge Local source in its plugin directory when applicable.

Report these separately:

1. Runtime executable responds with the intended version.
2. Plugin is registered, installed and enabled.
3. FileForge tools are available in this chat and `file_forge_info` succeeds.
4. The requested operation completed and output exists.

A CLI run or a separate STDIO test does not prove this chat loaded the plugin. If tools remain unavailable, say so and ask whether to reconnect or use CLI before any MCP job was accepted. Only execute the fallback after that choice. Reconnect after setup; do not promise immediate tool injection into the current chat.
