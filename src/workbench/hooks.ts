import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export interface ElementSize {
  width: number;
  height: number;
}

/**
 * Track an element's content-box size. Falls back to `fallback` during SSR or
 * in environments without `ResizeObserver` (tests), so components still render
 * a deterministic first frame.
 */
export function useElementSize<T extends HTMLElement>(fallback: ElementSize): [RefObject<T | null>, ElementSize] {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<ElementSize>(fallback);
  useIsoLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      const width = Math.max(0, Math.floor(rect.width));
      const height = Math.max(0, Math.floor(rect.height));
      setSize((previous) => (previous.width === width && previous.height === height ? previous : { width, height }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, size];
}

/**
 * Prepare a canvas for crisp HiDPI drawing and run `draw` whenever its inputs
 * change. `draw` receives a context already scaled to CSS pixels.
 */
export function useCanvasDraw(
  ref: RefObject<HTMLCanvasElement | null>,
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): void {
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || width <= 0 || height <= 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ratio = typeof window === "undefined" ? 1 : Math.min(2, window.devicePixelRatio || 1);
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    draw(ctx);
  }, [ref, width, height, draw]);
}

/** Coalesce rapid calls (pointer moves) to one per animation frame. */
export function useRafCallback<A extends unknown[]>(callback: (...args: A) => void): (...args: A) => void {
  const frame = useRef<number | null>(null);
  const latest = useRef(callback);
  latest.current = callback;
  const pending = useRef<A | null>(null);
  useEffect(
    () => () => {
      if (frame.current !== null && typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(frame.current);
    },
    [],
  );
  return useCallback((...args: A) => {
    pending.current = args;
    if (frame.current !== null) return;
    if (typeof requestAnimationFrame === "undefined") {
      latest.current(...args);
      return;
    }
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (pending.current) latest.current(...pending.current);
    });
  }, []);
}

/** Controlled/uncontrolled state pair (value wins when the host provides it). */
export function useControllable<T>(value: T | undefined, defaultValue: T, onChange?: (next: T) => void): [T, (next: T) => void] {
  const [internal, setInternal] = useState<T>(defaultValue);
  const controlled = value !== undefined;
  const current = controlled ? value : internal;
  const set = useCallback(
    (next: T) => {
      if (!controlled) setInternal(next);
      onChange?.(next);
    },
    [controlled, onChange],
  );
  return [current, set];
}
