import { writeFileSync } from "node:fs";
import { messages } from "../dist/messages.js";
const quote = (text) => "'" + text.replaceAll("'", "'\\''") + "'";
// Generate bootstrap text from the same typed catalog as all other CLI presentation.
const shell = `command -v node >/dev/null 2>&1 || { locale=en; json=no; next=no; for arg in "$@"; do [ "$arg" = -- ] && break; [ "$next" = yes ] && locale="$arg"; next=no; case "$arg" in --language) next=yes;; --language=*) locale="\${arg#*=}";; --json) json=yes;; esac; done; if [ "$json" = yes ]; then printf '%s\\n' '{"schemaVersion":1,"status":"failed","error":{"code":"NODE_REQUIRED"}}'; elif [ "$locale" = zh-CN ]; then printf '%s\\n' ${quote(messages["zh-CN"].nodeRequired)} >&2; else printf '%s\\n' ${quote(messages.en.nodeRequired)} >&2; fi; exit 1; }; exec node "$0" "$@"`;
writeFileSync(
  new URL("../dist/launcher.js", import.meta.url),
  `#!/bin/sh\n':' //; ${shell}\nimport '../bin/file-forge.js';\n`,
  { mode: 0o755 },
);
