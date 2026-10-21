# Lossless audio and GLB optimization

Quality preservation takes priority over byte savings. These source capabilities add `audio compress` / `compress_audio` and `model compress` / `compress_model`, including automatic dispatch inside `folder compress`. Check the installed release's help/tool schemas before using them. They do not change the existing lossy image/video presets.

```sh
file-forge audio compress "/absolute/song.wav" --output "/absolute/delivery" --json
file-forge model compress "/absolute/scene.glb" --output "/absolute/delivery" --json
```

Each operation selects one regular file and writes a new task directory, defaulting to Downloads on macOS. Sources remain unchanged. Music uses the audio workflow. No quality, bitrate, resize, resample, simplification, or lossy options are accepted by these commands.

## Audio

Recognized inputs: WAV/WAVE, AIF/AIFF, FLAC, MP3, M4A, AAC, OGG, Opus, WMA. FFprobe must be available beside an absolute configured FFmpeg executable or on PATH; `FFPROBE_PATH` overrides it. It is required only for audio processing. Invalid inputs or failed tools fail explicitly.

Single-stream signed 16-bit or 24-bit integer PCM and FLAC can be encoded as FLAC at compression level 12. Sample rate, channel count and sample order stay unchanged. The pipeline decodes source and candidate into the same 32-bit integer PCM representation and compares SHA-256 hashes, then checks stream properties. Common source tags must survive, except the encoder tag. Only a strictly smaller verified candidate is delivered. A mismatched sample check fails instead of delivering an unverified candidate.

Already lossy formats, floating-point or unsupported sample precision, additional streams/artwork, and chapters retain the original file byte-for-byte. A candidate that is not smaller or cannot retain common tags also returns the original. These are successful `original-retained` results with a reason, not claims of compression. Format-specific container metadata is not guaranteed to map identically when converting PCM to FLAC; source files are always retained.

## GLB

The supported model format is self-contained GLB 2.0. This conservative pass compacts only whitespace outside strings in its JSON chunk and updates GLB chunk/header lengths. It preserves numeric tokens, strings, extras, extension declarations, all subsequent binary chunks, geometry, embedded textures, materials, skins, morph targets and animation data. It adds no required decoder extension and does not perform Draco/Meshopt encoding, quantization, mesh simplification, texture recompression or animation resampling.

Already compact files are copied byte-for-byte with an `original-retained` result. Reduction can be small or zero for production GLBs because binary data usually dominates file size. This is container optimization, not geometry compression. Other 3D formats are not supported by `model compress`; folder processing copies them as ordinary files. Container/JSON checks do not constitute full semantic glTF validation. GLBs containing external resource URIs are rejected; the operation never fetches resources or follows those references.

Implementation follows the [Khronos GLB container specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#glb-file-format-specification). Audio uses the [FFmpeg FLAC encoder](https://ffmpeg.org/ffmpeg-codecs.html#flac-2), with decoded-sample verification rather than an assumption that a codec setting guarantees preservation.

## Folders, MCP and manifests

Folder processing applies this policy to recognized audio and GLB files, alongside its existing image/video behavior. Width, height and quality only affect images/videos, not audio or models. It reserves both original and possible FLAC names before creating output, so `song.wav` plus `song.flac` is a collision even when one would ultimately be retained. Naming normalization still applies; references inside copied files are not rewritten.

MCP tools accept `operation: "audio-compress"` or `"model-compress"`, `input`, `output`, and a unique `requestId`. They run through the same scoped, cancellable worker and root checks as other jobs. Poll `job_status` until terminal. No arbitrary encoder arguments are exposed.

Audio deliveries and folders with audio but no GLB use schema v4. Model deliveries and folders containing GLBs use schema v6, including automatic posters. Existing v1–v5 manifests remain readable and exportable. Assets record `lossless`, `optimization`, optional `note`, source/output sizes and `sizeChange`; audio also records sample rate, channels and available bit depth. `lossless` applies to each audio/model asset, not to other images/videos in a mixed folder. Read actual sizes and the optimization result before reporting savings.

Validation uses real CLI and MCP jobs: 16/24-bit PCM decoded-sample equality, floating-point/MP3 byte preservation, animated/textured GLB JSON and binary preservation, unchanged outcomes, manifest round trips, malformed/external inputs, folder collisions, and worker/staging cleanup. No UI testing is required.

For rendered model previews, use the separate [six-angle poster workflow](model-posters.md). It leaves the GLB unchanged and emits quality-80 lossy WebP derivatives; model and folder compression automatically generate six default views per GLB.
