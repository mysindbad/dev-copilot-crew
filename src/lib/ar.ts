/**
 * Arabic rendering layer for server-produced English strings.
 *
 * Backend checks, GitHub errors and provider messages are produced in English.
 * The interface is Arabic-first, so every such string is passed through
 * `arabize()` before it is displayed. Unknown strings are returned unchanged so
 * no information is ever lost or invented.
 */

const EXACT: Record<string, string> = {
  "Repository URL valid": "رابط المستودع صحيح",
  "GitHub token valid": "توكن GitHub صحيح",
  "GitHub token present": "توكن GitHub موجود",
  "Repository access": "الوصول إلى المستودع",
  "Write access": "صلاحية الكتابة",
  "Branch verified": "الفرع مؤكَّد",
  "Provider key present": "مفتاح المزوّد موجود",
  "Models discovered": "النماذج المتوفرة",
  verified: "تم التحقق",
  untested: "لم يُختبر",
  error: "خطأ",
  "no key": "بدون مفتاح",
  ok: "سليم",
  pass: "ناجح",
  fail: "فاشل",
  warn: "تنبيه",
  skip: "متجاوَز",
  APPROVED: "موافَق عليه",
  CHANGES_REQUESTED: "مطلوب تعديلات",
  FAILED: "فشل",
  APPROVE: "موافقة",
  REQUEST_CHANGES: "طلب تعديلات",
  BLOCKER: "مانع",
  MAJOR: "خطير",
  MINOR: "بسيط",
  INFO: "معلومة",
  CREATE: "إنشاء",
  MODIFY: "تعديل",
  DELETE: "حذف",
  UNKNOWN: "غير معروف",
  LOW: "خطر منخفض",
  MEDIUM: "خطر متوسط",
  HIGH: "خطر عالٍ",
};

const RULES: [RegExp, string][] = [
  [
    /^Gemini 404:[\s\S]*model models\/(\S+) is no longer available[\s\S]*$/i,
    "النموذج $1 توقف عند Google. غادي نختار تلقائيًا نموذجًا حديثًا فالمحاولة الجاية.",
  ],
  [
    /^(Gemini|OpenRouter) 503:[\s\S]*$/i,
    "النموذج مشغول دابا (ضغط عالٍ عند المزوّد). جرّبنا نموذجًا آخر تلقائيًا — عاود المحاولة إذا بقا المشكل.",
  ],
  [/^(Gemini|OpenRouter) 429:[\s\S]*$/i, "تجاوزنا حد الاستعمال مؤقتًا. استنى شوية وعاود."],
  [/^(Gemini|OpenRouter) 524:[\s\S]*$/i, "النموذج تأخر بزاف وتوقفت المحاولة تلقائيًا."],
  [/^All configured model routes failed\.[\s\S]*$/i, "فشلت النماذج المتاحة، والتفاصيل مبينة تحت كل محاولة."],
  [
    /^A comprehensive audit cannot start because repository coverage is partial \((\d+) of (\d+) inspectable text files read\)\. Re-run inspection or narrow the task\.$/i,
    "ما نقدرش نسميه فحص شامل: تقراو غير $1 من أصل $2 ملف نصي قابل للفحص. عاود الفحص أو حدّد جزءًا أصغر من المشروع.",
  ],
  [/^Authenticated as (.+)$/i, "متصل بحساب $1"],
  [/^Token is read-only.*$/i, "التوكن للقراءة فقط — لا يمكن الإرسال إلى GitHub"],
  [/^No token stored.*$/i, "لا يوجد توكن — سنقرأ المستودع كزائر عمومي فقط"],
  [
    /^GitHub rejected the stored token \((\d+)\).*$/i,
    "GitHub رفض التوكن (خطأ $1) — سنكمل بالقراءة العمومية",
  ],
  [/^Expected github\.com\/owner\/repo$/i, "الشكل الصحيح: github.com/المالك/المستودع"],
  [/^Invalid repository URL\.$/i, "رابط المستودع غير صحيح."],
  [/^Push and pull request are allowed\.?$/i, "الإرسال وفتح Pull Request مسموحان"],
  [/(\d+) models? available/i, "$1 نموذج متاح"],
  [
    /^No change survived the guardrails \((\d+) rejected\):?\s*([\s\S]*)$/i,
    "ما مرّ حتى تعديل من قواعد الأمان ($1 مرفوض). السبب: $2",
  ],
  [/outside the approved plan scope/i, "خارج نطاق الخطة المعتمدة"],
  [/could not be read at this commit/i, "تعذّرت قراءته عند هذه النسخة"],
  [/model returned empty content/i, "النموذج رجّع محتوى فارغ"],
  [/content contained placeholder elisions/i, "المحتوى فيه اختصارات ناقصة"],
  [/no change against the current file/i, "بلا تغيير مقارنة بالملف الحالي"],
  [/^No provider\/model selected\.$/i, "لم تختر مزوّدًا ولا نموذجًا."],
  [/API key is not configured\.?/i, "المفتاح غير مُعرَّف."],
  [/rate limit/i, "تجاوز حد الاستعمال"],
  [/read-only/i, "قراءة فقط"],
  [/not configured/i, "غير مُعرَّف"],
];

export function arabize(text: string | undefined | null): string {
  if (!text) return "";
  const trimmed = text.trim();
  const exact = EXACT[trimmed];
  if (exact) return exact;
  for (const [re, rep] of RULES) {
    if (re.test(trimmed)) return trimmed.replace(re, rep);
  }
  return trimmed;
}

/** Arabic label for a check state. */
export function stateLabel(state: string): string {
  return EXACT[state] ?? state;
}
