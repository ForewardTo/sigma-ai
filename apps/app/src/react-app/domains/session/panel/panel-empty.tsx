/** @jsxImportSource react */
import * as React from "react";
import { ArrowLeft, ArrowRight, FileText, Globe, Mic2, Puzzle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PanelEmptyActions = {
  onOpenBrowser?: () => void;
  onOpenExtensions?: () => void;
  onOpenVoice?: () => void;
};

export function handlePanelEscape(key: string, onClose: () => void) {
  if (key !== "Esc") return false;
  onClose();
  return true;
}

type PanelDestination = {
  id: "browser" | "files" | "extensions" | "voice";
  label: string;
  description: string;
  icon: React.ReactNode;
  activate: () => void;
};

export function getPanelDestinations(
  actions: PanelEmptyActions,
  onOpenFiles: () => void,
): PanelDestination[] {
  const destinations: PanelDestination[] = [];

  if (actions.onOpenBrowser) {
    destinations.push({
      id: "browser",
      label: "浏览器",
      description: "在内置浏览器中打开新页面。",
      icon: <Globe aria-hidden="true" />,
      activate: actions.onOpenBrowser,
    });
  }

  destinations.push({
    id: "files",
    label: "文件和制品",
    description: "查看本会话中创建的文件和制品。",
    icon: <FileText aria-hidden="true" />,
    activate: onOpenFiles,
  });

  if (actions.onOpenExtensions) {
    destinations.push({
      id: "extensions",
      label: "库",
      description: "浏览 Agent 可用的技能和连接。",
      icon: <Puzzle aria-hidden="true" />,
      activate: actions.onOpenExtensions,
    });
  }

  if (actions.onOpenVoice) {
    destinations.push({
      id: "voice",
      label: "语音模式",
      description: "使用实时语音与 OpenWork 对话。",
      icon: <Mic2 aria-hidden="true" />,
      activate: actions.onOpenVoice,
    });
  }

  return destinations;
}

export function PanelEmpty({ onOpenBrowser, onOpenExtensions, onOpenVoice }: PanelEmptyActions) {
  const [destination, setDestination] = React.useState<"chooser" | "files">("chooser");

  if (destination === "files") {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 sm:p-6">
        <Button
          variant="ghost"
          size="sm"
          className="mb-6 w-fit gap-2"
          onClick={() => setDestination("chooser")}
        >
          <ArrowLeft />
          所有目标
        </Button>
        <div className="m-auto max-w-sm text-center">
          <span className="mx-auto mb-4 flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <FileText aria-hidden="true" />
          </span>
          <h2 className="text-base font-medium text-foreground">尚未有文件或制品</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            本会话中创建的文件和制品将自动显示在这里。
          </p>
        </div>
      </div>
    );
  }

  const destinations = getPanelDestinations(
    { onOpenBrowser, onOpenExtensions, onOpenVoice },
    () => setDestination("files"),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 sm:p-6">
      <div className="my-auto w-full max-w-xl self-center">
        <h2 className="text-base font-medium text-foreground">选择一个目标</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          随时打开工具或返回此处切换。
        </p>
        <div className="mt-5 grid gap-2" aria-label="Panel destinations">
          {destinations.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                "group flex min-h-16 w-full items-center gap-3 rounded-xl border border-border bg-background p-3 text-left",
                "transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
              onClick={() => item.activate()}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4">
              {item.icon}              
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">{item.label}</span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{item.description}</span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
