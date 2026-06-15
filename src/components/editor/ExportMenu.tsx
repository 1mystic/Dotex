import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, ChevronDown, File, FileCode, FileText, Loader2 } from "lucide-react";
import { generateHTMLDocument } from "@/lib/markdownCompiler";
import { toast } from "sonner";

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface Props {
  source: string;
  docTitle: string;
}

export default function ExportMenu({ source, docTitle }: Props) {
  const [exporting, setExporting] = useState(false);
  const safeName = docTitle.replace(/[^\w\-]+/g, "_") || "document";

  const exportPDF = async () => {
    setExporting(true);
    const html = generateHTMLDocument(source, docTitle);
    const printOverride = `<style>
      @page { size: A4; margin: 1.8cm 1.8cm 2cm 1.8cm; }
      html { font-size: 9.5pt !important; }
      body { font-size: 9.5pt; line-height: 1.45; max-width: none; padding: 0; }
      h1 { font-size: 1.6rem; } h2 { font-size: 1.3rem; } h3 { font-size: 1.1rem; }
      p { margin: 0.5em 0; }
      pre { font-size: 8.5pt; padding: 0.6rem; }
    </style>`;
    // Wait for __mermaidReady (set by the inline script in generateHTMLDocument)
    // before opening the print dialog so diagrams are fully rendered.
    const printScript = `<script>window.addEventListener('load',function(){(window.__mermaidReady||Promise.resolve()).then(function(){setTimeout(function(){window.print();},150);});});<\/script>`;
    const finalHtml = html.replace("</head>", `${printOverride}${printScript}</head>`);

    const blob = new Blob([finalHtml], { type: "text/html" });
    const blobUrl = URL.createObjectURL(blob);
    const previewTab = window.open(blobUrl, "_blank");
    if (!previewTab) {
      URL.revokeObjectURL(blobUrl);
      toast.error("Pop-up blocked. Allow pop-ups to open the print preview.");
      setExporting(false);
      return;
    }

    setTimeout(() => {
      previewTab.focus();
      toast.success(`Print preview opened for ${docTitle}. Use 'Save as PDF' in the dialog.`);
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
        setExporting(false);
      }, 1800);
    }, 2200);
  };

  const exportHTML = () => {
    downloadBlob(generateHTMLDocument(source, docTitle), `${safeName}.html`, "text/html");
    toast.success("HTML downloaded");
  };
  const exportMD = () => {
    downloadBlob(source, `${safeName}.md`, "text/markdown");
    toast.success("Markdown downloaded");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90 h-9 gap-1.5" disabled={exporting}>
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Export
          <ChevronDown className="h-4 w-4 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={exportPDF}>
          <File className="h-4 w-4 mr-2 text-red-500" /> PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportHTML}>
          <FileCode className="h-4 w-4 mr-2 text-orange-500" /> HTML
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportMD}>
          <FileText className="h-4 w-4 mr-2 text-primary" /> Markdown
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
