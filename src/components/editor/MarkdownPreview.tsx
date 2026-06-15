import { forwardRef, useDeferredValue, useEffect, useMemo, useRef } from "react";
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

const MarkdownPreview = forwardRef<HTMLDivElement, Props>(function MarkdownPreview(
  { source, darkMode = true, onScroll }: Props,
  ref,
) {
  const deferredSource = useDeferredValue(source);
  const html = useMemo(() => compile(deferredSource), [deferredSource]);
  const isPending = deferredSource !== source;
  const contentRef = useRef<HTMLDivElement>(null);

  // Render mermaid diagrams whenever the compiled HTML changes or dark mode switches
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;
    const wrappers = Array.from(
      container.querySelectorAll<HTMLElement>(".mermaid-wrapper[data-mermaid]"),
    );
    if (!wrappers.length) return;

    let cancelled = false;

    (async () => {
      const mermaid = await getMermaid();
      if (cancelled) return;

      const theme = darkMode ? "dark" : "default";
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
        wrappers.map(async (el, i) => {
          if (cancelled) return;
          const encoded = el.getAttribute("data-mermaid") ?? "";
          const code = decodeURIComponent(encoded);
          if (!code.trim()) return;

          const id = `mermaid-live-${i}-${Date.now()}`;
          try {
            const { svg } = await mermaid.render(id, code);
            if (cancelled) return;
            const wrapper = document.createElement("div");
            wrapper.className = "mermaid-diagram";
            wrapper.innerHTML = svg;
            // Only replace if the original placeholder is still in the DOM
            if (el.isConnected) el.replaceWith(wrapper);
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

    // If html or darkMode changes before rendering completes, abandon the in-flight renders
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
