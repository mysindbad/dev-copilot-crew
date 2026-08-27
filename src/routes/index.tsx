import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { TeamChat } from "@/components/TeamChat";
import { ActivityFeed } from "@/components/ActivityFeed";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "فريق التطوير الذكي — محادثة مدير المشروع" },
      {
        name: "description",
        content:
          "ناقش فكرتك مع مدير المشروع الذكي، وهو يسلّمها تلقائيًا للمهندس والمبرمج والمراجعين ثم إلى GitHub.",
      },
      { property: "og:title", content: "فريق التطوير الذكي — محادثة مدير المشروع" },
      {
        property: "og:description",
        content: "محادثة عربية مع فريق وكلاء يبرمج مشروعك على GitHub خطوة بخطوة.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChatPage,
});

function ChatPage() {
  return (
    <AppShell>
      <TeamChat />
      <ActivityFeed />
    </AppShell>
  );
}
