// noop logger shouldn't be used in browser

import { LogSink, ProcessedLog } from "../types.js";

export function createConsoleSink(options: any): LogSink {
  function log(data: ProcessedLog) {
    // eslint-disable-next-line no-console
    console.log(formatLog(data));
  }

  return {
    log,
  };
}

export function formatLog(log: ProcessedLog): string {
  return JSON.stringify(log);
}
