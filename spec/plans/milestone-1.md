# תוכנית – Milestone 1: יסודות המערכת וצפייה ברשימה משותפת

**מקורות:** `MILESTONES.md` (Milestone 1), `PRD.md`, `ARCHITECTURE.md` (כולל ADR-1 עד ADR-11), `DESIGN.md`, `wireframes.png`, `style-guide.png`, `mockups1/2.png`.

**מטרה:** Slice ראשון מקצה לקצה – אתר React בעברית RTL עם שני דפים, שקורא את רשימת המשימות מ-PostgreSQL ב-Supabase דרך `GET /api/tasks` ב-Vercel Functions, ומציג פרטי משימה נבחרת (לקריאה בלבד). תשתית Migrations, סביבות Dev/Production ופריסה אוטומטית מוכנות להמשך.

**מחוץ ל-Milestone הזה:** יצירה, עריכה, מחיקה, Checkbox פעיל, גרירה, Validation של טפסים (`shared/validation.ts` – Milestone 2), Advisory Lock ו-Transactions (Milestones 2–4), Manifest ו-PWA (Milestone 5), ליטוש חזותי מלא (Milestone 5).

---

## 1. החלטות יישום ל-Milestone הזה

| נושא | החלטה | נימוק |
|---|---|---|
| כפתור "הוסף משימה" | **לא מוצג** ב-Milestone 1 | `MILESTONES.md`: "אין עדיין ממשק יצירת משימה"; אסור להציג פעולות כתיבה כאילו הן עובדות. |
| Checkbox בשורה | מוצג כ-**Disabled** (מחוון סטטוס בלבד), מסומן למשימה שהושלמה | נדרש סימון חזותי להשלמה; הפעלה רק ב-Milestone 4. |
| ידית גרירה | **לא מוצגת** עדיין | פעולת כתיבה; תתווסף ב-Milestone 4. |
| אזור פרטים | שדות כותרת / תיאור / תאריך יעד ב-`readOnly`, **ללא** כפתורי שמירה/מחיקה | `MILESTONES.md`: "ניתן להציג שדות פרטים… אך אין עדיין להציג פעולות כתיבה". |
| טקסט מצב ריק | "אין עדיין משימות ברשימה" | ה-PRD מתיר טקסט קצר שלא נקבע נוסחו. |
| טקסט טעינה | "טוען משימות…" | – |
| טקסט שגיאת טעינה | "לא ניתן לטעון את המשימות. בדוק את החיבור לאינטרנט ורענן את הדף." | PRD: הודעת שגיאה מתאימה; ללא כפתור "נסה שוב" (לא הוגדר). |
| קיצור טקסט ארוך | CSS `text-overflow: ellipsis` בשורה אחת; ללא כותרת – השורה הראשונה של התיאור | PRD: אורך הקיצור לפי רוחב המסך. |
| תאריך יעד | מוחזר מה-API כמחרוזת `YYYY-MM-DD` (Type Parser ל-`date` ב-`pg`, OID 1082), מוצג ב-`<input type="date" readOnly>` | ברירת המחדל של `pg` ממירה `date` ל-`Date` של JS ועלולה להזיז יום. |
| `updated_at` | ללא Trigger; יעודכן במפורש בשאילתות ה-UPDATE (Milestone 3) | פשטות. |
| Node | `engines.node: "24.x"` (מותקן מקומית 24.22) | LTS נתמך ב-Vercel. |
| אזור Functions | `regions` ב-`vercel.json` לפי האזור שייבחר ל-Supabase (למשל `fra1` ל-Frankfurt) | ARCHITECTURE 2.9: קרבה לאזור המסד. |

אם במהלך הבנייה יתברר שצריך לסטות מ-ADR קיים – יתועד ADR-12 ואילך.

---

## 2. מבנה הקבצים שייווצרו

