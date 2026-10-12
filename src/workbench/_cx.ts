// Internal class-name join helper for the workbench domain (not exported).
export function cx(...parts: Array<string | false | null | undefined>): string | undefined {
  const resolved = parts.filter((p): p is string => typeof p === "string" && p.length > 0);
  return resolved.length > 0 ? resolved.join(" ") : undefined;
}
