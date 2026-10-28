# תוכנית – Milestone 2: יצירת משימה באמצעות Modal

**מקורות:** `MILESTONES.md` (Milestone 2), `PRD.md` (זרימה 2, FR-02, FR-03, FR-10, Edge Cases), `ARCHITECTURE.md` (2.3, 2.4, 2.5, 2.6, ADR-5, ADR-6, ADR-7, ADR-11, ADR-12), `DESIGN.md` (1.1, 1.3, 1.6, 2.3), `wireframes.png` (מסך "הוספת משימה").

**מטרה:** מבקר לוחץ **"הוסף משימה"**, ממלא טופס ב-Modal, והמשימה נשמרת במסד, מופיעה בסוף הרשימה ונבחרת. כולל Validation זהה בלקוח ובשרת ותקרת 1,000 משימות שנאכפת בשרת תחת נעילה.

**ללא שינוי במסד הנתונים:** הטבלה וה-Constraints מ-Milestone 1 מספיקים. אין Migration חדשה, ולכן הדחיפה של אבן הדרך הזו לא תשנה את מבנה מסד ה-Production.

---

## 1. קבצים

| קובץ | פעולה | תוכן |
|---|---|---|
| `shared/validation.ts` | חדש | כללי Validation והודעות בעברית, משותפים ללקוח ולשרת (ADR-6) |
| `shared/validation.test.ts` | חדש | Unit tests לכללים |
| `shared/types.ts` | שינוי | הוספת `TaskInput` (`{title, description, dueDate}`) |
| `server/tasksRepository.ts` | שינוי | `createTask()` ב-Transaction עם Advisory Lock, ספירה והוספה בסוף |
| `server/listLock.ts` | חדש | קבוע מפתח ה-Advisory Lock ופונקציה `lockTaskList(client)` – ישמשו גם את המחיקה (M3) והסדר (M4) |
| `server/http.ts` | שינוי | `readJsonBody()` – בדיקת `Content-Type`, גודל (16KB) ו-JSON תקין |
| `api/tasks/index.ts` | שינוי | הוספת `POST` לצד `GET`; `Allow: GET, POST` |
| `src/api/tasksClient.ts` | שינוי | `createTask(input)` שמחזיר את המשימה או זורק שגיאה עם `code`/`message`/`field` מהשרת |
| `src/components/CreateTaskModal.tsx` | חדש | ה-Modal והטופס |
| `src/components/AddTaskButton.tsx` (או בתוך `HomePage`) | חדש/שינוי | הכפתור + הודעת "הרשימה מלאה" |
| `src/pages/HomePage.tsx` | שינוי | פתיחת/סגירת ה-Modal, הוספה לרשימה ובחירת המשימה החדשה |
| `src/utils/date.ts` | חדש | `localToday()` – התאריך המקומי של המכשיר כ-`YYYY-MM-DD` (לא `toISOString`) |
| `src/styles/global.css` | שינוי | כפתורים (Primary/Secondary/Disabled), Overlay, Modal, הודעות שגיאה |
| `tests/api/tasks.test.ts` | שינוי | בדיקות `POST` (Repository מדומה) |
| `src/pages/HomePage.test.tsx` | שינוי | בדיקות ה-Modal וזרימת היצירה (fetch מדומה) |
| `server/tasksRepository.integration.test.ts` | שינוי | יצירה מול Dev: מיקום בסוף, תקרה, שתי יצירות מקבילות |
| `e2e/tasks-create.spec.ts` | חדש | זרימת יצירה מלאה ב-Chrome (Desktop + Mobile) |
| `e2e/tasks-view.spec.ts` | שינוי | הבדיקה "No write actions yet" תתעדכן: כפתור "הוסף" קיים כעת; "שמור"/"מחק" עדיין לא |
| `spec/MILESTONES.md` | שינוי | סימון 🟡 בסיום הבנייה |

אין תלויות npm חדשות.

---

## 2. Validation משותף – `shared/validation.ts`