```text
/
├── package.json, package-lock.json      # "type": "module", scripts, engines
├── tsconfig.json                        # strict; כולל src, shared, server, api
├── vite.config.ts                       # React plugin + הגדרות Vitest
├── playwright.config.ts                 # Desktop Chrome + Pixel 7, מול vercel dev :3000
├── vercel.json                          # SPA fallback שאינו נוגע ב-/api, regions
├── index.html                           # <html lang="he" dir="rtl">
├── .env.example                         # DATABASE_URL= (ללא ערך); מועתק פעם אחת ל-.env
├── src/
│   ├── main.tsx                         # BrowserRouter + ייבוא גופן Inter ו-CSS
│   ├── App.tsx                          # Layout: NavBar + Routes (/, /about)
│   ├── components/
│   │   ├── NavBar.tsx                   # "דף הבית" / "אודות" עם NavLink פעיל
│   │   ├── TaskList.tsx                 # Loading / Error / Empty / שורות
│   │   └── TaskDetails.tsx              # הודעת בחירה או שדות readOnly
│   ├── pages/
│   │   ├── HomePage.tsx                 # טעינה, state של משימות ובחירה
│   │   └── AboutPage.tsx
│   ├── api/tasksClient.ts               # fetch('/api/tasks') + טיפול בשגיאות HTTP
│   ├── utils/taskLabel.ts (+ .test.ts)  # כותרת, או שורה ראשונה של התיאור
│   └── styles/global.css                # Design Tokens, RTL, Responsive
├── shared/types.ts                      # Task: id, title, description, dueDate, completed, position
├── server/
│   ├── db.ts                            # pg.Pool ברמת מודול (max 1, SSL, timeouts, date parser)
│   ├── tasksRepository.ts               # listTasks() – SQL פרמטרי
│   └── http.ts                          # sendJson / sendError בפורמט {error:{code,message}}
├── api/tasks/index.ts (+ .test.ts)      # GET בלבד בשלב זה; אחר → 405
├── supabase/
│   ├── config.toml                      # נוצר ב-supabase init
│   └── migrations/<timestamp>_create_tasks.sql
├── scripts/
│   ├── install-browser.mjs              # postinstall: Chromium לתוך node_modules (ADR-11)
│   └── seed-dev.mjs                     # הוספת משימות בדיקה ל-Dev בלבד
├── test-support/devSnapshot.ts          # שמירה ושחזור טבלת tasks ב-Dev (ADR-7/11)
├── server/tasksRepository.integration.test.ts
└── e2e/
    ├── navigation.spec.ts
    └── tasks-view.spec.ts
```

**Dependencies:** `react`, `react-dom`, `react-router-dom`, `pg`, `@fontsource-variable/inter`.
**devDependencies:** `typescript`, `vite`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`, `@types/pg`, `@types/node`, `@vercel/node`, `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, `@playwright/test`, `vercel`, `supabase` (ADR-4, ADR-11). `@dnd-kit/*` יותקן רק ב-Milestone 4.

**Scripts ב-`package.json`:**
- `dev` → `vercel dev --listen 3000`
- `build` → `tsc --noEmit && vite build`
- `test` → `vitest run` (ללא `*.integration.test.ts`)
- `test:integration` → `vitest run --config` ייעודי ל-`*.integration.test.ts`, עם `node --env-file=.env` / טעינת `.env`
- `test:e2e` → `playwright test`
- `seed:dev` → `node --env-file=.env scripts/seed-dev.mjs`
- `postinstall` → `node scripts/install-browser.mjs`

---

## 3. מסד הנתונים

### 3.1 Migration: `supabase/migrations/<timestamp>_create_tasks.sql`
כתובה כך שהרצה חוזרת שלה על Dev אינה נכשלת (`if not exists`, `drop policy if exists`):

