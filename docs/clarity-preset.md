# Clarity compression preset

Use `--preset clarity` for opt-in detail retention with compression. The default `standard` preset remains unchanged. CLI image process/compress, video compress and folder compress accept this flag; MCP uses `options.preset: "clarity"` with the same validation.

```sh
file-forge image compress photo.png --preset clarity --json
file-forge video compress clip.mp4 --preset clarity --json
file-forge folder compress ./assets --preset clarity --json
```

| Setting                       | Standard (default) | Clarity |
| ----------------------------- | ------------------ | ------- |
| Image / video-cover quality   | 80                 | 90      |
| WebP effort                   | Sharp default (4)  | 6       |
| WebP smart chroma subsampling | Off                | On      |
| H.264 CRF                     | 23                 | 18      |
| H.264 encoder preset          | medium             | slow    |

Explicit `--quality` overrides image/cover quality in either preset; it does not set video CRF. The preset applies to images and videos inside folders. Existing image conversion formats remain available; extra WebP effort/subsampling apply only to WebP. With the default audio=keep, video audio encoding remains AAC 128 kb/s; audio=remove omits audio. No sharpening, upscaling, frame-rate change or new resize fallback is introduced. Omitted dimensions retain the existing image/video size. Explicitly reducing dimensions can still remove detail.

This is a fixed lossy preset, not a measured quality guarantee or search for the smallest file. It cannot recover detail missing from the source. Clarity normally takes longer and can produce larger files; report actual sizes even when compression increases size. PNG behavior remains governed by its encoder, not a perceptual score.

Video covers run through the same selected image preset once. Audio/music and GLB optimization remain strictly lossless; automatic GLB posters retain their separate default quality-80 workflow. Preset selection does not alter those operations.

Manifests record the requested preset and effective quality, plus video CRF/encoder preset. WebP clarity image settings record effort and smartSubsample (the string `"true"` in the existing string/number parameter format). Source assets remain unchanged. Check installed CLI help before assuming an older release supports this flag.

References: [Sharp output options](https://sharp.pixelplumbing.com/api-output/) and [FFmpeg H.264 encoding guide](https://trac.ffmpeg.org/wiki/Encode/H.264).