- קבועים: `TITLE_MAX = 100`, `DESCRIPTION_MAX = 2000`, `TASK_LIMIT = 1000`, `PRODUCT_TIME_ZONE = 'Asia/Jerusalem'` (ADR-5).
- `normalizeText(value)`: `trim`; מחרוזת ריקה ⇐ `null`.
- `charLength(value)`: אורך ב-Code Points (`[...value].length`), כמו `varchar` (ADR-6).
- `isValidDateString(value)`: תבנית `YYYY-MM-DD` **ותאריך אמיתי** (למשל `2026-02-30` נדחה).
- `todayInTimeZone(tz)`: התאריך הנוכחי באזור הזמן, באמצעות `Intl.DateTimeFormat('en-CA', { timeZone })` – לשימוש השרת.
- `validateTaskInput(input, today, savedDueDate?)` מחזירה את הקלט המנורמל, או רשימת שגיאות `{field, message}`:
  - כותרת ותיאור ריקים אחרי `trim` ⇐ `field: 'form'`, **"יש להזין כותרת או תיאור למשימה"** (נוסח ה-PRD).
  - כותרת מעל 100 ⇐ `field: 'title'`, "הכותרת יכולה להכיל עד 100 תווים".
  - תיאור מעל 2,000 ⇐ `field: 'description'`, "התיאור יכול להכיל עד 2,000 תווים".
  - תאריך לא תקין ⇐ `field: 'dueDate'`, "תאריך היעד אינו תקין".
  - תאריך לפני `today` ⇐ `field: 'dueDate'`, "תאריך היעד לא יכול להיות בעבר". הפרמטר `savedDueDate` מוכן כבר עכשיו ל-M3 (ADR-8): אם התאריך זהה לשמור – לא בודקים עבר. ביצירה הוא לא מועבר.
- השוואת תאריכים כמחרוזות `YYYY-MM-DD` (סדר מילוני = סדר כרונולוגי).
- הקובץ בטוח לדפדפן: אין בו גישה ל-Database או סודות.

---

## 3. שרת

### 3.1 `POST /api/tasks` – `api/tasks/index.ts`
1. Method: `GET` ממשיך כמו היום; `POST` חדש; כל השאר ⇐ `405` עם `Allow: GET, POST`.
2. `readJsonBody`: `Content-Type` חייב להיות `application/json` ⇐ אחרת `415`/`400 INVALID_REQUEST`; גוף מעל 16KB ⇐ `413`/`400`; JSON לא תקין או שאינו אובייקט ⇐ `400 INVALID_REQUEST`.
3. מבנה: `title` ו-`description` חייבים להיות `string` או `null` (או חסרים ⇐ `null`); `dueDate` מחרוזת או `null`. סוג אחר ⇐ `400`. שדות נוספים (למשל `completed`, `position`) – מתעלמים.
4. `validateTaskInput(body, todayInTimeZone(PRODUCT_TIME_ZONE))`; שגיאה ⇐ `422 VALIDATION_ERROR` עם `field` ו-`message` של השגיאה הראשונה.
5. `createTask(normalized)` ⇐ `201` עם המשימה החדשה (`Cache-Control: no-store` כמו ב-`sendJson`).
6. `TaskLimitError` ⇐ `409 TASK_LIMIT_REACHED`, "הרשימה מלאה (1,000 משימות). יש למחוק משימה לפני הוספת משימה חדשה."
7. כל שגיאה אחרת ⇐ `503 SERVICE_UNAVAILABLE`, "לא ניתן לשמור את המשימה כרגע. נסה שוב." – בלוג רק הודעת השגיאה, **בלי** תוכן המשימה.

