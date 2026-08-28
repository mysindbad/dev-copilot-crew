import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Lang = "ar" | "en";

type Entry = { ar: string; en: string };

const DICT = {
  "app.title": { ar: "فريق التطوير الذكي", en: "My AI Dev Team" },
  "app.tagline": {
    ar: "اربط مستودعك على GitHub وخلي فريق الوكلاء الأذكياء يخطط، يبرمج ويراجع معك.",
    en: "Connect your GitHub repository and let a team of AI agents plan, code and review with you.",
  },
  "lang.toggle": { ar: "English", en: "العربية" },

  "status.repoOn": { ar: "المستودع متصل", en: "repo connected" },
  "status.repoOff": { ar: "المستودع غير متصل", en: "repo offline" },
  "status.inspected": { ar: "تم الفحص", en: "inspected" },
  "status.notInspected": { ar: "لم يُفحص بعد", en: "not inspected" },
  "status.providerReady": { ar: "المزوّد جاهز", en: "provider ready" },
  "status.providerIdle": { ar: "المزوّد غير جاهز", en: "provider idle" },
  "status.reviewed": { ar: "المراجعة", en: "review" },
  "status.notReviewed": { ar: "بدون مراجعة", en: "not reviewed" },

  "project.current": { ar: "المشروع الحالي", en: "Current project" },
  "project.repository": { ar: "المستودع", en: "Repository" },
  "project.branch": { ar: "الفرع", en: "Branch" },
  "project.access": { ar: "الصلاحية", en: "Access" },
  "project.rw": { ar: "قراءة + كتابة", en: "read + write" },
  "project.ro": { ar: "قراءة فقط", en: "read only" },
  "project.visibility": { ar: "الظهور", en: "Visibility" },
  "project.private": { ar: "خاص", en: "private" },
  "project.public": { ar: "عام", en: "public" },
  "project.lastCommit": { ar: "آخر تعديل (commit)", en: "Last commit" },
  "project.empty": {
    ar: "لا يوجد مشروع متصل. اربط مستودعًا بالأسفل للبدء.",
    en: "No projects connected yet. Connect a repository below to begin.",
  },

  "panel.connect.title": { ar: "اربط مستودعك", en: "Connect your repository" },
  "panel.connect.button": { ar: "اختبر الاتصال", en: "Test connection" },
  "panel.inspect.title": { ar: "فحص المستودع", en: "Repository inspection" },
  "panel.inspect.desc": {
    ar: "يقرأ ملفات المستودع الحقيقية عند آخر commit ويُنتج تقريرًا مبنيًا على أدلة. الفحص قراءة فقط — لا يُكتب ولا يُرسل أي شيء.",
    en: "Reads the real repository tree at the current commit and produces an evidence-based audit. Read-only — nothing is written or pushed.",
  },
  "panel.inspect.button": { ar: "افحص المستودع", en: "Inspect repository" },
  "panel.inspect.again": { ar: "أعد الفحص", en: "Re-inspect repository" },
  "panel.inspect.busy": { ar: "جاري الفحص…", en: "Inspecting…" },
  "panel.providers.title": { ar: "مزوّدو الذكاء الاصطناعي", en: "AI providers" },
  "panel.architect.title": { ar: "وكيل المهندس المعماري", en: "Architect agent" },
  "panel.architect.desc": {
    ar: "تخطيط بالقراءة فقط. يعتمد على حقائق تقرير الفحص فقط — لا يكتب ملفات ولا يرسل تعديلات.",
    en: "Read-only planning. The Architect uses only the facts from the repository audit.",
  },
  "panel.architect.button": { ar: "أنشئ الخطة", en: "Generate plan" },
  "panel.architect.request": { ar: "اطلب المهمة", en: "Task request" },
  "panel.coder.title": { ar: "وكيل المبرمج", en: "Coder agent" },
  "panel.coder.desc": {
    ar: "يطبّق الخطة على الملفات الحقيقية ويُظهر لك التغييرات (diff) قبل أي إرسال. لا شيء يُكتب على GitHub في هذه المرحلة.",
    en: "Applies the plan to the real files and returns a controlled diff. Nothing is committed or pushed.",
  },
  "panel.review.title": { ar: "مجلس المراجعة", en: "Review board" },
  "panel.git.title": { ar: "مدير Git", en: "Git manager" },

  "team.title": { ar: "فريق الوكلاء", en: "Agent team" },
  "team.desc": {
    ar: "المهندس المعماري يخطط من التقرير الحقيقي، والمبرمج ينفّذ الخطوات المعتمدة. مدير Git وحده يكتب على GitHub، وعلى فرع جديد فقط وبعد موافقتك. لا يوجد أي نشاط وهمي هنا.",
    en: "The Architect plans from the real audit and the Coder implements approved steps. Only the Git Manager writes to GitHub, on a new branch after your approval.",
  },
  "team.done": { ar: "منجز", en: "done" },
  "team.planned": { ar: "مبرمج", en: "planned" },

  "agent.pm": { ar: "مدير المشروع", en: "Project Manager" },
  "agent.architect": { ar: "المهندس المعماري", en: "Architect" },
  "agent.uiux": { ar: "مراجع الواجهة", en: "UI/UX Reviewer" },
  "agent.frontend": { ar: "مطوّر الواجهة", en: "Frontend Developer" },
  "agent.backend": { ar: "مطوّر الخادم", en: "Backend Developer" },
  "agent.security": { ar: "مراجع الأمان", en: "Security Reviewer" },
  "agent.qa": { ar: "مسؤول الجودة", en: "QA / Tester" },
  "agent.debugger": { ar: "المصحّح", en: "Debugger" },
  "agent.reviewer": { ar: "مراجع الكود", en: "Code Reviewer" },
  "agent.lead": { ar: "قائد الفريق", en: "Team Lead" },
  "agent.git": { ar: "مدير Git", en: "Git Manager" },
  "agent.inspector": { ar: "فاحص المستودع", en: "Inspector" },

  "perm.orchestration": { ar: "تنسيق فقط", en: "Orchestration only" },
  "perm.read": { ar: "قراءة فقط", en: "Read only" },
  "perm.rwx": { ar: "قراءة · كتابة · تنفيذ", en: "Read · Write · Execute" },
  "perm.rx": { ar: "قراءة · تنفيذ", en: "Read · Execute" },

  "chat.title": { ar: "تحدّث مع قائد الفريق", en: "Talk to the Team Lead" },
  "chat.desc": {
    ar: "ناقش مشروعك بلغة بسيطة. قائد الفريق يسألك، يفهم طلبك، ثم يحوّله إلى مهمة جاهزة للمهندس المعماري.",
    en: "Discuss your project in plain language. The Team Lead asks questions, then turns your idea into a ready task.",
  },
  "chat.placeholder": {
    ar: "اكتب هنا… مثال: بغيت نزيد صفحة تسجيل الدخول",
    en: "Write here… e.g. I want to add a login page",
  },
  "chat.send": { ar: "أرسل", en: "Send" },
  "chat.thinking": { ar: "قائد الفريق كيفكر…", en: "The Team Lead is thinking…" },
  "chat.empty": {
    ar: "ابدأ الحوار: قل لي باش بغيتي تبدا وأنا نوجّهك خطوة بخطوة.",
    en: "Start the conversation: tell me what you want to build and I'll guide you step by step.",
  },
  "chat.suggestedTask": { ar: "المهمة المقترحة", en: "Suggested task" },
  "chat.useTask": { ar: "استعمل هذه المهمة", en: "Use this task" },
  "chat.nextStep": { ar: "الخطوة التالية", en: "Next step" },
  "chat.questions": { ar: "أسئلة قائد الفريق", en: "Questions for you" },
  "chat.needProvider": {
    ar: "اختر مزوّدًا ونموذجًا من لوحة المزوّدين لتبدأ الحوار.",
    en: "Pick a provider and model in the AI providers panel to start chatting.",
  },
  "chat.clear": { ar: "مسح المحادثة", en: "Clear chat" },
  "chat.you": { ar: "أنت", en: "You" },

  "activity.title": { ar: "ماذا يفعل الفريق الآن", en: "What the team is doing" },
  "activity.empty": {
    ar: "لا يوجد نشاط بعد. كل خطوة يقوم بها أي وكيل ستظهر هنا مع اسم النموذج.",
    en: "No activity yet. Every agent step will appear here with its model name.",
  },
  "activity.clear": { ar: "مسح", en: "Clear" },
  "activity.running": { ar: "يشتغل", en: "running" },
  "activity.done": { ar: "انتهى", en: "done" },
  "activity.failed": { ar: "فشل", en: "failed" },
  "activity.model": { ar: "النموذج", en: "model" },

  "act.connect": { ar: "اختبار الاتصال بالمستودع", en: "Testing repository connection" },
  "act.connected": { ar: "المستودع متصل", en: "Repository connected" },
  "act.inspect": { ar: "فحص ملفات المستودع", en: "Inspecting repository files" },
  "act.inspected": { ar: "انتهى الفحص وأُنتج التقرير", en: "Audit completed" },
  "act.plan": { ar: "إنشاء الخطة التقنية", en: "Generating the technical plan" },
  "act.planned": { ar: "الخطة جاهزة", en: "Plan ready" },
  "act.code": { ar: "كتابة التعديلات على الملفات", en: "Writing the code changes" },
  "act.coded": { ar: "التعديلات جاهزة للمراجعة", en: "Diff staged for review" },
  "act.review": { ar: "مراجعة الكود والأمان والجودة", en: "Reviewing code, security and QA" },
  "act.reviewed": { ar: "انتهت المراجعة", en: "Review finished" },
  "act.chat": { ar: "قائد الفريق يجيب على سؤالك", en: "Team Lead is answering you" },
  "act.chatDone": { ar: "قائد الفريق أجاب", en: "Team Lead answered" },
} satisfies Record<string, Entry>;

export type TKey = keyof typeof DICT;

const STORAGE_KEY = "aidevteam.lang";

interface Ctx {
  lang: Lang;
  dir: "rtl" | "ltr";
  setLang: (l: Lang) => void;
  toggle: () => void;
  t: (key: TKey) => string;
}

const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ar");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "ar" || saved === "en") setLangState(saved);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      lang,
      dir: lang === "ar" ? "rtl" : "ltr",
      setLang,
      toggle: () => setLang(lang === "ar" ? "en" : "ar"),
      t: (key: TKey) => DICT[key][lang],
    }),
    [lang, setLang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nContext);
  if (ctx) return ctx;
  // Safe fallback so a component never crashes outside the provider.
  return {
    lang: "ar",
    dir: "rtl",
    setLang: () => {},
    toggle: () => {},
    t: (key: TKey) => DICT[key].ar,
  };
}
