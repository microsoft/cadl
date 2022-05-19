import { normalizePath } from "@cadl-lang/compiler";
import { relative } from "path";

export function relativeTo(from: string, to: string) {
  return normalizePath(relative(from, to));
}
