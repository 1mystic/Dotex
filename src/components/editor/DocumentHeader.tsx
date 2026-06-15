import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Code2, Columns2, Eye, Moon, Sun, Pencil, Check, PanelLeftOpen } from "lucide-react";
import ExportMenu from "./ExportMenu";

type ViewMode = "editor" | "split" | "preview";

interface Props {
  title: string;
  onTitleChange: (t: string) => void;
  source: string;
  viewMode: ViewMode;
  onViewMode: (m: ViewMode) => void;
  darkMode: boolean;
  onToggleDark: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export default function DocumentHeader({
  title, onTitleChange, source, viewMode, onViewMode, darkMode, onToggleDark,
  sidebarOpen, onToggleSidebar,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const save = () => { onTitleChange(draft.trim() || "Untitled Document"); setEditing(false); };
  const cancel = () => { setDraft(title); setEditing(false); };

  const modes: { key: ViewMode; label: string; Icon: any }[] = [
    { key: "editor", label: "Editor", Icon: Code2 },
    { key: "split", label: "Split", Icon: Columns2 },
    { key: "preview", label: "Preview", Icon: Eye },
  ];

  return (
    <div className="shrink-0 flex items-center justify-between px-5 py-3 bg-card border-b border-border gap-3">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* Mobile-only: header toggle (desktop uses the floating left-edge button) */}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 md:hidden"
          onClick={onToggleSidebar}
          title="Toggle sidebar"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </Button>
        <img src="/favicon.svg" alt="Dotex" className="h-8 w-8 shrink-0" />
        <span className="text-base font-bold hidden sm:inline">Dotex</span>
        <Badge variant="secondary" className="hidden sm:inline-flex text-xs">2026</Badge>
        <Separator orientation="vertical" className="h-5" />
        {editing ? (
          <div className="flex items-center gap-1 min-w-0">
            <Input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") cancel();
              }}
              className="h-7 text-sm w-56"
            />
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={save}>
              <Check className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <button
            className="group flex items-center gap-1.5 text-[15px] text-foreground/80 hover:text-foreground truncate"
            onClick={() => { setDraft(title); setEditing(true); }}
          >
            <span className="truncate">{title}</span>
            <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-0.5 bg-secondary rounded-lg p-0.5 shrink-0">
        {modes.map(({ key, label, Icon }) => (
          <Button
            key={key}
            variant={viewMode === key ? "default" : "ghost"}
            size="sm"
            className="h-7 px-2.5 text-xs gap-1.5"
            onClick={() => onViewMode(key)}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </Button>
        ))}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onToggleDark}>
          {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <ExportMenu source={source} docTitle={title} />
      </div>
    </div>
  );
}
