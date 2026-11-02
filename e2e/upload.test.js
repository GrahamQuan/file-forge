import { test } from "vitest";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import {
  chmod,
  open,
  stat,
  link,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const launcher = resolve("packages/cli/dist/launcher.js");
const loader = resolve("e2e/upload-routing.js");
const hash = (data) => createHash("sha256").update(data).digest("hex");
const hmac = (key, value) => createHmac("sha256", key).update(value).digest();
const endpoint = `https://${"a".repeat(32)}.r2.cloudflarestorage.com`;
const project = (bucket = "assets-one", prefix = "") => ({
  CONFIG_VERSION: 1,
  R2_ENDPOINT: endpoint,
  R2_BUCKET: bucket,
  R2_REGION: "auto",
  R2_PUBLIC_BASE_URL: "https://cdn.example.com",
  FILE_PATH: prefix,
  R2_ACCESS_KEY_ID: "dummy-access",
  R2_SECRET_ACCESS_KEY: "dummy-secret",
});
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "ff-upload-e2e-")));
  const config = join(root, "file-forge.upload.local.json");
  const assets = join(root, "assets");
  const output = join(root, "output");
  await mkdir(assets);
  await mkdir(output);
  const configuration = {
    "one.example": project(),
    "two.example": project("assets-two", "shared/"),
  };
  await writeFile(config, JSON.stringify(configuration), { mode: 0o600 });
  const env = {
    ...process.env,
    FILE_FORGE_CONFIG_DIR: join(root, "settings"),
    FILE_FORGE_UPLOAD_CONFIG: config,
    FILE_FORGE_ROOT: root,
    FFMPEG_PATH: join(root, "missing-ffmpeg"),
  };
  const children = new Set();
  function launch(args, extra = {}) {
    const child = spawn("/bin/sh", [launcher, ...args], {
      cwd: root,
      env: { ...env, ...extra },
      stdio: ["pipe", "pipe", "pipe"],
    });
    // Owner: this fixture; cwd=root; PID=child.pid; terminal=Vitest; no listening port.
    children.add(child);
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    const done = once(child, "close").then(([code]) => {
      children.delete(child);
      return {
        code,
        stdout,
        stderr,
        data: args.includes("--json") && stdout.trim() ? JSON.parse(stdout) : undefined,
      };
    });
    return { child, done };
  }
  const run = async (args, extra) => {
    const result = await launch(["upload", ...args, "--json"], extra).done;
    assert.ok(!result.stdout.includes("dummy-secret") && !result.stdout.includes("dummy-access"));
    assert.ok(!result.stderr.includes("dummy-secret"));
    return result;
  };
  const plan = async (extra = [], override) => {
    const result = await run(
      [
        "plan",
        "--project",
        "one.example",
        "--input",
        assets,
        "--output",
        output,
        "--recursive",
        ...extra,
      ],
      override,
    );
    assert.equal(result.code, 0, JSON.stringify(result));
    return result.data;
  };
  return {
    root,
    config,
    assets,
    output,
    configuration,
    env,
    run,
    launch,
    plan,
    async cleanup() {
      for (const child of children) {
        child.kill("SIGINT");
        await Promise.race([once(child, "close"), delay(5000)]);
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
          await once(child, "close");
        }
        assert.throws(() => process.kill(child.pid, 0), { code: "ESRCH" });
      }
      await rm(root, { recursive: true, force: true });
    },
  };
}
async function protocolServer(root) {
  const objects = new Map();
  const requests = [];
  const errors = [];
  let drop = false,
    publicFailure = false,
    confirmationGate,
    hold = false,
    holdGet = false,
    listingPage,
    breakReceipt,
    mutateHead = false,
    deny = false;
  const server = createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      requests.push({ method: req.method, path: req.url, headers: req.headers, body });
      if (!req.headers.authorization) {
        assert.equal(req.method, "HEAD");
        res.writeHead(publicFailure ? 503 : 200).end();
        return;
      }
      const auth =
        /^AWS4-HMAC-SHA256 Credential=([^/]+)\/([^,]+), SignedHeaders=([^,]+), Signature=(.+)$/.exec(
          req.headers.authorization,
        );
      assert.ok(auth);
      assert.ok(["dummy-access", "rotated-access"].includes(auth[1]));
      const names = auth[3].split(";");
      const payloadHash = req.method === "PUT" ? hash(body) : hash("");
      assert.equal(req.headers["x-amz-content-sha256"], payloadHash);
      const canonicalRequest = [
        req.method,
        req.url.split("?")[0],
        req.url.split("?")[1] ?? "",
        names
          .map((name) => `${name}:${String(req.headers[name]).trim().replace(/\s+/g, " ")}\n`)
          .join(""),
        auth[3],
        payloadHash,
      ].join("\n");
      const [day, region, service, terminator] = auth[2].split("/");
      assert.equal(region, "auto");
      assert.equal(service, "s3");
      assert.equal(terminator, "aws4_request");
      const key = hmac(
        hmac(
          hmac(
            hmac(`AWS4${auth[1] === "rotated-access" ? "rotated-secret" : "dummy-secret"}`, day),
            region,
          ),
          service,
        ),
        terminator,
      );
      assert.equal(
        hmac(
          key,
          `AWS4-HMAC-SHA256\n${req.headers["x-amz-date"]}\n${auth[2]}\n${hash(canonicalRequest)}`,
        ).toString("hex"),
        auth[4],
      );
      if (deny) {
        res.writeHead(403).end();
        return;
      }
      if (listingPage && req.method === "GET") {
        res
          .writeHead(200, { "content-type": "application/xml" })
          .end(listingPage(new URL(req.url, endpoint)));
        return;
      }
      const current = objects.get(req.url);
      if (req.method === "PUT") {
        assert.equal(Number(req.headers["content-length"]), body.length);
        assert.ok(names.includes("content-length"));
        assert.ok(names.includes("if-none-match") || names.includes("if-match"));
        if (
          (req.headers["if-none-match"] === "*" && current) ||
          (req.headers["if-match"] && req.headers["if-match"] !== current?.etag)
        ) {
          res.writeHead(412).end();
          return;
        }
        const object = { body, etag: `"${hash(body)}"` };
        objects.set(req.url, object);
        await writeFile(join(root, hash(req.url)), body);
        if (breakReceipt) {
          await rename(breakReceipt, `${breakReceipt}.before-put`);
          await mkdir(breakReceipt);
          breakReceipt = undefined;
        }
        if (drop) {
          res.destroy();
          return;
        }
        if (hold) return;
        if (confirmationGate) await confirmationGate;
        res.writeHead(200, { etag: object.etag }).end();
        return;
      }
      if (!current) {
        res.writeHead(404).end();
        return;
      }
      if (req.method === "HEAD") {
        res.writeHead(200, { etag: current.etag, "content-length": current.body.length }).end();
        if (mutateHead) objects.set(req.url, { body: Buffer.from("changed"), etag: '"different"' });
        return;
      }
      assert.equal(req.method, "GET");
      assert.ok(names.includes("if-match"));
      if (req.headers["if-match"] !== current.etag) {
        res.writeHead(412).end();
        return;
      }
      res.writeHead(200, { etag: current.etag });
      if (holdGet) {
        res.write(current.body.subarray(0, 1));
        return;
      }
      res.end(current.body);
    } catch (error) {
      errors.push(error);
      res.writeHead(500).end();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  // Owner: upload E2E fixture, cwd=root, PID=process.pid, port, terminal=Vitest.
  return {
    objects,
    requests,
    env: { NODE_OPTIONS: `--import=${loader}`, FILE_FORGE_TEST_UPLOAD_PORT: String(port) },
    set(options) {
      ({
        drop = drop,
        listingPage = listingPage,
        publicFailure = publicFailure,
        confirmationGate = confirmationGate,
        hold = hold,
        holdGet = holdGet,
        breakReceipt = breakReceipt,
        mutateHead = mutateHead,
        deny = deny,
      } = options);
    },
    async close() {
      const closed = once(server, "close");
      server.close();
      server.closeAllConnections();
      await closed;
      const probe = createServer();
      probe.listen(port, "127.0.0.1");
      await once(probe, "listening");
      await new Promise((resolve) => probe.close(resolve));
      assert.deepEqual(errors, []);
    },
  };
}
const applyArgs = (plan) => [
  "apply",
  "--project",
  plan.plan.project,
  "--plan",
  plan.planPath,
  "--plan-hash",
  plan.plan.planHash,
];

