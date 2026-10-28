# תוכנית – Milestone 5: התאמה חזותית, PWA ובדיקת מוצר מלאה

**מקורות:** `MILESTONES.md` (Milestone 5), `PRD.md` (כל הזרימות, 3ג, FR-10, Edge Cases, 5א), `DESIGN.md` (1.1–1.6, 2.1–2.5), `ARCHITECTURE.md` (2.7, 2.8, 2.9, 2.10, ADR-4, ADR-10, ADR-11, ADR-12), `wireframes.png` (מבנה), `style-guide.png` (שפה עיצובית), `mockups1.png` / `mockups2.png` (גימור בלבד).

**מטרה:** ליטוש חזותי סופי של שני הדפים וה-Modal-ים לפי ה-Style Guide, בלי להוסיף שום רכיב פונקציונלי; PWA שניתן להתקנה ב-Chrome Android (Manifest + אייקונים, **ללא Service Worker** – ADR-10); חיווי ברור כשאין חיבור; השלמת בדיקות E2E לכל זרימות המשתמש; ואימות ה-Production אחרי הדחיפה.

**ללא שינוי במסד הנתונים ובשרת:** אין Migration חדשה ואין שינוי ב-API. הדחיפה של אבן הדרך הזו לא תשנה את מבנה מסד ה-Production.

**מצב קיים (נקודת פתיחה):** אסימוני הצבע, הגופנים, הכרטיסים, ה-Modal-ים והפריסה הרספונסיבית כבר קיימים ב-`global.css` מאבני הדרך הקודמות. אבן הדרך הזו מתקנת את מה שעדיין רחוק מה-Style Guide, ולא כותבת את העיצוב מחדש.

---

## 1. קבצים

| קובץ | פעולה | תוכן |
|---|---|---|
| `public/manifest.webmanifest` | חדש | Manifest לפי ARCHITECTURE 2.8 / ADR-10 |
| `public/icons/icon.svg` | חדש | אייקון מקור: דף מחברת לבן עם סימון ✓ על רקע `#2F80ED` |
| `public/icons/icon-maskable.svg` | חדש | אותו ציור עם שוליים בטוחים (Safe Zone ‏80%) לאייקון `maskable` |
| `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` (180) | חדש (נוצרים) | PNG שנוצרים מה-SVG ונשמרים ב-Git |
| `public/favicon.svg` | חדש | Favicon (עותק של `icon.svg`) |
| `scripts/generate-icons.mjs` | חדש | יצירת קובצי ה-PNG מה-SVG באמצעות Chromium של Playwright (ADR-10) |
| `package.json` | שינוי קטן | סקריפט `icons` (`node scripts/generate-icons.mjs`); ללא תלויות חדשות |
| `index.html` | שינוי | `<link rel="manifest">`, `theme-color`, `favicon`, `apple-touch-icon`, `description` |
| `vercel.json` | שינוי קטן | Header ‏`Content-Type: application/manifest+json` ל-`/manifest.webmanifest` (אם Vercel לא מגיש אותו כך כברירת מחדל) |
| `src/hooks/useOnlineStatus.ts` | חדש | `navigator.onLine` + אירועי `online`/`offline` |
| `src/components/OfflineNotice.tsx` | חדש | פס הודעה קבוע בשני הדפים כשאין חיבור (ADR-10) |
| `src/App.tsx` | שינוי קטן | הצגת `OfflineNotice` מתחת לתפריט |
| `src/components/Icons.tsx` | חדש | אייקוני קו פשוטים משותפים: הוספה (+), סגירה (×), מחיקה (פח), ידית גרירה |
| `src/components/TaskList.tsx`, `CreateTaskModal.tsx`, `TaskDetails.tsx`, `DeleteTaskModal.tsx` | שינוי קטן | שימוש באייקונים המשותפים ובמחלקות CSS המעודכנות; ללא שינוי בהתנהגות |
| `src/pages/HomePage.tsx` | שינוי קטן | אייקון + בכפתור "הוסף משימה" |
| `src/styles/global.css` | שינוי | ליטוש חזותי ו-Responsive (סעיף 2) |
| `e2e/pwa-offline.spec.ts` | חדש | Manifest, אייקונים, אין Service Worker, מצב לא-מקוון |
| `e2e/full-flow.spec.ts` | חדש | זרימה מלאה אחת מקצה לקצה + רגרסיה של שני חלונות |
| `e2e/layout.spec.ts` | חדש | פריסה: דסקטופ (רשימה מימין, פרטים משמאל), מובייל (עמודה אחת, ללא גלילה אופקית), RTL |
| `src/components/OfflineNotice.test.tsx` | חדש | Unit להופעה/היעלמות ההודעה |
| `CLAUDE.md` | שינוי קטן | הוספת `npm run icons` לפקודות ההרצה |
| `spec/ARCHITECTURE.md` | ADR חדש (14) רק אם תתקבל החלטה טכנית שלא מכוסה (למשל Header ל-Manifest או שינוי ב-ADR-10) |
| `spec/MILESTONES.md` | שינוי | סימון 🟡 בסיום הבנייה |

