import { test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, basename } from "node:path";
import sharp from "sharp";

test("folder CLI preserves sources, normalizes hierarchy, handles partial failure and rejects collisions", async () => {
  const root = await mkdtemp(join(tmpdir(), "file-forge-folder-"));
  const cli = (...args) =>
    spawnSync(process.execPath, [resolve("packages/cli/bin/file-forge.js"), ...args, "--json"], {
      encoding: "utf8",
      timeout: 30000,
      env: { ...process.env, FILE_FORGE_CONFIG_DIR: join(root, "config") },
    });
  try {
    const input = join(root, "Example.COM");
    const nested = join(input, "Some_Route+Name");
    await mkdir(join(nested, "Empty Dir"), { recursive: true });
    const image = join(nested, "Some Example.PNG");
    await sharp({ create: { width: 1200, height: 600, channels: 3, background: "red" } })
      .png()
      .toFile(image);
    const original = await readFile(image);
    await writeFile(join(input, "Read Me.txt"), "unchanged bytes");
    await writeFile(join(input, ".DS_Store"), "metadata");
    await symlink(image, join(input, "Link.png"));
    const video = join(nested, "My Clip.mp4");
    const made = spawnSync(
      process.env.FFMPEG_PATH || "ffmpeg",
      [
        "-nostdin",
        "-hide_banner",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=800x600:rate=10:duration=0.2",
        "-c:v",
        "libx264",
        video,
      ],
      { encoding: "utf8", timeout: 30000 },
    );
    assert.equal(made.status, 0, made.stderr);
    const videoOriginal = await readFile(video);
    const untouchedModel = join(nested, "Untouched.glb");
    await writeFile(untouchedModel, "not decoded when excluded");
    for (const selection of ["images", "videos"]) {
      const result = cli(
        "folder",
        "compress",
        input,
        "--media",
        selection,
        "--width",
        "512",
        "--output",
        join(root, "selected"),
      );
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const manifest = JSON.parse(result.stdout);
      assert.equal(manifest.parameters.image.media, selection);
      const selected = manifest.assets.find(
        (a) =>
          a.originalName === basename(selection === "images" ? image : video) &&
          !a.assetId.endsWith("-cover"),
      );
      assert.equal(selected.outputWidth, 512);
      assert.equal(selected.outputHeight, selection === "images" ? 256 : 384);
      const excludedSource = selection === "images" ? video : image;
      const excluded = manifest.assets.find((a) => a.originalName === basename(excludedSource));
      assert.deepEqual(await readFile(excluded.output), await readFile(excludedSource));
      assert.ok(excluded.output.endsWith(selection === "images" ? ".mp4" : ".png"));
      assert.deepEqual(
        await readFile(
          manifest.assets.find((a) => a.originalName === basename(untouchedModel)).output,
        ),
        await readFile(untouchedModel),
      );
      assert.equal(manifest.assets.filter((a) => a.view).length, 0);
      assert.equal(
        manifest.assets.filter((a) => a.assetId.endsWith("-cover")).length,
        selection === "videos" ? 1 : 0,
      );
    }
    assert.equal(
      cli(
        "folder",
        "compress",
        input,
        "--media",
        "audio",
        "--output",
        join(root, "invalid-selection"),
      ).status,
      2,
    );
    assert.ok(!(await readdir(root)).includes("invalid-selection"));
    await rm(untouchedModel);

    for (const [args, dimensions] of [
      [[], [1200, 600]],
      [
        ["--width", "300"],
        [300, 150],
      ],
      [
        ["--height", "100"],
        [200, 100],
      ],
      [
        ["--width", "400", "--height", "100"],
        [200, 100],
      ],
    ]) {
      const result = cli("folder", "compress", input, ...args, "--output", join(root, "out"));
      assert.equal(result.status, 0, result.stderr);
      const manifest = JSON.parse(result.stdout);
      assert.equal(manifest.schemaVersion, 2);
      assert.equal(manifest.status, "succeeded");
      const output = join(manifest.directory, "example-com", "some-route-name");
      const meta = await sharp(join(output, "some-example.webp")).metadata();
      assert.deepEqual([meta.width, meta.height], dimensions);
      assert.deepEqual(await readdir(join(output, "empty-dir")), []);
      assert.equal(
        await readFile(join(manifest.directory, "example-com", "read-me.txt"), "utf8"),
        "unchanged bytes",
      );
      assert.equal(manifest.assets.filter((a) => a.status === "skipped").length, 2);
      const cover = await sharp(join(output, "my-clip.webp")).metadata();
      const encoded = manifest.assets.find((a) => a.kind === "video");
      assert.deepEqual([cover.width, cover.height], [encoded.outputWidth, encoded.outputHeight]);
      if (!args.length) assert.deepEqual([encoded.outputWidth, encoded.outputHeight], [800, 600]);
      assert.equal(encoded.outputWidth % 2, 0);
      assert.equal(encoded.outputHeight % 2, 0);
      const exported = cli(
        "manifest",
        "export",
        "--manifest",
        join(manifest.directory, "manifest.json"),
        "--output",
        join(root, "exports"),
      );
      assert.equal(exported.status, 0, exported.stderr);
      assert.deepEqual(JSON.parse(exported.stdout).assets, manifest.assets);
      assert.equal(
        (await readdir(manifest.directory)).some((n) => n.startsWith(".folder-")),
        false,
      );
    }
    assert.deepEqual(await readFile(image), original);
    assert.deepEqual(await readFile(video), videoOriginal);
    assert.equal(cli("folder", "compress", input, "--output", join(input, "new", "out")).status, 2);
    await symlink(input, join(root, "alias"));
    assert.equal(
      cli("folder", "compress", input, "--output", join(root, "alias", "out")).status,
      2,
    );
    const conflictingImage = join(nested, "My Clip.png");
    await writeFile(conflictingImage, original);
    const coverCollision = cli(
      "folder",
      "compress",
      input,
      "--output",
      join(root, "cover-collision"),
    );
    assert.equal(coverCollision.status, 2, coverCollision.stderr);
    assert.equal((await readdir(root)).includes("cover-collision"), false);
    assert.deepEqual(await readFile(conflictingImage), original);
    await rm(conflictingImage);
    await writeFile(join(input, "Broken.png"), "invalid image");
    const partial = cli("folder", "compress", input, "--output", join(root, "partial"));
    assert.equal(JSON.parse(partial.stdout).status, "partial");
    await writeFile(join(nested, "Some+Example.jpg"), original);
    const collision = cli("folder", "compress", input, "--output", join(root, "collision"));
    assert.equal(collision.status, 2, collision.stderr);
    assert.equal((await readdir(root)).includes("collision"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
