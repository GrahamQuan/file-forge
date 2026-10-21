# Optional video audio removal

Video audio is kept by default: the first audio stream, when present, is encoded as AAC at 128 kb/s (not byte-for-byte passthrough or preservation of every track). Use `--audio remove` / MCP `options.audio: "remove"` to omit all audio streams; `--audio keep` explicitly restores the default. Supported by video and folder compression; image-only commands reject it. Folder selection applies first: only selected videos lose audio, excluded files and standalone audio/music files retain their existing behavior. Silent input is valid in either mode. Covers, video dimensions and compression presets are unchanged. Manifests record `parameters.video.audio`. Remember an explicit choice only within this chat, and pass it on compatible later requests; new chats default to keep.

```sh
file-forge video compress clip.mp4 --audio remove --json
file-forge folder compress ./assets --media videos --width 512 --audio remove --json
```
