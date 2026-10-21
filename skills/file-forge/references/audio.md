# Lossless audio and music

Use `audio compress` for music/audio. Prefer connected `compress_audio`. Check installed help and tool schemas first; older releases may lack this operation. No lossy fallback is authorized by a compression request.

```sh
file-forge audio compress "/absolute/song.wav" --json
```

The MCP tool requires `requestId`, `input`, `output` and `operation: "audio-compress"`. There is no options object. Use an output parent within the authorized MCP root; CLI defaults to Downloads on macOS. Follow [execution](execution.md) for job polling and reporting.

Audio supports WAV/WAVE, AIF/AIFF, FLAC, MP3, M4A, AAC, OGG, Opus and WMA. Check FFprobe as well as FFmpeg. Resolve FFprobe beside an absolute FFmpeg path, on PATH, or through `FFPROBE_PATH`. If unavailable, explain the blocker and recommend the matching FFmpeg/FFprobe installation or existing path; apply the entrypoint's Stop and ask rule.

Eligible 16/24-bit integer PCM and FLAC become FLAC only after decoded-sample hashes match and the result is smaller. Sample rate and channels are preserved. Already lossy, floating-point, higher-precision, multistream/artwork/chapter inputs retain original bytes. Common metadata tags must survive conversion; container-specific metadata may differ. Never promise bit-for-bit container identity for an encoded FLAC. Sources remain intact.

Folder compression automatically uses this policy for audio/music. Dimensions and quality do not affect audio. Output collision checks include the possible FLAC path. Mixed folders still use the existing lossy image/video presets; do not describe the whole folder as lossless. If the user requires strictly lossless images/videos too, stop and explain that those existing presets do not meet that requirement.

Read schema-v4 asset fields `lossless`, `optimization`, `note`, `size`, `outputSize`, and `sizeChange`. `original-retained` is a valid successful outcome with zero savings. Report it explicitly, alongside the actual path and format. Never claim smaller size solely because the job succeeded.

For requested operations beyond these presets, select [custom processing](custom-processing.md) and read [direct FFmpeg](ffmpeg.md). Do not force the request into a mismatched built-in operation.
