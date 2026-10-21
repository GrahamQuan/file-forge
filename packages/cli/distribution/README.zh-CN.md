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

已实现检查、图片处理、网站图标、通用清单导出及会话级 MCP 任务。
上传、持久任务、公开发布、自动升级及其他平台仍待实现。
第三方许可文件随生产依赖保留在 `runtime/node_modules` 中。
