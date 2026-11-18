/** Small JSON-tree helpers shared by the `pipelineEditor` view model. */

import { BYPASS_KEY, type JsonPath } from "./types.js";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isBypassWrapper(value: unknown): value is Record<typeof BYPASS_KEY, unknown> {
  return isRecord(value) && BYPASS_KEY in value && Object.keys(value).length === 1;
}

/** Stable string form of a path, usable as an id. */
export function pathId(path: JsonPath): string {
  return path.map((segment) => (typeof segment === "number" ? String(segment) : `~${encodeURIComponent(segment)}`)).join("/");
}

export function getAt(root: unknown, path: JsonPath): unknown {
  let current: unknown = root;
  for (const segment of path) {
    if (Array.isArray(current) && typeof segment === "number") current = current[segment];
    else if (isRecord(current) && typeof segment === "string") current = current[segment];
    else return undefined;
  }
  return current;
}

/** Assign in a mutable draft. The parent container must exist. */
export function setAt(root: unknown, path: JsonPath, value: unknown): void {
  const key = path[path.length - 1];
  const parent = getAt(root, path.slice(0, -1));
  if (Array.isArray(parent) && typeof key === "number") parent[key] = value;
  else if (isRecord(parent) && typeof key === "string") parent[key] = value;
  else throw new Error(`Cannot assign at ${pathId(path)}`);
}

/** Remove an array element or an object key from a mutable draft. */
export function deleteAt(root: unknown, path: JsonPath): void {
  const key = path[path.length - 1];
  const parent = getAt(root, path.slice(0, -1));
  if (Array.isArray(parent) && typeof key === "number") parent.splice(key, 1);
  else if (isRecord(parent) && typeof key === "string") delete parent[key];
  else throw new Error(`Cannot delete at ${pathId(path)}`);
}

export function cloneJson<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

/** Rebuild an object with one key renamed or replaced, keeping key order. */
export function replaceKey(source: Record<string, unknown>, key: string, nextKey: string, nextValue: unknown): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(source)) {
    if (name === key) next[nextKey] = nextValue;
    else next[name] = value;
  }
  return next;
}

/** Replace the content of `target` in place, keeping its identity in the draft. */
export function overwriteRecord(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const name of Object.keys(target)) delete target[name];
  Object.assign(target, source);
}
