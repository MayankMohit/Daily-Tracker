// Dev seed: populate the store with lots of tasks + task logs so the dashboard
// table, insights and graphs have realistic data to show.
//
// Backend-aware: if MONGODB_URI is set (same rule as src/lib/store/index.ts) it
// seeds MongoDB; otherwise it writes the local JSON file under .data/.
//
// Idempotent: every task it creates is tagged `_seed: true`; re-running first
// removes previously-seeded tasks and their logs, then regenerates. Your own
// (non-seeded) tasks and any real logs on them are left untouched.
//
//   node scripts/seed.mjs
//
import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "db.json");
const DEFAULT_USER = "user_3Gr7BOLiPOl91R3kiIaRriBAlvJ";

// --- load MONGODB_URI from .env.local (Next does this automatically; a plain
//     node script does not). We never print the value. ----------------------
async function loadEnv() {
  try {
    const txt = await fs.readFile(path.join(process.cwd(), ".env.local"), "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* no .env.local — fine */
  }
}

// --- id generator (mirrors nanoid(16) alphabet) --------------------------
const ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
function newId(n = 16) {
  let s = "";
  for (let i = 0; i < n; i++)
    s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

// --- date helpers (local-time YYYY-MM-DD, matching src/lib/date.ts) -------
const pad = (n) => String(n).padStart(2, "0");
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dow = (dayKey) => new Date(dayKey + "T00:00:00").getDay(); // 0=Sun..6=Sat

function daysBetween(start, end) {
  const out = [];
  const d = new Date(start);
  while (d <= end) {
    out.push(key(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function taskAppliesOn(task, date) {
  if (task.startDate && date < task.startDate) return false;
  if (task.endDate && date > task.endDate) return false;
  switch (task.recurrence) {
    case "daily":
      return true;
    case "weekdays": {
      const d = dow(date);
      return d >= 1 && d <= 5;
    }
    case "custom":
      return (task.recurrenceDays ?? []).includes(dow(date));
    case "one-off":
      return task.startDate ? date === task.startDate : true;
  }
}

const rand = (min, max) => min + Math.random() * (max - min);
const chance = (p) => Math.random() < p;

function stamp(dayKey) {
  const h = Math.floor(rand(6, 22));
  const m = Math.floor(rand(0, 60));
  return new Date(`${dayKey}T${pad(h)}:${pad(m)}:00`).toISOString();
}

// --- value computation (mirrors services/logs.ts computeValue) ------------
function computeValue(task, entered) {
  if (task.type === "boolean") return { kind: "boolean", boolStatus: true };
  const cfg = task.percentageConfig;
  if (cfg.mode === "direct") {
    const pct = Math.max(0, Math.min(100, entered));
    return { kind: "direct_percentage", percentage: Math.round(pct * 10) / 10 };
  }
  const actual = Math.max(0, entered);
  const target = cfg.targetValue || 1;
  const raw = (actual / target) * 100;
  return {
    kind: "quantity",
    actualValue: Math.round(actual * 10) / 10,
    targetValueSnapshot: cfg.targetValue,
    unitSnapshot: cfg.unit?.value,
    rawPercentage: Math.round(raw * 10) / 10,
    percentage: Math.round(Math.min(100, raw) * 10) / 10,
  };
}

// --- seed task catalogue --------------------------------------------------
const CATALOG = [
  { title: "Meditate", cat: "Health", type: "boolean", goal: "build", recurrence: "daily", priority: "high", color: "#7c7bff", p: 0.82 },
  { title: "Take vitamins", cat: "Health", type: "boolean", goal: "build", recurrence: "daily", priority: "low", color: "#4ade80", p: 0.9 },
  { title: "8h sleep", cat: "Health", type: "boolean", goal: "build", recurrence: "daily", priority: "medium", color: "#38bdf8", p: 0.7 },
  { title: "Stretch", cat: "Health", type: "boolean", goal: "build", recurrence: "daily", priority: "low", color: "#22d3ee", p: 0.6 },
  { title: "Workout", cat: "Fitness", type: "boolean", goal: "build", recurrence: "custom", recurrenceDays: [1, 3, 5], priority: "high", color: "#fb923c", p: 0.85 },
  { title: "Steps", cat: "Fitness", type: "percentage", goal: "build", mode: "quantity", unit: "steps", target: 10000, recurrence: "daily", priority: "medium", color: "#f59e0b", p: 0.9, gen: () => Math.round(rand(4000, 14000)) },
  { title: "Water", cat: "Health", type: "percentage", goal: "build", mode: "quantity", unit: "L", target: 3, recurrence: "daily", priority: "medium", color: "#60a5fa", p: 0.92, gen: () => Math.round(rand(1, 4) * 10) / 10 },
  { title: "Pushups", cat: "Fitness", type: "percentage", goal: "build", mode: "quantity", unit: "reps", target: 50, recurrence: "daily", priority: "low", color: "#f472b6", p: 0.7, gen: () => Math.round(rand(10, 70)) },
  { title: "Read", cat: "Mind", type: "percentage", goal: "build", mode: "quantity", unit: "min", target: 30, recurrence: "daily", priority: "medium", color: "#a78bfa", p: 0.75, gen: () => Math.round(rand(0, 60)) },
  { title: "Study", cat: "Mind", type: "percentage", goal: "build", mode: "quantity", unit: "min", target: 120, recurrence: "weekdays", priority: "high", color: "#818cf8", p: 0.8, gen: () => Math.round(rand(30, 180)) },
  { title: "Journal", cat: "Mind", type: "boolean", goal: "build", recurrence: "daily", priority: "low", color: "#c084fc", p: 0.65 },
  { title: "Learn language", cat: "Mind", type: "boolean", goal: "build", recurrence: "daily", priority: "medium", color: "#2dd4bf", p: 0.6 },
  { title: "Deep work", cat: "Work", type: "percentage", goal: "build", mode: "direct", recurrence: "weekdays", priority: "high", color: "#34d399", p: 0.85, gen: () => Math.round(rand(30, 100)) },
  { title: "Inbox zero", cat: "Work", type: "boolean", goal: "build", recurrence: "weekdays", priority: "medium", color: "#4ade80", p: 0.7 },
  { title: "Plan tomorrow", cat: "Work", type: "boolean", goal: "build", recurrence: "weekdays", priority: "low", color: "#a3e635", p: 0.75 },
  { title: "No-spend day", cat: "Finance", type: "boolean", goal: "build", recurrence: "daily", priority: "low", color: "#fbbf24", p: 0.45 },
  { title: "Make bed", cat: "Life", type: "boolean", goal: "build", recurrence: "daily", priority: "low", color: "#94a3b8", p: 0.88 },
  { title: "Call family", cat: "Social", type: "boolean", goal: "build", recurrence: "custom", recurrenceDays: [0, 6], priority: "medium", color: "#f87171", p: 0.7 },
  { title: "No smoking", cat: "Health", type: "boolean", goal: "avoid", recurrence: "daily", priority: "high", color: "#f87171", p: 0.9 },
  { title: "No junk food", cat: "Health", type: "boolean", goal: "avoid", recurrence: "daily", priority: "medium", color: "#fb7185", p: 0.62 },
  { title: "No doomscrolling", cat: "Mind", type: "boolean", goal: "avoid", recurrence: "daily", priority: "medium", color: "#e879f9", p: 0.55 },
  { title: "No alcohol", cat: "Health", type: "boolean", goal: "avoid", recurrence: "daily", priority: "low", color: "#fca5a5", p: 0.8 },
];

/** Build the seed tasks + logs for a user across last month → today. */
function buildData(userId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const window = daysBetween(start, today);
  const createdAt = new Date(start);
  createdAt.setDate(createdAt.getDate() - 2);

  const tasks = [];
  const logs = [];

  for (const spec of CATALOG) {
    const task = {
      _id: newId(),
      userId,
      title: spec.title,
      type: spec.type,
      goal: spec.goal,
      category: spec.cat,
      priority: spec.priority,
      recurrence: spec.recurrence,
      active: true,
      color: spec.color,
      createdAt: createdAt.toISOString(),
      _seed: true,
    };
    if (spec.recurrenceDays) task.recurrenceDays = spec.recurrenceDays;
    if (spec.type === "percentage") {
      task.percentageConfig =
        spec.mode === "quantity"
          ? { mode: "quantity", unit: { type: "preset", value: spec.unit }, targetValue: spec.target }
          : { mode: "direct" };
    }
    tasks.push(task);

    for (const date of window) {
      if (!taskAppliesOn(task, date)) continue;
      if (!chance(spec.p)) continue;
      const entered = spec.gen ? spec.gen() : 1;
      logs.push({
        _id: newId(),
        userId,
        taskId: task._id,
        date,
        value: computeValue(task, entered),
        completedAt: stamp(date),
      });
    }
  }

  return { tasks, logs, window };
}

// --- backend writers ------------------------------------------------------
async function seedMongo(uri) {
  const { default: mongoose } = await import("mongoose");
  await mongoose.connect(uri, { bufferCommands: false });
  const dbc = mongoose.connection.db;
  const tasksColl = dbc.collection("tasks");
  const logsColl = dbc.collection("taskLogs");

  const anyTask = await tasksColl.findOne({});
  const userId = anyTask?.userId ?? DEFAULT_USER;

  // Idempotency: drop prior seed + its logs.
  const prior = await tasksColl.find({ _seed: true }).project({ _id: 1 }).toArray();
  const priorIds = prior.map((t) => t._id);
  if (priorIds.length) {
    await tasksColl.deleteMany({ _seed: true });
    await logsColl.deleteMany({ taskId: { $in: priorIds } });
  }

  const { tasks, logs, window } = buildData(userId);
  if (tasks.length) await tasksColl.insertMany(tasks);
  if (logs.length) await logsColl.insertMany(logs);

  await mongoose.disconnect();
  return { backend: "mongodb", userId, tasks: tasks.length, logs: logs.length, window };
}

async function seedLocal() {
  let db;
  try {
    db = JSON.parse(await fs.readFile(DATA_FILE, "utf8"));
  } catch {
    db = {};
  }
  db.tasks ??= [];
  db.taskLogs ??= [];

  const userId = db.tasks.find((t) => t.userId)?.userId ?? DEFAULT_USER;

  const backup = DATA_FILE.replace(
    /\.json$/,
    `.backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  await fs.writeFile(backup, JSON.stringify(db, null, 2), "utf8");

  const seededIds = new Set(db.tasks.filter((t) => t._seed).map((t) => t._id));
  db.tasks = db.tasks.filter((t) => !t._seed);
  db.taskLogs = db.taskLogs.filter((l) => !seededIds.has(l.taskId));

  const { tasks, logs, window } = buildData(userId);
  db.tasks.push(...tasks);
  db.taskLogs.push(...logs);

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(db, null, 2), "utf8");
  return { backend: "local-file", userId, tasks: tasks.length, logs: logs.length, window, backup: path.basename(backup) };
}

async function main() {
  await loadEnv();
  const uri = process.env.MONGODB_URI;
  const r = uri ? await seedMongo(uri) : await seedLocal();

  console.log(`Backend: ${r.backend}`);
  console.log(`Seeded ${r.tasks} tasks and ${r.logs} task logs`);
  console.log(`Window:  ${r.window[0]} → ${r.window[r.window.length - 1]} (${r.window.length} days)`);
  console.log(`User:    ${r.userId}`);
  if (r.backup) console.log(`Backup:  ${r.backup}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
