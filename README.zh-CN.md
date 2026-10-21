# FileForge

[English](README.md) | [简体中文](README.zh-CN.md)

面向用户、脚本和编码智能体的本地媒体处理工具，基于 Sharp 和 FFmpeg，提供 CLI 和本地 MCP 工具。

**源码能力：**已实现图片、视频和文件夹压缩、音频/音乐无损优化及 GLB JSON 压缩、六角度 3D 海报、图片转换、网站图标生成、素材检查、明确的原目录重命名及版本化交付清单。上传、持久任务和自更新尚未实现。已配置 GitHub 自动发布；下载是否可用取决于 main 分支成功运行工作流。

也可使用 `folder rename INPUT --renames PLAN.json` 明确重命名原目录：默认预览，添加 `--apply` 后按计划修改根目录或子目录名称，不改变文件内容。详见[用法](docs/usage.md#rename-original-folders-explicitly)。

## 本地指南

- [安装 FileForge 并连接 Codex（英文）](docs/installation.md)
- [使用 CLI 和 MCP 工具（英文）](docs/usage.md)
- [当前能力与待实现功能（英文）](docs/current-capabilities.md)
- [将可复用 skill 复制到其他项目（英文）](docs/skill-distribution.md)
- [编码智能体文档索引（英文）](docs/README.md)

## 快速开始

安装 Node.js 24、pnpm 10.33.0 和 FFmpeg。将 FFmpeg 加入 `PATH`，或通过 `FFMPEG_PATH` 指定路径；Sharp 已包含在依赖中。

```sh
pnpm install
pnpm build
pnpm --silent file-forge --help
```

## 使用

```sh
# Inspect assets
pnpm --silent file-forge inspect ./assets --recursive --json

# Compress images to WebP
pnpm --silent file-forge image compress ./assets --width 1200 --height 800 --output ./delivery --json

# Compress a video to MP4 and generate a WebP cover
pnpm --silent file-forge video compress ./clip.mp4 --width 1280 --height 720 --output ./delivery --json

# Losslessly optimize audio/music or a self-contained GLB
pnpm --silent file-forge audio compress ./song.wav --output ./delivery --json
pnpm --silent file-forge model compress ./scene.glb --output ./delivery --json
pnpm --silent file-forge model posters ./scene.glb --width 1024 --output ./delivery --json

# Compress a directory into a normalized hierarchy, preserving original dimensions
pnpm --silent file-forge folder compress ./assets --output ./delivery --json

# Generate PNG, ICO, and traced SVG favicons from a static PNG
pnpm --silent file-forge favicon generate ./logo.png --size 64 --output ./icons --json

# Export a delivery manifest for prepared assets
pnpm --silent file-forge manifest export ./assets --recursive --output ./delivery --json
```

未指定宽高时，压缩保留原始尺寸，跳过缩放。仅指定 `--width` 或 `--height` 时，另一边自动按比例计算；两者同时指定时作为边界框，保持比例且不放大。使用 `folder compress <directory>` 递归压缩媒体并输出新的规范命名层级，其他文件原样复制，跳过 `.DS_Store`、符号链接和动图。命名冲突会在创建输出前报错。不保证文件体积变小。需要更多控制时，使用 `image process`，支持 WebP、JPEG、PNG 和 AVIF；通过 `--help` 查看选项。

媒体产物和重命名记录写入新的 `file-forge-<id>` 目录，并附带 `manifest.json` 和 `report.md`。媒体处理保留源文件；应用明确的目录重命名计划只改变目录名称。输出目录必须位于输入目录之外。`--json` 将最终结果输出到 stdout，诊断信息输出到 stderr。

默认使用英语。运行 `file-forge config set language zh-CN` 保存中文偏好，或通过 `--language en|zh-CN` 仅覆盖当前调用。

音频/音乐与 GLB 使用严格无损优化，文件夹处理也包含这些类型。音频需要 FFprobe（支持 `FFPROBE_PATH`）；符合条件的整数 PCM/FLAC 仅在验证样本一致且体积更小时输出 FLAC，否则保留原字节。GLB 仅移除 JSON 空白并保留二进制数据，体积可能只减少一点或保持不变。现有图片/视频有损预设不变。详见[策略与支持格式（英文）](docs/lossless-audio-models.md)。

## Codex 与安装

- **Codex / MCP：**参阅[配置指南](packages/file-forge-plugin/SETUP.md)。必须显式设置 `FILE_FORGE_ROOT`，工具路径不得超出此目录。任务记录仅在当前 MCP 会话内保留。
- **macOS Apple Silicon 运行包：**运行 `pnpm package:runtime`，然后按照[安装指南](packages/cli/distribution/README.zh-CN.md)操作。已发布的构建可从 [GitHub Releases](https://github.com/GrahamQuan/file-forge/releases) 下载；安装前请检查所选版本的资源和实际能力。Node.js 和 FFmpeg 需单独安装；安装插件不会安装运行时。

## 可复用的项目 skill

[skills/file-forge](skills/file-forge/SKILL.md) 是唯一维护源，包含入口地图及面向安装、处理操作的分主题参考文档。缺少工具、必要信息或需要修复时，会提供建议方案并询问用户。

```sh
pnpm build
pnpm skill:copy --project "/Users/a6677/Documents/projects/ProductDesignSkills" --dry-run
pnpm skill:copy --project "/Users/a6677/Documents/projects/ProductDesignSkills"
```

复制表示以本仓库为唯一来源创建或完整替换目标 skill，移除活动副本中的过时文件。内容相同则不修改；旧副本保留在活动 skills 目录之外作为恢复备份。目标位置为 `<project>/.agents/skills/file-forge`；此操作不会安装运行时或 Codex 插件。详见 [skill 分发指南](docs/skill-distribution.md)。

## 开发

采用 TypeScript + Effect，以及 pnpm/Turborepo monorepo。CLI 和 MCP 共享核心操作，通过媒体适配器调用 Sharp 和 FFmpeg。

```sh
pnpm check       # Lint, formatting, types, and build
pnpm test:e2e    # Real non-UI CLI and media flows; requires FFmpeg
```

源码可能包含已安装版本没有的功能。阅读历史规格前，请先查看[当前能力](docs/current-capabilities.md)。

更多细节见[产品范围](specs/20261009-first-draft/PRODUCT.md)、[技术设计](specs/20261009-first-draft/TECH.md)和[实现状态](specs/20261009-first-draft/IMPLEMENTATION.md)。

## 许可证

[MIT](LICENSE)

## 自动发布

推送到 `main` 后，在 macOS arm64 上运行 `pnpm check` 和真实 E2E，通过后发布下一个补丁版本（`0.0.1`、`0.0.2` 等）。拉取请求仅执行验证。每次发布包含运行包、版本匹配的插件 ZIP 和 SHA-256 校验文件。解压前验证校验和，再运行包内安装器。升级时使用相同前缀安装新包，然后重新连接 Codex MCP；自动 `--upgrade` 尚不可用。匹配的插件需单独安装和配置。Node.js 与 FFmpeg 仍需自行安装。

发布标签指向已验证的源提交；CI 在临时检出目录中写入发布版本，不向 main 回写版本提交。已完成发布的重跑不会重复发布。失败草稿需检查和恢复，不会自动覆盖；已预留标签可能造成版本号间隔。仓库必须允许 GitHub Actions 写入发布和标签。本地检查不能证明某次远程工作流或发布已成功，请在 GitHub 上验证。

3D 海报将六个轴向视图渲染为透明背景的质量 80 的有损 WebP。画布默认 16:9（1024×576）；--ratio W:H 可选其他比例，一个尺寸按比例推算另一边，两个尺寸确定画布（16–4096；与明确比例冲突时拒绝处理）。需要本机 Chrome/Chromium，可通过 `FILE_FORGE_CHROME_PATH` 配置。源文件不变；模型/文件夹压缩会为每个 GLB 自动生成六张默认海报。详见[海报行为、相机与限制（英文）](docs/model-posters.md)。

Skill 同时支持 FileForge 内置流程和自定义 Sharp/FFmpeg 处理。Codex 根据需求选择合适的路线，检查相关已安装能力、保留源文件并验证产物。自定义处理使用宿主终端/Node 工具，无需安装 FileForge；缺少依赖、关键信息不明确或处理失败时，仍会提出解决方案并询问。详见[自定义处理（英文）](docs/custom-processing.md)。

3D 海报会在交付前自动将每张渲染的 PNG 送入共享图片处理流程，保留画布尺寸并编码为质量 80 的有损 WebP。只执行一次标准质量 80 编码，无需再次压缩。

GLB 压缩会通过标准图片流程自动生成六张默认 16:9 海报。模型/文件夹组合交付使用 v6 清单；海报失败时保留已处理模型并报告部分成功。独立海报命令仍支持自定义比例和尺寸。

图片、视频及文件夹压缩支持可选的 `--preset clarity`：图片/封面质量 90（WebP effort 6 和智能色度采样），视频 CRF 18、slow 编码。默认仍为质量 80 / CRF 23 medium。明确指定的 quality 仅覆盖图片/封面质量。此预设仍有损，可能耗时更长、文件更大；未指定尺寸时不会缩放。

单个文件使用对应媒体命令；`folder compress PATH --media videos --width 512` 递归地仅处理视频。`--media images` 仅处理图片，省略则处理所有支持的媒体。其他文件在规范命名的输出副本中保持原字节和格式。Codex 仅在当前聊天记住设置，新聊天恢复默认值。