test("upload CLI validates private configuration and immutable offline plans without media prerequisites", async () => {
  const f = await fixture();
  try {
    const original = await readFile(f.config);
    assert.equal(
      (await f.run(["config", "check", "--project", "one.example"])).data.readiness,
      "offline",
    );
    assert.equal(
      (await f.run(["config", "check", "--project", "missing"])).data.error.code,
      "UPLOAD_PROJECT_UNKNOWN",
    );
    await chmod(f.config, 0o644);
    assert.equal(
      (await f.run(["config", "check", "--project", "one.example"])).data.error.code,
      "UPLOAD_CONFIG_UNSAFE",
    );
    await chmod(f.config, 0o600);
    for (const raw of [
      '{"one.example":{},"one.example":{}}',
      JSON.stringify({ "one.example": { ...project(), unknownSecret: "private-value" } }),
      JSON.stringify({ "one.example": { ...project(), FILE_PATH: "../" } }),
    ]) {
      await writeFile(f.config, raw);
      const result = await f.run(["config", "check", "--project", "one.example"]);
      assert.equal(result.data.error.code, "UPLOAD_CONFIG_INVALID");
      assert.ok(!result.stdout.includes("private-value"));
    }
    await writeFile(f.config, original);
    await writeFile(join(f.assets, "a %.png"), "exact-bytes");
    await writeFile(join(f.assets, "manifest.json"), "{}");
    await writeFile(join(f.assets, ".env"), "secret");
    const plan = await f.plan();
    assert.equal(plan.plan.entries[0].key, "a %.png");
    assert.match(plan.plan.entries[0].url, /a%20%25\.png$/);
    assert.equal(plan.plan.excluded.length, 2);
    await writeFile(join(f.assets, "a %.png"), "changed");
    assert.equal((await f.run(applyArgs(plan))).data.error.code, "UPLOAD_INPUT_CHANGED");
    const tampered = JSON.parse(await readFile(plan.planPath, "utf8"));
    tampered.entries[0].key = "other.png";
    await writeFile(plan.planPath, JSON.stringify(tampered));
    assert.equal((await f.run(applyArgs(plan))).data.error.code, "UPLOAD_PLAN_INVALID");
    await link(f.config, join(f.assets, "hidden-config.png"));
    assert.equal(
      (
        await f.run([
          "plan",
          "--project",
          "one.example",
          "--input",
          f.assets,
          "--output",
          f.output,
          "--recursive",
        ])
      ).code,
      2,
    );
    await rm(join(f.assets, "hidden-config.png"));
    await symlink(join(f.assets, "a %.png"), join(f.assets, "alias.png"));
    assert.equal(
      (
        await f.run([
          "plan",
          "--project",
          "one.example",
          "--input",
          f.assets,
          "--output",
          f.output,
          "--recursive",
        ])
      ).code,
      2,
    );
    await f.launch(["config", "set", "language", "zh-CN", "--json"]).done;
    assert.deepEqual(await readFile(f.config), original);
  } finally {
    await f.cleanup();
  }
});

