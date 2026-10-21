import { fileURLToPath } from "node:url";
import { Context, Data, Effect, FileSystem, Layer, Path, Schema } from "effect";
import puppeteer, { type Browser } from "puppeteer-core";
import { posterScene } from "./poster-scene.js";

export const posterViews = ["front", "back", "left", "right", "top", "bottom"] as const;
export type PosterView = (typeof posterViews)[number];
const dimension = Schema.Number.check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 16, maximum: 4096 }),
);
export const PosterOptionsSchema = Schema.Struct({
  width: Schema.optional(dimension),
  height: Schema.optional(dimension),
  ratio: Schema.optional(Schema.String.check(Schema.isPattern(/^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/))),
});
export type PosterOptions = typeof PosterOptionsSchema.Type;
export class PosterError extends Data.TaggedError("PosterError")<{
  readonly code:
    | "INVALID_INPUT"
    | "POSTER_BROWSER_REQUIRED"
    | "POSTER_RENDER_FAILED"
    | "POSTER_TIMEOUT"
    | "POSTER_UNSUPPORTED_MODEL";
  readonly detail: string;
  readonly cause?: unknown;
}> {}
export const validatePosterOptions = (value: unknown) =>
  Schema.decodeUnknownEffect(PosterOptionsSchema)(value, { onExcessProperty: "error" }).pipe(
    Effect.mapError(
      () =>
        new PosterError({
          code: "INVALID_INPUT",
          detail:
            "Poster dimensions must be integers from 16 through 4096 and ratio must be positive W:H",
        }),
    ),
    Effect.flatMap((options) =>
      Effect.try({
        try: () => {
          const ratio =
            options.ratio ??
            (options.width !== undefined && options.height !== undefined
              ? `${options.width}:${options.height}`
              : "16:9");
          const [horizontal, vertical] = ratio.split(":").map(Number) as [number, number];
          const aspect = horizontal / vertical;
          if (![horizontal, vertical, aspect].every((value) => Number.isFinite(value) && value > 0))
            throw new Error("Invalid ratio");
          const width =
            options.width ??
            (options.height !== undefined
              ? Math.round(options.height * aspect)
              : Math.round(1024 * Math.min(aspect, 1)));
          const height =
            options.height ??
            (options.width === undefined && aspect < 1 ? 1024 : Math.round(width / aspect));
          if (
            ![width, height].every(
              (value) => Number.isInteger(value) && value >= 16 && value <= 4096,
            )
          )
            throw new Error("Derived dimension out of range");
          if (
            options.ratio !== undefined &&
            options.width !== undefined &&
            options.height !== undefined &&
            Math.round(width / aspect) !== height
          )
            throw new Error("Dimensions conflict with ratio");
          return { width, height, ratio };
        },
        catch: () =>
          new PosterError({
            code: "INVALID_INPUT",
            detail: "Use a positive W:H ratio with compatible dimensions from 16 through 4096",
          }),
      }),
    ),
  );
export class PosterConfig extends Context.Service<PosterConfig, { readonly executable?: string }>()(
  "@file-forge/media/PosterConfig",
) {}
export const posterLayer = (executable?: string) => Layer.succeed(PosterConfig, { executable });
const native = <A>(run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) =>
      new PosterError({
        code: "POSTER_RENDER_FAILED",
        detail: "3D poster rendering failed",
        cause,
      }),
  });
