export type Locale = "en" | "zh-CN";
interface MessageCatalog {
  help: string;
  installUsage: string;
  installComplete: (executable: string) => string;
  installFailed: (code: string) => string;
  nodeRequired: string;
  ffmpegRequired: string;
  invalid: string;
  settingsInvalid: (file: string) => string;
  settingsFailed: string;
  language: (locale: Locale, source: string) => string;
  saved: (locale: Locale) => string;
  summary: (status: string, count: number, directory?: string) => string;
  failed: (code: string) => string;
  cancelled: string;
  progress: string;
  faviconProgress: string;
  unsupportedUpgrade: string;
}
export const messages: Record<Locale, MessageCatalog> = {
  en: {
    installUsage:
      "Usage: ./install.js [--prefix DIR] [--language en|zh-CN] [--json]. Default prefix: ~/.local. Node.js and FFmpeg must already be installed.",
    installComplete: (executable) =>
      `Installed FileForge: ${executable}. Add its bin directory to PATH. Previous builds and user settings were preserved.`,
    installFailed: (code) =>
      `Installation failed (${code}). Check archive integrity, platform, destination permissions, command conflicts, or an active installation lock. The existing command was preserved.`,
    nodeRequired: "Node.js 22.13 or newer is required. Install Node.js, add it to PATH, and retry.",
    ffmpegRequired:
      "FFmpeg is missing or cannot run. Install your own FFmpeg build and add it to PATH, or set FFMPEG_PATH to its executable. FileForge does not bundle or download FFmpeg.",
    help: `FileForge local foundation preview
Usage:
  file-forge favicon generate <input.png> [--size 64] [--output DIR] [--json]
  file-forge inspect <files...> [--recursive] [--json]
  file-forge image process <files...> [--width N] [--height N] [--quality N] [--format webp|jpeg|png|avif] [--output DIR] [--recursive] [--json]
  file-forge image compress <files...> [--width N] [--height N] [--quality 80] [--output DIR] [--json]
  file-forge folder rename <input> --renames PLAN.json [--apply] [--output DIR] [--json]
  file-forge folder compress <input> [--width N] [--height N] [--quality 80] [--output DIR] [--json]
  file-forge audio compress <input> [--output DIR] [--json]
  file-forge model compress <input.glb> [--output DIR] [--json]
  file-forge model posters <input.glb> [--ratio W:H] [--width N] [--height N] [--output DIR] [--json]
  file-forge video compress <input> [--width N] [--height N] [--quality 80] [--output DIR] [--json]
  file-forge manifest export [files...] [--manifest FILE] [--output DIR] [--recursive] [--include-paths] [--json]
  file-forge config get language [--json]
  file-forge config set language en|zh-CN [--json]
  file-forge mcp
  file-forge -v | --version
Global options: --language en|zh-CN, --help
Favicons: static PNG to ICO, PNG, and traced vector SVG; size 16–256 (default 64), transparent padding, no enlargement. Tracing can alter colors, edges, and partial transparency.
Images preserve aspect ratio without enlargement. Supply at least one image process option.
Compression preserves original dimensions when no size is supplied; supply width or height alone for an automatic other axis. Folder compression preserves nested structure with normalized names. Images become WebP; videos become MP4 with a first-frame WebP cover. Explicitly resized video dimensions round down to even pixels; quality controls the cover.
Output: a new task directory under Downloads or --output. Sources and existing outputs are preserved by media workflows. Folder rename previews by default; --apply renames original directories from an explicit JSON plan.
Folder compression always recurses; other directory operations require --recursive. Symlinks, animated images, SVG, and unsupported files are reported explicitly.
Audio/music: strictly lossless; eligible PCM/FLAC becomes smaller verified FLAC, otherwise original bytes are retained. Requires FFprobe (FFPROBE_PATH supported). Models: self-contained GLB 2.0 JSON compaction only; binary data stays unchanged. Folder processing includes both.
3D posters: six axis views processed through the shared image workflow as lossless WebP without additional resizing, transparent canvas, default 16:9 at 1024x576; --ratio W:H selects another ratio, one dimension derives the other, both set the canvas (16–4096; explicit ratio conflicts fail). Requires Chrome/Chromium; FILE_FORGE_CHROME_PATH selects an absolute executable. Model/folder compression does not generate posters.
Manifest export accepts existing assets without processing them, or an existing version 1, 2, 3, 4 or 5 manifest.
Exit codes: 0 success/empty, 1 partial/failure, 2 invalid arguments/configuration, 130 interruption.
MCP uses STDIO and requires FILE_FORGE_ROOT. Uploads, general composition commands, specialized templates, public releases, and upgrades are not implemented.`,
    invalid: "Invalid arguments. Use --help for supported commands and options.",
    settingsInvalid: (file) =>
      `Cannot read valid settings at ${file}. Using English; the file was preserved.`,
    settingsFailed:
      "Cannot save language settings. Existing settings were preserved; check the file, permissions, and lock.",
    language: (locale, source) =>
      `Language: ${locale} (${source === "saved" ? "saved" : "default"}).`,
    saved: (locale) => `Language saved: ${locale}.`,
    summary: (status, count, directory) =>
      `Result: ${status}; ${count} assets.${directory ? ` Delivery: ${directory}` : ""}`,
    failed: (code) => `Operation failed (${code}).`,
    cancelled: "Cancelled. Active work has stopped; completed outputs are retained.",
    faviconProgress:
      "Generating favicons; vector tracing may change colors, edges, and partial transparency.",
    progress: "Processing images; cancellation waits for the active image to finish.",
    unsupportedUpgrade:
      "Self-update is unavailable. Install a separately downloaded FileForge archive, or update your source checkout and rebuild with pnpm build.",
  },
  "zh-CN": {
    installUsage:
      "用法：./install.js [--prefix DIR] [--language en|zh-CN] [--json]。默认目录：~/.local。请先安装 Node.js 和 FFmpeg。",
    installComplete: (executable) =>
      `FileForge 已安装：${executable}。请将其 bin 目录加入 PATH。旧版本和用户设置已保留。`,
    installFailed: (code) =>
      `安装失败（${code}）。请检查压缩包完整性、平台、目标目录权限、命令冲突或安装锁。原有命令已保留。`,
    nodeRequired: "需要 Node.js 22.13 或更新版本。请安装 Node.js，将其加入 PATH 后重试。",
    ffmpegRequired:
      "FFmpeg 未安装或无法运行。请自行安装 FFmpeg 并加入 PATH，或将 FFMPEG_PATH 设为其可执行文件路径。FileForge 不内置或下载 FFmpeg。",
    help: `FileForge 本地基础功能预览版
用法：
  file-forge favicon generate <input.png> [--size 64] [--output DIR] [--json]
  file-forge inspect <files...> [--recursive] [--json]
  file-forge image process <files...> [--width N] [--height N] [--quality N] [--format webp|jpeg|png|avif] [--output DIR] [--recursive] [--json]
  file-forge image compress <files...> [--width N] [--height N] [--quality 80] [--output DIR] [--json]
  file-forge folder rename <input> --renames PLAN.json [--apply] [--output DIR] [--json]
  file-forge folder compress <input> [--width N] [--height N] [--quality 80] [--output DIR] [--json]
  file-forge audio compress <input> [--output DIR] [--json]
  file-forge model compress <input.glb> [--output DIR] [--json]
  file-forge model posters <input.glb> [--ratio W:H] [--width N] [--height N] [--output DIR] [--json]
  file-forge video compress <input> [--width N] [--height N] [--quality 80] [--output DIR] [--json]
  file-forge manifest export [files...] [--manifest FILE] [--output DIR] [--recursive] [--include-paths] [--json]
  file-forge config get language [--json]
  file-forge config set language en|zh-CN [--json]
  file-forge mcp
  file-forge -v | --version
全局选项：--language en|zh-CN、--help
网站图标：静态 PNG 转 ICO、PNG 和描摹矢量 SVG；尺寸 16–256（默认 64），透明填充，不放大。描摹可能改变颜色、边缘和半透明效果。
图片保持宽高比，默认不放大。image process 必须提供至少一个图片选项。
未指定尺寸时压缩保留原始宽高并跳过缩放；仅指定宽或高时自动保持比例。文件夹压缩保留层级并规范名称。图片输出 WebP；视频输出 MP4 及同尺寸的首帧 WebP 封面。指定缩放的视频尺寸向下取偶数；quality 控制封面质量。
产物保存在 Downloads 或 --output 下的新任务目录中。媒体处理保留源文件和现有产物。folder rename 默认预览；--apply 按明确的 JSON 计划重命名原目录。
文件夹压缩总是递归；其他目录操作需要 --recursive。符号链接、动画图片、SVG 和不支持的文件会明确报告。
音频/音乐：严格无损；符合条件的 PCM/FLAC 仅在样本验证通过且更小时转为 FLAC，否则保留原字节。需要 FFprobe（支持 FFPROBE_PATH）。模型：仅压缩自包含 GLB 2.0 的 JSON 空白，二进制数据不变。文件夹处理包含这两类素材。
3D 海报：六个轴向视图自动经过共享图片流程，不额外缩放，输出无损 WebP、透明画布，默认 16:9（1024×576）；--ratio W:H 可选其他比例，一个尺寸按比例推算另一边，两个尺寸确定画布（16–4096；与明确比例冲突时拒绝处理）。需要 Chrome/Chromium；FILE_FORGE_CHROME_PATH 可指定可执行文件的绝对路径。模型或文件夹压缩不会自动生成海报。
清单导出可接收现有素材而不重新处理，也可接收版本 1、2、3、4 或 5 的现有清单。
退出码：0 成功或空集合，1 部分成功或失败，2 参数或配置错误，130 中断。
MCP 使用 STDIO，需要设置 FILE_FORGE_ROOT。上传、通用合成命令、专用模板、公开发布和升级尚未实现。`,
    invalid: "参数无效。使用 --help 查看支持的命令和选项。",
    settingsInvalid: (file) => `无法读取 ${file} 中的有效设置。使用英语，原文件已保留。`,
    settingsFailed: "无法保存语言设置。原设置已保留，请检查文件、权限和锁。",
    language: (locale, source) => `语言：${locale}（${source === "saved" ? "已保存" : "默认"}）。`,
    saved: (locale) => `语言已保存：${locale}。`,
    summary: (status, count, directory) =>
      `结果：${({ succeeded: "成功", partial: "部分成功", failed: "失败", empty: "空集合", cancelled: "已取消" } as Record<string, string>)[status] ?? status}；${count} 个素材。${directory ? `交付目录：${directory}` : ""}`,
    failed: (code) => `操作失败（${code}）。`,
    cancelled: "已取消。活动任务已停止，已完成的产物已保留。",
    faviconProgress: "正在生成网站图标；矢量描摹可能改变颜色、边缘和半透明效果。",
    progress: "正在处理图片；取消时会等待当前图片完成。",
    unsupportedUpgrade:
      "不支持自更新。请另行下载 FileForge 压缩包并安装，或更新源码仓库后运行 pnpm build 重新构建。",
  },
};
