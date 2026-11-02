import { createHash, createHmac } from "node:crypto";
import { Effect, FileSystem, Redacted, Stream } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { encodeKey, sha256, UploadError } from "./common.js";
import type { UploadConfig } from "./config.js";
import type { Entry } from "./plan.js";

const sign = (
  config: UploadConfig,
  method: "PUT" | "HEAD" | "GET",
  uri: string,
  query: string,
  payload: string,
  condition: Record<string, string>,
) => {
  const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = timestamp.slice(0, 8);
  const scope = `${day}/auto/s3/aws4_request`;
  const headers: Record<string, string> = {
    host: new URL(config.destination.endpoint).host,
    "x-amz-date": timestamp,
    "x-amz-content-sha256": payload,
    ...condition,
  };
  const names = Object.keys(headers).sort();
  const signedHeaders = names.join(";");
  const canonicalRequest = [
    method,
    uri,
    query,
    names.map((name) => `${name}:${headers[name]!.trim().replace(/\s+/g, " ")}\n`).join(""),
    signedHeaders,
    payload,
  ].join("\n");
  const hmac = (key: string | Buffer, data: string) =>
    createHmac("sha256", key).update(data).digest();
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${Redacted.value(config.secretKey)}`, day), "auto"), "s3"),
    "aws4_request",
  );
  const signature = hmac(
    signingKey,
    `AWS4-HMAC-SHA256\n${timestamp}\n${scope}\n${sha256(canonicalRequest)}`,
  ).toString("hex");
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${Redacted.value(config.accessKey)}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return HttpClientRequest.make(method)(
    config.destination.endpoint + uri + (query ? `?${query}` : ""),
    { headers },
  );
};
const signObject = (
  config: UploadConfig,
  method: "PUT" | "HEAD" | "GET",
  entry: Entry,
  condition: Record<string, string>,
) =>
  sign(
    config,
    method,
    `/${encodeKey(config.destination.bucket)}/${encodeKey(entry.key)}`,
    "",
    method === "PUT" ? entry.sha256 : sha256(""),
    {
      ...condition,
      ...(method === "PUT"
        ? { "content-type": entry.mime, "content-length": String(entry.size) }
        : {}),
    },
  );

export const listPage = (config: UploadConfig, prefix: string, token?: string) =>
  Effect.scoped(
    Effect.gen(function* () {
      const params: Record<string, string> = {
        "encoding-type": "url",
        "list-type": "2",
        "max-keys": "1000",
        prefix,
      };
      if (token) params["continuation-token"] = token;
      const query = Object.keys(params)
        .sort()
        .map((name) => `${name}=${encodeKey(params[name]!).replaceAll("/", "%2F")}`)
        .join("&");
      const client = yield* HttpClient.HttpClient;
      const response = yield* client.execute(
        sign(config, "GET", `/${encodeKey(config.destination.bucket)}`, query, sha256(""), {}),
      );
      if (response.status !== 200)
        return yield* Effect.fail(
          new UploadError({
            code:
              response.status === 401 || response.status === 403
                ? "UPLOAD_DENIED"
                : "BUCKET_LIST_FAILED",
          }),
        );
      const chunks: Buffer[] = [];
      let bytes = 0;
      yield* response.stream.pipe(
        Stream.runForEach((chunk) =>
          Effect.gen(function* () {
            bytes += chunk.length;
            if (bytes > 8 * 1024 * 1024)
              return yield* Effect.fail(new UploadError({ code: "BUCKET_LIST_LIMIT" }));
            chunks.push(Buffer.from(chunk));
          }),
        ),
      );
      return Buffer.concat(chunks).toString("utf8");
    }),
  ).pipe(
    Effect.timeout("30 seconds"),
    Effect.mapError((error) =>
      error instanceof UploadError ? error : new UploadError({ code: "BUCKET_LIST_FAILED" }),
    ),
  );

export const remoteHead = (config: UploadConfig, entry: Entry) =>
  Effect.scoped(
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;
      const response = yield* client.execute(signObject(config, "HEAD", entry, {}));
      return { status: response.status, etag: response.headers.etag };
    }),
  ).pipe(
    Effect.timeout("15 seconds"),
    Effect.mapError(() => new UploadError({ code: "UPLOAD_OUTCOME_UNKNOWN" })),
  );
export const remotePut = (
  config: UploadConfig,
  entry: Entry,
  snapshot: string,
  condition: Record<string, string>,
  onBytes?: (bytes: number) => Effect.Effect<void>,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;
      const fs = yield* FileSystem.FileSystem;
      const request = signObject(config, "PUT", entry, condition).pipe(
        HttpClientRequest.bodyStream(
          fs
            .stream(snapshot)
            .pipe(Stream.tap((chunk) => (onBytes ? onBytes(chunk.length) : Effect.void))),
          {
            contentType: entry.mime,
            contentLength: entry.size,
          },
        ),
      );
      const response = yield* client.execute(request);
      return response.status;
    }),
  ).pipe(
    Effect.timeout("120 seconds"),
    Effect.mapError(() => new UploadError({ code: "UPLOAD_OUTCOME_UNKNOWN" })),
  );
export const publicHead = (url: string) =>
  Effect.scoped(
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;
      const response = yield* client.execute(HttpClientRequest.head(url));
      return {
        outcome:
          response.status >= 200 && response.status < 300
            ? ("reachable" as const)
            : ("unreachable" as const),
        status: response.status,
        observedAt: new Date().toISOString(),
      };
    }),
  ).pipe(
    Effect.timeout("15 seconds"),
    Effect.catch(() =>
      Effect.succeed({ outcome: "unknown" as const, observedAt: new Date().toISOString() }),
    ),
  );
export const remoteDigest = (config: UploadConfig, entry: Entry, etag: string) =>
  Effect.scoped(
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;
      const response = yield* client.execute(
        signObject(config, "GET", entry, { "if-match": etag }),
      );
      if (response.status !== 200 || response.headers.etag !== etag) return "unknown" as const;
      let count = 0;
      const hash = createHash("sha256");
      yield* response.stream.pipe(
        Stream.runForEach((chunk) =>
          Effect.gen(function* () {
            count += chunk.length;
            if (count > entry.size)
              return yield* Effect.fail(new UploadError({ code: "UPLOAD_LIMIT_EXCEEDED" }));
            hash.update(chunk);
          }),
        ),
      );
      return count === entry.size && hash.digest("hex") === entry.sha256
        ? ("matches" as const)
        : ("differs" as const);
    }),
  ).pipe(
    Effect.timeout("120 seconds"),
    Effect.catch((error) =>
      Effect.succeed(
        error instanceof UploadError && error.code === "UPLOAD_LIMIT_EXCEEDED"
          ? ("differs" as const)
          : ("unknown" as const),
      ),
    ),
  );
