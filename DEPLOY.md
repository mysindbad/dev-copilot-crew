# نشر التطبيق من GitHub (بدون Lovable)

هاد المشروع كيتنشر أوتوماتيكيًا من GitHub Actions إلى **Cloudflare Workers**،
وكيعطيك رابط دائم مستقل تمامًا على Lovable.

## علاش Cloudflare وماشي GitHub Pages؟

GitHub Pages كيدعم غير الملفات الثابتة (HTML/CSS/JS). هاد التطبيق فيه كود خلفي
(server functions) كيتواصل مع GitHub API ومزوّدي الذكاء الاصطناعي، إذن خاصو خادم.
GitHub Actions هو اللي كيبني وكينشر — والاستضافة كتكون على Cloudflare Workers (مجانية للاستعمال العادي).

## الخطوات (مرة وحدة غير)

### 1. صاوب حساب Cloudflare
سجّل فـ https://dash.cloudflare.com (مجاني).

### 2. جيب `Account ID`
من الصفحة الرئيسية ديال Cloudflare → **Workers & Pages** → على اليمين كتلقى **Account ID**. كوپيه.

### 3. صاوب `API Token`
- سير لـ https://dash.cloudflare.com/profile/api-tokens
- **Create Token** → استعمل قالب **Edit Cloudflare Workers**
- **Continue → Create Token** → كوپيه التوكن (كيتعرض مرة وحدة غير)

### 4. زيد الأسرار فـ GitHub
فالمستودع: **Settings → Secrets and variables → Actions → New repository secret**

| الاسم | القيمة |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | التوكن ديال الخطوة 3 |
| `CLOUDFLARE_ACCOUNT_ID` | الـ Account ID ديال الخطوة 2 |

(اختياري) فتبويب **Variables** زيد `WORKER_NAME` إذا بغيتي اسم آخر غير `dev-copilot-crew`.

### 5. شغّل النشر
- **Actions** → **Deploy to Cloudflare Workers** → **Run workflow**
- ولا غير دير أي `push` على فرع `main` وكينطلق بوحدو.

### 6. جيب الرابط
منين تسالي الخطوة، فسجلّ `Deploy to Cloudflare Workers` غادي يتكتب:

```
Deployed dev-copilot-crew triggers (x.xx sec)
  https://dev-copilot-crew.<حسابك>.workers.dev
```

هادا هو الرابط الدائم ديالك. حطو فالمفضلة — كيخدم حتى لو مسحتي كلشي فـ Lovable.

## المفاتيح (GitHub Token / Gemini / OpenRouter)

ما خاصكش تحطهم فـ Cloudflare. التطبيق فيه **خانة الأسرار** فالواجهة —
كتدخل فيها رابط المستودع + التوكن + مفاتيح المزوّدين، وكيتخزنو فالمتصفح ديالك
وكيتبعتو مع كل طلب. يعني الرابط كيخدم مباشرة بلا أي إعداد إضافي.

إذا بغيتي مفاتيح افتراضية على مستوى الخادم، زيدهم فـ Cloudflare:
**Workers & Pages → dev-copilot-crew → Settings → Variables → Secrets**
بالأسماء: `GITHUB_TOKEN`، `GEMINI_API_KEY`، `OPENROUTER_API_KEY`.

## نطاق خاص (اختياري)

Cloudflare → الـ Worker ديالك → **Settings → Domains & Routes → Add custom domain**.

## تشغيل محلي

```bash
bun install
bun run dev      # http://localhost:8080
bun run build    # نسخة الإنتاج
```
