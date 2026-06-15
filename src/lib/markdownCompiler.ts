import { marked } from "marked";
import katex from "katex";
import DOMPurify from "dompurify";
import hljs from "highlight.js";

const MATH_ENVS = [
  "align", "align*", "aligned", "equation", "equation*",
  "gather", "gather*", "matrix", "pmatrix", "bmatrix",
  "vmatrix", "Vmatrix", "Bmatrix", "cases", "array", "split",
];

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderMath(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      strict: "ignore" as const,
      output: "html",
    });
  } catch (e) {
    return `<span style="color:#dc2626">${escapeHtml(tex)}</span>`;
  }
}

function processLatex(text: string, mathStore: string[]): string {
  const stash = (html: string) => {
    mathStore.push(html);
    return `\x00MATH${mathStore.length - 1}\x00`;
  };

  // $$...$$ display (process first so it strips wrapping dollars around envs)
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_m, t) => stash(renderMath(t, true)));
  // \[...\] display
  text = text.replace(/\\\[([\s\S]+?)\\\]/g, (_m, t) => stash(renderMath(t, true)));

  // Environments (bare, not wrapped in $$)
  const envPattern = new RegExp(
    `\\\\begin\\{(${MATH_ENVS.map((e) => e.replace("*", "\\*")).join("|")})\\}([\\s\\S]*?)\\\\end\\{\\1\\}`,
    "g",
  );
  text = text.replace(envPattern, (m) => stash(renderMath(m, true)));

  // \(...\) inline
  text = text.replace(/\\\(([\s\S]+?)\\\)/g, (_m, t) => stash(renderMath(t, false)));
  // $...$ inline
  text = text.replace(
    /(?<!\$)\$(?!\$)((?:[^$\\\n]|\\[\s\S])+?)\$(?!\$)/g,
    (_m, t) => stash(renderMath(t, false)),
  );

  return text;
}

// LRU compile cache — avoids recompiling unchanged source (e.g. during layout shifts)
const CACHE_MAX = 8;
const _compileCache = new Map<string, string>();

export function compile(source: string): string {
  if (_compileCache.has(source)) return _compileCache.get(source)!;

  const result = _compile(source);

  if (_compileCache.size >= CACHE_MAX) {
    _compileCache.delete(_compileCache.keys().next().value!);
  }
  _compileCache.set(source, result);
  return result;
}

function _compile(source: string): string {
  // Protect code blocks
  const codePlaceholders: string[] = [];
  let src = source.replace(/```[\s\S]*?```/g, (m) => {
    codePlaceholders.push(m);
    return `\x00CODE${codePlaceholders.length - 1}\x00`;
  });
  src = src.replace(/`[^`\n]+`/g, (m) => {
    codePlaceholders.push(m);
    return `\x00CODE${codePlaceholders.length - 1}\x00`;
  });

  const mathStore: string[] = [];
  src = processLatex(src, mathStore);

  // Restore code
  src = src.replace(/\x00CODE(\d+)\x00/g, (_m, i) => codePlaceholders[+i]);

  const renderer = new marked.Renderer();
  renderer.code = function (token: any) {
    const text = (typeof token === "object" ? token.text : token) || "";
    const lang = ((typeof token === "object" ? token.lang : "") || "").split(/\s/)[0];
    let highlighted: string;
    if (lang && hljs.getLanguage(lang)) {
      try {
        highlighted = hljs.highlight(text, { language: lang, ignoreIllegals: true }).value;
      } catch {
        highlighted = escapeHtml(text);
      }
    } else {
      highlighted = hljs.highlightAuto(text).value;
    }
    return `<pre><code class="hljs language-${escapeHtml(lang)}">${highlighted}</code></pre>`;
  };

  marked.setOptions({ renderer, gfm: true, breaks: true });
  let html = marked.parse(src) as string;

  // Restore math (after marked, before sanitize so KaTeX HTML is sanitized intact)
  html = html.replace(/\x00MATH(\d+)\x00/g, (_m, i) => mathStore[+i]);

  return DOMPurify.sanitize(html, {
    ADD_TAGS: [
      "math", "mrow", "mi", "mo", "mn", "msup", "msub", "mfrac", "mover",
      "munder", "mspace", "mtext", "mtable", "mtr", "mtd", "semantics",
      "annotation", "svg", "path", "g", "use", "defs", "line",
    ],
    ADD_ATTR: [
      "style", "class", "xmlns", "aria-hidden", "focusable", "viewBox",
      "width", "height", "fill", "stroke", "stroke-width", "d", "cx", "cy",
      "r", "points", "transform", "x", "y", "x1", "x2", "y1", "y2",
      "preserveAspectRatio",
    ],
  });
}

export function generateHTMLDocument(source: string, title: string): string {
  const body = compile(source);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" crossorigin="anonymous" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
<style>
  body { font-family: 'Inter', sans-serif; max-width: 760px; margin: 0 auto; padding: 2.5rem 2rem; line-height: 1.55; color: #0f172a; text-align: justify; hyphens: auto; }
  h1, h2, h3, h4 { font-family: 'Inter', sans-serif; line-height: 1.25; margin-top: 1.4em; }
  h1 { font-size: 2rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.3em; }
  h2 { font-size: 1.5rem; }
  h3 { font-size: 1.2rem; }
  p { margin: 0.7em 0; }
  code { font-family: 'JetBrains Mono', monospace; background: #f8fafc; border: 1px solid #cbd5e1; color: #1e293b; padding: 0.1em 0.35em; border-radius: 4px; font-size: 0.88em; }
  pre { background: #ffffff; color: #1e293b; border: 1.5px solid #94a3b8; border-left: 4px solid #7c3aed; border-radius: 6px; padding: 1rem; overflow-x: auto; font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; }
  pre code { background: transparent; border: none; padding: 0; }
  blockquote { border-left: 4px solid #7c3aed; background: #f5f3ff; padding: 0.6rem 1rem; margin: 1rem 0; border-radius: 0 6px 6px 0; }
  table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
  th, td { border: 1px solid #e2e8f0; padding: 0.5rem 0.75rem; text-align: left; }
  th { background: #f1f5f9; }
  tr:nth-child(even) td { background: #f8fafc; }
  .katex-display { background: #faf5ff; border: 1px solid #ddd6fe; border-radius: 0.5rem; padding: 1rem; overflow-x: auto; }
  img { max-width: 100%; }
  hr { border: none; border-top: 1px solid #e2e8f0; margin: 1.5rem 0; }
  @media print {
    @page { size: A4; margin: 1.8cm 1.8cm 2cm 1.8cm; }
    html, body { font-size: 10pt; }
    body { max-width: none; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    pre, blockquote, table { page-break-inside: avoid; }
    h1, h2, h3 { page-break-after: avoid; }
  }
</style>
</head>
<body>
${body}
</body>
</html>`;
}