- `create table if not exists public.tasks` עם העמודות מ-ARCHITECTURE 2.3: `id uuid pk default gen_random_uuid()`, `title varchar(100) null`, `description varchar(2000) null`, `due_date date null`, `completed boolean not null default false`, `position integer not null`, `created_at`/`updated_at timestamptz not null default now()`.
- `check (position >= 0)`.
- `check (coalesce(btrim(title), '') <> '' or coalesce(btrim(description), '') <> '')` – לפחות אחד מהשניים עם תוכן שאינו רווחים. (`btrim` מוריד רווחים; אם ייבחר להוריד גם ירידות שורה/טאבים – שימוש ב-`regexp_replace` על `\s`.)
- `create index if not exists tasks_position_id_idx on public.tasks (position, id)`.
- **ADR-2:** `alter table … enable row level security`; `revoke all … from anon, authenticated`; `grant usage on schema public to app_backend`; `grant select, insert, update, delete on public.tasks to app_backend`; `create policy tasks_app_backend_all … for all to app_backend using (true) with check (true)`.
- אין `UNIQUE` על `position` (ARCHITECTURE 2.3).

### 3.2 החלה ובדיקה – Dev בלבד
- `npx supabase init` (פעם אחת), `npx supabase link --project-ref <DEV_REF>` – **לפרויקט ה-Dev בלבד**, לעולם לא ל-Production.
- `npx supabase db push` → החלה על Dev; `npx supabase migration list` לאימות.
- בדיקת "ניתנות להרצה מחדש": הרצה חוזרת של קובץ ה-Migration על Dev (למשל `npx supabase db reset --linked`, שמוחק את נתוני הבדיקה ב-Dev – **רק אחרי אישורך**), ואז `seed:dev` מחדש.
- Production **אינו** מקבל Migrations ב-Milestone הזה ידנית; הוא יקבל אותן אוטומטית ב-Push (ADR-1).

### 3.3 נתוני בדיקה – `scripts/seed-dev.mjs`
מוסיף כ-6 משימות לבדיקה, דרך `DATABASE_URL` שב-`.env` (Dev בלבד): משימה עם כותרת, משימה **ללא כותרת עם תיאור ארוך** (לבדיקת הקיצור), משימה שהושלמה, משימה ללא תאריך יעד, וכותרת ארוכה. ה-`position` נקבע ברצף אחרי הקיימים. הסקריפט מדפיס כמה רשומות נוספו ואינו מוחק דבר.

---

## 4. Backend

### 4.1 `server/db.ts`
- `pg.Pool` אחד ברמת המודול, נוצר בעצלתיים (Lazy) מ-`process.env.DATABASE_URL`; שגיאה ברורה אם המשתנה חסר.
- `max: 1`, `idleTimeoutMillis` קצר (~10s), `connectionTimeoutMillis` (~5s), `statement_timeout`/`query_timeout` (~10s).
- `ssl: { rejectUnauthorized: false }` (ADR-3).
- `types.setTypeParser(1082, v => v)` – `date` נשאר מחרוזת `YYYY-MM-DD`.
- חיבור: Transaction Pooler, פורט 6543, משתמש `app_backend.<project-ref>` (ADR-2). אין Named Prepared Statements.

### 4.2 `server/tasksRepository.ts`
- `listTasks(): Promise<Task[]>` – `select id, title, description, due_date, completed, position from public.tasks order by position asc, id asc`, ומיפוי ל-camelCase (`dueDate`).

### 4.3 `api/tasks/index.ts`
- `GET` → `200` עם מערך (גם ריק), כותרת `Cache-Control: no-store`.
- Method אחר → `405` עם `{error:{code:"METHOD_NOT_ALLOWED", message}}` וכותרת `Allow: GET` (POST יתווסף ב-Milestone 2).
- כשל DB → `503` עם הודעה בעברית כללית, בלי לחשוף SQL/Secrets; לוג שגיאה ללא תוכן משימות.

