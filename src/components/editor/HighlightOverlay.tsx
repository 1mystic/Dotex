import { forwardRef } from "react";

export interface MatchInfo {
  matches: number[];
  currentIndex: number;
  term: string;
}

interface Props {
  source: string;
  matchInfo: MatchInfo;
}

const HighlightOverlay = forwardRef<HTMLDivElement, Props>(
  ({ source, matchInfo }, ref) => {
    const { matches, currentIndex, term } = matchInfo;
    if (!term || matches.length === 0) return null;

    const parts: React.ReactNode[] = [];
    let pos = 0;
    matches.forEach((start, i) => {
      if (start > pos) {
        parts.push(<span key={`t${i}`}>{source.slice(pos, start)}</span>);
      }
      parts.push(
        <mark key={`m${i}`} className={i === currentIndex ? "hl-current" : "hl-match"}>
          {source.slice(start, start + term.length)}
        </mark>,
      );
      pos = start + term.length;
    });
    if (pos < source.length) {
      parts.push(<span key="tail">{source.slice(pos)}</span>);
    }

    return (
      <div ref={ref} className="editor-highlight-overlay" aria-hidden="true">
        {parts}
      </div>
    );
  },
);

HighlightOverlay.displayName = "HighlightOverlay";
export default HighlightOverlay;