test("real CLI signs conditional writes, records conflicts/unknowns and reconciles without retries", async () => {
  const f = await fixture();
  const server = await protocolServer(f.root);
  try {
    await writeFile(join(f.assets, "a %.png"), "one");
    const plan = await f.plan();
    const relocated = join(f.output, "copied-plan.json");
    await writeFile(relocated, await readFile(plan.planPath));
    const copiedArgs = applyArgs(plan);
    copiedArgs[copiedArgs.indexOf("--plan") + 1] = relocated;
    assert.equal((await f.run(copiedArgs, server.env)).data.error.code, "UPLOAD_PLAN_INVALID");
    assert.equal(server.requests.length, 0);
    const applied = await f.run(applyArgs(plan), server.env);
    assert.equal(applied.code, 0, JSON.stringify(applied));
    assert.equal(server.objects.get("/assets-one/a%20%25.png").body.toString(), "one");
    assert.equal(
      (await f.run(applyArgs(plan), server.env)).data.error.code,
      "UPLOAD_ALREADY_STARTED",
    );
    assert.equal(
      (
        await f.run(
          ["verify", "--project", "one.example", "--receipt", applied.data.receiptPath],
          server.env,
        )
      ).data.observation.entries[0].result,
      "matches",
    );
    const conflict = await f.run(applyArgs(await f.plan()), server.env);
    assert.equal(conflict.data.receipt.entries[0].transfer, "conflict");
    await writeFile(join(f.assets, "a %.png"), "two");
    const replacement = await f.plan(["--overwrite-key", "a %.png"]);
    server.set({ mutateHead: true });
    assert.equal(
      (await f.run(applyArgs(replacement), server.env)).data.receipt.entries[0].transfer,
      "conflict",
    );
    server.set({ mutateHead: false, publicFailure: true });
    const replaced = await f.run(
      applyArgs(await f.plan(["--overwrite-key", "a %.png"])),
      server.env,
    );
    assert.equal(replaced.data.status, "partial");
    assert.equal(replaced.data.receipt.entries[0].transfer, "uploaded");
    assert.equal(replaced.data.receipt.entries[0].publicCheck.outcome, "unreachable");
    await writeFile(join(f.assets, "a %.png"), "three");
    server.set({ drop: true });
    const before = server.requests.filter((r) => r.method === "PUT").length;
    const lost = await f.run(applyArgs(await f.plan(["--overwrite-key", "a %.png"])), server.env);
    assert.equal(lost.data.receipt.entries[0].transfer, "unknown");
    assert.equal(server.requests.filter((r) => r.method === "PUT").length, before + 1);
    server.set({ drop: false });
    assert.equal(
      (
        await f.run(
          ["verify", "--project", "one.example", "--receipt", lost.data.receiptPath],
          server.env,
        )
      ).data.observation.entries[0].result,
      "matches",
    );
    const verify = async () =>
      (
        await f.run(
          ["verify", "--project", "one.example", "--receipt", lost.data.receiptPath],
          server.env,
        )
      ).data.observation.entries[0].result;
    const writes = server.requests.filter((request) => request.method === "PUT").length;
    server.objects.set("/assets-one/a%20%25.png", {
      body: Buffer.from("other"),
      etag: '"before-change"',
    });
    assert.equal(await verify(), "differs");
    server.set({ mutateHead: true });
    assert.equal(await verify(), "unknown");
    server.set({ mutateHead: false, deny: true });
    assert.equal(await verify(), "unknown");
    server.set({ deny: false });
    server.objects.delete("/assets-one/a%20%25.png");
    assert.equal(await verify(), "absent_observed");
    assert.equal(server.requests.filter((request) => request.method === "PUT").length, writes);
    assert.deepEqual(
      (await readdir(join(lost.data.receiptPath, ".."))).filter((name) =>
        name.startsWith(".upload-stage"),
      ),
      [],
    );
  } finally {
    await server.close();
    await f.cleanup();
  }
});

async function uploadMcp(f, environment) {
  const launched = f.launch(["mcp"], environment);
  let buffer = "",
    id = 0;
  const waiting = new Map();
  launched.child.stdout.on("data", (chunk) => {
    buffer += chunk;
    while (buffer.includes("\n")) {
      const end = buffer.indexOf("\n");
      const message = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      waiting.get(message.id)?.(message);
      waiting.delete(message.id);
    }
  });
  const request = async (method, params) => {
    const current = ++id;
    let timer;
    try {
      return await Promise.race([
        new Promise((resolve) => {
          waiting.set(current, resolve);
          launched.child.stdin.write(
            JSON.stringify({ jsonrpc: "2.0", id: current, method, params }) + "\n",
          );
        }),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("MCP timeout")), 10000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
      waiting.delete(current);
    }
  };
  const initialized = await request("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "upload-e2e", version: "1.0.0" },
  });
  assert.ok(initialized.result);
  launched.child.stdin.write(
    JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n",
  );
  const call = async (name, args) => {
    const response = await request("tools/call", { name, arguments: args });
    assert.equal(response.error, undefined);
    return JSON.parse(response.result.content.find((item) => item.type === "text").text);
  };
  const terminal = async (requestId) => {
    for (let i = 0; i < 600; i++) {
      const result = await call("job_status", { requestId });
      if (!["running", "cancelling"].includes(result.status)) return result;
      await delay(25);
    }
    throw new Error("Job timeout");
  };
  return {
    call,
    terminal,
    child: launched.child,
    async close() {
      launched.child.stdin.end();
      const result = await launched.done;
      assert.equal(result.code, 0, result.stderr);
      assert.throws(() => process.kill(launched.child.pid, 0), { code: "ESRCH" });
    },
  };
}