### 3.2 `createTask` – `server/tasksRepository.ts`
באותו `client` מ-`getPool().connect()` מ-`BEGIN` ועד `COMMIT`/`ROLLBACK` (ARCHITECTURE 2.9), ושחרורו ב-`finally`:
```sql
begin;
select pg_advisory_xact_lock($LIST_LOCK_KEY);           -- server/listLock.ts
select count(*)::int as count, coalesce(max(position), -1) + 1 as next from public.tasks;
-- count >= 1000  ⇒ rollback; throw TaskLimitError
insert into public.tasks (title, description, due_date, completed, position)
values ($1, $2, $3, false, $4)
returning id, title, description, due_date, completed, position;
commit;
```
- `position` = `max + 1`, כדי שהמשימה תהיה תמיד בסוף גם אם יש פערים במיקומים (נרמול מלא יגיע עם המחיקה והגרירה).
- מפתח הנעילה: קבוע מספרי אחד ב-`server/listLock.ts` (ARCHITECTURE 2.6: אותה נעילה לכל שינויי המבנה). Transaction-level, משתחרר אוטומטית ב-`COMMIT`/`ROLLBACK`.
- כל השאילתות פרמטריות; ללא Named Prepared Statements.

---

## 4. לקוח

### 4.1 כפתור "הוסף משימה" – `HomePage`
- בשורת הכותרת, ליד **"המשימות שלי"** (בדסקטופ בצד שמאל לפי ה-Wireframe); במובייל ברוחב מלא מעל הרשימה (DESIGN 1.6).
- Primary כחול. **Disabled** כאשר:
  - ברשימה 1,000 משימות או יותר ⇐ לידו ההודעה: **"הרשימה מלאה (1,000 משימות). יש למחוק משימה כדי להוסיף חדשה."**
  - הרשימה עדיין נטענת או שהטעינה נכשלה – הלקוח לא יודע אם הרשימה מלאה ואין לאן להוסיף את המשימה. (החלטת מימוש קטנה; אין הודעה נוספת – הודעת שגיאת הטעינה כבר מוצגת.)

### 4.2 `CreateTaskModal`
- **מבנה (Wireframe "הוספת משימה"):** Overlay אפור שקוף; חלון לבן ממורכז; כותרת **"הוספת משימה"** ואייקון X לסגירה (`aria-label="סגור"`); שדות:
  - **כותרת** – `input type="text"`, Placeholder: **"הזן כותרת (לא חובה)"**.
  - **תיאור** – `textarea`, Placeholder: **"הזן תיאור (לא חובה)"**.
  - **תאריך יעד** – `input type="date"` עם `min` = היום המקומי; ערך התחלתי = `localToday()`. ניקוי דרך בקר התאריך המובנה של Chrome (מחיקה במקלדת / "Clear" ב-Android). אין שדה שעה ואין שדה סטטוס.
  - אזור הודעה כללית מעל הכפתורים (כמו ב-Wireframe) – לשגיאת "כותרת או תיאור" ולשגיאות שרת/רשת.
  - כפתורים: **"הוסף משימה"** (Primary, `type="submit"`) ו-**"סגור"** (Secondary).
- **נגישות:** `role="dialog"`, `aria-modal="true"`, `aria-labelledby` לכותרת; פוקוס לשדה הכותרת בפתיחה; `Escape` סוגר (כמו "סגור"); בסגירה הפוקוס חוזר לכפתור "הוסף משימה". לחיצה על ה-Overlay **לא** סוגרת – למניעת אובדן טיוטה בטעות. `dir` יורש RTL.
- **טיוטה:** State בתוך הקומפוננטה בלבד. ה-Modal מוסר מה-DOM בסגירה (Unmount), ולכן כל פתיחה מתחילה מחדש: כותרת ותיאור ריקים, תאריך = היום. אין Local Storage.
- **שליחה:**
  1. `validateTaskInput` עם `localToday()`. שגיאה ⇐ הודעה ליד השדה הרלוונטי (`aria-invalid`, `aria-describedby`), או באזור הכללי לשגיאת "כותרת או תיאור"; לא נשלחת בקשה; הערכים נשארים.
  2. בזמן שמירה: הכפתור **"הוסף משימה"** מושבת ומציג "שומר…" – מונע לחיצה כפולה ויצירת שתי רשומות.
  3. הצלחה (`201`) ⇐ `onCreated(task)`: המשימה נוספת **לסוף** הרשימה, `selectedId` = המזהה החדש, ה-Modal נסגר.
  4. כישלון ⇐ ה-Modal נשאר פתוח עם כל הערכים. שגיאת `422` עם `field` ⇐ ליד השדה; `409 TASK_LIMIT_REACHED` ושגיאות אחרות ⇐ הודעת השרת באזור הכללי; כשל רשת ⇐ "לא ניתן להתחבר לשרת. בדוק את החיבור לאינטרנט ונסה שוב." המשתמש יכול לנסות שוב.
