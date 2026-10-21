# Favicons and manifests

## Favicons

```sh
file-forge favicon generate "/absolute/logo.png" --size 64 --json
```

`generate_favicons` body, plus `requestId`:

```json
{
  "operation": "favicon",
  "input": "/absolute/logo.png",
  "size": 64,
  "output": "/absolute/output-parent"
}
```

Input is a static PNG. Default size is 64; supported range is 16–256. Output includes `favicon.png`, `favicon.ico`, and a traced vector `favicon.svg`, with transparent padding and no enlargement. Tracing approximates colors, edges and partial transparency. This is not arbitrary SVG conversion or image generation.

## Delivery manifests

```sh
file-forge manifest export "/absolute/assets" --recursive --output "/absolute/output-parent" --json
file-forge manifest export --manifest "/absolute/manifest.json" --output "/absolute/output-parent" --json
```

`export_manifest` accepts `operation: "export"`, `output`, a unique `requestId`, and exactly one of `files: [...]` or `manifest: "/absolute/manifest.json"`. Optional `recursive` and `includePaths` are booleans. File inspection/export does not recompress assets or upload them. Re-export preserves recorded mappings; it does not copy all referenced outputs into the new report directory or revalidate remote state.

The versioned manifest contains statuses and source/output mappings; Markdown is an English report. Absolute paths are present in manifest mappings; `includePaths` controls report presentation, not manifest anonymization. Review before sharing. Do not claim the generic report matches a project's specialized handoff schema without comparing that schema.

Readers accept v1/v2/v3, v4 audio/model deliveries or mixed folders, v5 six-angle model posters, and v6 model/folder deliveries with automatic posters. Poster assets record per-view camera, dimensions and status; their byte size is not model compression savings. Audio/model assets report lossless optimization and retained-original outcomes separately; do not infer savings from success alone.