test("upload MCP keeps status responsive, scopes plans and retains cancelled receipts without FFmpeg", async () => {
  const f = await fixture();
  const server = await protocolServer(f.root);
  let client;
  try {
    await writeFile(join(f.assets, "asset.png"), "unchanged");
    client = await uploadMcp(f, server.env);
    const checked = await client.call("check_upload_config", {
      operation: "upload-check",
      project: "one.example",
      requestId: "check",
    });
    assert.equal(checked.status, "running");
    assert.equal((await client.terminal("check")).result.readiness, "offline");
    assert.equal(
      (
        await client.call("inspect_files", {
          operation: "inspect",
          files: [join(f.assets, "asset.png")],
          requestId: "media",
        })
      ).code,
      "FFMPEG_REQUIRED",
    );
    assert.equal(
      (
        await client.call("plan_upload", {
          operation: "upload-plan",
          project: "one.example",
          input: "/etc/passwd",
          output: f.output,
          requestId: "outside",
        })
      ).code,
      "PATH_OUTSIDE_ROOT",
    );
    await client.call("plan_upload", {
      operation: "upload-plan",
      project: "one.example",
      input: f.assets,
      output: f.output,
      recursive: true,
      requestId: "plan",
    });
    const plan = (await client.terminal("plan")).result;
    assert.equal(plan.status, "succeeded");
    server.set({ hold: true });
    const accepted = await client.call("upload_files", {
      operation: "upload-apply",
      project: "one.example",
      plan: plan.planPath,
      planHash: plan.plan.planHash,
      requestId: "send",
    });
    assert.ok(accepted.receiptPath);
    for (let i = 0; i < 400 && !server.requests.some((r) => r.method === "PUT"); i++)
      await delay(25);
    assert.ok(server.requests.some((r) => r.method === "PUT"));
    assert.equal((await client.call("job_cancel", { requestId: "send" })).status, "cancelling");
    const cancelled = await client.terminal("send");
    assert.equal(cancelled.status, "cancelled");
    assert.equal(cancelled.receiptPath, accepted.receiptPath);
    const receipt = JSON.parse(await readFile(cancelled.receiptPath, "utf8"));
    assert.equal(receipt.status, "cancelled");
    assert.equal(receipt.entries[0].transfer, "unknown");
    assert.throws(() => process.kill(cancelled.workerPid, 0), { code: "ESRCH" });
    assert.equal(
      (await readdir(join(cancelled.receiptPath, ".."))).some((name) =>
        name.startsWith(".upload-stage-"),
      ),
      false,
    );
    await client.close();
    client = undefined;
    server.set({ hold: false });
    client = await uploadMcp(f, server.env);
    assert.equal((await client.call("job_status", { requestId: "send" })).code, "UNKNOWN_JOB");
    await client.call("verify_upload", {
      operation: "upload-verify",
      project: "one.example",
      receipt: cancelled.receiptPath,
      requestId: "verify",
    });
    assert.equal((await client.terminal("verify")).result.observation.entries[0].result, "matches");
  } finally {
    if (client) await client.close();
    await server.close();
    await f.cleanup();
  }
});

test("upload project binding, credential rotation and concurrent creates preserve reviewed destinations", async () => {
  const f = await fixture();
  const server = await protocolServer(f.root);
  try {
    await writeFile(join(f.assets, "asset.png"), "original");
    const first = await f.plan();
    const second = await f.plan();
    const results = await Promise.all([
      f.run(applyArgs(first), server.env),
      f.run(applyArgs(second), server.env),
    ]);
    assert.deepEqual(results.map((result) => result.data.receipt.entries[0].transfer).sort(), [
      "conflict",
      "uploaded",
    ]);
    const other = await f.run([
      "plan",
      "--project",
      "two.example",
      "--input",
      f.assets,
      "--output",
      f.output,
      "--recursive",
    ]);
    assert.equal(other.data.plan.entries[0].key, "shared/asset.png");
    assert.equal((await f.run(applyArgs(other.data), server.env)).code, 0);
    assert.equal(server.objects.get("/assets-two/shared/asset.png").body.toString(), "original");
    f.configuration["two.example"].R2_BUCKET = "assets-one";
    await writeFile(f.config, JSON.stringify(f.configuration));
    const shared = await f.run([
      "plan",
      "--project",
      "two.example",
      "--input",
      f.assets,
      "--output",
      f.output,
      "--recursive",
    ]);
    assert.equal((await f.run(applyArgs(shared.data), server.env)).code, 0);
    assert.equal(server.objects.get("/assets-one/shared/asset.png").body.toString(), "original");

    const stale = await f.plan(["--overwrite-key", "asset.png"]);
    f.configuration["one.example"].R2_BUCKET = "other-bucket";
    await writeFile(f.config, JSON.stringify(f.configuration));
    const before = server.requests.length;
    assert.equal((await f.run(applyArgs(stale), server.env)).data.error.code, "UPLOAD_PLAN_STALE");
    assert.equal(server.requests.length, before);
    f.configuration["one.example"] = {
      ...project(),
      R2_ACCESS_KEY_ID: "rotated-access",
      R2_SECRET_ACCESS_KEY: "rotated-secret",
    };
    await writeFile(f.config, JSON.stringify(f.configuration));
    assert.equal((await f.run(applyArgs(stale), server.env)).code, 0);
    assert.ok(
      server.requests.some((r) => r.headers.authorization?.includes("Credential=rotated-access/")),
    );
  } finally {
    await server.close();
    await f.cleanup();
  }
});