### 4.4 `vercel.json`
- `rewrites`: `{ "source": "/((?!api/).*)", "destination": "/index.html" }` – קבצים סטטיים קיימים מוגשים לפני ה-Rewrite; `/api/*` לא מושפע.
- `regions`: אזור קרוב ל-Supabase.
- הערה: אם Vercel ידרוש סיומות `.js` בייבוא יחסי בקובצי TypeScript של `api/`/`server/` (ESM), נשתמש בהן – ייבדק ב-`vercel dev` וב-`vercel build`.

---

## 5. Frontend

### 5.1 Layout וניווט
- `index.html`: `lang="he" dir="rtl"`, `<title>` בעברית.
- `NavBar`: שני `NavLink` – **דף הבית** (`/`) ו-**אודות** (`/about`); הפעיל מובחן בכחול/רקע עדין. ללא אייקון המבורגר (DESIGN 1.6).
- נתיב לא מוכר → הפניה ל-`/` (אין דפים נוספים).

### 5.2 דף הבית (`HomePage`)
- כותרת **המשימות שלי** (H1).
- `useEffect` → `tasksClient.getTasks()`; state: `status: 'loading' | 'error' | 'ready'`, `tasks`, `selectedId` (מתחיל `null`).
- **הפרדה בין שגיאה לרשימה ריקה:** הודעת "אין עדיין משימות" מוצגת רק כש-`status === 'ready'` והמערך ריק; כל כשל (רשת, HTTP לא-2xx, JSON לא תקין) → הודעת שגיאה.
- אין שימוש ב-Local Storage / Session Storage / IndexedDB.

### 5.3 `TaskList`
- כרטיס עם כותרת אזור **רשימת משימות**.
- כל שורה: `<button>` לבחירה (או `role` מתאים עם מקלדת) עם הטקסט מ-`getTaskLabel`, ו-Checkbox Disabled.
- משימה שהושלמה: Checkbox מסומן + טקסט חצוי ובצבע משני – גם כשמוצגת תחילת תיאור.
- שורה נבחרת: רקע תכלת עדין + `aria-current`/`aria-pressed`.

### 5.4 `TaskDetails`
- כרטיס עם כותרת אזור **פרטי משימה**.
- ללא בחירה: **"בחר משימה מהרשימה כדי לצפות בפרטיה"** (ממורכז).
- עם בחירה: תוויות **כותרת**, **תיאור**, **תאריך יעד** ושדות `readOnly` (input, textarea, `input type="date"`); שדה ריק מוצג ריק.

### 5.5 דף אודות
- כותרת **אודות** ופסקה קצרה, לפי ה-Wireframe: האתר הוא TODO List משותף ופשוט, ללא התחברות, שמאפשר ליצור, לצפות, לעדכן, לסמן כהושלמו, לסדר מחדש ולמחוק משימות משותפות.

### 5.6 CSS (`global.css`) – בסיס, לא ליטוש סופי
- Design Tokens כ-CSS Variables לפי DESIGN 2.1 (`--primary`, `--background`, `--surface`, `--text-primary`, `--text-secondary`, `--border`, `--input-background`, `--error`…).
- גופן: `"Inter Variable", "Segoe UI", Roboto, "Noto Sans Hebrew", sans-serif` (ADR-4); גדלי H1 32 / H2 24 / H3 18 / Body 16/14.
- כרטיסים: רקע לבן, גבול בהיר, רדיוס 12px, צל `0 2px 8px rgba(0,0,0,0.08)`; מרווחים בכפולות 8px.
- **דסקטופ** (≥ 768px): Grid שתי עמודות – הרשימה בצד ימין (ראשונה ב-DOM, RTL), הפרטים משמאל.
- **מובייל** (< 768px): עמודה אחת, הרשימה מעל הפרטים; שדות ברוחב מלא.
- Focus גלוי בכחול.

---

## 6. סביבות, Secrets ופריסה

