# Runtime installation, upgrade and rollback

Apply the entrypoint’s Stop and ask rule first. For a newly discovered missing/broken runtime, present the proposed release, destination and remedy and wait for the user’s choice. An explicit request to install that same runtime already supplies authorization; do not ask again unless a new blocker or material change arises.

Official distribution: [GrahamQuan/file-forge](https://github.com/GrahamQuan/file-forge), [GitHub Releases](https://github.com/GrahamQuan/file-forge/releases).

Resolve the requested release, or inspect the latest published stable release when none is specified. Do not hardcode a version from this skill. Use GitHub tools, `gh release view --repo GrahamQuan/file-forge`, or the GitHub API to inspect exact tags and asset URLs. Do not guess a download URL, publish a release, or push source changes as part of installation.

The verified distribution target is macOS arm64. Check actual release assets before selecting a different platform; never install an arm64 archive on an unsupported host. Keep runtime and plugin versions matched.

For the chosen version, download these existing assets from the same release to a unique staging folder under Downloads:

- `file-forge-VERSION-darwin-arm64.tar.gz` and its `.sha256`
- `file-forge-plugin-VERSION.zip` and its `.sha256`

Use a download tool that fails on HTTP errors. Validate each checksum with `shasum -a 256 -c CHECKSUM_FILE` in the download directory before extraction. Stop on mismatch, report which asset failed verification, and ask whether to download it again from the official release or stop. Checksums from the same release detect corruption; they are not a signature.

Inspect archive entries before extracting into an empty task-owned staging directory: reject absolute paths, parent traversal and links escaping the extraction root. Read the included installation instructions. For the known package layout, run the extracted runtime's `./install.js --prefix "$HOME/.local" --json` and verify `"$HOME/.local/bin/file-forge" --version`. Do not pipe remote scripts to a shell.

The managed installer preserves earlier builds under `~/.local/lib/file-forge` and refuses unrelated existing commands. Use an absolute executable path or a process-local PATH; do not change shell startup files just to make the command discoverable. Continue to [plugin setup](codex-plugin.md) with the verified plugin archive.

## Upgrade

Inspect current CLI and connected MCP versions first. Wait for active jobs before switching builds. Download, verify and install the desired runtime using the same prefix, then update the matching plugin's owned marketplace source while preserving machine configuration. Use the installed Codex CLI's supported refresh/install flow; verify actual versions after reconnecting. `file-forge --upgrade` is not implemented in the verified version.

Do not remove/reinstall a working plugin repeatedly to force discovery. A reconnect or fresh chat may be necessary. Do not delete retained runtime builds or user outputs.

## No compatible published feature

Folder processing and optional-size behavior may be newer than published assets. Inspect release notes/source; do not assume the latest tag contains the current checkout. If necessary, offer a local source build and proceed when that setup is authorized:

```sh
# In a trusted FileForge checkout; use its pinned package-manager version.
pnpm install --frozen-lockfile
pnpm check
pnpm test:e2e
pnpm --silent file-forge --version
```

The source launcher is `packages/cli/dist/launcher.js`; the matching plugin is `packages/file-forge-plugin`. Keep the checkout/dependencies in place and rebuild after changes. Do not mix a released plugin requiring a different version with this runtime.

For authorized rollback, select the retained known-good build and rerun its installer with the same prefix; pair it with a compatible plugin. Preserve job outputs and active-build data.
