#!/usr/bin/env node
import { readFileSync } from "node:fs";
const args = process.argv.slice(2);
// Pure version reads build metadata only: no settings, media engines, or Effect runtime.
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  const { messages } = await import("../dist/messages.js");
  const beforeSeparator = args.slice(0, args.includes("--") ? args.indexOf("--") : args.length);
  const languageIndex = beforeSeparator.indexOf("--language");
  const locale =
    beforeSeparator.includes("--language=zh-CN") || beforeSeparator[languageIndex + 1] === "zh-CN"
      ? "zh-CN"
      : "en";
  if (beforeSeparator.includes("--json"))
    console.log(
      JSON.stringify({ schemaVersion: 1, status: "failed", error: { code: "NODE_REQUIRED" } }),
    );
  else console.error(messages[locale].nodeRequired);
  process.exitCode = 1;
} else if (args.length === 1 && (args[0] === "-v" || args[0] === "--version")) {
  const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  console.log(`file-forge ${version}`);
} else {
  const { main } = await import("../dist/main.js");
  await main(args);
}
