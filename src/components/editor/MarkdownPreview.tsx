import { forwardRef, useDeferredValue, useLayoutEffect, useMemo, useRef } from "react";
import { compile } from "@/lib/markdownCompiler";

interface Props {
  source: string;
  darkMode?: boolean;
  onScroll?: React.UIEventHandler<HTMLDivElement>;
}

// Lazy-load mermaid so it doesn't inflate the initial bundle
let mermaidLoader: Promise<typeof import("mermaid").default> | null = null;
function getMermaid() {
  if (!mermaidLoader) {
    mermaidLoader = import("mermaid").then((m) => m.default);
  }
  return mermaidLoader;
}

// Track initialized theme so we only re-initialize when it changes
let mermaidInitTheme: string | null = null;

// Cache rendered SVGs keyed by diagram source. Because the preview HTML is fully
// regenerated on every keystroke, the DOM (and any rendered diagram) is replaced
// each time — without this cache, every diagram would re-render and flash on each
// edit. With it, unchanged diagrams are swapped back in synchronously (before
// paint), so only a genuinely new/edited diagram ever re-renders.
const SVG_CACHE_MAX = 60;
const svgCache = new Map<string, string>();
function svgCacheGet(code: string): string | undefined {
  const v = svgCache.get(code);
  if (v !== undefined) {
    svgCache.delete(code); // refresh LRU recency
    svgCache.set(code, v);
  }
  return v;
}
function svgCacheSet(code: string, svg: string) {
  if (svgCache.has(code)) svgCache.delete(code);
  svgCache.set(code, svg);
  if (svgCache.size > SVG_CACHE_MAX) {
    svgCache.delete(svgCache.keys().next().value!);
  }
}

function replaceWithSvg(el: HTMLElement, svg: string) {
  if (!el.isConnected) return;
  const div = document.createElement("div");
  div.className = "mermaid-diagram";
  div.innerHTML = svg;
  el.replaceWith(div);
}

const MarkdownPreview = forwardRef<HTMLDivElement, Props>(function MarkdownPreview(
  { source, darkMode = true, onScroll }: Props,
  ref,
) {
  const deferredSource = useDeferredValue(source);
  const html = useMemo(() => compile(deferredSource), [deferredSource]);
  const isPending = deferredSource !== source;
  const contentRef = useRef<HTMLDivElement>(null);

  // Render mermaid diagrams. useLayoutEffect (not useEffect) runs synchronously
  // after React commits the DOM but BEFORE the browser paints — so cached diagrams
  // are swapped in with zero visible flash and no layout shift on every keystroke.
  useLayoutEffect(() => {
    const container = contentRef.current;
    if (!container) return;
    const wrappers = Array.from(
      container.querySelectorAll<HTMLElement>(".mermaid-wrapper[data-mermaid]"),
    );
    if (!wrappers.length) return;

    // 1. Synchronously swap in any diagrams we've already rendered. This is the
    //    common case while typing, and runs before paint → no flash/jitter.
    const pending: HTMLElement[] = [];
    for (const el of wrappers) {
      const code = decodeURIComponent(el.getAttribute("data-mermaid") ?? "");
      if (!code.trim()) continue;
      const cached = svgCacheGet(code);
      if (cached) replaceWithSvg(el, cached);
      else pending.push(el);
    }
    if (!pending.length) return;

    // 2. Asynchronously render only the new/changed diagrams.
    let cancelled = false;
    (async () => {
      const mermaid = await getMermaid();
      if (cancelled) return;

      // Always render with the light theme — see .mermaid-diagram CSS (white card).
      const theme = "default";
      if (mermaidInitTheme !== theme) {
        mermaid.initialize({
          startOnLoad: false,
          theme,
          securityLevel: "loose",
          fontFamily: "Inter, sans-serif",
        });
        mermaidInitTheme = theme;
      }

      await Promise.all(
        pending.map(async (el, i) => {
          if (cancelled || !el.isConnected) return;
          const code = decodeURIComponent(el.getAttribute("data-mermaid") ?? "");
          const id = `mermaid-live-${i}-${Date.now()}`;
          try {
            const { svg } = await mermaid.render(id, code);
            if (cancelled) return;
            svgCacheSet(code, svg);
            replaceWithSvg(el, svg);
          } catch (err: any) {
            if (cancelled || !el.isConnected) return;
            const errDiv = document.createElement("div");
            errDiv.className = "mermaid-error";
            errDiv.textContent = `⚠ Diagram error: ${err?.message ?? String(err)}`;
            el.replaceWith(errDiv);
          }
        }),
      );
    })();

    return () => { cancelled = true; };
  }, [html, darkMode]);

  // Intercept in-page anchor clicks (footnotes, TOC links). The browser's default
  // hash jump pollutes the URL (interfering with the router) and aligns the target
  // to the top of the scrollport, which dumps the last footnote into a sea of
  // whitespace. Instead, scroll the preview container to centre the target.
  const handleAnchorClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
    const anchor = (e.target as HTMLElement).closest('a[href^="#"]') as HTMLAnchorElement | null;
    if (!anchor) return;
    // Kill the native fragment jump unconditionally. Browsers scroll EVERY
    // scrollable ancestor (including overflow:hidden layout containers) to bring
    // the target into view, which collapses the whole app shell. We never want
    // that — footnote/TOC navigation must stay inside the preview pane.
    e.preventDefault();
    const id = decodeURIComponent((anchor.getAttribute("href") || "").slice(1));
    if (!id) return;
    const container = e.currentTarget;
    let el: HTMLElement | null = null;
    try {
      el = container.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`);
    } catch {
      el = null;
    }
    if (!el) return;
    const cRect = container.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    // Bounded by the container's own scroll range, so it only moves the preview.
    const target =
      eRect.top - cRect.top + container.scrollTop - container.clientHeight / 2 + el.offsetHeight / 2;
    container.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  };

  return (
    <div
      ref={ref}
      onScroll={onScroll}
      onClick={handleAnchorClick}
      className="h-full overflow-y-auto bg-background transition-opacity duration-100"
      style={{ opacity: isPending ? 0.75 : 1 }}
    >
      <div
        ref={contentRef}
        className="preview-content max-w-3xl mx-auto px-8 py-8"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
});

export default MarkdownPreview;