- **`.env.example`:** `DATABASE_URL=` בלבד. מועתק פעם אחת ל-`.env`; **את הערך (Dev) אתה ממלא**. Claude לא קורא את `.env`.
- **אין** משתני `VITE_*` עם פרטי מסד; הדפדפן פונה רק ל-`/api/...`.
- **Vercel Environment Variables** (אתה מגדיר בממשק, אני מדריך):
  - `DATABASE_URL` לסביבת **Production** → Pooler של פרויקט Production.
  - `DATABASE_URL` לסביבת **Preview** (ו-Development) → Pooler של פרויקט Dev.
- **Vercel ↔ GitHub:** פרויקט Vercel אחד המחובר ל-Repository; Framework Vite, Build `npm run build`, Output `dist`. Production Branch: `main`.
- **Supabase GitHub Integration:** רק בפרויקט **Production**, עם *Deploy to production* פעיל, Working directory: שורש ה-Repository (שבו `supabase/`), ענף `main`. פרויקט ה-Dev לא מחובר ל-GitHub.
- ה-Push עצמו – רק כשתבקש "דחוף שינויים לגיטהאב", ולפניו אציג מה ה-Migration תשנה ב-Production (CLAUDE.md).

---

## 7. מה תצטרך לעשות בעצמך (אעצור ואדריך צעד אחר צעד)

הבנייה תעצור בנקודות האלה. שום סיסמה לא תעבור דרכי – אתה מקליד אותה ישירות בממשקים או ב-`.env`.

1. **שני פרויקטי Supabase** (Dev ו-Production), באותו אזור (למשל Frankfurt), עם **Data API כבוי** בעת היצירה. לשמור לעצמך את סיסמת ה-Database של כל אחד.
2. **יצירת המשתמש `app_backend`** בכל אחד משני הפרויקטים, ב-SQL Editor: `create user app_backend with password '<סיסמה שתבחר>';` – סיסמה שונה לכל פרויקט (ADR-2). חייב לקרות **לפני** החלת ה-Migration.
3. **התחברות ל-Supabase CLI** בטרמינל: `npx supabase login` (אחרי ש-`npm install` ירוץ), ואז אני מקשר ל-Dev בלבד (`supabase link` יבקש ממך את סיסמת ה-Database של Dev).
4. **מילוי `DATABASE_URL` ב-`.env`** – כתובת ה-Transaction Pooler של **Dev** עם `app_backend.<ref>` והסיסמה שלו.
5. **Repository ריק ב-GitHub** – ולתת לי את הכתובת (ישמש ב-Push).
6. **Vercel:** `npx vercel login` בטרמינל; אני יוצר/מקשר את הפרויקט (`vercel link`); אתה מחבר בממשק Vercel את ה-Repository ומגדיר את שני ערכי `DATABASE_URL` (Production / Preview).
7. **Supabase GitHub Integration** בפרויקט ה-Production, כמתואר בסעיף 6.

סעיפים 1–4 נחוצים כדי שאוכל לבנות ולבדוק מקומית; סעיפים 5–7 נחוצים לתנאי ה-DoD האחרון ולבדיקה שלאחר הדחיפה.

---

## 8. סדר הבנייה

