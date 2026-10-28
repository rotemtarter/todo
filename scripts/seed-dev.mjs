// Adds sample tasks to the Dev database (the only database .env points to). Never deletes anything.
import { readFileSync } from 'node:fs';
import pg from 'pg';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set in .env');
  process.exit(1);
}

// Refuse to run unless .env points to the Dev project the Supabase CLI is linked to.
const devRef = readFileSync('supabase/.temp/project-ref', 'utf8').trim();
let user = '';
try {
  user = decodeURIComponent(new URL(process.env.DATABASE_URL).username);
} catch {
  console.error('DATABASE_URL is not a valid URL');
  process.exit(1);
}
if (!devRef || user !== `app_backend.${devRef}`) {
  console.error('DATABASE_URL does not point to the linked Dev project; refusing to run');
  process.exit(1);
}

const samples = [
  { title: 'לקנות מצרכים', description: 'חלב, לחם, ביצים וירקות לשבוע', dueDate: 0, completed: false },
  { title: 'לתכנן חופשה', description: 'לבדוק יעדים, מחירים ולסגור טיסות', dueDate: 14, completed: false },
  { title: 'לסיים דוח שנתי', description: null, dueDate: 3, completed: true },
  { title: 'לפנות למוסך', description: null, dueDate: null, completed: false },
  {
    title: null,
    description:
      'לבדוק אפשרויות ביטוח לרכב אצל לפחות שלוש חברות שונות, להשוות מחירים, השתתפות עצמית וכיסויים נוספים\nולהחליט עד סוף החודש',
    dueDate: 30,
    completed: false,
  },
  {
    title: 'כותרת ארוכה במיוחד כדי לבדוק שהטקסט נקטע כראוי בשורת הרשימה ואינו שובר את הפריסה של הדף',
    description: 'משימה לבדיקת קיצור',
    dueDate: 7,
    completed: false,
  },
];

function dateInDays(days) {
  if (days === null) return null;
  const date = new Date();
  date.setDate(date.getDate() + days);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query('begin');
  const { rows } = await client.query('select coalesce(max(position) + 1, 0)::int as next from public.tasks');
  let position = rows[0].next;
  for (const task of samples) {
    await client.query(
      'insert into public.tasks (title, description, due_date, completed, position) values ($1, $2, $3, $4, $5)',
      [task.title, task.description, dateInDays(task.dueDate), task.completed, position++],
    );
  }
  await client.query('commit');
  console.log(`Added ${samples.length} sample tasks to the Dev database.`);
} catch (error) {
  await client.query('rollback');
  console.error('Seeding failed:', error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