- **שגיאות** בצבע `error` עדין, לפי DESIGN 2.3 ("Feedback").

### 4.3 `tasksClient.createTask`
- `POST /api/tasks`, `Content-Type: application/json`, גוף `{title, description, dueDate}` (מחרוזות ריקות נשלחות כמו שהן – השרת מנרמל; או `null` לתאריך ריק).
- `201` ⇐ מחזיר `Task`. אחרת זורק `ApiRequestError` עם `status`, `code`, `message`, `field` מגוף השגיאה (אם קיים).

### 4.4 עיצוב – `global.css`
- `.button`, `.button--primary` (`#2F80ED`, טקסט לבן, Hover כהה יותר), `.button--secondary` (לבן עם מסגרת כחולה, Hover תכלת), `:disabled` (אפור בהיר, `cursor: not-allowed`) – לפי ה-Style Guide.
- `.modal-overlay` (רקע `rgba(0,0,0,0.4)`, `position: fixed`, מרכוז), `.modal` (לבן, רדיוס 12–16px, צל רך, רוחב עד ~480px, ובמובייל `calc(100% - 32px)` עם גלילה פנימית אם הגובה לא מספיק).
- `.field__error`, `.form-alert` (אדום עדין), `.field__input[aria-invalid="true"]` (מסגרת אדומה).
- הליטוש החזותי המלא נשאר ל-Milestone 5.

---

## 5. בדיקות

### 5.1 Unit – `npm test`
- **`shared/validation.test.ts`:** כותרת בלבד / תיאור בלבד / שניהם תקינים; ריק ורווחים בלבד ⇐ השגיאה מה-PRD; 100 ו-101 תווים; 2,000 ו-2,001; תווי Emoji נספרים כתו אחד; תאריך היום / מחר / אתמול; `null`; `2026-02-30` ופורמטים שגויים; `savedDueDate` זהה לתאריך בעבר ⇐ תקין; `todayInTimeZone` מחזיר `YYYY-MM-DD`.
- **`tests/api/tasks.test.ts`** (Repository מדומה): `201` עם המשימה; `422` עם `field` לכל סוג שגיאה ו-`createTask` לא נקרא; `400` ל-JSON שבור / סוג שדה שגוי / Content-Type שגוי; `409 TASK_LIMIT_REACHED`; `503` בלי פרטים פנימיים; `405` עם `Allow: GET, POST`; שדות `completed`/`position` שנשלחו – מתעלמים.
- **`src/pages/HomePage.test.tsx`** (`fetch` מדומה): הכפתור פותח Modal עם ערכי פתיחה (ריק, ריק, היום); סגירה ופתיחה מאפסות; Validation מוצג בלי לשלוח בקשה ובלי למחוק ערכים; הצלחה סוגרת, מוסיפה בסוף ובוחרת (הפרטים מוצגים); שגיאת שרת משאירה Modal וערכים; ב-1,000 משימות הכפתור Disabled וההודעה מוצגת; בזמן שמירה כפתור השליחה מושבת.

### 5.2 Integration מול Dev – `npm run test:integration` (ADR-7, Snapshot ושחזור)
- יצירה מוסיפה **רשומה אחת** ב-`position` = max+1, `completed = false`, ערכים מנורמלים.
- עם 1,000 משימות ⇐ `TaskLimitError` ואין רשומה חדשה.
- עם 999 משימות, **שתי יצירות מקבילות** משני Pools נפרדים ⇐ בדיוק אחת מצליחה, אחת נכשלת בתקרה, ובסוף יש בדיוק 1,000.
- שתי יצירות מקבילות ברשימה רגילה ⇐ שתיהן נשמרות במיקומים שונים ורציפים.

