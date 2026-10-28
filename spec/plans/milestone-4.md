# תוכנית – Milestone 4: סטטוס ביצוע וסדר ידני

**מקורות:** `MILESTONES.md` (Milestone 4), `PRD.md` (זרימות 4 ו-5, FR-01, FR-05, FR-06, FR-07, Edge Cases), `ARCHITECTURE.md` (2.2, 2.4–2.6, 2.10, ADR-7, ADR-9, ADR-11, ADR-13), `DESIGN.md` (1.1, 1.6, 2.3), `wireframes.png` (שורת משימה: טקסט, Checkbox וידית גרירה).

**מטרה:** Checkbox בכל שורה שומר מיד "הושלמה"/"לביצוע" בלי להזיז את המשימה; ידית גרירה (עכבר ומגע) משנה את סדר הרשימה, והסדר נשמר במסד לכל המבקרים. כשלים מחזירים את המצב השמור האחרון עם הודעה, ו-`409` בגרירה מציע לרענן את הרשימה.

**ללא שינוי במסד הנתונים:** הטבלה, ה-Constraints וההרשאות הקיימות (`select`/`update` ל-`app_backend`) מספיקים; אין אילוץ UNIQUE על `position` (2.3). אין Migration חדשה, ולכן הדחיפה של אבן הדרך הזו לא תשנה את מבנה מסד ה-Production.

---

## 1. קבצים

