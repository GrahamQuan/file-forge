import { Effect } from "effect";
import { SaxesParser } from "saxes";
import { fail, safeRelative, UploadError } from "./common.js";
import type { UploadConfig } from "./config.js";
import { listPage } from "./r2.js";

function parsePage(xml: string) {
  const parser = new SaxesParser();
  const path: string[] = [];
  const keys: string[] = [];
  let truncated: string | undefined;
  let encoding: string | undefined;
  let token: string | undefined;
  let value = "";
  const invalid = (): never => {
    throw new Error("Invalid listing");
  };
  parser.on("doctype", invalid);
  parser.on("opentag", (tag) => {
    if (!path.length && tag.name !== "ListBucketResult") invalid();
    path.push(tag.name);
    value = "";
  });
  parser.on("text", (text) => {
    value += text;
  });
  parser.on("cdata", (text) => {
    value += text;
  });
  parser.on("closetag", () => {
    switch (path.join("/")) {
      case "ListBucketResult/Contents/Key":
        keys.push(decodeURIComponent(value));
        break;
      case "ListBucketResult/IsTruncated":
        truncated = value;
        break;
      case "ListBucketResult/EncodingType":
        encoding = value;
        break;
      case "ListBucketResult/NextContinuationToken":
        token = value;
        break;
    }
    path.pop();
    value = "";
  });
  parser.write(xml).close();
  if (
    encoding !== "url" ||
    (truncated !== "true" && truncated !== "false") ||
    (truncated === "true" && !token)
  )
    invalid();
  return { keys, next: truncated === "true" ? token : undefined };
}

export const listFolders = (config: UploadConfig, project: string, subfolder = "") =>
  Effect.gen(function* () {
    const relative = subfolder.replace(/\/$/, "");
    if (subfolder && !safeRelative(relative)) return yield* fail("INVALID_INPUT");
    const prefix = config.destination.prefix + (relative ? relative + "/" : "");
    const folders = new Set<string>();
    const tokens = new Set<string>();
    let next: string | undefined;
    do {
      if (tokens.size >= 100) return yield* fail("BUCKET_LIST_LIMIT");
      const xml = yield* listPage(config, prefix, next);
      const page = yield* Effect.try({
        try: () => parsePage(xml),
        catch: () => new UploadError({ code: "BUCKET_LIST_INVALID" }),
      });
      for (const key of page.keys) {
        if (!key.startsWith(prefix)) return yield* fail("BUCKET_LIST_INVALID");
        for (
          let slash = key.indexOf("/", prefix.length);
          slash !== -1;
          slash = key.indexOf("/", slash + 1)
        ) {
          folders.add(key.slice(0, slash + 1));
          if (folders.size > 10000) return yield* fail("BUCKET_LIST_LIMIT");
        }
      }
      next = page.next;
      if (next && tokens.has(next)) return yield* fail("BUCKET_LIST_INVALID");
      if (next) tokens.add(next);
    } while (next);
    return {
      status: "succeeded" as const,
      project,
      bucket: config.destination.bucket,
      prefix,
      folders: [...folders].sort(),
    };
  });
