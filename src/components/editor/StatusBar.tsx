interface Props {
  source: string;
  cursorLine: number;
  cursorCol: number;
}

export default function StatusBar({ source, cursorLine, cursorCol }: Props) {
  const wordCount = source.trim() ? source.trim().split(/\s+/).length : 0;
  const charCount = source.length;
  const lineCount = source.split("\n").length;
  const displayCount = (source.match(/\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]/g) || []).length;
  const inlineCount = (source.match(/\$[^$\n]+\$|\\\([\s\S]*?\\\)/g) || []).length;

  return (
    <div className="shrink-0 h-6 flex items-center justify-between px-4 bg-card border-t border-border text-[11px] font-mono text-muted-foreground">
      <div className="flex items-center gap-3">
        <span>Ln {cursorLine}, Col {cursorCol}</span>
        <span>·</span>
        <span>{wordCount} words</span>
        <span>·</span>
        <span>{charCount.toLocaleString()} chars</span>
        <span>·</span>
        <span>{lineCount} lines</span>
      </div>
      <div className="flex items-center gap-3">
        {displayCount > 0 && <span className="text-primary">∫ {displayCount} display</span>}
        {inlineCount > 0 && <span className="text-primary">$ {inlineCount} inline</span>}
        <span>Dotex · MD + LaTeX + HTML</span>
      </div>
    </div>
  );
}
