import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

test('learner detail opens a dedicated resource manager for the selected learner', () => {
  const page = read('src/components/LearnersPage.tsx');
  assert.match(page, /import LearnerResourcePanel from ["']\.\/LearnerResourcePanel["']/);
  assert.match(page, /<LearnerResourcePanel\s+learnerId=\{viewTarget\.id\}/);
});

test('learner resource manager uses the private resource bucket and shared assignment tables', () => {
  assert.equal(existsSync('src/components/LearnerResourcePanel.tsx'), true, 'LearnerResourcePanel must exist');
  const panel = read('src/components/LearnerResourcePanel.tsx');
  assert.match(panel, /studyspace-resources/);
  assert.match(panel, /learning_resources/);
  assert.match(panel, /resource_assignments/);
  assert.match(panel, /25\s*\*\s*1024\s*\*\s*1024/);
  assert.ok(panel.includes('\\.(pdf|doc|docx'), 'the established document extension allowlist must be retained');
  assert.match(panel, /resource_assignments[\s\S]*\.delete\(/);
  assert.doesNotMatch(panel, /from\(["']learning_resources["']\)\s*\.delete\(/);
});

test('weekly timetable includes a daily teaching card', () => {
  const timetable = read('src/components/TeacherWeeklyTimetable.tsx');
  assert.match(timetable, /todayClasses/);
  assert.match(timetable, /Today's classes/);
  assert.match(timetable, /monitor-today-classes/);
});

test('Monitor two-week subscription price is E180 for fourteen days', () => {
  const page = read('src/components/LearnersPage.tsx');
  assert.match(page, /2 Weeks — 14 days — E180/);
  assert.doesNotMatch(page, /2 Weeks — 14 days — E200/);
});

test('Monitor top bar remains sticky with a theme-aware surface', () => {
  const styles = read('src/styles.css');
  const topbarRules = [...styles.matchAll(/\.topbar\s*\{([^}]*)\}/g)].map(match => match[1]);
  assert.ok(topbarRules.some(rule =>
    /position:\s*sticky/.test(rule) &&
    /top:\s*0/.test(rule) &&
    /z-index:/.test(rule) &&
    /background:/.test(rule)
  ), 'a theme-aware sticky topbar rule must exist');
});

test('deployment workflow checks the actual teacher timetable component', () => {
  const workflow = read('.github/workflows/deploy.yml');
  assert.match(workflow, /node --test scripts\/monitor-finalization\.test\.mjs/);
  assert.match(workflow, /src\/components\/TeacherWeeklyTimetable\.tsx/);
  assert.doesNotMatch(workflow, /src\/components\/AdminTimetablePage\.tsx/);
});
