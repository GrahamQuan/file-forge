# Media selection and chat preferences

## Selection and chat preferences

Choose one file with its existing image/video/audio/model command. Use `folder compress PATH` for every supported file recursively, `--media images` for only images, or `--media videos` for only videos. MCP `compress_folder` uses the optional top-level `media: "all" | "images" | "videos"` field (default `all`).

Example: `file-forge folder compress "/path/xxx" --media videos --width 512 --json`. Selected videos preserve aspect ratio without enlargement; height is automatic (even dimensions for H.264). Non-selected regular files are copied byte-for-byte with their existing format into the normalized output hierarchy. Selected videos still get covers; excluded GLBs do not render posters or require Chrome. Normal metadata/symlink skips and naming collision checks remain in force. Selection is recorded in `parameters.image.media`.

Remember explicit user preferences for selection, dimensions, quality and preset only within the current chat. A later explicit value overrides earlier choices. Carry those preferences into CLI/MCP arguments; never write persistent config or change global defaults. A new chat starts with normal defaults: all folder media, original image/video dimensions, standard compression. Keep the input file/folder tied to the current request; do not reuse an old path as a default. Scope an inherited preference to compatible operations and do not turn a specific-file request into a folder operation.
