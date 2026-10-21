# FileForge

[English](README.md) | [简体中文](README.zh-CN.md)

FileForge 是面向用户、脚本和编码 agent 的本地素材处理与交付工具。当前为**本地基础功能预览版**，提供独立 CLI、Effect 媒体服务、图片批处理、网站图标生成、双语显示和通用交付清单，并非完整 v1。

## 从源码运行

使用 Node.js 24（`.node-version`）和 pnpm 10.33.0：

```sh
pnpm install
pnpm build
pnpm --silent file-forge --help
pnpm --silent file-forge --version
pnpm --silent file-forge favicon generate ./logo.png --size 64 --output ./icons --json
pnpm --silent file-forge inspect ./assets --recursive --json
pnpm --silent file-forge image process ./assets --width 1200 --format webp --output ./delivery --json
pnpm --silent file-forge manifest export ./prepared-assets --recursive --output ./delivery --json
pnpm --silent file-forge manifest export --manifest ./delivery/file-forge-TASK/manifest.json --output ./reports --json
```

构建后的 workspace 可执行入口为 `packages/cli/dist/launcher.js`（POSIX 启动器）。启动器在进入 JavaScript 前检查 Node.js；最低要求 22.13，`.node-version` 推荐 24。缺少 Node 时退出并提示安装；支持显式 `--language`，但无法读取已保存设置。`-v` 和 `--version` 可离线使用，不加载设置、Sharp 或 FFmpeg。其他命令需要先构建。没有开发服务器或 `pnpm start` 命令。此源码预览版不是 GitHub 安装包；`--upgrade` 返回 `UNSUPPORTED_INSTALLATION`，不会替换文件。

## 本地操作

- `inspect` 接收指定文件与目录。递归需要 `--recursive`；规范路径相同的输入会去重。空集合报告 `empty`。符号链接、不支持的文件、未启用递归时的子目录、损坏图片和动画图片均有明确结果。
- `image process` 必须显式提供至少一个 `--width`、`--height`、`--quality` 或 `--format`。输出支持 WebP、JPEG、PNG 和 AVIF。宽高为正整数，质量为 1–100。缩放保持宽高比、适配边界且不放大。记录实际体积，不保证压缩后更小。
- 输入扩展名包括 PNG、JPEG、WebP、AVIF、TIFF、GIF、HEIF 和 HEIC，实际解码取决于 Sharp 已安装的编解码器。此 CLI 阶段排除动画、多页图片和 SVG；内部媒体 E2E 仍验证可信 SVG 的渲染。
- 每次处理或导出在 `--output` 下创建独立的 `file-forge-<id>` 目录，macOS 默认使用用户的 Downloads。其他平台必须显式指定输出和配置目录，尚未完成分发验证。输出父目录必须位于选定输入目录之外，避免递归读取此前的产物。
- 输出名称采用小写 ASCII 名称和确定性的源路径哈希后缀，兼容纯 Unicode 名称。保留源文件与已有产物。图片经暂存、验证后通过排他硬链接发布；不支持硬链接的文件系统会报告失败。
- 批处理逐张执行。SIGINT/SIGTERM 停止派发，等待当前 Sharp 操作完成，并在任务目录已创建时保存取消清单。保留已完成产物。尚无后台任务、跨进程取消、请求去重、崩溃恢复或持久任务注册表。
- `manifest export` 检查现有素材，不重新压缩或上传；也可读取版本 1 的 `--manifest`。JSON 是权威数据，`report.md` 从中生成。重新导出保留历史映射，不声称已刷新本地或远端状态。Markdown 默认隐藏绝对路径，可用 `--include-paths` 显式包含。JSON 是包含本地路径的任务记录。

`--json` 在 stdout 输出一个最终结构化结果，进度和诊断使用 stderr。错误码、JSON 字段、清单结构和报告标题保持英文。退出码：0 成功或空集合，1 部分成功或执行失败，2 参数或设置无效，130 中断。

## 网站图标生成

```sh
pnpm --silent file-forge favicon generate ./logo.png --size 64 --output ./icons --json
```

此命令在 `./icons` 下的新任务目录中生成 `favicon.png`、`favicon.ico`、`favicon.svg`、`manifest.json` 和 `report.md`。`--size` 默认为 64，接受 16 到 256 的整数。输入必须是实际的静态 PNG；动画 PNG、符号链接和非 PNG 数据会被拒绝。macOS 上省略 `--output` 时使用 Downloads。

