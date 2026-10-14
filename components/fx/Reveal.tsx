"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Word-by-word blur-up reveal. Re-runs when `text` changes. */
export function RevealText({
  text,
  className,
  delay = 0,
  step = 55,
  wordClassName,
}: {
  text: string;
  className?: string;
  delay?: number;
  step?: number;
  wordClassName?: (word: string, i: number) => string | undefined;
}) {
  const words = text.split(" ");
  return (
    <span key={text} className={className} aria-label={text}>
      {words.map((w, i) => (
        <span key={i} aria-hidden className="inline-block overflow-hidden pb-[0.08em] align-bottom">
          <span
            className={cn("rise inline-block", wordClassName?.(w, i))}
            style={{ animationDelay: `${delay + i * step}ms` }}
          >
            {w}
            {i < words.length - 1 ? " " : ""}
          </span>
        </span>
      ))}
    </span>
  );
}

const GLYPHS = "0123456789$%#§";

/** Scrambles characters, then settles on the final value (left to right). */
export function DecodeText({ value, className, ms = 900 }: { value: string; className?: string; ms?: number }) {
  const [out, setOut] = useState(value);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const settled = Math.floor(p * value.length);
      setOut(
        value
          .split("")
          .map((c, i) => (i < settled || c === " " || c === "," || c === "." ? c : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]))
          .join(""),
      );
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return <span className={cn("tabular-nums", className)}>{out}</span>;
}

/** Eased count-up from 0 to target when `run` is true. */
export function useCountUp(target: number, run: boolean, ms = 1600) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!run) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - p, 4))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // rAF pauses in background/unfocused tabs; always land on the final value.
    const done = setTimeout(() => setV(target), ms + 100);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(done);
    };
  }, [target, run, ms]);
  return run ? v : 0;
}
