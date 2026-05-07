import { forwardRef, useDeferredValue, useMemo } from "react";
import { compile } from "@/lib/markdownCompiler";

interface Props {
  source: string;
  onScroll?: React.UIEventHandler<HTMLDivElement>;
}

const MarkdownPreview = forwardRef<HTMLDivElement, Props>(function MarkdownPreview(
  { source, onScroll }: Props,
  ref,
) {
  // Defer heavy compilation so the editor textarea stays responsive during typing
  const deferredSource = useDeferredValue(source);
  const html = useMemo(() => compile(deferredSource), [deferredSource]);
  const isPending = deferredSource !== source;

  return (
    <div
      ref={ref}
      onScroll={onScroll}
      className="h-full overflow-y-auto bg-background transition-opacity duration-100"
      style={{ opacity: isPending ? 0.75 : 1 }}
    >
      <div
        className="preview-content max-w-3xl mx-auto px-8 py-8"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
});

export default MarkdownPreview;