### 5.3 E2E ב-Chrome – `npm run test:e2e` (Desktop + Mobile, Snapshot של Dev)
- יצירה עם כותרת בלבד, עם תיאור בלבד, ועם שניהם ותאריך מנוקה ⇐ המשימה בסוף הרשימה, נבחרת, ופרטיה מוצגים; אחרי Refresh היא עדיין שם; בדיקה במסד ⇐ רשומה אחת, `completed = false`.
- ריק/רווחים, 101 תווים, תאריך עבר ⇐ הודעה בטופס, אין בקשה, אין רשומה.
- סגירה ב-X / "סגור" / `Escape` ⇐ פתיחה מחדש מאופסת, תאריך = היום.
- שגיאת שרת מדומה (`page.route` ⇐ `503`) ⇐ Modal וערכים נשארים, הודעה מוצגת; ביטול הדימוי ולחיצה חוזרת ⇐ הצלחה.
- 1,000 משימות במסד ⇐ הכפתור Disabled וההודעה מוצגת; `POST` ישיר ⇐ `409`.
- "חלון אחר": `context` דפדפן שני רואה את המשימה שנוצרה.
- בדיקות ה-E2E של Milestone 1 ממשיכות לעבור (עם העדכון שבסעיף 1).

### 5.4 בדיקה ידנית שלי לפני סימון 🟡
- `npm run build` עובר; `npm start` ובדיקה בדפדפן בדסקטופ וברוחב מובייל; סגירת ההרצה בסיום.

---

## 6. מיפוי ל-Definition of Done

| תנאי | איך מתקיים / נבדק |
|---|---|
| יצירה עם כותרת בלבד / תיאור בלבד / שניהם; תאריך אופציונלי | 2, 3.1, 4.2 · בדיקות 5.1, 5.3 |
| ריק/רווחים, חריגת אורך ותאריך עבר נחסמים עם הודעה בטופס | 2, 4.2 (לקוח) + 3.1 (שרת) · 5.1, 5.3 |
| תאריך ראשוני = היום, ניתן לנקות, אין שעה | 4.2 (`localToday`, `type="date"`) · 5.1, 5.3 |
| שמירה ⇐ רשומה אחת, "לביצוע", מוצגת, Modal נסגר, נבחרת | 3.2, 4.2 (נעילת כפתור בזמן שמירה) · 5.2, 5.3 |
| 1,000 משימות ⇐ כפתור לא זמין + הודעה; `409` גם בשתי בקשות מקבילות | 3.2 (נעילה + ספירה), 4.1 · 5.2, 5.3 |
| סגירה מאפסת; שגיאת שרת משאירה Modal וערכים ומאפשרת ניסיון חוזר | 4.2 (Unmount, טיפול בשגיאות) · 5.1, 5.3 |
| נראה אחרי Refresh ובחלון אחר; בדיקות קודמות עוברות | 5.3 + רגרסיה של M1 |

---

## 7. החלטות מימוש קטנות (לאישורך במסגרת אישור התוכנית)

1. **Placeholders** לפי ה-Wireframe: "הזן כותרת (לא חובה)" / "הזן תיאור (לא חובה)" (ה-Wireframe גובר על ה-Style Guide בתוכן).
2. **נוסחי הודעות** שאינם מוגדרים ב-PRD (אורך, תאריך, רשימה מלאה, שגיאת רשת) – כמפורט בסעיפים 2, 3.1, 4.1, 4.2.
3. **הכפתור מושבת** גם בזמן טעינת הרשימה או אחרי כישלון טעינה.
4. **לחיצה על הרקע** סביב ה-Modal לא סוגרת אותו; `Escape`, X ו-"סגור" כן.
5. **טקסט נשמר אחרי `trim`** (רווחים בתחילה ובסוף מוסרים).
6. **ניקוי תאריך** דרך בקר התאריך המובנה של Chrome, בלי כפתור "נקה" נוסף (לא מופיע ב-Wireframe).

אם אחת מההחלטות האלה היא בעצם החלטה טכנית משמעותית שמתבררת במהלך הבנייה (למשל מפתח הנעילה המשותף), היא תתועד כ-ADR-13 ב-`ARCHITECTURE.md`.
