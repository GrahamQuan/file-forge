# Direct FFmpeg video and audio processing

Read [custom processing](custom-processing.md) first. Use the installed FFmpeg build for requested video/audio operations outside FileForge presets. Capability depends on that build's codecs, filters and formats; the examples below are not an allowlist.

## Inspect and choose

Resolve existing FFmpeg/FFprobe from their configured absolute paths or PATH. Check `ffmpeg -version`, `ffmpeg -filters`, `ffmpeg -encoders`, `ffmpeg -formats`, and targeted `ffmpeg -h filter=NAME` / `ffmpeg -h encoder=NAME` as needed. Inspect inputs with `ffprobe -v error -show_streams -show_format -of json INPUT`. Do not require FileForge, Sharp or a browser for a purely direct FFmpeg task.

- Use stream copy for compatible remux/extraction when no filtering is needed. Select streams explicitly with `-map`; account for audio tracks, subtitles, attachments, dispositions and metadata instead of relying on automatic stream selection.
- Trimming with stream copy may be limited by keyframes/timestamps. Exact cuts or filters may require decoding and re-encoding; explain any conflict with the requested quality/container before proceeding.
- Filters can support crops, overlays, subtitles, speed changes, fades, audio mixing and normalization. Check the installed filter help and compose only the requested transformations. Filtering changes decoded content; calling its output lossless refers to encoding, not equality with the input.
- Avoid implicit size, frame-rate, sample-rate, channel-layout, pixel-format, precision or HDR/color changes. For strict audio compression, verify decoded samples and stream properties; do not apply AAC/MP3 as an unnoticed fallback. A lossless codec or stream copy does not by itself establish preservation of every stream and metadata field.

## Execute and verify

Invoke the resolved executable with an argument array and `shell: false` from a script, or safely quoted explicit terminal arguments. Use `-nostdin` and `-n` for unattended no-overwrite execution. Filenames, subtitle text, filtergraphs and concat lists each have their own parsing rules: argument arrays prevent shell interpretation but do not escape FFmpeg filter syntax. Prefer separate input files/streams or carefully encoded task-owned list/text files for user content. Do not fetch external inputs unless that is part of the authorized request.

Track the owned process/session and drain diagnostics; keep output outside the source tree. Cancel cooperatively, wait for exit and inspect incomplete staging before cleanup. Do not treat a partially written file as a successful output.

Check exit status, reopen with FFprobe and verify streams, duration, dimensions, format and required metadata. Use an actual decode check when appropriate; compare decoded samples/frames for preservation claims where no edit was requested. Report cut/timestamp limitations or validation failures instead of silently retrying with lower quality.

Official references: [FFmpeg CLI, stream selection and stream copy](https://ffmpeg.org/ffmpeg.html), [filters and filtergraph escaping](https://ffmpeg.org/ffmpeg-filters.html), [FFprobe](https://ffmpeg.org/ffprobe.html). Local help establishes which features are installed.
