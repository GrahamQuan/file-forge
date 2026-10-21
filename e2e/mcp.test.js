import { test } from "vitest";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import sharp from "sharp";
const plugin = resolve("packages/file-forge-plugin");
const executable = resolve("packages/cli/dist/launcher.js");
const dead = (pid) => {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return error.code === "ESRCH";
  }
};
async function connect(root, overrides = {}, configurationFile = "mcp.json") {
  const configuration = JSON.parse(await readFile(join(plugin, configurationFile), "utf8"))
    .mcpServers["file-forge"];
  const child = spawn(
    configuration.command,
    configuration.args.map((arg) => arg.replaceAll("${PLUGIN_ROOT}", plugin)),
    {
      cwd: root,
      env: {
        ...process.env,
        FILE_FORGE_ROOT: root,
        FILE_FORGE_EXECUTABLE: executable,
        ...overrides,
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  // Ownership: this test, cwd=root, PID=child.pid, STDIO only (no port), parent Vitest session.
  const pending = new Map();
  let sequence = 0,
    buffer = "",
    stderr = "",
    invalid;
  child.stderr.on("data", (data) => (stderr += data));
  child.stdout.on("data", (data) => {
    buffer += data;
    while (buffer.includes("\n")) {
      const end = buffer.indexOf("\n"),
        line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      try {
        const message = JSON.parse(line);
        if (message.id !== undefined) {
          pending.get(message.id)?.(message);
          pending.delete(message.id);
        }
      } catch (error) {
        invalid = error;
      }
    }
  });
  const closed = once(child, "close");
  const request = async (method, params = {}) => {
    const id = ++sequence;
    let timer;
    try {
      return await Promise.race([
        new Promise((resolve) => {
          pending.set(id, resolve);
          child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
        }),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`MCP timeout: ${method}; ${stderr}`)), 10000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
      pending.delete(id);
    }
  };
  const close = async (signal) => {
    if (child.exitCode === null && child.signalCode === null) {
      if (signal) child.kill(signal);
      else child.stdin.end();
      let timer;
      try {
        await Promise.race([
          closed,
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error("MCP shutdown timed out")), 35000);
          }),
        ]);
      } catch (error) {
        if (!dead(child.pid)) child.kill("SIGKILL");
        await closed;
        throw error;
      } finally {
        clearTimeout(timer);
      }
    }
    assert.equal(dead(child.pid), true);
    assert.equal(invalid, undefined, "stdout must contain only JSON-RPC");
    assert.equal(buffer, "");
  };
  return { request, close, child, closed, stderr: () => stderr };
}
const decode = (response) => {
  assert.equal(response.error, undefined, JSON.stringify(response));
  return JSON.parse(response.result.content.find((item) => item.type === "text").text);
};
async function initialize(client) {
  const response = await client.request("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "file-forge-e2e", version: "0.0.0" },
  });
  assert.equal(response.result.serverInfo.name, "file-forge");
  client.child.stdin.write(
    JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n",
  );
}
const call = (client, name, args = {}) => client.request("tools/call", { name, arguments: args });
async function terminal(client, requestId) {
  for (let attempt = 0; attempt < 800; attempt++) {
    const job = decode(await call(client, "job_status", { requestId }));
    if (!["running", "cancelling"].includes(job.status)) return job;
    await delay(50);
  }
  assert.fail("job did not terminate");
}
test("plugin-backed MCP executes all local operations, scopes paths, deduplicates jobs, and cleans up", async () => {
  const root = await mkdtemp(join(tmpdir(), "file-forge-mcp-"));
  let client;
  try {
    const portable = JSON.parse(await readFile(join(plugin, "plugin.json"), "utf8"));
    const compatibility = JSON.parse(
      await readFile(join(plugin, ".codex-plugin/plugin.json"), "utf8"),
    );
    assert.equal(portable.name, compatibility.name);
    assert.equal(portable.version, compatibility.version);
    assert.deepEqual(portable.extensions["com.openai"].interface, compatibility.interface);
    assert.ok(compatibility.interface.shortDescription.length <= 30);
    assert.match(
      await readFile(join(plugin, "skills/file-forge/SKILL.md"), "utf8"),
      /^---\nname: file-forge\n/,
    );
    const input = join(root, "logo.png");
    await sharp({ create: { width: 128, height: 64, channels: 4, background: "red" } })
      .png()
      .toFile(input);
    const original = await readFile(input);
    client = await connect(root);
    await initialize(client);
    const list = await client.request("tools/list");
    assert.deepEqual(list.result.tools.map((tool) => tool.name).sort(), [
      "compress_folder",
      "compress_images",
      "compress_video",
      "export_manifest",
      "file_forge_info",
      "generate_favicons",
      "inspect_files",
      "job_cancel",
      "job_status",
      "process_images",
      "rename_folders",
    ]);
    assert.equal(
      decode(await call(client, "file_forge_info")).root,
      await import("node:fs/promises").then((fs) => fs.realpath(root)),
    );
    const inspect = { requestId: "inspect", operation: "inspect", files: [input] };
    assert.equal(decode(await call(client, "inspect_files", inspect)).status, "running");
    const inspected = await terminal(client, "inspect");
    assert.equal(inspected.status, "succeeded", JSON.stringify(inspected));
    assert.equal(inspected.result.assets[0].width, 128);
    assert.deepEqual(decode(await call(client, "inspect_files", inspect)), inspected);
    assert.equal(
      decode(await call(client, "inspect_files", { ...inspect, files: [root] })).code,
      "REQUEST_ID_CONFLICT",
    );
    const image = {
      requestId: "image",
      operation: "image",
      files: [input],
      options: { width: 32, format: "webp" },
      output: join(root, "outputs"),
    };
    decode(await call(client, "process_images", image));
    const processed = await terminal(client, "image");
    assert.equal(processed.status, "succeeded", JSON.stringify(processed));
    assert.equal((await sharp(processed.result.assets[0].output).metadata()).width, 32);
    const compressedRequest = {
      ...image,
      requestId: "compressed",
      operation: "image-compress",
      options: { width: 32, height: 32 },
    };
    const rejected = await call(client, "compress_images", {
      ...compressedRequest,
      options: { width: 0 },
    });
    assert.ok(rejected.error || rejected.result?.isError);
    decode(await call(client, "compress_images", compressedRequest));
    const compressed = await terminal(client, "compressed");
    assert.equal(compressed.status, "succeeded", JSON.stringify(compressed));
    const compressedMeta = await sharp(compressed.result.assets[0].output).metadata();
    assert.equal(compressedMeta.width, 32);
    assert.equal(compressedMeta.height, 16);
    assert.equal(compressedMeta.format, "webp");
    const videoSource = join(root, "source.mp4");
    const fixture = spawnSync(
      process.env.FFMPEG_PATH || "ffmpeg",
      [
        "-nostdin",
        "-n",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=128x64:rate=10:duration=0.2",
        "-c:v",
        "libx264",
        videoSource,
      ],
      { encoding: "utf8", timeout: 10000 },
    );
    assert.equal(fixture.status, 0, fixture.stderr);
    decode(
      await call(client, "compress_video", {
        requestId: "video",
        operation: "video-compress",
        input: videoSource,
        options: { width: 64, height: 32 },
        output: join(root, "outputs"),
      }),
    );
    const compressedVideo = await terminal(client, "video");
    assert.equal(compressedVideo.status, "succeeded", JSON.stringify(compressedVideo));
    assert.equal(compressedVideo.result.assets.length, 2);
    const videoCover = await sharp(compressedVideo.result.assets[1].output).metadata();
    assert.equal(videoCover.width, 64);
    assert.equal(videoCover.height, 32);
    const cli = spawn(
      process.execPath,
      [
        resolve("packages/cli/bin/file-forge.js"),
        "image",
        "process",
        input,
        "--width",
        "32",
        "--format",
        "webp",
        "--output",
        join(root, "cli"),
        "--json",
      ],
      {
        env: { ...process.env, FILE_FORGE_CONFIG_DIR: join(root, "config") },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let cliOutput = "";
    cli.stdout.on("data", (data) => (cliOutput += data));
    cli.stderr.resume();
    assert.equal((await once(cli, "close"))[0], 0);
    assert.ok(dead(cli.pid));
    const cliResult = JSON.parse(cliOutput);
    assert.deepEqual(cliResult.parameters, processed.result.parameters);
    assert.deepEqual(
      await readFile(cliResult.assets[0].output),
      await readFile(processed.result.assets[0].output),
    );
    decode(
      await call(client, "generate_favicons", {
        requestId: "favicon",
        operation: "favicon",
        input,
        output: join(root, "outputs"),
      }),
    );
    const favicon = await terminal(client, "favicon");
    assert.equal(favicon.status, "succeeded", JSON.stringify(favicon));
    assert.equal(favicon.result.assets.length, 3);
    for (const name of ["favicon.png", "favicon.svg"])
      assert.equal((await sharp(join(favicon.result.directory, name)).metadata()).width, 64);
    const ico = await readFile(join(favicon.result.directory, "favicon.ico"));
    assert.equal(ico.readUInt16LE(2), 1);
    assert.equal(ico[6], 64);
    decode(
      await call(client, "export_manifest", {
        requestId: "export",
        operation: "export",
        manifest: join(favicon.result.directory, "manifest.json"),
        output: join(root, "deliveries"),
      }),
    );
    const exported = await terminal(client, "export");
    assert.equal(exported.status, "succeeded", JSON.stringify(exported));
    assert.equal(
      JSON.parse(await readFile(join(exported.result.directory, "manifest.json"), "utf8")).assets
        .length,
      3,
    );
    assert.ok(
      (await readFile(join(exported.result.directory, "report.md"), "utf8")).includes(
        "favicon.png",
      ),
    );
    const invalid = await call(client, "generate_favicons", {
      requestId: "bad",
      operation: "favicon",
      input,
      output: root,
      size: 0,
    });
    assert.ok(invalid.error || invalid.result.isError);
    assert.equal(
      decode(
        await call(client, "inspect_files", {
          requestId: "outside",
          operation: "inspect",
          files: ["../outside.png"],
        }),
      ).code,
      "PATH_OUTSIDE_ROOT",
    );
    await symlink(tmpdir(), join(root, "escape"));
    assert.equal(
      decode(
        await call(client, "generate_favicons", {
          requestId: "symlink",
          operation: "favicon",
          input,
          output: join(root, "escape"),
        }),
      ).code,
      "PATH_OUTSIDE_ROOT",
    );
    assert.deepEqual(await readFile(input), original);
    for (const job of [inspected, processed, favicon, exported]) assert.ok(dead(job.workerPid));
  } finally {
    if (client) await client.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("MCP cancellation, busy rejection, signal/EOF cleanup, and prerequisite failures", async () => {
  const root = await mkdtemp(join(tmpdir(), "file-forge-mcp-life-"));
  let client;
  try {
    await mkdir(join(root, "inputs"));
    const pixels = await sharp({
      create: { width: 2048, height: 2048, channels: 4, background: "blue" },
    })
      .png()
      .toBuffer();
    const fs = await import("node:fs/promises");
    for (let i = 0; i < 40; i++) await fs.writeFile(join(root, "inputs", `${i}.png`), pixels);
    client = await connect(root, {}, ".mcp.json");
    await initialize(client);
    const args = {
      requestId: "cancel",
      operation: "image",
      files: [join(root, "inputs")],
      options: { format: "avif" },
      output: join(root, "out"),
    };
    assert.equal(decode(await call(client, "process_images", args)).status, "running");
    let status;
    for (let i = 0; i < 100; i++) {
      status = decode(await call(client, "job_status", { requestId: "cancel" }));
      if (status.workerPid) break;
      await delay(10);
    }
    assert.ok(status.workerPid);
    let delivery;
    for (let i = 0; i < 400; i++) {
      const directories = await readdir(join(root, "out")).catch(() => []);
      for (const directory of directories) {
        const candidate = join(root, "out", directory);
        if ((await readdir(candidate)).some((name) => name.endsWith(".avif"))) delivery = candidate;
      }
      if (delivery) break;
      await delay(25);
    }
    assert.ok(delivery, "cancel only after real media output has been published");
    const start = Date.now();
    assert.equal(
      decode(await call(client, "process_images", { ...args, requestId: "busy" })).code,
      "BUSY",
    );
    assert.equal(
      decode(await call(client, "job_cancel", { requestId: "cancel" })).status,
      "cancelling",
    );
    assert.ok(Date.now() - start < 3000, "control plane must stay responsive");
    const done = await terminal(client, "cancel");
    assert.equal(done.status, "cancelled");
    assert.ok(dead(status.workerPid));
    const cancelledManifest = JSON.parse(await readFile(join(delivery, "manifest.json"), "utf8"));
    assert.equal(cancelledManifest.status, "cancelled");
    assert.ok(cancelledManifest.assets.some((asset) => asset.status === "succeeded"));
    decode(await call(client, "process_images", { ...args, requestId: "shutdown" }));
    for (let i = 0; i < 100; i++) {
      status = decode(await call(client, "job_status", { requestId: "shutdown" }));
      if (status.workerPid) break;
      await delay(10);
    }
    await client.close("SIGTERM");
    assert.ok(dead(status.workerPid));
    client = undefined;
    client = await connect(root);
    await initialize(client);
    assert.equal(
      decode(await call(client, "job_status", { requestId: "cancel" })).code,
      "UNKNOWN_JOB",
    );
    decode(await call(client, "process_images", { ...args, requestId: "eof" }));
    for (let i = 0; i < 100; i++) {
      status = decode(await call(client, "job_status", { requestId: "eof" }));
      if (status.workerPid) break;
      await delay(10);
    }
    await client.close();
    assert.ok(dead(status.workerPid));
    client = undefined;
    client = await connect(root, { FFMPEG_PATH: join(root, "missing-ffmpeg") });
    assert.equal((await client.closed)[0], 1);
    assert.match(client.stderr(), /FFMPEG_REQUIRED/);
    await client.close();
    client = undefined;
    client = await connect(root, { FILE_FORGE_ROOT: "" });
    assert.equal((await client.closed)[0], 1);
    assert.match(client.stderr(), /ROOT_REQUIRED/);
    await client.close();
    client = undefined;
    client = await connect(root, { FILE_FORGE_EXECUTABLE: join(root, "missing-runtime") });
    assert.equal((await client.closed)[0], 1);
    assert.match(client.stderr(), /RUNTIME_REQUIRED/);
    await client.close();
    client = undefined;
    assert.deepEqual((await readdir(join(root, "inputs"))).length, 40);
  } finally {
    if (client) await client.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("plugin MCP compresses a nested folder with a single size axis", async () => {
  const root = await mkdtemp(join(tmpdir(), "file-forge-folder-mcp-"));
  let client;
  try {
    const input = join(root, "Example.COM", "Some Route");
    await mkdir(input, { recursive: true });
    await sharp({ create: { width: 800, height: 400, channels: 3, background: "blue" } })
      .png()
      .toFile(join(input, "My_Image.png"));
    client = await connect(root);
    await initialize(client);
    const listing = await client.request("tools/list");
    assert.ok(listing.result.tools.some((t) => t.name === "compress_folder"));
    decode(
      await call(client, "compress_folder", {
        requestId: "folder",
        operation: "folder-compress",
        input: join(root, "Example.COM"),
        output: join(root, "output"),
        options: { width: 300 },
      }),
    );
    const job = await terminal(client, "folder");
    assert.equal(job.status, "succeeded", JSON.stringify(job));
    const asset = job.result.assets[0];
    const metadata = await sharp(asset.output).metadata();
    assert.deepEqual([metadata.width, metadata.height], [300, 150]);
    assert.ok(asset.output.endsWith("example-com/some-route/my-image.webp"));
    decode(
      await call(client, "compress_folder", {
        requestId: "original-size",
        operation: "folder-compress",
        input: join(root, "Example.COM"),
        output: join(root, "output"),
        options: {},
      }),
    );
    const originalSize = await terminal(client, "original-size");
    assert.equal(originalSize.status, "succeeded", JSON.stringify(originalSize));
    const originalMeta = await sharp(originalSize.result.assets[0].output).metadata();
    assert.deepEqual([originalMeta.width, originalMeta.height], [800, 400]);
  } finally {
    if (client) await client.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("MCP previews and applies directory renames while protecting its configured root", async () => {
  const root = await mkdtemp(join(tmpdir(), "file-forge-rename-mcp-"));
  let client;
  try {
    const input = join(root, "Original Root");
    await mkdir(join(input, "Sub Folder"), { recursive: true });
    client = await connect(root);
    await initialize(client);
    const request = {
      operation: "folder-rename",
      input,
      output: join(root, "receipts"),
      renames: [
        { path: ".", name: "renamed-root" },
        { path: "Sub Folder", name: "sub-folder" },
      ],
    };
    decode(await call(client, "rename_folders", { ...request, requestId: "preview" }));
    const preview = await terminal(client, "preview");
    assert.equal(preview.status, "succeeded", JSON.stringify(preview));
    assert.equal(preview.result.apply, false);
    assert.deepEqual(await readdir(input), ["Sub Folder"]);
    const rejected = decode(
      await call(client, "rename_folders", {
        ...request,
        requestId: "root",
        input: root,
        renames: [{ path: ".", name: "outside" }],
        apply: true,
      }),
    );
    assert.equal(rejected.code, "PATH_OUTSIDE_ROOT");
    decode(await call(client, "rename_folders", { ...request, requestId: "apply", apply: true }));
    const applied = await terminal(client, "apply");
    assert.equal(applied.status, "succeeded", JSON.stringify(applied));
    assert.deepEqual(await readdir(join(root, "renamed-root")), ["sub-folder"]);
    assert.ok(dead(applied.workerPid));
  } finally {
    if (client) await client.close();
    await rm(root, { recursive: true, force: true });
  }
});
