import fs from "fs";
import path from "path";
import db from "../services/db.js";

const VAULT_ROOT = "C:/Gal's Obsidian Vault";
const LESSON_FOLDERS = [
    "01 Notes/Psychometric/Lessons/Homework",
];

interface Frontmatter {
    lesson_number: number | null;
    area: string;
    section: string;
}

interface CheckboxRow {
    section: string;
    zone: string;
    topic: string;
    exercise_set: string;
    completed: 0 | 1;
    url: string;
}

function parseFrontmatter(raw: string): Frontmatter {
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return { lesson_number: null, area: "", section: "" };
    const fm = match[1];

    const lessonMatch = fm.match(/^lesson-number:\s*(\d+)/m);
    const lesson_number = lessonMatch ? parseInt(lessonMatch[1]) : null;

    // area: "[[🧠 Psychometric MOC]]" → strip [[ ]]
    const areaMatch = fm.match(/^area:\s*"?\[\[(.+?)\]\]"?/m);
    const area = areaMatch ? areaMatch[1] : "";

    // section: either inline or YAML array
    let section = "";
    const sectionLine = fm.match(/^section:(.*)/m);
    if (sectionLine) {
        const val = sectionLine[1].trim();
        if (val) {
            section = val.replace(/^["']|["']$/g, "");
        } else {
            const arrayMatch = fm.match(/^section:\s*\n\s+-\s+(.+)/m);
            if (arrayMatch) section = arrayMatch[1].trim();
        }
    }

    return { lesson_number, area, section };
}

// Headers that group assignments by *when/why* (this week's homework, next
// lesson's prep, vocab, reinforcement) rather than by exam section/zone.
// They show up at varying heading depths across files (e.g. "#" in most
// lessons, "##" in Lesson 15) so they're matched by content, not level.
const STRUCTURAL_HEADER_MARKERS = ["שיעורי בית", "הכנה לשיעור", "אוצר מילים", "חיזוק"];

// A header normally just renames the zone (e.g. "ספר קושיות"), inheriting
// the note's frontmatter section. Two explicit overrides appear in practice:
//   "(פרק X)"   → this chunk's exam section is actually X, not the frontmatter default
//   "(תחת X)"   → file this chunk's zone as X instead of the header's own label
// A header can also declare its section just by naming it directly (e.g. "אנגלית").
const SECTION_KEYWORDS = ["מילולי", "אנגלית", "כמותי"] as const;

function classifyHeader(cleanedText: string, defaultSection: string): { zone: string; section: string } {
    let text = cleanedText;
    let section = defaultSection;

    const chapterMatch = text.match(/\(פרק\s+(מילולי|כמותי|אנגלית)\)/);
    if (chapterMatch) {
        section = chapterMatch[1];
        text = text.replace(chapterMatch[0], "").trim();
    } else {
        for (const keyword of SECTION_KEYWORDS) {
            if (text.includes(keyword)) {
                section = keyword;
                break;
            }
        }
    }

    const underMatch = text.match(/\(תחת\s+([^)]+)\)/);
    const zone = underMatch
        ? underMatch[1].trim()
        : text.replace(/[-–]+$/, "").trim();

    return { zone, section };
}

function parseCheckboxes(body: string, defaultSection: string): CheckboxRow[] {
    const rows: CheckboxRow[] = [];
    let currentZone = "";
    let currentSection = defaultSection;

    for (const line of body.split("\n")) {
        // Heading of any level → either a structural grouping (skip, keep
        // current zone/section) or a real zone header (re-classify).
        const heading = line.match(/^#{1,6}\s+(.*)$/);
        if (heading) {
            const cleaned = heading[1].replace(/\*\*/g, "").trim();
            if (!STRUCTURAL_HEADER_MARKERS.some((marker) => cleaned.includes(marker))) {
                const info = classifyHeader(cleaned, defaultSection);
                currentZone = info.zone;
                currentSection = info.section;
            }
            continue;
        }

        // - [x] [text](url)
        const cb = line.match(/^[-*]\s+\[([x ])\]\s+\[([^\]]+)\]\(([^)]*)\)/i);
        if (!cb) continue;

        const completed = cb[1].toLowerCase() === "x" ? 1 : 0;
        const linkText = cb[2];
        const url = cb[3];

        // Split on en dash (Hebrew) or hyphen (English)
        const enIdx = linkText.indexOf(" – ");
        const hypIdx = linkText.indexOf(" - ");
        const sepIdx = enIdx !== -1 ? enIdx : hypIdx;
        const sepLen = enIdx !== -1 ? 3 : 3; // both separators are 3 chars with spaces

        let topic: string;
        let exercise_set: string;
        if (sepIdx !== -1) {
            topic = linkText.slice(0, sepIdx).trim();
            exercise_set = linkText.slice(sepIdx + sepLen).trim();
        } else {
            topic = linkText.trim();
            exercise_set = "";
        }

        rows.push({
            section: currentSection, zone: currentZone, topic, exercise_set,
            completed: completed as 0 | 1, url,
        });
    }

    return rows;
}

const deleteByPath = db.prepare("DELETE FROM exercise_completions WHERE note_path = ?");
const insert = db.prepare(`
  INSERT INTO exercise_completions
    (note_path, lesson_number, area, section, zone, topic, exercise_set, completed, url, synced_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const syncAll = db.transaction(() => {
    let total = 0;
    const now = new Date().toISOString();

    for (const folder of LESSON_FOLDERS) {
        const folderPath = path.join(VAULT_ROOT, folder);
        if (!fs.existsSync(folderPath)) {
            console.log(`  skip (not found): ${folderPath}`);
            continue;
        }

        const files = fs.readdirSync(folderPath).filter((f) => f.endsWith(".md"));

        for (const file of files) {
            const absPath = path.join(folderPath, file);
            const notePath = `${folder}/${file}`.replace(/\\/g, "/");
            const content = fs.readFileSync(absPath, "utf-8");

            // Separate frontmatter from body
            const bodyStart = content.indexOf("---", 3);
            const body = bodyStart !== -1 ? content.slice(bodyStart + 3) : content;

            const fm = parseFrontmatter(content);
            const rows = parseCheckboxes(body, fm.section);

            deleteByPath.run(notePath);
            for (const row of rows) {
                insert.run(notePath, fm.lesson_number, fm.area, row.section,
                    row.zone, row.topic, row.exercise_set, row.completed, row.url, now);
                total++;
            }

            console.log(`  ${file}: ${rows.length} checkboxes`);
        }
    }

    return total;
});

const count = syncAll();
console.log(`\nDone. Synced ${count} total entries.`);
