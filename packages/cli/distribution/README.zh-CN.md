# FileForge 运行时

[English](README.md)

此预览压缩包适用于 macOS Apple Silicon。请自行安装 Node.js 22.13 或更新版本（推荐 24）及 FFmpeg。
已包含 Sharp、原生库和矢量描摹依赖。使用压缩包无需 npm、pnpm、开发仓库、网络或管理员权限。

解压前运行 `shasum -a 256 -c file-forge-0.0.0-darwin-arm64.tar.gz.sha256` 验证完整性。
校验和只能检测损坏；请从可信来源获取压缩包及校验和。此预览版未签名。
运行 `tar -xzf file-forge-0.0.0-darwin-arm64.tar.gz` 后进入解压目录。

可直接运行 `./file-forge.js --help`，或安装：

```sh
./install.js --prefix "$HOME/.local"
export PATH="$HOME/.local/bin:$PATH"
file-forge --version
file-forge favicon generate /path/to/logo.png --size 64 --output /path/to/output
```

安装器支持 `--language en|zh-CN` 和 `--json`，检查 Node、FFmpeg、目标平台及所有文件和链接。
如果 FFmpeg 不在 PATH 中，请设置 `FFMPEG_PATH`。安装器不会修改 shell 配置。
使用 `file-forge config set language zh-CN` 保存 CLI 语言偏好。

旧构建保留在 `PREFIX/lib/file-forge`；`PREFIX/bin/file-forge` 指向当前构建。
重复安装完整的同一构建是安全的。安装新下载的压缩包即可切换。遇到无关的已有命令或并发安装时会拒绝。
若安装器被强制终止，请先确认锁中记录的 PID 已退出，再手动删除 `.install.lock`，切勿删除活动锁。
不会自动清理或升级；仍有进程使用旧构建时请保留它。回滚时运行旧构建的 `install.js --prefix PREFIX`。
停止使用时只删除其拥有的 `PREFIX/bin/file-forge` 链接；保留设置和素材，确认无进程使用后再删除旧构建。

在 Codex 中配置已安装的 `PREFIX/bin/file-forge`，传入参数 `mcp` 并显式设置工作区 `FILE_FORGE_ROOT`。
所有 MCP 输入和输出必须位于该工作区。本地独立插件可通过 `FILE_FORGE_EXECUTABLE` 指向此命令。
请在宿主 PATH 中配置 Node，并通过 PATH 或 `FFMPEG_PATH` 提供 FFmpeg。本安装器不修改 Codex 配置。

当前源码支持图片、视频和文件夹压缩、检查、格式转换、网站图标、原目录重命名预览/应用、
版本化清单导出及会话级 MCP 任务。未指定宽高时保留原尺寸；请查看本压缩包的帮助确认实际能力。
GitHub Actions 会发布经过验证的补丁版本，并提供单独的匹配插件 ZIP 和校验和。
上传、持久任务、自动升级及其他分发平台尚未实现。
可复用的项目 skill 及复制脚本在源码仓库中维护；安装运行时不会复制该 skill 或注册 Codex 插件。
第三方许可文件随生产依赖保留在 `runtime/node_modules` 中。

音频/音乐压缩严格无损，需要 FFprobe（PATH、配置的 FFmpeg 同目录或 FFPROBE_PATH）。符合条件的 PCM/FLAC 仅在验证后体积更小时转为 FLAC；其他输入保留原字节。自包含 GLB 2.0 仅压缩 JSON 空白，二进制数据不变。文件夹处理包含这两类素材；音频使用 v4 清单，包含自动 GLB 海报的模型/文件夹交付使用 v6 清单。现有图片/视频预设仍为有损。

使用 `file-forge model posters INPUT.glb --width 1024 --json` 生成前、后、左、右、上、下六张质量 80 的有损 WebP。透明画布默认 16:9（1024×576）；--ratio W:H 可选其他比例，一个尺寸按比例推算另一边，两个尺寸确定画布（16–4096；与明确比例冲突时拒绝处理）。源文件不变。该独立流程需要本机 Chrome/Chromium，自动发现 macOS Chrome/Edge，或通过绝对路径 `FILE_FORGE_CHROME_PATH` 配置；不内置浏览器。已包含 Three.js 和 Puppeteer Core。仅支持不超过 256 MiB 的自包含 GLB；外部资源、KTX2/Basis 和未知扩展会被拒绝。版本 5 清单记录各视图与相机；版本 1–6 均可导出。模型/文件夹压缩会为每个 GLB 自动生成六张默认海报。

配套 skill 也可为内置预设之外的需求选择直接使用 Sharp/FFmpeg。此路线需要获准的宿主执行能力与相关依赖，保留源文件并验证产物。这是智能体编排，不是任意命令 CLI/MCP 接口或 FileForge 管理的任务。缺少工具、关键信息不明确或处理失败时，会提出解决方案并请求用户决定。

3D 海报会在交付前自动将每张渲染的 PNG 送入共享图片处理流程，保留画布尺寸并编码为质量 80 的有损 WebP。只执行一次标准质量 80 编码，无需再次压缩。

GLB 压缩会通过标准图片流程自动生成六张默认 16:9 海报。模型/文件夹组合交付使用 v6 清单；海报失败时保留已处理模型并报告部分成功。独立海报命令仍支持自定义比例和尺寸。