三个图标均为指定尺寸的正方形画布。Logo 保持宽高比，不裁剪或放大，必要时居中添加透明填充。PNG 和 ICO 保留栅格透明度。ICO 包含一个 PNG 压缩帧，面向现代消费者，不是兼容旧版 Windows 的多分辨率图标包。

SVG 通过固定版本的 VTracer 适配器描摹为真正的彩色矢量路径，不嵌入 PNG。描摹会近似处理颜色、边缘和半透明效果，复杂 Logo 请在发布前检查。全透明 PNG 会生成空的透明 SVG。仅生成网站图标时加载描摹依赖，库操作不使用 FFmpeg 或在线服务，但 CLI 会检查共同前置依赖。

所有格式先生成再发布。发布失败或取消时，只移除当前任务未完成的目录，保留已有文件。取消会等待当前原生调用完成。版本 1 清单通过 `favicon` 图片预设记录三个派生产物，并可使用 `manifest export` 重新导出。

## 语言设置

```sh
pnpm --silent file-forge config get language
pnpm --silent file-forge config set language zh-CN
pnpm --silent file-forge config set language en
pnpm --silent file-forge --language zh-CN --help
```

默认英语，不随系统语言变化。保存的偏好跨项目和重启生效；`--language en|zh-CN` 仅覆盖当前调用。所有 FileForge 终端文案集中在一个强类型双语对象中，命令名与机器结果不翻译。

macOS 设置位于 `~/Library/Application Support/file-forge/config.json`。`FILE_FORGE_CONFIG_DIR` 可显式覆盖目录，用于隔离安装或测试。缺少设置时默认英语且不写入。格式错误、版本不支持或不可读的设置会产生英文诊断并保留原文件。保存操作保留未知字段，使用限时排他锁和原子替换。冲突的语言覆盖会被拒绝。残留的 `config.json.lock` 会阻止写入；仅在确认没有存活的 FileForge 设置写入进程持有它时才可移除。

## 架构与验证

```text
packages/cli/          Effect CLI 适配、显示和用户设置
packages/core/     检查、图片批处理编排、清单和报告
packages/media/    Sharp 与受作用域管理的 FFmpeg Effect 服务
packages/mcp/      本地 STDIO MCP 与会话任务进程
packages/file-forge-plugin/  本地插件清单、技能与配置说明
e2e/               真实非 UI 进程与媒体流程
specs/             产品约定、技术设计和实现证据
```

Effect 与 `@effect/platform-node` 固定为 4.0.2。服务采用类型化 Effect、schema、平台文件系统与进程服务，以及作用域资源清理；仅在 CLI 或测试边界执行。由于所选 Effect 文件系统 API 会跟随链接且不提供 `lstat`，链接检查使用范围受限的 Node 适配器。CLI 将框架错误映射至文案对象，并抑制机器模式下的框架帮助输出。

Node.js 和 FFmpeg 由用户自行安装，不内置可执行文件。Sharp 作为包依赖提供，无需单独安装。将 FFmpeg 加入 PATH，或通过 `FFMPEG_PATH` 指定其可执行文件。所有业务 CLI 命令在开始工作前检查 FFmpeg 是否可运行；缺失或无法运行时返回 `FFMPEG_REQUIRED` 并提供安装提示。帮助、版本和语言设置无需 FFmpeg。不会自动下载任何依赖。FFmpeg 服务采用参数数组、不启用 shell、限制日志长度，并通过 Node 平台适配器处理超时、SIGTERM、验证后升级终止和等待退出。

| 命令                                | 用途                                            |
| ----------------------------------- | ----------------------------------------------- |
| `pnpm build`                        | 使用 TypeScript 7 原生编译器构建 workspace      |
| `pnpm typecheck`                    | 严格类型检查                                    |
| `pnpm lint`                         | oxlint                                          |
| `pnpm format` / `pnpm format:check` | oxfmt                                           |
| `pnpm check`                        | lint、格式、类型和构建                          |
| `pnpm test:e2e`                     | 真实 CLI、Sharp 和 FFmpeg 流程；必须安装 FFmpeg |

E2E 覆盖真实图片/音频/视频产物、FFmpeg 失败/超时/中断与进程退出、CLI 语言持久化及并发写入、无效/只读设置、部分失败的批处理、源文件保留、确定性命名、清单、取消、PNG/ICO/矢量 SVG 网站图标解码，以及无效或动画图标输入。测试清理临时文件与任务进程。没有单元、组件或 UI 测试。

