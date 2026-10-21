# Upgrade FileForge or its skill

Use this workflow for “upgrade FileForge”, “update to the latest version”, or “upgrade the FileForge skill”. An explicit upgrade request authorizes the selected upgrade; do not ask for the same permission again. A request to add upgrade support to this skill is an instruction edit, not a request to upgrade the installed software.

## Select the target

- “Upgrade FileForge” means the runtime and its matching installed Codex plugin. Preserve the installation prefix and authorized media root.
- “Upgrade/copy the skill” means refresh the selected project’s complete skill copy from the canonical FileForge repository. It does not upgrade software.
- Use context to resolve “upgrade”. If the target remains unclear, ask whether the user means the runtime/plugin, the skill, or both. Do not require media paths or dimensions.

## Runtime and plugin

1. Read [readiness](readiness.md) and inspect the active executable path, CLI version, connected MCP version, plugin registration and platform. Record the current prefix and plugin configuration for recovery. Source builds can report `0.0.0`; inspect their checkout revision instead of treating that as a release version.
2. Resolve the requested release, or the latest published stable release if omitted, from the official GitHub repository. Follow [runtime installation](runtime-installation.md) for exact assets, platform checks, checksums and archive inspection. Do not confuse unreleased source changes with a published upgrade. If the desired version is already installed and verified, report that no upgrade is needed.
3. Check active work before switching builds. Let known active jobs finish; do not cancel them as part of an upgrade. If active work cannot be determined safely, ask when to switch.
4. Install the verified runtime with the existing prefix. Preserve prior builds and user outputs. Update an installed plugin from the same release using [plugin setup](codex-plugin.md), preserving its local environment and marketplace configuration. Inspect the host’s supported update commands; do not invent `file-forge --upgrade`, edit plugin caches, or repeatedly remove/reinstall the plugin. If no plugin was installed, report that separately; install one only when requested or already authorized.
5. Verify the absolute active CLI path and version, plugin version/enabled state, and connected `file_forge_info` version after reconnecting. A running MCP process may still use the previous build. If a fresh chat is needed, report that verification is pending; do not claim the current chat upgraded based on CLI success alone. Use read-only inspection for a smoke check when an authorized input is available; an upgrade alone does not authorize processing user assets.
6. Report previous and resulting versions, executable location, plugin connection status and any remaining step. If installation or verification fails, preserve working builds and outputs, explain the blocker and propose a concrete retry or rollback. Apply the entrypoint’s Stop and ask rule before a materially different remedy.

## Skill refresh

The only source is `skills/file-forge` in the trusted FileForge checkout. Resolve its location and the target project from context; ask only if they are unknown. Use the checkout’s built copy helper:

```sh
pnpm skill:copy --project "/absolute/consumer-project" --dry-run
pnpm skill:copy --project "/absolute/consumer-project"
```

Run from the FileForge checkout. If the helper is absent or stale, build it using that repository’s documented setup. To fetch a newer revision when requested, inspect the checkout first and preserve local edits; never reset or overwrite a dirty checkout to refresh a skill.

The copy creates or fully replaces `<project>/.agents/skills/file-forge`, including references and metadata. It removes stale active-copy files and retains the old directory as a recovery backup outside active skills. Do not merge consumer edits, use a consumer as the source, or commit/push unless requested. Verify the helper’s result (`copied`, `updated` or `unchanged`) and report its target and backup when present. A fresh chat may be needed to load the updated instructions.
