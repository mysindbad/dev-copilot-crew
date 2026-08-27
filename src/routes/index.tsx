import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { TeamChat } from "@/components/TeamChat";
import { ActivityFeed } from "@/components/ActivityFeed";
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "فريق التطوير الذكي — محادثة مدير المشروع" },
      {
        name: "description",
        content:
          "ناقش فكرتك مع مدير المشروع الذكي، وسلّمها للفريق: تخطيط، برمجة، مراجعة وإرسال إلى GitHub تلقائيًا.",
      },
      { property: "og:title", content: "فريق التطوير الذكي — محادثة مدير المشروع" },
      {
        property: "og:description",
        content: "محادثة عربية مع مدير مشروع ذكي يوزّع الخدمة على وكلاء متخصصين تلقائيًا.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChatPage,
});

function ChatPage() {
  const ws = useWorkspace();

  return (
    <AppShell>
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TeamChat />
        </div>
        <div className="space-y-5">
          <ActivityFeed />
          {!ws.keyStatus.github || (!ws.keyStatus.gemini && !ws.keyStatus.openrouter) ? (
            <section className="panel p-4 text-sm leading-7">
              <h2 className="text-base font-semibold">باش تبدا</h2>
              <ul className="mt-2 space-y-1.5 text-muted-foreground">
                {!ws.keyStatus.github && <li>• زيد توكن GitHub من الإعدادات (أيقونة فوق).</li>}
                {!ws.keyStatus.gemini && !ws.keyStatus.openrouter && (
                  <li>• زيد مفتاح Gemini ولا OpenRouter باش يخدمو الوكلاء.</li>
                )}
                <li>• دخّل رابط المستودع واختبر الاتصال.</li>
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
