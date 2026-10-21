# FileForge runtime

[简体中文](README.zh-CN.md)

This preview archive is for macOS Apple Silicon. Install Node.js 22.13 or newer (24 recommended)
and FFmpeg yourself. Sharp, its native libraries, and vector tracing are included. No npm, pnpm,
development checkout, network access, or administrator access is required to use this archive.

Verify the archive before extraction with `shasum -a 256 -c file-forge-0.0.0-darwin-arm64.tar.gz.sha256`.
Checksums detect corruption; obtain the archive and checksum from a trusted source. This preview is not signed.
Extract with `tar -xzf file-forge-0.0.0-darwin-arm64.tar.gz`, then enter the extracted directory.

Run directly with `./file-forge.js --help`, or install:

```sh
./install.js --prefix "$HOME/.local"
export PATH="$HOME/.local/bin:$PATH"
file-forge --version
file-forge favicon generate /path/to/logo.png --size 64 --output /path/to/output
```

The installer accepts `--language en|zh-CN` and `--json`. It checks Node, FFmpeg, the target platform,
and every payload file/link. Set `FFMPEG_PATH` to your external executable if it is not on PATH.
It does not edit your shell configuration. Use `file-forge config set language zh-CN` to save CLI language.

Installed builds are preserved under `PREFIX/lib/file-forge`; `PREFIX/bin/file-forge` points to the active
build. Reinstalling an identical intact build is safe. Install a newly downloaded archive to activate it.
Existing unrelated commands and concurrent installers are rejected. If an installer was forcibly killed,
verify that its recorded PID has exited before manually removing its `.install.lock`. Never remove a live lock.
No automatic cleanup or self-update is performed. Keep older builds while processes still use them.
To roll back, run an older retained build's `install.js --prefix PREFIX`. To stop using FileForge, remove
only its owned `PREFIX/bin/file-forge` link; keep settings/assets and remove old build directories only
when you are sure no process needs them.

For Codex, configure the installed `PREFIX/bin/file-forge` with argument `mcp` and an explicit
`FILE_FORGE_ROOT` workspace. All MCP input/output paths must remain within that workspace. The separate
FileForge plugin can use `FILE_FORGE_EXECUTABLE` pointing to this installed executable. Configure Node
on the host's PATH and FFmpeg on PATH or through `FFMPEG_PATH`. No Codex configuration is changed here.

Only inspection, image processing, favicons, generic manifest export, and session-local MCP jobs are
implemented. Uploads, durable jobs, public releases, automatic updates, and other platforms remain planned.
Third-party licenses are retained alongside the included production dependencies in `runtime/node_modules`.