| קובץ | פעולה | תוכן |
|---|---|---|
| `package.json` / `package-lock.json` | שינוי | תלויות חדשות: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` (גרסה יציבה נוכחית, לפי ARCHITECTURE 1) |
| `api/tasks/[id]/status.ts` | חדש | `PATCH /api/tasks/:id/status` (מיקום לפי ADR-9) |
| `api/tasks/order.ts` | חדש | `PUT /api/tasks/order` (נתיב סטטי, גובר על `[id]` – ADR-9) |
| `server/tasksRepository.ts` | שינוי | `setTaskCompleted(id, completed)`, `reorderTasks(orderedIds)`, שגיאה `OrderConflictError` |
| `server/http.ts` | שינוי קטן | `ORDER_MAX_BODY_BYTES = 64 * 1024`; קריאת `{completed}` ו-`{orderedIds}` עם בדיקות קלט |
| `shared/types.ts` | שינוי קטן | טיפוסי גוף הבקשות `TaskStatusInput`, `TaskOrderInput` |
| `src/api/tasksClient.ts` | שינוי | `setTaskCompleted(id, completed)`, `reorderTasks(orderedIds)` |
| `src/utils/taskOrder.ts` | חדש | פונקציות טהורות: הזזת משימה במערך, החזרת סדר קודם תוך שמירת שינויים אחרים, החלת מיקומים מתשובת השרת |
| `src/components/TaskList.tsx` | שינוי | `DndContext` + `SortableContext`, שורה ניתנת לגרירה, Checkbox פעיל, הודעת שגיאה וכפתור "רענן את הרשימה" |
| `src/pages/HomePage.tsx` | שינוי | שמירת סטטוס וסדר עם UI אופטימי ו-Rollback, רענון רשימה אחרי `409` |
| `src/styles/global.css` | שינוי | ידית גרירה, שורה בזמן גרירה, Checkbox פעיל, הודעת שגיאה ברשימה |
| `tests/api/task-status.test.ts` | חדש | בדיקות `PATCH .../status` עם Repository מדומה |
| `tests/api/task-order.test.ts` | חדש | בדיקות `PUT /api/tasks/order` עם Repository מדומה |
| `src/utils/taskOrder.test.ts` | חדש | Unit לפונקציות הסדר |
| `src/pages/HomePage.test.tsx` | שינוי | Checkbox: שמירה, Rollback, השבתה בזמן שמירה, שמירת הטיוטה |
| `server/tasksRepository.integration.test.ts` | שינוי | סטטוס וסדר מול Dev, כולל מקביליות |
| `e2e/tasks-status-order.spec.ts` | חדש | Checkbox וגרירה ב-Chrome (Desktop + Mobile Touch) |
| `spec/MILESTONES.md` | שינוי | סימון 🟡 בסיום הבנייה |

---

## 2. שרת

### 2.1 `api/tasks/[id]/status.ts` – `PATCH`
1. Method אחר ⇐ `405` עם `Allow: PATCH`. מזהה שאינו UUID ⇐ `400 INVALID_ID` (`readTaskId`).
2. גוף: `readJsonObject` (16KB). חייב `completed` מסוג `boolean` (לא מחרוזת/מספר, לא חסר) ⇐ אחרת `400 INVALID_REQUEST`. שדות אחרים מתעלמים מהם.
3. `setTaskCompleted(id, completed)`: שאילתה אחת, **בלי** Advisory Lock (ADR-9):
   `update public.tasks set completed = $2, updated_at = now() where id = $1 returning ...` – לא נוגעת ב-`position` או בשדות הפרטים. אין שורה ⇐ `TaskNotFoundError`.
4. תשובות: `200` עם המשימה; `404 TASK_NOT_FOUND` (אותה הודעה כמו ב-`[id]/index.ts` – להעביר את הקבוע למקום משותף ב-`server/http.ts`); תקלה ⇐ `503` "לא ניתן לעדכן את סטטוס המשימה כרגע. נסה שוב." (Log של הודעת השגיאה בלבד, ללא תוכן משימות).
5. ערך מפורש, לא Toggle: שליחה חוזרת של אותו ערך אינה הופכת אותו.

### 2.2 `api/tasks/order.ts` – `PUT`
1. Method אחר ⇐ `405` עם `Allow: PUT`.
2. גוף: `readJsonObject(req, ORDER_MAX_BODY_BYTES)` (64KB, ADR-9). `orderedIds` חייב להיות מערך של עד 1,000 מחרוזות UUID, ללא כפילויות ⇐ אחרת `400 INVALID_REQUEST`. (מערך ריק תקין רק אם גם הרשימה במסד ריקה – אחרת `409`.)
3. `reorderTasks(orderedIds)` – Transaction אחת על אותו `client` (2.9):
   1. `begin`; `lockTaskList(client)` – אותה נעילה של יצירה ומחיקה (ADR-13).
   2. `select id from public.tasks`; השוואה אחד-לאחד לקבוצה שנשלחה (אותו גודל, כל מזהה קיים). אי-התאמה ⇐ `OrderConflictError` ⇐ `rollback`, בלי לשנות דבר.
   3. עדכון בשאילתה אחת:
      ```sql
      update public.tasks t
         set position = o.ord - 1, updated_at = now()
        from unnest($1::uuid[]) with ordinality as o(id, ord)
       where t.id = o.id and t.position <> o.ord - 1
      ```
      (`updated_at` מתעדכן רק בשורות שזזו.)
   4. קריאת הרשימה בסדרה החדש באותו `client`, `commit`, והחזרתה.
4. תשובות: `200` עם מערך המשימות בסדר החדש (מיקומים 0..N-1); `409 ORDER_CONFLICT` "רשימת המשימות השתנתה בינתיים. רענן את הרשימה ונסה שוב."; תקלה ⇐ `503` "לא ניתן לשמור את סדר המשימות כרגע. נסה שוב."
5. שתי גרירות מקבילות על אותה קבוצה מסודרות לפי הנעילה – **האחרונה קובעת** (2.6), ללא זיהוי התנגשויות.

### 2.3 ניתוב
`api/tasks/order.ts` ו-`api/tasks/[id]/index.ts` חיים יחד: לבדוק תחת `vercel dev` ש-`PUT /api/tasks/order` מגיע ל-`order.ts`, ש-`PATCH /api/tasks/order` מחזיר `405` (ולא `400 INVALID_ID` מה-`[id]`), וש-`/api/tasks/:id/status` מגיע ל-`status.ts`. אם הניתוב בפועל שונה מהמתואר ב-ADR-9 – לעצור ולתעד ADR חדש.

---

## 3. לקוח

### 3.1 `tasksClient`
- `setTaskCompleted(id, completed)` ⇐ `PATCH /api/tasks/:id/status`, מצפה ל-`200` ומשימה עם אותו `id`.
- `reorderTasks(orderedIds)` ⇐ `PUT /api/tasks/order`, מצפה ל-`200` ומערך.
- שגיאות דרך `errorFromBody` הקיים (`status`, `code`, הודעה בעברית מהשרת); כשל רשת ⇐ `ApiRequestError('network')`.

### 3.2 `src/utils/taskOrder.ts` (פונקציות טהורות, נבדקות ב-Unit)
- `moveTask(tasks, activeId, overId)` – המערך החדש (על בסיס `arrayMove` של dnd-kit).
- `restoreOrder(current, previousIds)` – מחזיר את **הסדר** הקודם אבל לוקח את ערכי המשימות מהמצב הנוכחי (למשל סימון שהשתנה בינתיים לא נדרס – ADR-9).
- `applyServerPositions(current, serverTasks)` – לוקח מתשובת השרת רק את הסדר וה-`position`, ולא שדות אחרים (כדי לא לדרוס סימון שעדיין נשמר).

### 3.3 `HomePage` – מצב ופעולות
State חדש: `pendingStatusIds` (Set של משימות שה-Checkbox שלהן בשמירה), `savingOrder` (boolean), `listError` (`{ message, canRefresh }` או `null`).

**Checkbox (`handleToggle(id, completed)`):**
1. מנקה `listError`, מעדכן מיד את `completed` של אותה משימה (אופטימי), ומוסיף ל-`pendingStatusIds` – ה-Checkbox מושבת עד סיום הבקשה (ADR-9).
2. הצלחה: מעדכן מהתשובה רק את `completed`.
3. כישלון: מחזיר **רק** את `completed` של אותה משימה לערך הקודם, ומציג הודעה: מהשרת אם יש (למשל `404` "המשימה לא נמצאה…"), אחרת "לא ניתן לעדכן את סטטוס המשימה. בדוק את החיבור ונסה שוב."
4. לא משנה את `selectedId` ואינו נוגע בטיוטה: `TaskDetails` נשאר עם אותו `key`, ולכן הטיוטה שבעורך נשארת (FR-05).

**גרירה (`handleReorder(activeId, overId)`):**
1. אם אין שינוי מיקום – לא עושים כלום. אחרת: שומרים את רשימת המזהים הקודמת, מחילים `moveTask` מיד, `savingOrder = true` (ידיות הגרירה מושבתות עד הסיום, ADR-9), ושולחים את **כל** המזהים בסדר החדש.
2. הצלחה: `applyServerPositions`.
3. `409 ORDER_CONFLICT`: `restoreOrder` לסדר הקודם (בלי להחיל סדר חלקי ובלי להשמיט משימות), והודעה "רשימת המשימות השתנתה בינתיים…" עם כפתור **"רענן את הרשימה"**.
4. כשל אחר: `restoreOrder` והודעה "לא ניתן לשמור את הסדר החדש. הסדר הקודם הוחזר."
5. גרירה לא משנה את `selectedId` ואת הטיוטה.

**"רענן את הרשימה":** `GET /api/tasks` מחדש (מצב טעינה כמו בכניסה לדף); המשימה הנבחרת נשארת נבחרת אם עדיין קיימת, אחרת הבחירה מתאפסת. אין Polling ואין רענון אוטומטי (FR-01).

### 3.4 `TaskList` – שורה ניתנת לגרירה
- `DndContext` עם `closestCenter`, `PointerSensor` (`activationConstraint: { distance: 5 }`, כדי שנגיעה בידית לא תתחיל גרירה בטעות) ו-`KeyboardSensor` עם `sortableKeyboardCoordinates`; `SortableContext` עם `verticalListSortingStrategy`.
- כל שורה (`SortableTaskRow`) משתמשת ב-`useSortable({ id, disabled: savingOrder })`. ה-`listeners`/`attributes` מוצמדים **רק** לכפתור הידית, לא לשורה – לחיצה על הטקסט בוחרת, לחיצה על ה-Checkbox מסמנת, וגרירה אפשרית רק מהידית (ADR-9).
- סדר בתוך השורה לפי ה-Wireframe (RTL): טקסט מימין, Checkbox, וידית הגרירה בקצה השמאלי.
- Checkbox: `onChange` ⇐ `onToggle(task.id, event.target.checked)`, `disabled` בזמן שמירה של אותה משימה, `aria-label` "סימון השלמה: <טקסט המשימה>".
- ידית: `<button type="button">` עם אייקון ⋮⋮ (SVG קו פשוט, DESIGN 2.3), `aria-label` "גרור כדי לשנות את מיקום המשימה: <טקסט>".
- נגישות: `accessibility.announcements` ו-`screenReaderInstructions` של dnd-kit בעברית (למשל "המשימה הורמה", "המשימה הועברה למקום 3 מתוך 7", "הגרירה בוטלה").
- הודעת `listError` מוצגת בכרטיס הרשימה מתחת לכותרת (`role="alert"`), ואיתה הכפתור "רענן את הרשימה" כשרלוונטי.
- משימות שהושלמו נשארות במקומן ובאותה רשימה, עם טקסט חצוי (כבר קיים) – ניתנות לגרירה כמו כל משימה.

### 3.5 עיצוב – `global.css`
- `.task-row__handle`: אייקון אפור (`text-secondary`), `cursor: grab`, **`touch-action: none`** (חובה לגרירה במגע ב-Android), אזור לחיצה של לפחות 44×44px במובייל; Hover/Focus בכחול `primary`; מושבת – שקיפות מופחתת.
- שורה בזמן גרירה: רקע `surface`, צל רך (`0 2px 8px rgba(0,0,0,0.08)`), `z-index` מעל השורות האחרות, `cursor: grabbing`.
- Checkbox פעיל: `cursor: pointer`, `accent-color: var(--primary)`; מושבת בזמן שמירה – שקיפות קלה.
- `.list-alert`: הודעה בגוון אדום עדין (כמו `form-alert`), עם כפתור Secondary "רענן את הרשימה".
- ליטוש סופי שייך ל-Milestone 5; כאן רק מה שנדרש כדי שהפעולות יהיו ברורות ונוחות.

---

## 4. בדיקות

### 4.1 Unit – `npm test`
- `tests/api/task-status.test.ts`: `200` עם הערך המפורש (true ⇐ false ⇐ true); `completed` חסר/לא boolean ⇐ `400`; מזהה לא תקין ⇐ `400`; `404`; `503` בלי דליפת פרטים; `405`; שדות `title`/`position` בגוף אינם מועברים ל-Repository.
- `tests/api/task-order.test.ts`: `200` ומערך; לא מערך / יותר מ-1,000 / מזהה לא UUID / כפילויות ⇐ `400`; `OrderConflictError` ⇐ `409 ORDER_CONFLICT`; גוף מעל 64KB ⇐ `413`, גוף של 1,000 UUID מתקבל; `503`; `405`.
- `src/utils/taskOrder.test.ts`: הזזה למעלה/למטה, ללא שינוי, `restoreOrder` שומר `completed` שהשתנה, `applyServerPositions` לא דורס שדות.
- `HomePage.test.tsx`: Checkbox שולח `PATCH` עם ערך מפורש ומושבת עד התשובה; כישלון מחזיר את הסימון ומציג הודעה; סימון המשימה הנבחרת בזמן עריכה לא מאפס את הטיוטה ולא שולח `PATCH` של פרטים; סימון לא משנה את סדר השורות.
- בדיקות קודמות נשארות ירוקות (בדיקה שמניחה Checkbox מושבת, אם יש, מתעדכנת).

### 4.2 Integration מול Dev – `npm run test:integration` (ADR-7, Snapshot ושחזור)
- `setTaskCompleted`: משנה רק `completed` ו-`updated_at`; לא נוגע ב-`position`/פרטים; משימה חסרה ⇐ `TaskNotFoundError`.
- `reorderTasks`: סדר מדויק ומיקומים 0..N-1; קבוצה עם מזהה חסר / מזהה עודף ⇐ `OrderConflictError` והמסד לא השתנה.
- **שתי גרירות מקבילות** משני Pools: שתיהן מצליחות, התוצאה היא בדיוק אחד משני הסדרים (האחרון), מיקומים רציפים ללא כפילויות.
- **יצירה במקביל לגרירה** ו-**מחיקה במקביל לגרירה** משני Pools: אין מיקום כפול או חסר, אין משימה שאבדה או חזרה; אם הגרירה רצה אחרי השינוי – היא מקבלת `OrderConflictError` ולא מחילה סדר חלקי.
- סטטוס ועדכון פרטים במקביל לגרירה: אף פעולה לא דורסת את השדות של האחרת.

### 4.3 E2E ב-Chrome – `npm run test:e2e` (Desktop + Mobile, Snapshot של Dev)
`e2e/tasks-status-order.spec.ts`:
- Checkbox מסמן ומבטל; המשימה לא זזה; אחרי Refresh הערך נשמר (וגם ב-DB דרך ה-API).
- גרירה עם עכבר (Desktop) של משימה – כולל משימה שהושלמה – למיקום אחר; אחרי Refresh הסדר זהה והמיקומים רציפים.
- גרירה ב-**Touch** בפרויקט Mobile Chrome (Pixel 7): אירועי מגע אמיתיים דרך CDP (`Input.dispatchTouchEvent`) על הידית; הסדר משתנה ונשמר, וה-Checkbox והבחירה לא הופעלו בטעות.
- בחירת משימה, שינוי הכותרת בלי לשמור, ואז סימון ה-Checkbox שלה וגרירתה ⇐ הטיוטה עדיין בשדה, וב-DB הכותרת לא השתנתה.
- שגיאת שרת מדומה (`page.route` ⇐ `500`) בסטטוס ⇐ ה-Checkbox חוזר והודעה; בסדר ⇐ הסדר חוזר והודעה.
- `409`: אחרי טעינת הדף נוצרת משימה דרך ה-API ("מבקר אחר"), ואז גרירה ⇐ הודעה וכפתור "רענן את הרשימה"; הסדר במסד לא השתנה; לחיצה על הכפתור מציגה את הרשימה העדכנית כולל המשימה החדשה.
- מבקר אחר (חלון/Context שני) מסמן וגורר ⇐ בחלון הראשון אין שינוי ואין בקשת `GET` נוספת עד Refresh; אחרי Refresh השינוי מופיע.
- כל קובצי ה-E2E הקודמים עוברים (רגרסיה).

### 4.4 בדיקה שלי לפני סימון 🟡
`npm test`, `npm run test:integration`, `npm run test:e2e`, `npm run build`; בדיקה ידנית ב-`vercel dev` (בדפדפן המובנה) של סימון וגרירה בדסקטופ ובתצוגת מובייל; סגירת ההרצה בסיום. גרירה במגע אמיתי בטלפון Android – לבדיקה שלך (ADR-11), אחרי "הרץ כדי שאבדוק" (דרך כתובת הרשת המקומית) או באתר החי אחרי הדחיפה.

---

## 5. מיפוי ל-Definition of Done

| תנאי | איך מתקיים / נבדק |
|---|---|
| Checkbox מסמן ומבטל, נשמר מיד, לא משנה מיקום | 2.1, 3.3; Unit + E2E (4.1, 4.3) |
| משימות שהושלמו באותה רשימה וניתנות לגרירה | 3.4; E2E גרירת משימה שהושלמה |
| סימון/גרירה של הנבחרת לא נוגעים בטיוטה | 3.3 (`key` ללא שינוי); Unit + E2E |
| Drag & Drop בעכבר ובמגע, בלי להפעיל Checkbox/בחירה בטעות | 3.4 (ידית בלבד, `touch-action: none`, `distance: 5`); E2E Desktop + Touch; בדיקה ידנית שלך בטלפון |
| אחרי גרירה ו-Refresh הסדר מדויק, רציף, ללא כפילויות | 2.2; Integration + E2E |
| Integration: Transaction אטומית ביצירה/מחיקה בזמן גרירה ובשתי גרירות מקבילות | 4.2 |
| קבוצת מזהים שהשתנתה ⇐ `409`, בלי אובדן משימה או סדר חלקי | 2.2, 3.3; Unit + Integration + E2E |
| תקלה בשרת מחזירה Checkbox/סדר עם חיווי שגיאה | 3.3; Unit + E2E |
| שינויי מבקר אחר רק אחרי Refresh; אין עדכוני רקע; רגרסיה | 3.3 (בלי Polling); E2E שני חלונות + כל הבדיקות הקודמות |

---

## 6. החלטות מימוש קטנות (לאישורך במסגרת אישור התוכנית)
1. **מקום הודעות השגיאה:** הודעה אחת בתוך כרטיס "רשימת משימות", מתחת לכותרת – לא חלון קופץ. היא מתנקה בפעולה הבאה (סימון או גרירה) או ברענון.
2. **כפתור "רענן את הרשימה"** טוען מחדש רק את הרשימה (לא את כל הדף), ושומר את המשימה הנבחרת אם היא עדיין קיימת.
3. **`updated_at`** מתעדכן בשינוי סטטוס ובשורות שזזו בגרירה (נתון פנימי בלבד, לא מוצג).
4. **מערך סדר ריק** מתקבל רק כשהרשימה במסד ריקה (אחרת `409`).
5. אם בבנייה יתברר שצריך לסטות מ-ADR-9 (למשל בניתוב של Vercel) – אתעד ADR-14 ואעדכן אותך.
