import { forwardRef, useMemo } from "react";
import { compile } from "@/lib/markdownCompiler";

interface Props {
  source: string;
  onScroll?: React.UIEventHandler<HTMLDivElement>;
}

const MarkdownPreview = forwardRef<HTMLDivElement, Props>(function MarkdownPreview({ source, onScroll }: Props, ref) {
  const html = useMemo(() => compile(source), [source]);
  return (
    <div ref={ref} onScroll={onScroll} className="h-full overflow-y-auto bg-background">
      <div
        className="preview-content max-w-3xl mx-auto px-8 py-8"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
});

export default MarkdownPreview;
