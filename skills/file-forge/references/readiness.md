# Readiness and capability checks

Choose the route first. For direct Sharp check Node/module resolution; for direct FFmpeg check FFmpeg/FFprobe and needed features. FileForge/plugin checks below apply only to built-in work or setup requests; their absence does not block an independent custom task. See [custom processing](custom-processing.md).

Check relevant availability without changing configuration:

```sh
uname -s
uname -m
command -v file-forge
command -v node
node --version
command -v ffmpeg
ffmpeg -version
command -v ffprobe
command -v codex
codex plugin --help
```

If FileForge is absent from PATH, check the known managed location `~/.local/bin/file-forge` before installing a duplicate. An existing executable that fails to launch is a diagnostic case, not proof it is missing. Read version/help using its absolute path. Resolve symlinks when useful to identify the active build.

Requirements in the verified implementation:

- Node.js >=22.13; Node 24 is the documented development/runtime choice. Use a compatible existing installation first. For GUI-launched MCP, configure an absolute Node directory in PATH rather than assuming shell initialization runs.
- FFmpeg is required by FileForge startup, even for its image workflows. Select an existing binary via PATH or absolute `FFMPEG_PATH`. FFprobe is required for audio processing and useful for video verification. It normally accompanies FFmpeg; set `FFPROBE_PATH` if its location differs.
- Sharp and the vector tracer ship with the runtime; do not install `cwebp`, ImageMagick, Python packages or gltfpack for FileForge operations.
- Only 3D posters require Chrome/Chromium. Reuse macOS Chrome or Edge in `/Applications`, or an absolute `FILE_FORGE_CHROME_PATH`. The runtime includes Three.js/Puppeteer Core but does not download a browser. Follow the stop-and-ask rule for missing browser installation; model compression and folders containing GLBs now need one for their automatic posters.
- pnpm is needed for a source build, not a published runtime archive.
- Codex CLI or supported plugin-management tools are needed for automated plugin installation.

For missing prerequisites, stop dependent processing, explain the missing tool and recommended installation or existing-path solution, and ask the user which to use. Do not treat a general processing request as installation approval. Once approved, reuse the user's established package manager. When dependency installation is already authorized, install only missing dependencies and then check their executable versions. On a Homebrew-managed Mac, inspect the installed formula/help before using `brew install ffmpeg` or an appropriate supported Node formula. Do not bootstrap a package manager, use sudo, replace global Node, or modify shell startup files without authorization for that change. If unavailable, explain the exact missing dependency, recommend an alternative, and wait for the user before changing the setup. Read-only preparation may continue.

Read `file-forge --help`, relevant subcommand help, and connected tool schemas. Call `file_forge_info` to learn the runtime version, authorized root and session limits. A version string alone does not establish feature support: source builds use `0.0.0`, while release CI assigns other versions. Check matching release documentation/source when help leaves behavior ambiguous.

Never turn an omitted width/height into 512 or derive a fake bound to satisfy an old tool. If the installed version requires both dimensions, explain that the requested no-resize behavior needs a newer build, recommend the installation reference’s compatible upgrade/source option, and ask before proceeding.
