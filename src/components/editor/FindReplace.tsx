import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Props {
  source: string;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  showReplace: boolean;
  onToggleReplace: () => void;
  onChange: (newSource: string) => void;
  onClose: () => void;
}

function findMatches(source: string, term: string, caseSensitive: boolean): number[] {
  if (!term) return [];
  const positions: number[] = [];
  const haystack = caseSensitive ? source : source.toLowerCase();
  const needle = caseSensitive ? term : term.toLowerCase();
  let pos = 0;
  while (pos <= haystack.length - needle.length) {
    const idx = haystack.indexOf(needle, pos);
    if (idx === -1) break;
    positions.push(idx);
    pos = idx + Math.max(needle.length, 1);
  }
  return positions;
}

function scrollTextareaToOffset(ta: HTMLTextAreaElement, source: string, charOffset: number) {
  const before = source.slice(0, charOffset);
  const lineNum = (before.match(/\n/g) ?? []).length;
  const lineHeight = parseFloat(window.getComputedStyle(ta).lineHeight) || 22;
  ta.scrollTop = Math.max(0, lineNum * lineHeight - ta.clientHeight / 3);
}

export default function FindReplace({
  source,
  textareaRef,
  showReplace,
  onToggleReplace,
  onChange,
  onClose,
}: Props) {
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const findInputRef = useRef<HTMLInputElement>(null);

  const matches = findMatches(source, findText, caseSensitive);
  const matchCount = matches.length;
  // Keep index in bounds as matches list changes
  const safeIndex = matchCount > 0 ? Math.min(currentIndex, matchCount - 1) : 0;

  // Auto-focus find input on mount
  useEffect(() => {
    findInputRef.current?.focus();
    findInputRef.current?.select();
  }, []);

  // Reset index whenever search term or case sensitivity changes
  useEffect(() => {
    setCurrentIndex(0);
  }, [findText, caseSensitive]);

  // Scroll textarea to current match whenever it changes
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta || matchCount === 0 || !findText) return;
    const start = matches[safeIndex];
    scrollTextareaToOffset(ta, source, start);
    // Set selection range so cursor lands there when textarea gets focus
    ta.setSelectionRange(start, start + findText.length);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeIndex, matchCount, findText]);

  const navigate = useCallback(
    (dir: 1 | -1) => {
      if (matchCount === 0) return;
      const next = ((safeIndex + dir) % matchCount + matchCount) % matchCount;
      setCurrentIndex(next);
      // Focus textarea so the selection highlight is visible, then return to find input
      const ta = textareaRef.current;
      if (ta) {
        const start = matches[next];
        scrollTextareaToOffset(ta, source, start);
        ta.setSelectionRange(start, start + findText.length);
        ta.focus();
      }
      // Return focus to find input after a frame so the selection stays set
      requestAnimationFrame(() => findInputRef.current?.focus());
    },
    [matchCount, safeIndex, matches, source, findText, textareaRef],
  );

  const handleReplace = () => {
    if (matchCount === 0) return;
    const start = matches[safeIndex];
    const newSource =
      source.slice(0, start) + replaceText + source.slice(start + findText.length);
    onChange(newSource);
    // Keep current index – next render recomputes matches
  };

  const handleReplaceAll = () => {
    if (matchCount === 0 || !findText) return;
    const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const newSource = source.replace(
      new RegExp(escaped, caseSensitive ? "g" : "gi"),
      replaceText,
    );
    onChange(newSource);
  };

  const onFindKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "Enter") { e.preventDefault(); e.shiftKey ? navigate(-1) : navigate(1); }
    if (e.key === "F3") { e.preventDefault(); e.shiftKey ? navigate(-1) : navigate(1); }
  };

  const onReplaceKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "Enter") { e.preventDefault(); handleReplace(); }
  };

  return (
    <div className="absolute top-2 right-3 z-20 w-[22rem] rounded-lg border border-border bg-card shadow-xl shadow-black/10 select-none">
      {/* ── Find row ── */}
      <div className="flex items-center gap-1 px-2 py-1.5">
        {/* Replace toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 text-muted-foreground"
          title={showReplace ? "Hide replace" : "Show replace (Ctrl+H)"}
          onClick={onToggleReplace}
        >
          <ChevronsUpDown className="h-3.5 w-3.5" />
        </Button>

        <Input
          ref={findInputRef}
          value={findText}
          onChange={(e) => setFindText(e.target.value)}
          onKeyDown={onFindKeyDown}
          placeholder="Find…"
          className="h-7 text-sm flex-1 min-w-0"
          spellCheck={false}
        />

        {/* Case-sensitive toggle */}
        <button
          title="Match case"
          onClick={() => setCaseSensitive((v) => !v)}
          className={cn(
            "h-6 w-6 shrink-0 rounded text-[11px] font-mono font-bold transition-colors",
            caseSensitive
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-secondary",
          )}
        >
          Aa
        </button>

        {/* Match count */}
        <span className="w-12 shrink-0 text-center text-[11px] tabular-nums text-muted-foreground">
          {findText
            ? matchCount === 0
              ? "No match"
              : `${safeIndex + 1} / ${matchCount}`
            : ""}
        </span>

        <Button
          variant="ghost" size="icon"
          className="h-6 w-6 shrink-0"
          title="Previous match (Shift+Enter / Shift+F3)"
          disabled={matchCount === 0}
          onClick={() => navigate(-1)}
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost" size="icon"
          className="h-6 w-6 shrink-0"
          title="Next match (Enter / F3)"
          disabled={matchCount === 0}
          onClick={() => navigate(1)}
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost" size="icon"
          className="h-6 w-6 shrink-0"
          title="Close (Escape)"
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* ── Replace row ── */}
      {showReplace && (
        <div className="flex items-center gap-1 border-t border-border px-2 py-1.5">
          {/* Spacer aligns with toggle button above */}
          <span className="h-6 w-6 shrink-0" />

          <Input
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            onKeyDown={onReplaceKeyDown}
            placeholder="Replace…"
            className="h-7 text-sm flex-1 min-w-0"
            spellCheck={false}
          />

          <Button
            variant="outline"
            className="h-7 shrink-0 px-2.5 text-xs"
            disabled={matchCount === 0}
            onClick={handleReplace}
            title="Replace current (Enter)"
          >
            Replace
          </Button>
          <Button
            variant="outline"
            className="h-7 shrink-0 px-2.5 text-xs"
            disabled={matchCount === 0}
            onClick={handleReplaceAll}
            title="Replace all"
          >
            All
          </Button>
        </div>
      )}
    </div>
  );
}