1. Scaffolding: `package.json`, TypeScript, Vite, React Router, `index.html`, `vercel.json`, `.env.example` → `.env`, עדכון `.gitignore` רק אם צריך. `npm install`.
2. ⏸ צעדים 1–4 שלך (Supabase, `app_backend`, CLI, `.env`).
3. Migration → `supabase db push` על Dev → `migration list`.
4. `server/db.ts`, `tasksRepository.ts`, `api/tasks/index.ts` + Unit test ל-Handler (Repository מדומה: 200 עם מערך, `[]`, 405, 503, `no-store`).
5. `seed:dev` → בדיקה ידנית: `curl http://localhost:3000/api/tasks` תחת `vercel dev`.
6. Frontend: NavBar, Home, TaskList, TaskDetails, About, CSS; Unit test ל-`getTaskLabel`; בדיקת RTL ב-Testing Library לרשימה ריקה מול שגיאה.
7. Integration (`test:integration`, ADR-7): `listTasks` מחזיר לפי `position, id`; טבלה ריקה → `[]`; כולל `devSnapshot` שמחזיר את נתוני ה-Dev בסיום.
8. E2E (`test:e2e`, ADR-11) ב-Desktop Chrome ו-Pixel 7:
   - טעינת `/` – אין בחירה, הודעת הבחירה מוצגת; לחיצה על שורה מציגה פרטים.
   - שורה ללא כותרת מציגה תחילת תיאור; משימה שהושלמה – Checkbox מסומן וטקסט חצוי.
   - ניווט `/` ↔ `/about`, ו-Refresh ישיר ב-`/about`.
   - `page.route` מחזיר 500 → הודעת שגיאה ולא "אין משימות"; `[]` → מצב ריק.
   - הוספת רשומה ל-Dev (דרך `pg` בבדיקה) → `reload` → הרשומה מופיעה; `localStorage` ריק.
   - פריסה: במובייל הרשימה מעל הפרטים; בדסקטופ הרשימה מימין לפרטים (השוואת `boundingBox`).
9. `npm run build`; בדיקה ש-`dist/` אינו מכיל `pooler.supabase.com`, `postgres://`, `app_backend` או `DATABASE_URL`.
10. ⏸ צעדים 5–7 שלך (GitHub, Vercel, Integration); `npx vercel build` מקומי לאימות תצורת Vercel.
11. עדכון `CLAUDE.md` → **פקודות הרצה** (`npm run dev`, `npm test`), ADRs אם נדרשו, סימון 🟡 ב-`MILESTONES.md`, סגירת השרת המקומי.

---

## 9. בדיקה מול Definition of Done

| תנאי DoD | איך ייבדק |
|---|---|
| `GET /api/tasks` בסדר קבוע; ריק → `[]` | Unit ל-Handler + Integration מול Dev + `curl` |
| כותרת / תיאור מקוצר; משימה שהושלמה מובחנת | Unit ל-`getTaskLabel` + E2E על נתוני ה-seed |
| אין בחירה בכניסה; בחירה מציגה פרטים; שגיאה ≠ רשימה ריקה | E2E (כולל `page.route` 500) + Testing Library |
| ניווט ו-Refresh ב-`/about` | E2E מול `vercel dev` (SPA fallback) |
| מבנה לפי Wireframes בדסקטופ ובמובייל, צבעי וגופני Style Guide | E2E פריסה + צילומי מסך בשני הגדלים שאבדוק מול התמונות |
| שינוי נתונים במסד + Refresh מראה עדכון; אין Local Storage | E2E (הוספה ב-`pg` → reload; בדיקת `localStorage`) |
| אין פרטי חיבור בקוד לקוח או ב-Git; Migrations מתועדות, הוחלו על Dev וניתנות להרצה מחדש | grep על `dist/` ועל הקבצים שיעלו ל-Git; `migration list`; הרצה חוזרת על Dev (באישורך) |
| רץ מקומית מול Dev; Production לא בשימוש | `.env` מכיל Dev בלבד (לפי הצהרתך); CLI מקושר ל-Dev; Preview מוגדר ל-Dev ב-Vercel |
| Vercel ו-Supabase GitHub Integration מחוברים; Build מקומי עובר; בדיקות טעינה/ניווט ב-Chrome | הדרכה שלך בממשקים + `npm run build` + `npx vercel build` + E2E |
| **לאחר הדחיפה:** Deployment תקין, Migrations על Production אוטומטית, האתר החי טוען מ-Production ומנווט | רק אחרי "דחוף שינויים לגיטהאב": בדיקת סטטוס Deployment, טבלת `tasks` ב-Production (קריאה בלבד), E2E קריאה בלבד מול הכתובת החיה |
