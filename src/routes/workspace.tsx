/**
 * IDE-style workspace route — the professional AI development environment.
 *
 * Layout: top bar + recovery banner + three resizable panels (file explorer,
 * code editor, agent panel) + bottom panel (terminal / activity / git changes).
 * Panel sizes persist to localStorage via react-resizable-panels autoSaveId.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback, useEffect } from "react";
import { useWorkspace } from "@/lib/workspace";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { WorkspaceTopBar } from "@/components/workspace/WorkspaceTopBar";
import { FileExplorer } from "@/components/workspace/FileExplorer";
import { EditorPanel, type OpenFile } from "@/components/workspace/EditorPanel";
import { AgentPanel } from "@/components/workspace/AgentPanel";
import { BottomPanel } from "@/components/workspace/BottomPanel";
import { RecoveryBanner } from "@/components/workspace/RecoveryBanner";
import { SettingsDrawer } from "@/components/SettingsDrawer";

export const Route = createFileRoute("/workspace")({
  head: () => ({
    meta: [
      { title: "Workspace — AI Dev Team" },
      { name: "description", content: "Professional AI development workspace with code editor, terminal, and agent pipeline." },
    ],
  }),
  component: WorkspacePage,
});

function WorkspacePage() {
  const { setSettingsOpen, bootstrapState, repoConfig } = useWorkspace();
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);

  // Bootstrap state from GitHub on mount when a repo is connected
  useEffect(() => {
    if (repoConfig.repoUrl.trim()) void bootstrapState();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openFile = useCallback((path: string, content: string) => {
    setOpenFiles((prev) => {
      if (prev.some((f) => f.path === path)) return prev;
      return [...prev, { path, content }];
    });
    setActivePath(path);
  }, []);

  const closeFile = useCallback((path: string) => {
    setOpenFiles((prev) => {
      const next = prev.filter((f) => f.path !== path);
      if (activePath === path) {
        const last = next[next.length - 1];
        setActivePath(last ? last.path : null);
      }
      return next;
    });
  }, [activePath]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <WorkspaceTopBar onOpenSettings={() => setSettingsOpen(true)} />
      <RecoveryBanner />

      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup orientation="vertical">
          {/* Main area */}
          <ResizablePanel defaultSize="72" minSize="30">
            <ResizablePanelGroup orientation="horizontal">
              {/* File explorer */}
              <ResizablePanel defaultSize="18" minSize="10" maxSize="35">
                <div className="h-full border-r border-border bg-secondary/20">
                  <FileExplorer onOpenFile={openFile} activePath={activePath} />
                </div>
              </ResizablePanel>
              <ResizableHandle orientation="horizontal" />
              {/* Editor */}
              <ResizablePanel defaultSize="54" minSize="20">
                <EditorPanel
                  openFiles={openFiles}
                  activePath={activePath}
                  onCloseFile={closeFile}
                  onSearch={() => {}}
                />
              </ResizablePanel>
              <ResizableHandle orientation="horizontal" />
              {/* Agent panel */}
              <ResizablePanel defaultSize="28" minSize="15" maxSize="45">
                <AgentPanel />
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>

          <ResizableHandle withHandle orientation="vertical" />

          {/* Bottom panel */}
          <ResizablePanel defaultSize="28" minSize="10" maxSize="60">
            <BottomPanel />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <SettingsDrawer />
    </div>
  );
}