---

## 2. ליטוש חזותי (`global.css` ורכיבים)

עקרון: **ה-Wireframes קובעים מבנה ותוכן, ה-Style Guide קובע מראה.** מה-Mockups לוקחים רק גימור (צל, ריווח, צבע) – **לא** ממשים: תאריך/תיאור בשורת הרשימה, תפריט שלוש נקודות, פסי צבע עדיפות, "ערוך משימה", "נוצר בתאריך"/"עודכן לאחרונה", כותרת "To Do", תפריט המבורגר, "הגדרות", או איור לוח ריק (DESIGN 1, 2.3, 2.4).

### 2.1 בסיס
- טיפוגרפיה לפי 2.2: H1 ‏32px Bold (מובייל 24px), H2 של אזורים 18px Semibold כ-Card Title (כמו היום), Body ‏16/14/12. בדיקה שכל הטקסטים בעברית מוצגים בגופן Sans-serif עברי תקין.
- ריווח בכפולות 8px בלבד; מעבר על ערכים חריגים קיימים (`10px`, `4px`, `6px`) והחלפתם בערכי הרשת (שדות וכפתורים יכולים להישאר עם ריפוד פנימי 12px/8px לגובה נוח).
- רדיוס 8–16px; צל `0 2px 8px rgba(0,0,0,0.08)`.

### 2.2 תפריט ניווט
- שני קישורים בלבד, פריט פעיל בכחול על רקע תכלת עדין + קו תחתון כחול (כמו ב-Style Guide Navigation). במובייל – אותם שני קישורים כלשוניות ברוחב מלא, בלי המבורגר (DESIGN 1.6).

### 2.3 כפתורים
- Primary / Hover / Disabled / Secondary / Danger בדיוק לפי Style Guide: Disabled בגוון אפור-כחלחל בהיר עם טקסט לבן; Hover של Secondary ברקע תכלת. גובה מינימלי 44px במובייל (מגע).
- "הוסף משימה" עם אייקון +; "מחק משימה" עם אייקון פח (קו), בגוון אדום.

### 2.4 שדות
- רקע לבן, גבול `#D1D5DB`, רדיוס 8px, Placeholder אפרפר, יישור לימין; Focus: גבול כחול + טבעת כחולה עדינה. שדה תיאור גבוה עם ידית שינוי גודל. שדה התאריך נשאר הבקר המובנה של Chrome (DESIGN 2.3).
- שגיאת Validation: גבול אדום + טקסט אדום מתחת לשדה (כמו היום). הודעת שגיאה כללית / הצלחה בסגנון "States & Feedback": רקע אדום/ירוק עדין, גבול באותו גוון ואייקון עגול קטן. **בלי** כפתור × לסגירת ההודעה (אינו ב-PRD).

### 2.5 רשימה ופרטים
- שני כרטיסים לבנים נפרדים עם כותרת אזור; שורות עם קו מפריד דק, שורה נבחרת ברקע תכלת עדין, Hover עדין. השורה מציגה **רק** ידית, Checkbox וטקסט מזהה (DESIGN 2.3).
- Checkbox מעוצב: ריבוע מעוגל מעט, מסומן בכחול עם ✓ לבן (CSS על `input[type=checkbox]` עם `appearance: none`, נשאר `input` אמיתי – ללא שינוי בהתנהגות או בבדיקות). טקסט חצוי ואפור למשימה שהושלמה.
- אזור פרטים ריק: ההודעה ממורכזת בגובה נוח בתוך הכרטיס.
- דסקטופ: רשימה מימין, פרטים משמאל, רווח 24px. מובייל (מתחת ל-768px): עמודה אחת, רשימה מעל פרטים, כפתור "הוסף משימה" ברוחב מלא מעל הרשימה, כפתורי הפרטים ברוחב מלא זה לצד זה, ללא גלילה אופקית.

### 2.6 Modal-ים
- Overlay כהה שקוף, חלון לבן ממורכז, רדיוס 16px, צל רך; כותרת, אמצעי סגירה (×), שדות, כפתורים. במובייל: רוחב כמעט מלא עם שוליים 16px, גלילה פנימית כשאין מקום (מקלדת וירטואלית), כפתורים בגובה 44px.
- אישור מחיקה: חלון קטן, "אישור" באדום מלא, "ביטול" משני.

