// Test-only transport composition. Never packaged or enabled by production CLI/MCP options.
import { registerHooks } from "node:module";
registerHooks({
  load(url, context, next) {
    const loaded = next(url, context);
    if (url.endsWith("/upload/dist/plan.js") && process.env.FILE_FORGE_TEST_HASH_PAUSE) {
      const mode = JSON.stringify(process.env.FILE_FORGE_TEST_HASH_PAUSE);
      const marker = JSON.stringify(process.env.FILE_FORGE_TEST_HASH_MARKER);
      return {
        ...loaded,
        source: String(loaded.source).replace(
          "hash.update(chunk);",
          `hash.update(chunk); if ((${mode} === "stage") === file.includes(".upload-stage-")) { yield* Effect.promise(() => native.writeFile(${marker}, file)); yield* Effect.sleep("120 seconds"); }`,
        ),
      };
    }
    if (!url.endsWith("/upload/dist/r2.js")) return loaded;
    const port = Number(process.env.FILE_FORGE_TEST_UPLOAD_PORT);
    if (!Number.isInteger(port) || port < 1) throw new Error("Missing test server");
    const source = String(loaded.source).replaceAll("client.execute(", "send(client, ");
    return {
      ...loaded,
      source:
        source +
        `\nconst send = (client, request) => client.execute(HttpClientRequest.setUrl(request, "http://127.0.0.1:${port}" + new URL(request.url).pathname + new URL(request.url).search));\n`,
    };
  },
});
