# FileForge

[English](README.md) | [简体中文](README.zh-CN.md)

面向用户、脚本和编码智能体的本地媒体处理工具，基于 Sharp 和 FFmpeg，提供 CLI 和本地 MCP 工具。

**预览版：**已支持图片处理、视频压缩、网站图标生成、素材检查和交付清单。上传、持久任务、公开发布和自更新尚未实现。

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

# Generate PNG, ICO, and traced SVG favicons from a static PNG
pnpm --silent file-forge favicon generate ./logo.png --size 64 --output ./icons --json

# Export a delivery manifest for prepared assets
pnpm --silent file-forge manifest export ./assets --recursive --output ./delivery --json
```

压缩必须同时指定宽高，保持宽高比且不放大，不保证文件体积变小。需要更多控制时，使用 `image process`，支持 WebP、JPEG、PNG 和 AVIF；通过 `--help` 查看选项。

产物写入新的 `file-forge-<id>` 目录，并附带 `manifest.json` 和 `report.md`，保留源文件。输出目录必须位于输入目录之外。`--json` 将最终结果输出到 stdout，诊断信息输出到 stderr。

默认使用英语。运行 `file-forge config set language zh-CN` 保存中文偏好，或通过 `--language en|zh-CN` 仅覆盖当前调用。

## Codex 与安装

- **Codex / MCP：**参阅[配置指南](packages/file-forge-plugin/SETUP.md)。必须显式设置 `FILE_FORGE_ROOT`，工具路径不得超出此目录。任务记录仅在当前 MCP 会话内保留。
- **macOS Apple Silicon 运行包：**运行 `pnpm package:runtime`，然后按照[安装指南](packages/cli/distribution/README.zh-CN.md)操作。暂未提供公开下载。Node.js 和 FFmpeg 需单独安装；安装插件不会安装运行时。

## 开发

采用 TypeScript + Effect，以及 pnpm/Turborepo monorepo。CLI 和 MCP 共享核心操作，通过媒体适配器调用 Sharp 和 FFmpeg。

```sh
pnpm check       # Lint, formatting, types, and build
pnpm test:e2e    # Real non-UI CLI and media flows; requires FFmpeg
```

更多细节见[产品范围](specs/20261009-first-draft/PRODUCT.md)、[技术设计](specs/20261009-first-draft/TECH.md)和[实现状态](specs/20261009-first-draft/IMPLEMENTATION.md)。

## 许可证

[MIT](LICENSE)
