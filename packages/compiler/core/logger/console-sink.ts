import { codeFrameColumns } from "@babel/code-frame";
import pc from "picocolors";
import { Formatter } from "picocolors/types";
import { LogLevel, LogSink, ProcessedLog, SourceLocation } from "../types.js";

export interface FormatLogOptions {
  pretty?: boolean;
}

export interface ConsoleSinkOptions extends FormatLogOptions {}

export function createConsoleSink(options: ConsoleSinkOptions = {}): LogSink {
  function log(data: ProcessedLog) {
    // eslint-disable-next-line no-console
    console.log(formatLog(data, options));
  }

  return {
    log,
  };
}

export function formatLog(log: ProcessedLog, options: FormatLogOptions): string {
  const code = color(options, log.code ? ` ${log.code}` : "", pc.gray);
  const level = formatLevel(options, log.level);
  const content = `${level}${code}: ${log.message}`;
  const location = log.sourceLocation;
  if (location?.file) {
    const formattedLocation = formatSourceLocation(options, location);
    const sourcePreview = formatSourcePreview(options, location);
    return `${formattedLocation} - ${content}${sourcePreview}`;
  } else {
    return content;
  }
}

function color(options: FormatLogOptions, text: string, color: Formatter) {
  return options.pretty ? color(text) : text;
}

function formatLevel(options: FormatLogOptions, level: LogLevel) {
  switch (level) {
    case "error":
      return color(options, "error", pc.red);
    case "warning":
      return color(options, "warning", pc.yellow);
    default:
      return level;
  }
}

function formatSourceLocation(options: FormatLogOptions, location: SourceLocation) {
  const postition = getLineAndColumn(location);
  const path = color(options, location.file.path, pc.cyan);

  const line = color(options, postition.start.line.toString(), pc.yellow);
  const column = color(options, postition.start.column.toString(), pc.yellow);
  return `${path}:${line}:${column}`;
}

/**
 * Create a preview of where the log location is.
 *
 * ----------------------------------------------
 *   4 |
 *   5 | @route("/alpha/{id}")
 * > 6 | op doAlpha(@path id: string): abc;
 *     |                               ^
 *   7 |
 *   8 | @route("/beta/{id}")
 *   9 | op doBeta(@path id: string): string;
 */
function formatSourcePreview(options: FormatLogOptions, location: SourceLocation) {
  if (!options.pretty) {
    return "";
  }
  const postion = getLineAndColumn(location);

  const result = codeFrameColumns(location.file.text, postion, {
    linesAbove: 0,
    linesBelow: 0,
  });
  return `\n${result}`;
}

interface RealLocation {
  start: { line: number; column: number };
  end?: { line: number; column: number };
}

function getLineAndColumn(location: SourceLocation): RealLocation {
  const pos = location.file.getLineAndCharacterOfPosition(location.pos ?? 0);
  const end = location.end ? location.file.getLineAndCharacterOfPosition(location.end) : undefined;
  const result: RealLocation = {
    start: { line: pos.line + 1, column: pos.character + 1 },
  };
  if (end) {
    result.end = { line: end.line + 1, column: end.character + 1 };
  }
  return result;
}
