import Database from 'better-sqlite3';
const db = new Database('./data/jarvis.db');

console.log('=== Distinct sections ===');
const sections = db.prepare('SELECT DISTINCT section FROM exercise_completions ORDER BY section').all();
sections.forEach(s => console.log(s.section));

console.log('\n=== Topics per section ===');
const topicCounts = db.prepare('SELECT section, COUNT(DISTINCT topic) as topic_count FROM exercise_completions GROUP BY section ORDER BY section').all();
topicCounts.forEach(t => console.log(`${t.section}: ${t.topic_count} topics`));

console.log('\n=== Remaining exercises per section ===');
const sectionRemaining = db.prepare('SELECT section, COUNT(*) - SUM(completed) as remaining, COUNT(DISTINCT topic) as topics FROM exercise_completions GROUP BY section ORDER BY remaining DESC').all();
sectionRemaining.forEach(s => console.log(`${s.section}: ${s.remaining} remaining, ${s.topics} topics`));

console.log('\n=== Top 15 topics by remaining (raw query) ===');
const topTopics = db.prepare(`
  SELECT section, zone, topic, COUNT(*) as total, SUM(completed) as done, COUNT(*) - SUM(completed) as remaining
  FROM exercise_completions
  GROUP BY topic
  ORDER BY remaining DESC
  LIMIT 15
`).all();
topTopics.forEach((t, i) => console.log(`${i+1}. "${t.topic}" (${t.section}): ${t.remaining} remaining`));

console.log('\n=== Check for duplicate topic names across sections ===');
const dupTopics = db.prepare(`
  SELECT topic, COUNT(DISTINCT section) as section_count, GROUP_CONCAT(DISTINCT section) as sections
  FROM exercise_completions
  GROUP BY topic
  HAVING COUNT(DISTINCT section) > 1
`).all();
if (dupTopics.length === 0) {
  console.log('No duplicates found - all topics are unique within their section');
} else {
  console.log(`Found ${dupTopics.length} topics appearing in multiple sections:`);
  dupTopics.forEach(d => console.log(`  "${d.topic}" in: ${d.sections}`));
}

db.close();
