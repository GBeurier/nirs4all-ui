/**
 * Capsule-scoped keyboard shortcuts. Bindings are matched on the capsule
 * root's `onKeyDown` (never `window`), and ignored while typing in an input,
 * so two capsules on one page never fight and popovers keep Escape.
 */

import { type KeyboardEvent, type ReactNode } from "react";

import { KeyHint } from "./controls.js";

export interface ShortcutBinding {
  /** e.g. `"mod+z"`, `"shift+mod+z"`, `"escape"`, `"?"`, `"1"`. `mod` = Ctrl or ⌘. */
  keys: string;
  label: string;
  group?: string | undefined;
  run: () => void;
  /** Hide from the help dialog. */
  hidden?: boolean | undefined;
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function matchesShortcut(keys: string, event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">): boolean {
  const parts = keys.toLowerCase().split("+");
  const key = parts[parts.length - 1]!;
  const wantMod = parts.includes("mod");
  const wantShift = parts.includes("shift");
  const wantAlt = parts.includes("alt");
  const mod = event.ctrlKey || event.metaKey;
  const pressed = event.key.toLowerCase();
  const keyMatches = pressed === key || (key === "escape" && pressed === "esc");
  // `?` implies shift on most layouts: do not require an explicit shift part.
  const shiftOk = key === "?" ? true : wantShift === event.shiftKey;
  return keyMatches && wantMod === mod && shiftOk && wantAlt === event.altKey;
}

/** Dispatch a keydown to the first matching binding. Returns true when handled. */
export function dispatchShortcut(event: KeyboardEvent, bindings: readonly ShortcutBinding[]): boolean {
  if (isEditable(event.target) && event.key !== "Escape") return false;
  for (const binding of bindings) {
    if (matchesShortcut(binding.keys, event)) {
      event.preventDefault();
      event.stopPropagation();
      binding.run();
      return true;
    }
  }
  return false;
}

export function formatShortcut(keys: string): ReactNode {
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  return keys.split("+").map((part, i) => (
    <KeyHint key={i}>
      {part === "mod" ? (isMac ? "⌘" : "Ctrl") : part === "shift" ? "⇧" : part === "alt" ? (isMac ? "⌥" : "Alt") : part === "escape" ? "Esc" : part.toUpperCase()}
    </KeyHint>
  ));
}

export function ShortcutsDialog({
  bindings,
  onClose,
  title = "Keyboard shortcuts",
  gestures,
}: {
  bindings: readonly ShortcutBinding[];
  onClose: () => void;
  title?: string | undefined;
  /** Mouse gesture help rows `[gesture, effect]`. */
  gestures?: ReadonlyArray<readonly [string, string]> | undefined;
}) {
  const groups = new Map<string, ShortcutBinding[]>();
  for (const binding of bindings) {
    if (binding.hidden) continue;
    const group = binding.group ?? "General";
    const bucket = groups.get(group);
    if (bucket) bucket.push(binding);
    else groups.set(group, [binding]);
  }
  return (
    <div className="n4wb-dialog-scrim" onClick={onClose}>
      <div className="n4wb-dialog" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <header className="n4wb-dialog-head">
          <strong>{title}</strong>
          <button type="button" className="n4wb-icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="n4wb-shortcuts">
          {[...groups.entries()].map(([group, entries]) => (
            <section key={group}>
              <h4>{group}</h4>
              <dl>
                {entries.map((binding) => (
                  <div key={binding.keys} className="n4wb-shortcut-row">
                    <dt>{binding.label}</dt>
                    <dd>{formatShortcut(binding.keys)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
          {gestures?.length ? (
            <section>
              <h4>Mouse</h4>
              <dl>
                {gestures.map(([gesture, effect]) => (
                  <div key={gesture} className="n4wb-shortcut-row">
                    <dt>{effect}</dt>
                    <dd>
                      <KeyHint>{gesture}</KeyHint>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
