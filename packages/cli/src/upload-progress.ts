import { Effect } from "effect";
import type { UploadProgress, UploadResult } from "@file-forge/upload";
import { messages, type Locale } from "./messages.js";

type Row = { key: string; percent: number | undefined; transfer: string; publicCheck: string };

// Escape user-controlled keys before writing terminal control sequences of our own.
const safe = (value: string) =>
  JSON.stringify(value).replace(
    /[\u007f-\uffff]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
const width = (value: string) =>
  Array.from(value).reduce((sum, char) => sum + (char.codePointAt(0)! >= 0x2e80 ? 2 : 1), 0);
const cell = (value: string, size: number) => {
  let clipped = value;
  if (width(clipped) > size) {
    clipped = clipped.slice(0, size - 3);
    while (width(clipped) > size - 3) clipped = clipped.slice(0, -1);
    clipped += "...";
  }
  return clipped + " ".repeat(Math.max(0, size - width(clipped)));
};

export const uploadReporter = (locale: Locale, mode: "auto" | "table" | "lines") => {
  const catalog = messages[locale];
  const rows = new Map<number, Row>();
  let latest: UploadProgress | undefined;
  let previous = "";
  let drawnLines = 0;
  let dimensions = "";
  const terminalFits = () =>
    process.stderr.isTTY &&
    (process.stderr.columns ?? 80) >= 79 &&
    (process.stderr.rows ?? 24) >= 10 &&
    process.env.TERM !== "dumb";
  const tableEnabled = () => mode === "table" || (mode === "auto" && terminalFits());
  const label = (value: string) => catalog.uploadTable.states[value] ?? value;
  const render = (final = false) => {
    if (!latest) return;
    const live = terminalFits();
    const capacity = Math.max(1, Math.min(8, (process.stderr.rows ?? 24) - 6));
    const entries = [...rows.entries()];
    const visible = final ? entries : entries.slice(-capacity);
    const line = (values: string[]) =>
      values.map((value, i) => cell(value, [4, 20, 6, 22, 14][i]!)).join(" | ");
    const output =
      [
        line(catalog.uploadTable.headers),
        "-".repeat(78),
        ...visible.map(([index, row]) =>
          line([
            String(index),
            safe(row.key),
            row.percent === undefined ? "-" : `${row.percent}%`,
            label(row.transfer),
            label(row.publicCheck),
          ]),
        ),
        cell(
          catalog.uploadTable.overall(latest.overallPercent, latest.fileIndex, latest.fileCount),
          78,
        ),
      ].join("\n") + "\n";
    if (output === previous) return;
    // If resized too small, append plain snapshots instead of moving across wrapped lines.
    const currentDimensions = `${process.stderr.columns}:${process.stderr.rows}`;
    if (live && drawnLines > 0 && dimensions === currentDimensions)
      process.stderr.write(`\u001b[${drawnLines}A\r\u001b[J`);
    process.stderr.write(output);
    drawnLines = live && !final ? visible.length + 3 : 0;
    previous = output;
    dimensions = currentDimensions;
  };
  return {
    progress: (progress: UploadProgress) =>
      Effect.sync(() => {
        if (
          latest &&
          latest.fileIndex === progress.fileIndex &&
          latest.filePercent === progress.filePercent &&
          latest.overallPercent === progress.overallPercent &&
          latest.phase === progress.phase &&
          latest.publicOutcome === progress.publicOutcome
        )
          return;
        latest = progress;
        rows.set(progress.fileIndex, {
          key: progress.key,
          percent: progress.filePercent,
          transfer:
            progress.phase === "public_check" || progress.phase === "public_result"
              ? "confirmed"
              : progress.phase,
          publicCheck:
            progress.publicOutcome ??
            (progress.phase === "public_check" ? "checking" : "not_attempted"),
        });
        if (tableEnabled()) render();
        else {
          const line = catalog.uploadProgress(progress);
          if (line !== previous) process.stderr.write(line + "\n");
          previous = line;
          drawnLines = 0;
        }
      }),
    finish: (result: UploadResult) =>
      Effect.sync(() => {
        if (!latest || !tableEnabled() || !("receipt" in result)) return;
        result.receipt.entries.forEach((entry, index) =>
          rows.set(index + 1, {
            key: entry.key,
            percent: entry.transfer === "uploaded" ? 100 : rows.get(index + 1)?.percent,
            transfer: entry.transfer === "uploaded" ? "confirmed" : entry.transfer,
            publicCheck: entry.publicCheck.outcome,
          }),
        );
        render(true);
      }),
  };
};