const supportedExtensions = new Set([
  "KHR_draco_mesh_compression",
  "EXT_meshopt_compression",
  "KHR_meshopt_compression",
  "KHR_mesh_quantization",
  "EXT_mesh_gpu_instancing",
  "KHR_lights_punctual",
  "KHR_materials_clearcoat",
  "KHR_materials_dispersion",
  "KHR_materials_ior",
  "KHR_materials_sheen",
  "KHR_materials_specular",
  "KHR_materials_transmission",
  "KHR_materials_iridescence",
  "KHR_materials_anisotropy",
  "KHR_materials_unlit",
  "KHR_materials_volume",
  "KHR_materials_emissive_strength",
  "EXT_materials_bump",
  "KHR_texture_transform",
  "EXT_texture_webp",
  "EXT_texture_avif",
]);
const validateGlb = (bytes: Buffer) =>
  Effect.try({
    try: () => {
      if (
        bytes.length < 20 ||
        bytes.readUInt32LE(0) !== 0x46546c67 ||
        bytes.readUInt32LE(4) !== 2 ||
        bytes.readUInt32LE(8) !== bytes.length ||
        bytes.readUInt32LE(16) !== 0x4e4f534a
      )
        throw new Error("Invalid GLB 2.0");
      let offset = 12;
      while (offset < bytes.length) {
        if (offset + 8 > bytes.length) throw new Error("Truncated GLB");
        const length = bytes.readUInt32LE(offset);
        if (length % 4 || offset + 8 + length > bytes.length) throw new Error("Invalid GLB chunk");
        offset += length + 8;
      }
      const json = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          bytes.subarray(20, 20 + bytes.readUInt32LE(12)),
        ),
      );
      if (json.asset?.version !== "2.0") throw new Error("Unsupported model version");
      for (const extension of [...(json.extensionsUsed ?? []), ...(json.extensionsRequired ?? [])])
        if (!supportedExtensions.has(extension))
          throw new Error(`Unsupported extension: ${extension}`);
      const visit = (value: unknown): void => {
        if (!value || typeof value !== "object") return;
        for (const [key, child] of Object.entries(value)) {
          if (
            key === "uri" &&
            typeof child === "string" &&
            !/^data:(image\/(png|jpeg|webp|avif)|application\/(octet-stream|gltf-buffer));base64,/.test(
              child,
            )
          )
            throw new Error("External or unsupported resource URI");
          visit(child);
        }
      };
      visit(json);
    },
    catch: (cause) =>
      new PosterError({
        code: "POSTER_UNSUPPORTED_MODEL",
        detail: "Select a self-contained supported GLB 2.0 model",
        cause,
      }),
  });

const closeBrowser = async (browser: Browser) => {
  const child = browser.process();
  const exited = () => !child || child.exitCode !== null || child.signalCode !== null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      browser.close(),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 10_000);
      }),
    ]).catch(() => {
      // A closed transport can reject close(); process exit below remains authoritative.
    });
  } finally {
    clearTimeout(timer);
  }
  // Only the child created by this adapter is eligible for termination.
  if (!exited()) {
    child!.kill("SIGTERM");
    for (let i = 0; i < 20 && !exited(); i++)
      await new Promise((resolve) => setTimeout(resolve, 100));
    if (!exited()) child!.kill("SIGKILL");
    for (let i = 0; i < 20 && !exited(); i++)
      await new Promise((resolve) => setTimeout(resolve, 100));
    if (!exited()) throw new Error("Owned poster browser did not exit");
  }
};

