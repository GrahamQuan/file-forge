# Downloadable runtime and local installer

Status: Implemented and verified locally on 2026-10-16 (macOS arm64).

Deliver a downloadable FileForge runtime archive without npm publishing. This milestone implements the
local packaging/install portion of first-draft P08/P09/P15; publishing URLs, GitHub release automation,
self-update, signing, and additional OS/architecture targets remain separate work.

## Acceptance

1. Build `file-forge-0.0.0-darwin-arm64.tar.gz` plus a SHA-256 checksum file. The first supported target is
   macOS Apple Silicon, the existing validated host. Reject unsupported build/install targets explicitly.
2. The archive includes compiled CLI/MCP/core/media code and production dependencies, including Sharp,
   its native libraries, and the vector tracer. Node.js >=22.13 and FFmpeg remain user-installed. Users
   need neither npm/pnpm nor the development checkout to run or install the extracted runtime.
3. Provide an executable launcher and installer inside the archive. Direct execution after extraction works.
   Installation defaults to `~/.local`, supports `--prefix`, checks prerequisites/integrity before activation,
   and prints clear bilingual guidance. It never installs prerequisites, edits shell startup files, or uses sudo.
4. Install immutable version/build directories and atomically activate `PREFIX/bin/file-forge`. Reinstalling
   the same valid build is safe. Preserve earlier builds for active processes and rollback; reject unrelated
   existing commands, conflicting installers, malformed metadata, wrong targets, and corrupted payloads.
   Failed installation must not replace a working command or delete source assets, preferences, or history.
5. Include versioned build metadata and a complete payload inventory. Reject unsafe or escaping links and
   modified payloads. Checksums detect corruption, not publisher authenticity; extraction assumes a trusted
   archive, and users should check its outer checksum before extracting. No remote download script is added.
6. An installed runtime supports the existing CLI and local MCP/plugin entrypoints. Do not modify Codex
   settings or install the plugin automatically. Existing `--upgrade` remains explicitly unavailable and
   tells users to install a separately downloaded archive.
7. Real non-UI E2E must unpack and install outside the checkout, run CLI/favicon/MCP with no package
   manager on PATH, verify actual native outputs, failures, reinstall/activation safety and source retention.
   UI validation belongs to the user. No publishing, tagging, account upload, or global installation is authorized.
