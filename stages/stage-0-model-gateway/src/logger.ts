import type {
  ErrorLog,
  RequestLog,
  RequestLogger,
  ResponseLog,
} from "./types.js";

export type LogLevel = "silent" | "error" | "info";

function toJson(entry: RequestLog | ResponseLog | ErrorLog): string {
  return JSON.stringify(entry);
}

export function createConsoleLogger(level: LogLevel = "info"): RequestLogger {
  return {
    logRequest(entry: RequestLog) {
      if (level === "info") {
        console.log(toJson(entry));
      }
    },
    logResponse(entry: ResponseLog) {
      if (level === "info") {
        console.log(toJson(entry));
      }
    },
    logError(entry: ErrorLog) {
      if (level === "info" || level === "error") {
        console.error(toJson(entry));
      }
    },
  };
}