### 2.7 דף אודות
- כרטיס תוכן מרכזי, כותרת H1 "אודות" ופסקת ההסבר הקיימת (ללא שינוי טקסט).

---

## 3. PWA (ADR-10)

### 3.1 `manifest.webmanifest`
```json
{
  "name": "רשימת משימות משותפת",
  "short_name": "משימות",
  "description": "רשימת TODO משותפת לכל המבקרים, ללא התחברות",
  "lang": "he",
  "dir": "rtl",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#EAF6FF",
  "theme_color": "#2F80ED",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

### 3.2 אייקונים
- `scripts/generate-icons.mjs` פותח את קובצי ה-SVG ב-Chromium של Playwright (שכבר מותקן בפרויקט), מצלם בגדלים הנדרשים ושומר PNG ב-`public/icons/`. הקבצים נשמרים ב-Git, כך שה-Build ב-Vercel לא תלוי בדפדפן.
- `vercel.json`: ה-Rewrite הקיים כבר לא נוגע בקבצים עם סיומת (ADR-12), לכן `/manifest.webmanifest` ו-`/icons/*` מוגשים כקבצים סטטיים.

### 3.3 ללא Service Worker וללא Cache
- לא נרשם Service Worker; אין שמירת משימות או תשובות API במכשיר (`no-store` ב-`GET /api/tasks` כבר קיים).
- אם בבדיקה במכשיר יתברר ש-Chrome Android לא מציע התקנה בלי Service Worker – עוצרים ומדווחים לך, והחלופה (ADR-10) היא Service Worker מינימלי שמעביר כל בקשה לרשת ללא Cache; זה יתועד ב-ADR חדש.

---

## 4. מצב לא-מקוון

- `useOnlineStatus` + `OfflineNotice`: פס בולט מתחת לתפריט, בשני הדפים, `role="status"`: **"אין חיבור לאינטרנט. לא ניתן לצפות במשימות עדכניות או לשמור שינויים עד שהחיבור יחזור."** (נוסח לאישורך).
- כשאין חיבור – לא חוסמים כפתורים מראש (ההתנהגות הקיימת נשמרת): כל פעולה נכשלת בבקשת הרשת, מוצגת הודעת השגיאה הקיימת, והמצב חוזר לאחרון השמור (Checkbox/סדר) או שהנתונים נשארים בטופס (יצירה/עריכה). זה עומד בדרישה "אין פעולות נתונים Offline".
- כשהחיבור חוזר – הפס נעלם. הרשימה **לא** נטענת מחדש אוטומטית (אין רענון רקע, PRD FR-01); המשתמש מרענן.
- פתיחה ראשונה של האתר בלי חיבור מציגה את דף "אין אינטרנט" של Chrome (אין Service Worker) – תקין לפי ADR-10.

---

## 5. בדיקות

### 5.1 Unit – `npm test`
- `OfflineNotice`: מוצג כש-`navigator.onLine` הוא `false`, מופיע/נעלם באירועי `offline`/`online`.
- כל בדיקות ה-Unit הקיימות (Validation, תוויות, סדר, HomePage) ממשיכות לעבור אחרי שינויי העיצוב.

### 5.2 API ו-Integration מול Dev – `npm run test:integration`
- ללא בדיקות חדשות (אין שינוי שרת); הרצה מלאה כרגרסיה.

### 5.3 E2E ב-Chrome – `npm run test:e2e` (Desktop + Mobile, Snapshot של Dev – ADR-11)
- **`pwa-offline.spec.ts`:** `/manifest.webmanifest` מוחזר עם JSON תקין (`display: standalone`, `start_url`, `lang`, `dir`, אייקונים 192/512/maskable); כל קובץ אייקון מוחזר `200` כ-`image/png` בגודל הנכון; ב-`index.html` יש `link rel=manifest` ו-`theme-color`; `navigator.serviceWorker.getRegistrations()` ריק. מצב לא-מקוון (`context.setOffline(true)`): הפס מוצג; ניסיון סימון Checkbox חוזר לערך הקודם עם הודעה; יצירה נכשלת והנתונים נשארים בטופס; רענון במצב לא-מקוון אינו מציג רשימה שמורה. חזרה לחיבור: הפס נעלם, ורענון מציג את הנתונים מהשרת.
- **`full-flow.spec.ts`:** זרימה אחת רציפה: כניסה → יצירה → בחירה → עריכה ושמירה → סימון השלמה → גרירה → ניווט לאודות וחזרה → רענון (הכול נשמר) → מחיקה באישור. ובנוסף: שני Contexts (שני "מבקרים") – שינוי באחד מופיע בשני רק אחרי רענון.
- **`layout.spec.ts`:** דסקטופ – כרטיס הרשימה מימין לכרטיס הפרטים (השוואת `boundingBox`); מובייל – הרשימה מעל הפרטים, `scrollWidth <= clientWidth` (ללא גלילה אופקית) בדף הבית, ב-Modal ובאודות; `dir="rtl"` ו-`lang="he"`; בדף אין טקסטים/כפתורים שאינם ב-PRD (למשל "הגדרות", "ערוך משימה").
- כל קובצי ה-E2E הקיימים (צפייה, יצירה, עריכה/מחיקה, סטטוס/סדר, ניווט) עוברים ללא שינוי בהתנהגות; עדכון Selectors רק אם שינוי מבני קטן מחייב זאת.

### 5.4 Build
- `npm run build` עובר; בדיקה ש-`dist/` כולל את `manifest.webmanifest` ואת `icons/`, ושאין ב-Bundle מחרוזות חיבור או משתני סביבה של השרת (חיפוש `DATABASE_URL`/`postgres://` ב-`dist/`).

### 5.5 בדיקה ויזואלית שלי לפני סימון 🟡
- צילומי מסך בדפדפן הפנימי של כל ששת המצבים מה-Wireframes (בית ללא בחירה, משימה נבחרת, Modal הוספה, Modal מחיקה, אודות, מובייל), השוואה ל-Wireframes ול-Style Guide ותיקון פערים.
- Chrome DevTools / Lighthouse מקומי: ה-Manifest מזוהה ללא שגיאות ("Installability").

### 5.6 בדיקות ידניות שלך (לא ניתנות לאוטומציה – ADR-11)
- גרירה במגע אמיתי בטלפון Android.
- התקנת ה-PWA ב-Chrome Android מהאתר החי (HTTPS) ופתיחתו כאפליקציה – **רק אחרי הדחיפה**, כי ההתקנה דורשת את הכתובת הציבורית.

### 5.7 בדיקה לאחר הדחיפה (Production)
- Deployment ב-Vercel הצליח אוטומטית; `https://<האתר>/manifest.webmanifest` ואייקונים נטענים; האתר החי טוען את הרשימה מ-Production ומנווט בין הדפים; בדיקות קריאה בלבד מול Production (ADR-11). Preview Deployments עדיין מחוברים ל-Dev.

---

## 6. מיפוי ל-Definition of Done

| תנאי | איך נבדק |
|---|---|
| דף הבית ואודות תואמים Wireframes ו-Style Guide; אין רכיבים מעבר ל-PRD | 5.5 (צילומי מסך) + `layout.spec.ts` (אין "הגדרות"/"ערוך משימה" וכו') |
| RTL, תאריכים, טקסטים בעברית; פריסה בדסקטופ ובמובייל | `layout.spec.ts` + 5.5 |
| כל זרימות המשתמש End-to-End כולל שגיאות | `full-flow.spec.ts` + קובצי E2E הקיימים + `pwa-offline.spec.ts` |
| התקנת PWA ב-Chrome Android; Manifest ו-HTTPS תקינים | `pwa-offline.spec.ts` + Lighthouse מקומי + 5.6 (אצלך, אחרי הדחיפה) |
| ניתוק רשת: אין רשימה שמורה ואין שינויים Offline; הנתונים נשארים בשרת | `pwa-offline.spec.ts` |
| פרטי Database מחוץ ללקוח; Validation בשרת; SQL פרמטרי | 5.4 (חיפוש ב-`dist/`) + בדיקות API/Integration הקיימות + סקירת קוד ה-Repository |
| Build, API, Integration, E2E עוברים; גרירה במגע ידנית; פריסה אוטומטית | 5.1–5.4 + 5.6 + 5.7 |
| הדגמה ותוצאות בדיקות, עצירה לאישור סופי | סיכום בסוף הבנייה + "הרץ כדי שאבדוק" |

---

## 7. החלטות מימוש קטנות (לאישורך במסגרת אישור התוכנית)

1. **אייקון האפליקציה:** דף מחברת לבן עם סימון ✓ על רקע כחול `#2F80ED` – פשוט, בהשראת ה-Style Guide. שם על מסך הבית בטלפון: **"משימות"**.
2. **נוסח הודעת "אין חיבור"** כמופיע בסעיף 4.
3. **בלי Service Worker** (כפי שכבר הוחלט ב-ADR-10); אם הטלפון לא יציע התקנה – אעצור ואשאל לפני שאוסיף אחד.
4. **אייקונים בכפתורים** (+ בהוספה, פח במחיקה, × בסגירה) – מופיעים ב-Style Guide וב-DESIGN 2.3; הם קישוט בלבד ולא מוסיפים פעולות.
5. **לא נוסף כפתור התקנה** באתר – ההתקנה דרך תפריט Chrome (ARCHITECTURE 2.8).
