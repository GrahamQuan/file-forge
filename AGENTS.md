# Project conventions

## Language

- Use English for source code, comments, identifiers, specifications, agent instructions, and all other project-authored content.
- Only translated README files and localized display messages may use other languages. Keep `README.md` in English and `README.zh-CN.md` in Simplified Chinese, with equivalent content and reciprocal links.
- Do not translate or rewrite user filenames, metadata, or asset content to enforce this policy.
- The CLI supports `en` and `zh-CN`, defaults to `en`, and stores its language preference in user configuration. Keep every FileForge-authored CLI display message in one typed TypeScript object; do not scatter strings across commands.
- Localize only presentation. Command names, configuration keys, error codes, JSON keys/enums, MCP schemas, tool descriptions, and machine diagnostics remain English and stable.

## Stack and structure

- Use a Git monorepo, pnpm workspaces, and Turborepo. Keep all workspaces under `packages/*`, including executable entry points such as the CLI.
- Build a Node.js + TypeScript CLI for manual use and local MCP calls by coding agents. Both entry points must reuse the same business operations.
- The local foundation includes `packages/cli`, `packages/core`, Effect-based `packages/media`, bilingual presentation, and real non-UI E2E flows. Local STDIO MCP and the source plugin are implemented under `packages/mcp` and `packages/file-forge-plugin`; local macOS arm64 runtime archives and installation are implemented; uploads, persistent job management, public release hosting, and other distribution targets remain planned. Do not reintroduce desktop dependencies or the removed desktop database/IPC packages.
- Follow `specs/20261009-first-draft/PRODUCT.md` and `TECH.md`; see `IMPLEMENTATION.md` and the READMEs for the implemented local subset. Do not advertise remaining proposed commands as implemented.
- Prefer Sharp for images and FFmpeg for video, audio, music, and compositions.
- Use Effect v4 throughout application and infrastructure code, including the existing media module when migrated. Public side-effecting operations return typed Effects; use services/layers, schemas, scoped resources, and structured concurrency.
- Prefer relevant Effect ecosystem facilities for CLI, MCP, filesystem, processes, HTTP, configuration, and scheduling. Verify availability in the selected release and isolate justified native/third-party adapters instead of maintaining parallel Promise-based application logic.
- Execute Effects at process/framework boundaries, not inside reusable services. Keep pure functions, types, and localization objects as ordinary TypeScript. Retain Sharp and FFmpeg behind Effect adapters, and install only packages needed by implemented capabilities.
- Use oxlint and oxfmt, not ESLint or Prettier.

## Tests and validation

- Do not write or run unit, component, UI, UI E2E, or screenshot tests.
- Write and run only real non-UI E2E tests; do not relabel unit tests as E2E.
- Leave UI validation to the user after implementation is complete; do not perform automated or manual UI testing.
- Use Vitest with `e2e/**/*.test.js`. Do not preinstall additional test tools without actual use cases.
- After implementation changes, run `pnpm check`; run `pnpm test:e2e` for media or data changes. Respect explicit user instructions not to execute code or tests, and report the unverified scope.

## Implementation boundaries

- Use ESM by default with `"type": "module"` in package manifests. Use `.js` for JavaScript files and module paths; `.mjs` is unnecessary.
- Use TypeScript strict mode. Import across workspaces through package names and public exports, never internal source paths.
- Retain the TypeScript 7 / ts-go native compiler direction and existing `tsc` commands; do not fall back to the older JavaScript compiler.
- Share explicit input validation between CLI and MCP. Do not expose generic shell execution or arbitrary FFmpeg argument passthrough.
- Keep Sharp on the Node.js side. Start FFmpeg with argument arrays and `shell: false`, never shell command concatenation.
- Keep MCP status and cancellation responsive. Effect fibers do not replace workers or task processes.
- Reserve STDIO MCP stdout for protocol output and use stderr for logs. Keep progress text out of CLI machine-readable output.
- Resolve configuration and credentials per task; do not switch projects by mutating global process environment variables. Never put secrets in logs, tool responses, or delivery manifests.
- Never silently delete source assets, task records, or historical data during failure recovery, upgrades, or migration. Do not commit media outputs, secrets, or user data.
- Version persisted formats and provide compatibility or migrations instead of deleting user data.

## Temporary resource cleanup

- Record the owning task, working directory, PID, port, and terminal session for every temporary server, preview, watcher, or automation process started by the task.
- Unless the user requests that a preview remain available, gracefully stop task-owned services and child processes after validation; verify process exit and port release.
- Recheck identity and ownership before forceful termination. Never use broad cleanup such as `killall node` or `pkill node`.
- Preserve pre-existing services, other tasks' services, and Codex/MCP infrastructure.
- Track and close task-created browser tabs, windows, sessions, and recording/tracing workers. Keep pages explicitly requested by the user or required for reviewing the deliverable.
- Preserve existing tabs, profiles, cookies, and login state. Report uncertain ownership or unsupported cleanup accurately.
- In the final response, report temporary service and browser cleanup. Explain any retained resources and how to stop them.
