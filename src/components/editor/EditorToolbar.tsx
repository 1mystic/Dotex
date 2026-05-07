import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Heading1, Heading2, Heading3, Bold, Italic, Strikethrough, Code,
  Quote, List, ListOrdered, Minus, Link as LinkIcon, Image as ImageIcon, Table, Link2, Link2Off,
} from "lucide-react";

interface Props {
  onInsert: (before: string, after?: string) => void;
  onSnippet: (snippet: string) => void;
  syncScrollEnabled: boolean;
  onToggleSyncScroll: () => void;
}

const TABLE_TEMPLATE = `\n| Header 1 | Header 2 | Header 3 |\n|----------|----------|----------|\n| Cell 1   | Cell 2   | Cell 3   |\n| Cell 4   | Cell 5   | Cell 6   |\n`;

const PMATRIX = `$$\n\\begin{pmatrix}\na & b \\\\\nc & d\n\\end{pmatrix}\n$$`;

const ALIGN = `$$\n\\begin{align}\nf(x) &= x^2 + 2x + 1 \\\\\n     &= (x+1)^2\n\\end{align}\n$$`;

const SUM = `$$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$$`;

export default function EditorToolbar({ onInsert, onSnippet, syncScrollEnabled, onToggleSyncScroll }: Props) {
  const TBtn = ({ tip, onClick, children }: any) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onClick}>{children}</Button>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
  const LBtn = ({ tip, onClick, children }: any) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 font-mono text-primary hover:bg-accent" onClick={onClick}>{children}</Button>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="shrink-0 h-9 flex items-center gap-1 px-3 bg-card border-b border-border overflow-x-auto">
        <TBtn tip="Heading 1" onClick={() => onInsert("# ")}><Heading1 className="h-4 w-4" /></TBtn>
        <TBtn tip="Heading 2" onClick={() => onInsert("## ")}><Heading2 className="h-4 w-4" /></TBtn>
        <TBtn tip="Heading 3" onClick={() => onInsert("### ")}><Heading3 className="h-4 w-4" /></TBtn>
        <Separator orientation="vertical" className="h-5 mx-1" />
        <TBtn tip="Bold" onClick={() => onInsert("**", "**")}><Bold className="h-4 w-4" /></TBtn>
        <TBtn tip="Italic" onClick={() => onInsert("_", "_")}><Italic className="h-4 w-4" /></TBtn>
        <TBtn tip="Strikethrough" onClick={() => onInsert("~~", "~~")}><Strikethrough className="h-4 w-4" /></TBtn>
        <TBtn tip="Inline code" onClick={() => onInsert("`", "`")}><Code className="h-4 w-4" /></TBtn>
        <Separator orientation="vertical" className="h-5 mx-1" />
        <TBtn tip="Blockquote" onClick={() => onInsert("> ")}><Quote className="h-4 w-4" /></TBtn>
        <TBtn tip="Bullet list" onClick={() => onInsert("- ")}><List className="h-4 w-4" /></TBtn>
        <TBtn tip="Numbered list" onClick={() => onInsert("1. ")}><ListOrdered className="h-4 w-4" /></TBtn>
        <TBtn tip="Horizontal rule" onClick={() => onSnippet("\n---\n")}><Minus className="h-4 w-4" /></TBtn>
        <Separator orientation="vertical" className="h-5 mx-1" />
        <TBtn tip="Link" onClick={() => onInsert("[", "](url)")}><LinkIcon className="h-4 w-4" /></TBtn>
        <TBtn tip="Image" onClick={() => onInsert("![alt](", ")")}><ImageIcon className="h-4 w-4" /></TBtn>
        <TBtn tip="Table" onClick={() => onSnippet(TABLE_TEMPLATE)}><Table className="h-4 w-4" /></TBtn>
        <Separator orientation="vertical" className="h-5 mx-1" />
        <span className="text-[10px] tracking-wider uppercase text-muted-foreground px-1">LaTeX</span>
        <LBtn tip="Inline math" onClick={() => onSnippet("$x^2 + y^2 = z^2$")}>$x$</LBtn>
        <LBtn tip="Display math" onClick={() => onSnippet("$$\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}$$")}>$$</LBtn>
        <LBtn tip="Fraction" onClick={() => onSnippet("$\\frac{a}{b}$")}>∫</LBtn>
        <LBtn tip="Matrix" onClick={() => onSnippet(PMATRIX)}>[ ]</LBtn>
        <LBtn tip="Align environment" onClick={() => onSnippet(ALIGN)}>≡</LBtn>
        <LBtn tip="Sum" onClick={() => onSnippet(SUM)}>Σ</LBtn>
        <div className="ml-auto flex items-center">
          <Separator orientation="vertical" className="h-5 mx-2" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onToggleSyncScroll}>
                {syncScrollEnabled ? <Link2 className="h-4 w-4" /> : <Link2Off className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{syncScrollEnabled ? "Disable synced scroll" : "Enable synced scroll"}</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}
