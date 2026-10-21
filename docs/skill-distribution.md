# Copy the FileForge skill to another project

The canonical reusable skill lives in [`skills/file-forge`](../skills/file-forge/SKILL.md). After every code change, update this skill and all affected documentation here, then copy it into consuming projects when requested. ProductDesignSkills is a consumer, not a separate source of truth.

This skill is the routing map for prerequisites, runtime/plugin setup and upgrades, images, videos, folders, source-folder renaming, favicons, manifests and troubleshooting. It stops and asks with a proposed solution when required tools, essential information or repairs are missing. No width/height means no resizing.

## Copy from a source checkout

Use the repository's supported Node version and install its dependencies, then build:

```sh
pnpm build
pnpm skill:copy --project "/Users/a6677/Documents/projects/ProductDesignSkills" --dry-run
pnpm skill:copy --project "/Users/a6677/Documents/projects/ProductDesignSkills"
```

Replace the project path for another consumer. The project must already exist. The destination is always `<project>/.agents/skills/file-forge`; the script copies all references and agent metadata with the entrypoint. Paths with spaces are supported. The compiled helper can also be run from any working directory:

```sh
node /absolute/file-forge/packages/cli/dist/copy-skill.js --project "/absolute/project"
```

The helper resolves the canonical source relative to its own checkout, not the shell's current directory. It requires Node and the built source workspace, but no FFmpeg, network, media processing, or Codex configuration changes. It is a contributor script, not an installed `file-forge` subcommand.

## Update an existing copy

“Upgrade the FileForge skill” uses this same full-copy workflow. “Upgrade FileForge” targets the runtime and matching installed plugin instead; see the skill’s [upgrade reference](../skills/file-forge/references/upgrade.md). Neither operation implies a Git commit or push.

“Copy” means create or fully replace the destination skill from this repository. Identical content returns `unchanged`; differing copies are replaced automatically, including removal of obsolete destination files:

```sh
pnpm skill:copy --project "/absolute/project" --dry-run
pnpm skill:copy --project "/absolute/project"
```

Make all intended skill changes in this repository. Consumer edits are not merged back or preserved in the active copy. Replacement retains the complete old directory as a recovery backup at `<project>/.agents/skill-backups/file-forge-<id>`; its path is returned in the JSON result. Backups are outside the active skills directory. Unrelated skills and project files are preserved. Retain backups until no longer needed; removal is a separate user decision.

Preview writes nothing. A real copy stages and verifies content, rejects symlink/special-file trees, uses an exclusive `.agents/.file-forge-copy.lock`, and rechecks target contents before activation. Do not edit the target concurrently. If activation fails after creating a backup, the helper attempts to restore it when the target is still absent; inspect the backup and reported error if recovery fails. After an interrupted process, inspect the lock's `owner.json` PID and confirm the owner has exited before removing a stale lock. Never remove a live lock.

Success JSON reports `schemaVersion`, `source`, `project`, `target`, `status`, and `backup` when applicable. Preview adds `action`. Errors are JSON on stderr with nonzero exit status; common codes are `UNSAFE_LINK`, `SKILL_COPY_LOCKED` and `SKILL_TARGET_CHANGED`.

## Skill versus plugin versus runtime

| Artifact                           | Purpose                                                        | How it is delivered                                          |
| ---------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------ |
| `skills/file-forge`                | Reusable setup and operation map                               | This copy helper → project `.agents/skills/file-forge`       |
| `packages/file-forge-plugin`       | Codex plugin manifest, MCP bootstrap and compact runtime skill | Matching plugin release ZIP or configured source marketplace |
| `packages/cli` with core/media/MCP | Executable processing implementation                           | Source build or verified macOS arm64 runtime archive         |

Copying the skill does not install/upgrade the runtime, register a plugin, change user-wide Codex settings, or inject tools into the current chat. Start a fresh project chat if needed to discover `$file-forge`; use its setup references when runtime/plugin work is requested. Update compact plugin instructions whenever behavior changes, while keeping detailed user workflow references in the canonical reusable skill.
