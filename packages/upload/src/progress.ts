import type { Effect } from "effect";

/** Transient transport progress, never evidence that R2 committed an object. */
export interface UploadProgress {
  key: string;
  fileIndex: number;
  fileCount: number;
  fileBytes: number;
  fileTotal: number;
  overallBytes: number;
  overallTotal: number;
  filePercent: number;
  overallPercent: number;
  publicOutcome?: "not_attempted" | "reachable" | "unreachable" | "unknown";
  phase: "sending" | "awaiting_confirmation" | "confirmed" | "public_check" | "public_result";
}
export type UploadProgressObserver = (progress: UploadProgress) => Effect.Effect<void>;