/** The browser is a rendering backend, with an isolated profile, pipe transport and no network assets. */
export const openPosterRenderer = (input: string, staging: string, options: PosterOptions) =>
  Effect.gen(function* () {
    const dimensions = yield* validatePosterOptions(options);
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const config = yield* PosterConfig;
    const candidates = config.executable
      ? [config.executable]
      : process.platform === "darwin"
        ? [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
          ]
        : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
    let executable: string | undefined;
    for (const candidate of candidates)
      if (path.isAbsolute(candidate) && (yield* fs.exists(candidate))) {
        executable = candidate;
        break;
      }
    if (!executable)
      return yield* new PosterError({
        code: "POSTER_BROWSER_REQUIRED",
        detail:
          "Install Chrome/Chromium or set FILE_FORGE_CHROME_PATH to its absolute executable path",
      });
    if (Number((yield* fs.stat(input)).size) > 256 * 1024 * 1024)
      return yield* new PosterError({
        code: "INVALID_INPUT",
        detail: "Poster input exceeds 256 MiB",
      });
    const bytes = Buffer.from(yield* fs.readFile(input));
    yield* validateGlb(bytes);
    const threeRoot = fileURLToPath(new URL("../", import.meta.resolve("three")));
    const resources = new Map<string, { body: string | Buffer; contentType: string }>();
    resources.set("/", {
      contentType: "text/html",
      body: '<!doctype html><html><head><script type="importmap">{"imports":{"three":"/build/three.module.js"}}</script></head><body><script type="module" src="/render.js"></script></body></html>',
    });
    resources.set("/render.js", {
      contentType: "text/javascript",
      body: posterScene.replace("__OPTIONS__", JSON.stringify(dimensions)),
    });
    resources.set("/model.glb", { contentType: "model/gltf-binary", body: bytes });
    for (const name of [
      "build/three.module.js",
      "build/three.core.js",
      "examples/jsm/loaders/GLTFLoader.js",
      "examples/jsm/loaders/DRACOLoader.js",
      "examples/jsm/utils/BufferGeometryUtils.js",
      "examples/jsm/utils/SkeletonUtils.js",
      "examples/jsm/environments/RoomEnvironment.js",
      "examples/jsm/libs/meshopt_decoder.module.js",
      "examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js",
      "examples/jsm/libs/draco/gltf/draco_decoder.wasm",
    ]) {
      resources.set(`/${name}`, {
        body: Buffer.from(yield* fs.readFile(path.join(threeRoot, name))),
        contentType: name.endsWith(".wasm") ? "application/wasm" : "text/javascript",
      });
    }
    const profile = path.join(staging, "browser-profile");
    const browser = yield* Effect.acquireRelease(
      native(() =>
        puppeteer.launch({
          executablePath: executable,
          headless: true,
          pipe: true,
          userDataDir: profile,
          handleSIGINT: false,
          handleSIGTERM: false,
          handleSIGHUP: false,
          timeout: 30_000,
          args: [
            "--use-gl=angle",
            "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
            "--disable-background-networking",
            "--disable-sync",
            "--no-first-run",
          ],
        }),
      ),
      (browser) => Effect.promise(() => closeBrowser(browser)),
    );
    const pid = browser.process()?.pid;
    yield* fs.writeFileString(
      path.join(staging, "browser-owner.json"),
      JSON.stringify({
        task: "model-posters",
        cwd: staging,
        pid,
        port: null,
        transport: "pipe",
        session: `worker-${process.pid}`,
        profile,
      }),
    );
    const page = yield* native(() => browser.newPage());
    yield* native(() => page.setRequestInterception(true));
    page.on("request", (request) => {
      const url = request.url();
      if (url.startsWith("blob:") || url.startsWith("data:")) {
        void request.continue().catch(() => {});
        return;
      }
      const resource = url.startsWith("https://file-forge.invalid/")
        ? resources.get(new URL(url).pathname)
        : undefined;
      void (
        resource ? request.respond({ status: 200, ...resource }) : request.abort("blockedbyclient")
      ).catch(() => {});
    });
    yield* native(() =>
      page.goto("https://file-forge.invalid/", { waitUntil: "load", timeout: 30_000 }),
    );
    const renderer = yield* native(
      () =>
        page.evaluate("globalThis.fileForgeReady") as Promise<{
          threeVersion: string;
          pose: string;
          projection: string;
          background: string;
          lighting: string;
        }>,
    );
    const browserVersion = yield* native(() => browser.version());
    const render = (view: PosterView, output: string) =>
      Effect.gen(function* () {
        const frame = yield* native(
          () =>
            page.evaluate(`globalThis.fileForgeRender(${JSON.stringify(view)})`) as Promise<{
              png: string;
              position: number[];
              target: number[];
              up: number[];
              orthographicScale: number;
            }>,
        );
        const png = Buffer.from(frame.png, "base64");
        // Keep the render lossless; the shared image workflow owns final encoding/publication.
        yield* fs.writeFile(output, png, { flag: "wx" });
        return {
          view,
          output,
          width: dimensions.width,
          height: dimensions.height,
          size: png.length,
          camera: {
            position: frame.position,
            target: frame.target,
            up: frame.up,
            orthographicScale: frame.orthographicScale,
          },
        };
      }).pipe(
        Effect.timeoutOrElse({
          duration: "60 seconds",
          orElse: () =>
            Effect.fail(
              new PosterError({ code: "POSTER_TIMEOUT", detail: "Poster render timed out" }),
            ),
        }),
      );
    return { render, dimensions, renderer: { ...renderer, browserVersion }, pid };
  }).pipe(
    Effect.timeoutOrElse({
      duration: "90 seconds",
      orElse: () =>
        Effect.fail(
          new PosterError({ code: "POSTER_TIMEOUT", detail: "Poster initialization timed out" }),
        ),
    }),
  );