const waitFor = async (predicate) => {
  for (let i = 0; i < 400; i++) {
    if (await predicate()) return;
    await delay(25);
  }
  throw new Error("Observation timeout");
};
test("upload input/config protection rejects tracked secrets, unsafe mappings and resource bounds", async () => {
  const f = await fixture();
  try {
    const original = await readFile(f.config);
    const check = () => f.run(["config", "check", "--project", "one.example"]);
    await writeFile(f.config, JSON.stringify({ "xn--example.test": project() }));
    assert.equal((await f.run(["config", "check", "--project", "xn--example.test"])).code, 0);
    for (const jurisdiction of ["eu", "fedramp", "us"]) {
      await writeFile(
        f.config,
        JSON.stringify({
          "one.example": {
            ...project(),
            R2_ENDPOINT: endpoint.replace(".r2.", `.${jurisdiction}.r2.`),
          },
        }),
      );
      assert.equal((await check()).code, 0);
    }
    for (const value of [
      { __proto__: {} },
      { constructor: project() },
      { "one.example": { ...project(), R2_REGION: "us-east-1" } },
      { "one.example": { ...project(), FILE_PATH: "/bad/" } },
      { "one.example": { ...project(), R2_ENDPOINT: endpoint + ":443" } },
      { "one.example": { ...project(), R2_PUBLIC_BASE_URL: "https://example.com/path" } },
      { "one.example": { ...project(), R2_ACCESS_KEY_ID: "<ENTER_LOCALLY>" } },
    ]) {
      await writeFile(f.config, JSON.stringify(value));
      assert.notEqual((await check()).code, 0);
    }
    await writeFile(f.config, original);
    const git = (...args) => {
      const result = spawnSync("git", args, { cwd: f.root, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
    };
    git("init", "--quiet");
    assert.equal((await check()).data.error.code, "UPLOAD_CONFIG_UNSAFE");
    await writeFile(join(f.root, ".gitignore"), "file-forge.upload.local.json\n");
    assert.equal((await check()).code, 0);
    git("add", "-f", "file-forge.upload.local.json");
    assert.equal((await check()).data.error.code, "UPLOAD_CONFIG_UNSAFE");
    git("rm", "--cached", "file-forge.upload.local.json");
    assert.equal((await check()).code, 0);
    const invalidPlan = () =>
      f.run([
        "plan",
        "--project",
        "one.example",
        "--input",
        f.assets,
        "--output",
        f.output,
        "--recursive",
      ]);
    assert.equal((await invalidPlan()).data.error.code, "UPLOAD_PLAN_INVALID");
    const large = await open(join(f.assets, "large.mp4"), "w");
    await large.truncate(512 * 1024 * 1024 + 1);
    await large.close();
    assert.equal((await invalidPlan()).data.error.code, "UPLOAD_LIMIT_EXCEEDED");
    await rm(join(f.assets, "large.mp4"));
    await writeFile(join(f.assets, "a.png"), "same");
    const planned = await f.plan();
    assert.equal(
      (await f.run([...applyArgs(planned).slice(0, -1), "0".repeat(64)])).data.error.code,
      "UPLOAD_PLAN_STALE",
    );
    const bad = { ...planned.plan, entries: [...planned.plan.entries, planned.plan.entries[0]] };
    const canonical = (value) =>
      Array.isArray(value)
        ? `[${value.map(canonical).join(",")}]`
        : value !== null && typeof value === "object"
          ? `{${Object.keys(value)
              .sort()
              .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
              .join(",")}}`
          : JSON.stringify(value);
    const { planHash: _ignored, ...contents } = bad;
    bad.planHash = hash(canonical(contents));
    await writeFile(planned.planPath, JSON.stringify(bad));
    assert.equal(
      (await f.run([...applyArgs(planned).slice(0, -1), bad.planHash])).data.error.code,
      "UPLOAD_PLAN_INVALID",
    );
    assert.deepEqual(await readFile(f.config), original);
    const overlap = await f.run([
      "plan",
      "--project",
      "one.example",
      "--input",
      f.assets,
      "--output",
      f.assets,
      "--recursive",
    ]);
    assert.equal(overlap.data.error.code, "UPLOAD_PLAN_INVALID");
    const alternate = join(f.assets, "private.png");
    await writeFile(alternate, original, { mode: 0o600 });
    await writeFile(
      join(f.root, ".gitignore"),
      "file-forge.upload.local.json\nassets/private.png\n",
    );
    const protectedPlan = await f.plan([], { FILE_FORGE_UPLOAD_CONFIG: alternate });
    assert.ok(
      protectedPlan.plan.excluded.some(
        (entry) => entry.path === "private.png" && entry.reason === "protected",
      ),
    );
    await rm(alternate);
    await writeFile(join(f.assets, "雪 %.png"), "unicode");
    const unicode = await f.plan();
    assert.ok(unicode.plan.entries.some((entry) => entry.url.endsWith("/%E9%9B%AA%20%25.png")));
    await Promise.all(
      Array.from({ length: 1000 }, (_, i) => writeFile(join(f.assets, `limit-${i}.png`), "")),
    );
    assert.equal((await invalidPlan()).data.error.code, "UPLOAD_LIMIT_EXCEEDED");
  } finally {
    await f.cleanup();
  }
});

test("upload workers cancel during hashing/staging, retain crash evidence and abort verification on EOF", async () => {
  const f = await fixture();
  const server = await protocolServer(f.root);
  let client;
  try {
    await writeFile(join(f.assets, "a.png"), "reviewed bytes");
    await writeFile(join(f.assets, "b.png"), "unsent bytes");
    for (const mode of ["hash", "stage"]) {
      const plan = await f.plan();
      const marker = join(f.root, `${mode}-started`);
      client = await uploadMcp(f, {
        ...server.env,
        FILE_FORGE_TEST_HASH_PAUSE: mode,
        FILE_FORGE_TEST_HASH_MARKER: marker,
      });
      await client.call("upload_files", {
        operation: "upload-apply",
        project: "one.example",
        plan: plan.planPath,
        planHash: plan.plan.planHash,
        requestId: mode,
      });
      await waitFor(() =>
        stat(marker).then(
          () => true,
          () => false,
        ),
      );
      assert.equal((await client.call("job_status", { requestId: mode })).status, "running");
      await client.call("job_cancel", { requestId: mode });
      const cancelled = await client.terminal(mode);
      assert.equal(cancelled.status, "cancelled");
      assert.equal(server.requests.length, 0);
      if (mode === "stage") {
        const receipt = JSON.parse(await readFile(cancelled.receiptPath, "utf8"));
        assert.equal(receipt.status, "cancelled");
        assert.ok(receipt.entries.every((entry) => entry.transfer === "not_sent"));
      }
      assert.equal(
        (await readdir(join(plan.planPath, ".."))).some((name) =>
          name.startsWith(".upload-stage-"),
        ),
        false,
      );
      await client.close();
      client = undefined;
    }
    const plan = await f.plan();
    server.set({ hold: true });
    client = await uploadMcp(f, server.env);
    const accepted = await client.call("upload_files", {
      operation: "upload-apply",
      project: "one.example",
      plan: plan.planPath,
      planHash: plan.plan.planHash,
      requestId: "crash",
    });
    await waitFor(() => server.requests.some((request) => request.method === "PUT"));
    const active = await client.call("job_status", { requestId: "crash" });
    // Deliberate crash fixture: identity was obtained from this test's own session/job.
    process.kill(active.workerPid, "SIGKILL");
    const crashed = await client.terminal("crash");
    assert.equal(crashed.status, "failed");
    assert.equal(crashed.receiptPath, accepted.receiptPath);
    const receipt = JSON.parse(await readFile(crashed.receiptPath, "utf8"));
    assert.equal(receipt.entries[0].transfer, "sending");
    assert.equal(receipt.entries[1].transfer, "not_sent");
    assert.equal(
      (await readdir(join(plan.planPath, ".."))).some((name) => name.startsWith(".upload-stage-")),
      false,
    );
    await client.close();
    client = undefined;
    server.set({ hold: false, holdGet: true });
    client = await uploadMcp(f, server.env);
    await client.call("verify_upload", {
      operation: "upload-verify",
      project: "one.example",
      receipt: crashed.receiptPath,
      requestId: "read",
    });
    await waitFor(() => server.requests.some((request) => request.method === "GET"));
    const reading = await client.call("job_status", { requestId: "read" });
    await client.close();
    client = undefined;
    assert.throws(() => process.kill(reading.workerPid, 0), { code: "ESRCH" });
    assert.deepEqual(JSON.parse(await readFile(crashed.receiptPath, "utf8")), receipt);
    assert.equal(server.requests.filter((request) => request.method === "PUT").length, 1);
  } finally {
    if (client) await client.close();
    await server.close();
    await f.cleanup();
  }
});

test("journal failure after committed PUT reports uncertainty and prevents further dispatch", async () => {
  const f = await fixture();
  const server = await protocolServer(f.root);
  try {
    await writeFile(join(f.assets, "a.png"), "committed");
    await writeFile(join(f.assets, "b.png"), "unsent");
    const plan = await f.plan();
    const receiptPath = join(plan.planPath, "..", "receipt.json");
    server.set({ breakReceipt: receiptPath });
    const result = await f.run(applyArgs(plan), server.env);
    assert.equal(result.code, 1);
    assert.equal(result.data.error.code, "RECEIPT_WRITE_FAILED");
    assert.ok(!result.stderr.includes("R2 confirmed"));
    assert.equal(result.data.error.remoteOutcome, "unknown");
    assert.equal(result.data.error.receiptPath, receiptPath);
    assert.equal(server.requests.filter((request) => request.method === "PUT").length, 1);
    assert.equal(server.objects.get("/assets-one/a.png").body.toString(), "committed");
    assert.equal(
      JSON.parse(await readFile(`${receiptPath}.before-put`, "utf8")).entries[0].transfer,
      "sending",
    );
  } finally {
    await server.close();
    await f.cleanup();
  }
});

test("CLI reports byte-weighted progress and waits for R2 confirmation separately from public checks", async () => {
  const f = await fixture();
  const server = await protocolServer(f.root);
  const confirmation = Promise.withResolvers();
  try {
    await writeFile(join(f.assets, "a.png"), Buffer.alloc(128 * 1024, 1));
    await writeFile(join(f.assets, "b.png"), Buffer.alloc(384 * 1024, 2));
    await writeFile(join(f.assets, "c.png"), Buffer.alloc(0));
    const plan = await f.plan();
    server.set({ confirmationGate: confirmation.promise, publicFailure: true });
    const running = f.launch(["upload", ...applyArgs(plan), "--json"], server.env);
    let liveProgress = "";
    let liveOutput = "";
    running.child.stderr.on("data", (chunk) => {
      liveProgress += chunk;
    });
    running.child.stdout.on("data", (chunk) => {
      liveOutput += chunk;
    });
    await waitFor(
      () =>
        server.requests.some((r) => r.method === "PUT") &&
        liveProgress.includes("Awaiting R2 confirmation"),
    );
    assert.match(liveProgress, /100% \| Overall: 25% \| Awaiting R2 confirmation/);
    assert.ok(!liveProgress.includes("R2 confirmed"));
    assert.equal(liveOutput, "");
    confirmation.resolve();
    const result = await running.done;
    assert.equal(result.code, 1); // Public URL failed, although every transfer was confirmed.
    assert.ok(result.data.receipt.entries.every((e) => e.transfer === "uploaded"));
    assert.ok(result.data.receipt.entries.every((e) => e.publicCheck.outcome === "unreachable"));
    assert.equal((result.stderr.match(/Uploaded — R2 confirmed/g) ?? []).length, 3);
    assert.equal((result.stderr.match(/Checking public URL separately/g) ?? []).length, 3);
    const lines = result.stderr.trim().split("\n");
    const totals = lines.map((line) => Number(/Overall: (\d+)%/.exec(line)[1]));
    assert.ok(
      totals.every((value, i) => value >= 0 && value <= 100 && (i === 0 || value >= totals[i - 1])),
    );
    assert.equal(totals.at(-1), 100);
    assert.ok(lines.some((line) => /"b.png": (?!0%|100%)\d+%/.test(line)));
    assert.ok(!result.stdout.includes("Overall:"));

    const conflict = await f.run(applyArgs(await f.plan()), server.env);
    assert.equal(conflict.data.receipt.entries[0].transfer, "conflict");
    assert.ok(!conflict.stderr.includes("R2 confirmed"));
    await writeFile(join(f.assets, "a.png"), "new bytes");
    server.set({ drop: true });
    const dropped = await f.run(applyArgs(await f.plan(["--overwrite-key", "a.png"])), server.env);
    assert.equal(dropped.data.receipt.entries[0].transfer, "unknown");
    assert.ok(!dropped.stderr.includes("R2 confirmed"));

    server.set({ drop: false, publicFailure: false });
    const localized = await f.run(
      [
        ...applyArgs(
          await f.plan([
            "--overwrite-key",
            "a.png",
            "--overwrite-key",
            "b.png",
            "--overwrite-key",
            "c.png",
          ]),
        ),
        "--language",
        "zh-CN",
      ],
      server.env,
    );
    assert.equal(localized.code, 0);
    assert.match(localized.stderr, /总进度：100%/);
    assert.match(localized.stderr, /R2 已确认/);
    await writeFile(join(f.assets, "a.png"), "");
    await writeFile(join(f.assets, "b.png"), "");
    const empty = await f.run(
      applyArgs(
        await f.plan([
          "--overwrite-key",
          "a.png",
          "--overwrite-key",
          "b.png",
          "--overwrite-key",
          "c.png",
        ]),
      ),
      server.env,
    );
    assert.equal(empty.code, 0);
    assert.match(empty.stderr, /Overall: 100%/);
    assert.ok(!/NaN|Infinity/.test(empty.stderr));
  } finally {
    confirmation.resolve();
    await server.close();
    await f.cleanup();
  }
});

test("CLI upload table separates confirmation and public results while preserving JSON and line mode", async () => {
  const f = await fixture();
  const server = await protocolServer(f.root);
  const confirmation = Promise.withResolvers();
  try {
    await writeFile(join(f.assets, "a.png"), Buffer.alloc(128 * 1024, 1));
    await writeFile(join(f.assets, "雪.png"), "second");
    const plan = await f.plan();
    server.set({ confirmationGate: confirmation.promise, publicFailure: true });
    const running = f.launch(
      ["upload", ...applyArgs(plan), "--progress", "table", "--json"],
      server.env,
    );
    let live = "";
    running.child.stderr.on("data", (chunk) => {
      live += chunk;
    });
    await waitFor(
      () =>
        server.requests.some((r) => r.method === "PUT") && live.includes("Awaiting confirmation"),
    );
    assert.match(live, /File \/ object key.*Sent.*R2 transfer.*Public URL/);
    assert.match(live, /100%.*Awaiting confirmation.*Not checked/);
    assert.ok(!live.includes("R2 confirmed"));
    confirmation.resolve();
    const result = await running.done;
    assert.equal(result.code, 1);
    assert.equal(result.data.receipt.entries.length, 2);
    assert.ok(result.data.receipt.entries.every((entry) => entry.transfer === "uploaded"));
    assert.match(result.stderr, /"a.png".*100%.*R2 confirmed.*Unreachable/);
    assert.ok(result.stderr.includes('"\\u96ea.png"'));
    assert.match(result.stderr, /Overall sent: 100%/);
    assert.ok(!result.stderr.includes("\u001b[")); // Piped tables are plain text snapshots.
    assert.ok(!result.stdout.includes("Overall sent:"));

    const conflict = await f.run([...applyArgs(await f.plan()), "--progress", "table"], server.env);
    assert.match(conflict.stderr, /"a.png".*Conflict.*Not checked/);
    assert.match(conflict.stderr, /Not sent.*Not checked/);
    const lines = await f.run([...applyArgs(await f.plan()), "--progress", "lines"], server.env);
    assert.match(lines.stderr, /Overall:/);
    assert.ok(!lines.stderr.includes("File / object key"));
    assert.equal(
      (await f.run([...applyArgs(await f.plan()), "--progress", "invalid"], server.env)).data.error
        .code,
      "INVALID_INPUT",
    );
    assert.equal(
      (await f.run(["config", "check", "--project", "one.example", "--progress", "table"])).data
        .error.code,
      "INVALID_INPUT",
    );
    const zh = await f.run(
      [...applyArgs(await f.plan()), "--progress", "table", "--language", "zh-CN"],
      server.env,
    );
    assert.match(zh.stderr, /文件 \/ 对象键/);
    assert.match(zh.stderr, /冲突/);
  } finally {
    confirmation.resolve();
    await server.close();
    await f.cleanup();
  }
});

test("upload commands ask for private setup and stop before touching upload artifacts", async () => {
  const f = await fixture();
  try {
    const missing = join(f.root, "missing-private.json");
    const planPath = join(f.output, "plan.json");
    for (const args of [
      ["config", "check"],
      ["plan", "--input", join(f.root, "absent.png"), "--output", f.output],
      ["apply", "--plan", planPath, "--plan-hash", "a".repeat(64)],
      ["verify", "--receipt", join(f.output, "receipt.json")],
    ]) {
      const r = await f.run([...args, "--project", "one.example", "--config", missing]);
      assert.equal(r.code, 2);
      assert.equal(r.data.error.code, "UPLOAD_CONFIG_MISSING");
      assert.ok(r.stderr.includes(missing));
      assert.match(r.stderr, /Please create the private project JSON/);
      assert.doesNotMatch(r.stderr, /Overall:/);
    }
    const human = await f.launch([
      "upload",
      "config",
      "check",
      "--project",
      "one.example",
      "--config",
      missing,
      "--language",
      "zh-CN",
    ]).done;
    assert.equal(human.code, 2);
    assert.match(human.stderr, /在本机填写/);
    assert.equal(human.stdout, "");
    await writeFile(f.config, JSON.stringify({ ...f.configuration, unfinished: {} }));
    const blocked = await f.run([
      "plan",
      "--project",
      "one.example",
      "--input",
      f.assets,
      "--output",
      f.output,
      "--recursive",
    ]);
    assert.equal(blocked.data.error.code, "UPLOAD_CONFIG_INVALID");
    assert.match(blocked.stderr, /complete every project entry/);
    assert.deepEqual(await readdir(f.output), []);
    assert.ok(!(await readdir(f.root)).includes("missing-private.json"));
  } finally {
    await f.cleanup();
  }
});

test("CLI and MCP list a scoped folder tree across signed R2 pages", async () => {
  const f = await fixture();
  const server = await protocolServer(f.root);
  let client;
  try {
    const project = "two.example";
    const prefix = "shared/雪 & space/";
    const token = "page/+&=%";
    server.set({
      listingPage: (url) => {
        assert.equal(url.pathname, "/assets-two");
        assert.equal(url.searchParams.get("list-type"), "2");
        assert.equal(url.searchParams.get("prefix"), prefix);
        assert.equal(url.searchParams.get("encoding-type"), "url");
        const next = url.searchParams.get("continuation-token");
        if (next !== null) assert.equal(next, token);
        const keys = next ? ["nested/sub/file", "empty/"] : ["file", "nested/file"];
        return `<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><EncodingType>url</EncodingType><IsTruncated>${!next}</IsTruncated>${keys.map((key) => "<Contents><Key>" + encodeURIComponent(prefix + key) + "</Key></Contents>").join("")}${next ? "" : "<NextContinuationToken>page/+&amp;=%</NextContinuationToken>"}</ListBucketResult>`;
      },
    });
    const args = ["folders", "--project", project, "--prefix", "雪 & space"];
    const result = await f.run(args, server.env);
    assert.equal(result.code, 0, JSON.stringify(result));
    assert.deepEqual(
      result.data.folders,
      ["empty/", "nested/", "nested/sub/"].map((key) => prefix + key),
    );
    const human = await f.launch(["upload", ...args], server.env).done;
    assert.equal(human.code, 0);
    assert.deepEqual(human.stdout.trimEnd().split("\n"), [
      JSON.stringify("assets-two/" + prefix),
      '  "empty/"',
      '  "nested/"',
      '    "sub/"',
    ]);
    client = await uploadMcp(f, server.env);
    await client.call("list_bucket_folders", {
      operation: "upload-folders",
      project,
      prefix: "雪 & space/",
      requestId: "folders",
    });
    assert.deepEqual((await client.terminal("folders")).result, result.data);
    assert.equal(server.requests.length, 6);
    assert.ok(server.requests.every((r) => r.method === "GET"));
    server.set({
      listingPage: () =>
        "<ListBucketResult><EncodingType>url</EncodingType><IsTruncated>false</IsTruncated></ListBucketResult>",
    });
    assert.deepEqual((await f.run(args, server.env)).data.folders, []);
    server.set({ listingPage: () => "<invalid/>" });
    assert.equal((await f.run(args, server.env)).data.error.code, "BUCKET_LIST_INVALID");
    server.set({ deny: true });
    assert.equal((await f.run(args, server.env)).data.error.code, "UPLOAD_DENIED");
    const count = server.requests.length;
    assert.equal(
      (await f.run(["folders", "--project", project, "--prefix", "../outside"], server.env)).data
        .error.code,
      "INVALID_INPUT",
    );
    assert.equal(
      (await f.run([...args, "--config", join(f.root, "missing.json")], server.env)).data.error
        .code,
      "UPLOAD_CONFIG_MISSING",
    );
    assert.equal(server.requests.length, count);
    assert.deepEqual(await readdir(f.output), []);
  } finally {
    if (client) await client.close();
    await server.close();
    await f.cleanup();
  }
});
