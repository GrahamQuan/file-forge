#!/bin/sh
set -eu
runtime=${FILE_FORGE_EXECUTABLE:-file-forge}
if ! command -v "$runtime" >/dev/null 2>&1; then
  printf '%s\n' 'RUNTIME_REQUIRED: Build/install FileForge and set FILE_FORGE_EXECUTABLE to its executable or add file-forge to PATH.' >&2
  exit 1
fi
if [ -z "${FILE_FORGE_ROOT:-}" ]; then
  printf '%s\n' 'ROOT_REQUIRED: Set FILE_FORGE_ROOT to the workspace authorized for this MCP session.' >&2
  exit 1
fi
version=$("$runtime" --version) || exit 1
if [ "$version" != 'file-forge 0.0.0' ]; then
  printf '%s\n' 'INCOMPATIBLE_RUNTIME: This preview plugin requires FileForge 0.0.0. Update the plugin and runtime together.' >&2
  exit 1
fi
exec "$runtime" mcp
