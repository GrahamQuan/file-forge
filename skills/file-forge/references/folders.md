# Recursive folder deliveries

This workflow creates a new copy. To rename the original root or selected subfolders, use [source-folder renaming](source-folder-renaming.md) instead; do not infer that permission from a compression request.

Verify `folder compress` / `compress_folder` exists in the installed build before using it.

```sh
file-forge folder compress "/absolute/Example.COM" --json
file-forge folder compress "/absolute/Example.COM" --width 300 --output "/absolute/output-parent" --json
```

MCP body, plus a unique `requestId`:

```json
{
  "operation": "folder-compress",
  "input": "/absolute/Example.COM",
  "options": {},
  "output": "/absolute/output-parent"
}
```

Recursion is automatic. No dimensions means compress at each file's original size. One or two supplied bounds apply to all supported media while preserving their individual aspect ratios. There is no fallback size.

Output layout:

```text
file-forge-<task-id>/
  manifest.json
  report.md
  example-com/
    some-route/
      some-example.webp
      clip.mp4
      clip.webp
```

Each source folder segment and file stem becomes lowercase ASCII letters, digits and hyphens. Runs of other characters become one hyphen; leading/trailing hyphens are trimmed. The last filename extension is separate. Thus `Example.COM/Some_Route/some example.PNG` becomes `example-com/some-route/some-example.webp`. Do not reuse another skill's naming algorithm.

Static supported images become WebP; mp4/mov/m4v/webm/mkv/avi become MP4 with same-basename sibling WebP cover (for example, `clip.mp4` and `clip.webp`). [Audio/music](audio.md) and [self-contained GLB models](3d-models.md) use their strictly lossless workflows; these assets may retain their original encoding. Other regular files are copied byte-for-byte to normalized output names. Skip `.DS_Store`, symlinks, non-regular files and animated images, reporting reasons. Empty directories are preserved. Copied HTML/JSON/CSS references are not rewritten to match renamed assets; flag that limitation when a working site/package is expected.

Choose output outside the input tree, including resolved symlink ancestors. Preflight rejects empty normalized stems and destination collisions, including generated covers or different image formats collapsing to one WebP. Do not overwrite, append invented suffixes, or rename source files to bypass a collision. Show the conflicting names and ask for the necessary naming decision.

Per-file failures permit remaining processing and appear in the manifest. Skips alone do not make a delivery with successful outputs fail. A delivery with no produced files is empty. Folder manifests use schema version 2; legacy version 1 remains readable. The normalized asset root is ready to stage for S3, but this operation does not upload anything.

Folder compression automatically renders six default quality-80 WebP posters per successfully processed GLB. See [3D models](3d-models.md#six-angle-posters).

Use the opt-in `--preset clarity` / MCP `options.preset: "clarity"` when the user prioritizes detail while still compressing. It uses image/cover quality 90 (WebP effort 6, smartSubsample enabled) and video CRF 18 / slow. Omission keeps quality 80 and CRF 23 / medium. Explicit quality overrides images/covers only. No automatic resizing or sharpening. This is lossy and may be slower/larger; never promise a quality threshold or the smallest possible output. Audio/model optimization and automatic GLB posters keep their existing policies. Check installed support before using the flag.
