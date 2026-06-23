import db from "../services/db.js";

// Dev seed — NOT a production migration. Wipes exercise_completions and
// replaces it with fake but structurally realistic data for local testing.

const AREA = "🧠 Psychometric MOC";
const SECTIONS = ["כמותי", "מילולי", "אנגלית"] as const;
const LESSON_COUNT = 10;
const ROWS_PER_LESSON = 2;

const TOPICS: Record<typeof SECTIONS[number], string[]> = {
    "כמותי": ["חזקות ושורשים", "משוואות", "אחוזים", "הנדסה", "סטטיסטיקה"],
    "מילולי": ["אנלוגיות", "הבנת הנקרא", "השלמת משפטים", "ניתוח טיעונים", "אוצר מילים"],
    "אנגלית": ["Reading Comprehension", "Sentence Completion", "Grammar", "Vocabulary", "Analogies"],
};

const ZONES = ["תרגול", "מבחן", "חזרה"];

function randomItem<T>(arr: readonly T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

const deleteAll = db.prepare("DELETE FROM exercise_completions");
const insert = db.prepare(`
  INSERT INTO exercise_completions
    (note_path, lesson_number, area, section, zone, topic, exercise_set, completed, url, synced_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const seed = db.transaction(() => {
    deleteAll.run();

    const now = new Date().toISOString();
    const counts: Record<string, number> = {};
    let exerciseCounter = 0;

    for (const section of SECTIONS) {
        counts[section] = 0;
        for (let lesson = 1; lesson <= LESSON_COUNT; lesson++) {
            for (let i = 0; i < ROWS_PER_LESSON; i++) {
                exerciseCounter++;
                const notePath = `01 Notes/Psychometric/Lessons/Homework/Lesson-${String(lesson).padStart(2, "0")}-seed.md`;
                const topic = randomItem(TOPICS[section]);
                const zone = randomItem(ZONES);
                const exerciseSet = `תרגיל ${exerciseCounter}`;
                const completed = Math.random() < 0.7 ? 1 : 0;
                const url = `https://example.com/seed/${section}/${exerciseCounter}`;

                insert.run(notePath, lesson, AREA, section, zone, topic, exerciseSet, completed, url, now);
                counts[section]++;
            }
        }
    }

    return counts;
});

console.log("Dev seed: wiping exercise_completions and inserting fake data...");
const counts = seed();

console.log("\nDone. Rows inserted per section:");
for (const [section, count] of Object.entries(counts)) {
    console.log(`  ${section}: ${count}`);
}
console.log(`  Total: ${Object.values(counts).reduce((a, b) => a + b, 0)}`);