## 剩余 v1 范围

上传、项目环境配置、持久任务管理、ZIP、音频/合成命令、GLB、SVG-to-JSX/TSX、专用 `song.md`/`prompt.md`、远端检查/替换、GitHub 公开发布与自更新尚未实现。存储策略、专用操作/模板约定和分发目标仍需决策。水印已推迟，更广泛的场景预设仍属于 v2；本次要求的网站图标导出已可使用。

运行时和本地 Codex 插件是独立交付物。安装插件不会自动安装运行时、FFmpeg、凭证或授予权限。运行时与插件有独立升级周期。本次工作没有发布运行时或插件。

桌面和 SQLite 包保持移除状态。未读取、迁移或删除历史数据库及用户媒体。项目内容使用英文，README 翻译和本地化文案例外；用户素材名称与内容保持原样。

参见 [PRODUCT.md](specs/20261009-first-draft/PRODUCT.md)、[TECH.md](specs/20261009-first-draft/TECH.md)、[实现证据](specs/20261009-first-draft/IMPLEMENTATION.md) 和 [AGENTS.md](AGENTS.md)。

网站图标约定与验证范围见[网站图标规格](specs/20261010-favicon-generation/TECH.md)。

## Codex 集成

本地 STDIO MCP 和源码插件现已提供检查、图片处理、网站图标生成及清单导出。参见
[配置说明和 Codex 测试提示](packages/file-forge-plugin/SETUP.md)及
[集成契约](specs/20261010-codex-integration/PRODUCT.md)。先构建，再配置 `file-forge mcp`，
显式设置 `FILE_FORGE_ROOT`；所有请求路径解析后必须位于该目录内。

业务工具返回会话任务：使用 `job_status` 查询、`job_cancel` 取消，并保留同一请求 ID 以免重复提交。
同时运行一个工作进程，最多保留 128 条记录。关闭服务会停止其工作进程，保留已完成文件。
记录不持久化，重新连接后不得自动重放结果不明的写入。帮助、版本及语言设置仍为 CLI 配置命令。

插件仅以源码提供，尚未安装到你的 Codex 账号。协议 E2E 验证真实启动入口；应用内安装及技能选择
仍需人工验收。

## 可下载运行包（macOS Apple Silicon）

使用者无需 npm 发布或包管理器安装。开发者运行 `pnpm package:runtime`，在 `release/` 生成压缩包和
SHA-256 校验文件。打包需要已安装的 workspace 和已缓存的生产依赖。目前尚未配置公开下载托管。

请自行安装 Node.js >=22.13（推荐 24）与 FFmpeg。Sharp 和矢量描摹器已包含在包内。
校验并解压后运行：

```sh
./install.js --prefix "$HOME/.local"
export PATH="$HOME/.local/bin:$PATH"
file-forge --help
```

安装器校验内容和平台，保留旧构建并原子切换命令，不修改 shell 配置。
直接使用、回滚和已安装 MCP 的配置请参阅[压缩包指南](packages/cli/distribution/README.zh-CN.md)。
首个运行包仅支持 macOS arm64。[分发规范](specs/20261016-runtime-distribution/TECH.md)记录范围与验证结果。

### 图片/视频压缩

智能体工作流会先询问缺失的宽高。专用压缩命令和 MCP 工具要求同时提供宽高；非交互调用缺少参数时会拒绝执行。

```sh
pnpm --silent file-forge image compress ./assets --width 1200 --height 800 --output ./delivery --json
pnpm --silent file-forge video compress ./clip.mp4 --width 1280 --height 720 --output ./delivery --json
```

图片使用 Sharp 缩小尺寸、压缩并转为 WebP（默认质量 80）。视频使用 FFmpeg 缩小尺寸，
编码为 CRF 23 的 H.264 MP4，并保留可用音频为 AAC；随后提取首帧，通过图片流程压缩为 WebP。
均保持宽高比且不放大；视频尺寸向下取偶数。封面尺寸与实际视频尺寸一致。
`--quality` 控制图片/封面质量，不控制视频 CRF。不保证文件更小。
每个视频请求接收一个文件，返回包含视频和封面产物的清单。
MCP 提供等价的 `compress_images`（`image-compress`）和 `compress_video`（`video-compress`）。

可选的动态文案由智能体使用本地 Hyperframes 项目制作，再进行最终压缩。
仅在需要动效时在本地安装 Hyperframes；它不是运行时依赖，也不是 FileForge 内置合成渲染器。
