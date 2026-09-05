import { createFileRoute } from "@tanstack/react-router";
import { FileCode2, GitCommitHorizontal, Loader2, RefreshCw, Save } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { InspectionPanel } from "@/components/InspectionPanel";
import { RepositoryAuditView } from "@/components/RepositoryAuditView";
import { useWorkspace } from "@/lib/workspace";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { getUserSecrets } from "@/lib/user-secrets";
import { listWorkspaceFiles, readWorkspaceFile, saveWorkspaceFile } from "@/lib/workspace-files.functions";
import type { WorkspaceFile } from "@/lib/workspace-files.server";

export const Route = createFileRoute("/project")({
  head: () => ({
    meta: [
      { title: "المشروع — فريق التطوير الذكي" },
      {
        name: "description",
        content: "حقائق مستودعك الحقيقية: التقنيات، نقاط الدخول، خريطة الـ API وعدد الملفات.",
      },
      { property: "og:title", content: "المشروع — فريق التطوير الذكي" },
      {
        property: "og:description",
        content: "تقرير فحص حقيقي لمستودع GitHub الخاص بك، بدون أي بيانات وهمية.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProjectPage,
});

function ProjectPage() {
  const { repoConfig, repoResult, audit, setAudit, setSettingsOpen } = useWorkspace();
  const repo = repoResult?.ok ? repoResult.repository : undefined;

  return (
    <AppShell>
      <section className="panel p-4 sm:p-6">
        <h2 className="text-base font-semibold">المشروع الحالي</h2>
        {repo ? (
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="المستودع" value={repo.fullName} />
            <Field label="الفرع" value={repo.branch} />
            <Field
              label="الصلاحية"
              value={repo.writeAccess ? "قراءة + كتابة" : "قراءة فقط"}
              tone={repo.writeAccess ? "ok" : "warn"}
            />
            <Field label="الظهور" value={repo.private ? "خاص" : "عام"} />
            {repo.lastCommit && (
              <div className="sm:col-span-2 lg:col-span-4">
                <span className="label-caps">آخر تعديل</span>
                <div className="mt-1 flex items-start gap-2 font-mono text-xs break-words text-muted-foreground">
                  <GitCommitHorizontal className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span dir="ltr">
                    {repo.lastCommit.sha} · {repo.lastCommit.message} — {repo.lastCommit.author}
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-2">
            <p className="text-sm text-muted-foreground">
              ما كاين حتى مستودع متصل. حل الإعدادات ودخّل الرابط والتوكن.
            </p>
            <button
              onClick={() => setSettingsOpen(true)}
              className="mt-3 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
            >
              فتح الإعدادات
            </button>
          </div>
        )}
      </section>

      <InspectionPanel
        repoUrl={repoConfig.repoUrl}
        branch={repoConfig.branch}
        connected={Boolean(repo)}
        audit={audit}
        onAudit={setAudit}
      />

      {repo && <WorkspaceEditor repoUrl={repoConfig.repoUrl} branch={repoConfig.branch} />}

      {audit && <RepositoryAuditView audit={audit} />}
    </AppShell>
  );
}

function Field({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
}) {
  return (
    <div>
      <span className="label-caps">{label}</span>
      <div
        className={
          "mt-1 font-mono text-sm break-words " +
          (tone === "warn" ? "text-warning" : tone === "ok" ? "text-success" : "text-foreground")
        }
      >
        {value}
      </div>
    </div>
  );
}


function WorkspaceEditor({ repoUrl, branch }: { repoUrl: string; branch: string }) {
  const listFiles = useServerFn(listWorkspaceFiles);
  const readFile = useServerFn(readWorkspaceFile);
  const saveFile = useServerFn(saveWorkspaceFile);
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [selectedPath, setSelectedPath] = useState("");
  const [content, setContent] = useState("");
  const [sha, setSha] = useState("");
  const [filter, setFilter] = useState("");
  const [commitMessage, setCommitMessage] = useState("Update from AI Dev Hub");
  const [busy, setBusy] = useState<"list" | "read" | "save" | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function refreshFiles() {
    setBusy("list");
    setNotice(null);
    const result = await listFiles({ data: { repoUrl, branch, secrets: getUserSecrets() } });
    setBusy(null);
    if (!result.ok) {
      setNotice({ tone: "error", text: result.error });
      return;
    }
    const nextFiles = result.data.sort((a, b) => a.path.localeCompare(b.path));
    setFiles(nextFiles);
    const nextPath = selectedPath && nextFiles.some((file) => file.path === selectedPath)
      ? selectedPath
      : nextFiles.find((file) => file.path === "README.md")?.path ?? nextFiles[0]?.path ?? "";
    if (nextPath) await openFile(nextPath);
  }

  async function openFile(path: string) {
    setSelectedPath(path);
    setBusy("read");
    setNotice(null);
    const result = await readFile({ data: { repoUrl, branch, path, secrets: getUserSecrets() } });
    setBusy(null);
    if (!result.ok) {
      setNotice({ tone: "error", text: result.error });
      return;
    }
    setContent(result.data.content);
    setSha(result.data.sha);
  }

  async function save() {
    if (!selectedPath || !sha) return;
    setBusy("save");
    setNotice(null);
    const result = await saveFile({
      data: {
        repoUrl,
        branch,
        path: selectedPath,
        content,
        sha,
        message: commitMessage,
        secrets: getUserSecrets(),
      },
    });
    setBusy(null);
    if (!result.ok) {
      setNotice({ tone: "error", text: result.error });
      return;
    }
    setSha(result.data.fileSha);
    setNotice({ tone: "ok", text: "تم حفظ الملف وإنشاء commit حقيقي في GitHub." });
  }

  useEffect(() => {
    void refreshFiles();
  }, [repoUrl, branch]);

  const visibleFiles = useMemo(() => {
    const value = filter.trim().toLowerCase();
    return value ? files.filter((file) => file.path.toLowerCase().includes(value)) : files;
  }, [files, filter]);

  return (
    <section className="panel overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4 sm:p-5">
        <div>
          <h2 className="text-base font-semibold">محرر الملفات الحقيقي</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            قراءة وكتابة مباشرة على الفرع <span className="font-mono" dir="ltr">{branch}</span> عبر GitHub.
          </p>
        </div>
        <button
          onClick={() => void refreshFiles()}
          disabled={busy !== null}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-medium hover-elevate disabled:opacity-50"
        >
          <RefreshCw className={busy === "list" ? "size-3.5 animate-spin" : "size-3.5"} /> تحديث الشجرة
        </button>
      </div>

      <div className="grid min-h-[520px] lg:grid-cols-[280px_1fr]">
        <aside className="border-b border-border bg-muted/20 lg:border-b-0 lg:border-e">
          <div className="border-b border-border p-3">
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="بحث في الملفات..."
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary"
              dir="auto"
            />
            <p className="mt-2 text-[0.68rem] text-muted-foreground">{files.length} ملف قابل للقراءة</p>
          </div>
          <div className="max-h-[380px] overflow-auto p-2 lg:max-h-[460px]">
            {busy === "list" && <p className="p-3 text-xs text-muted-foreground">جاري قراءة شجرة المستودع...</p>}
            {busy !== "list" && visibleFiles.length === 0 && <p className="p-3 text-xs text-muted-foreground">لا توجد ملفات مطابقة.</p>}
            {visibleFiles.map((file) => (
              <button
                key={file.path}
                onClick={() => void openFile(file.path)}
                className={"flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-start text-xs hover-elevate " + (selectedPath === file.path ? "bg-primary/10 text-primary" : "text-foreground")}
              >
                <FileCode2 className="mt-0.5 size-3.5 shrink-0" />
                <span className="min-w-0 truncate font-mono" dir="ltr">{file.path}</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="flex min-w-0 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-3">
            <div className="flex min-w-0 items-center gap-2 text-xs">
              <FileCode2 className="size-4 shrink-0 text-primary" />
              <span className="truncate font-mono" dir="ltr">{selectedPath || "اختر ملفًا"}</span>
              {busy === "read" && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
            </div>
            <button
              onClick={() => void save()}
              disabled={busy !== null || !selectedPath || !sha}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy === "save" ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              حفظ و commit
            </button>
          </div>
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            disabled={!selectedPath || busy === "read"}
            spellCheck={false}
            className="min-h-[360px] flex-1 resize-none bg-[#0b1020] p-4 font-mono text-[0.75rem] leading-6 text-slate-200 outline-none disabled:opacity-60"
            dir="ltr"
            placeholder="اختر ملفًا لبدء التحرير..."
          />
          <div className="border-t border-border p-3">
            <label className="label-caps">رسالة الـcommit</label>
            <input
              value={commitMessage}
              onChange={(event) => setCommitMessage(event.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary"
              dir="auto"
            />
            {notice && <p className={"mt-2 text-xs " + (notice.tone === "error" ? "text-destructive" : "text-success")}>{notice.text}</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
