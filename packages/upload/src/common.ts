import { createHash } from "node:crypto";
import { Data, Effect, Schema } from "effect";

export class UploadError extends Data.TaggedError("UploadError")<{
  readonly code: string;
  readonly field?: string;
  readonly receiptPath?: string;
  readonly remoteOutcome?: "unknown";
}> {}
export const fail = (code: string, field?: string) =>
  Effect.fail(new UploadError({ code, ...(field ? { field } : {}) }));
export const decode = <S extends Schema.Top>(
  schema: S,
  value: unknown,
  code = "UPLOAD_PLAN_INVALID",
) =>
  Schema.decodeUnknownEffect(schema)(value, { onExcessProperty: "error" }).pipe(
    Effect.mapError(() => new UploadError({ code })),
  );
export const sha256 = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
export const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
};
export const hasControls = (value: string) =>
  Array.from(value).some(
    (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
  );
export const safeRelative = (value: string) =>
  value.length > 0 &&
  !value.includes("\\") &&
  !hasControls(value) &&
  value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
export const encodeKey = (key: string) =>
  key
    .split("/")
    .map((part) =>
      encodeURIComponent(part).replace(
        /[!'()*]/g,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
      ),
    )
    .join("/");
export const text = Schema.String.check(Schema.isMinLength(1));
export const digest = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/));
export const Destination = Schema.Struct({
  endpoint: text,
  bucket: text,
  region: Schema.Literal("auto"),
  prefix: Schema.String,
  publicBaseUrl: text,
});
export type Destination = typeof Destination.Type;

// JSON.parse alone accepts duplicate keys. This bounded parser first checks every object scope.
export const parseJson = (source: string): unknown => {
  let at = 0;
  const space = () => {
    while (/\s/.test(source[at] ?? "") && at < source.length) at++;
  };
  const string = (): string => {
    const start = at++;
    while (at < source.length) {
      const c = source[at++];
      if (c === "\\") at++;
      else if (c === '"') return JSON.parse(source.slice(start, at)) as string;
    }
    throw new Error("Invalid JSON");
  };
  const visit = (depth: number): void => {
    if (depth > 32) throw new Error("Invalid JSON");
    space();
    const c = source[at];
    if (c === '"') {
      string();
      return;
    }
    if (c === "{" || c === "[") {
      at++;
      space();
      const end = c === "{" ? "}" : "]";
      const keys = new Set<string>();
      if (source[at] === end) {
        at++;
        return;
      }
      for (;;) {
        space();
        if (c === "{") {
          if (source[at] !== '"') throw new Error("Invalid JSON");
          const key = string();
          if (keys.has(key)) throw new Error("Duplicate key");
          keys.add(key);
          space();
          if (source[at++] !== ":") throw new Error("Invalid JSON");
        }
        visit(depth + 1);
        space();
        const separator = source[at++];
        if (separator === end) return;
        if (separator !== ",") throw new Error("Invalid JSON");
      }
    }
    const start = at;
    while (at < source.length && !/[\s,}\]]/.test(source[at]!)) at++;
    if (start === at) throw new Error("Invalid JSON");
    JSON.parse(source.slice(start, at));
  };
  visit(0);
  space();
  if (at !== source.length) throw new Error("Invalid JSON");
  return JSON.parse(source);
};
