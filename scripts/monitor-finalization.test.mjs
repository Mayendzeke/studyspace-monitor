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
  assert.match(timetable, /Loading today's classes/);
});

test('assigned learner resources are not hidden by the recent-library limit', () => {
  const panel = read('src/components/LearnerResourcePanel.tsx');
  assert.match(panel, /assignedIds/);
  assert.match(panel, /\.in\(["']id["'], assignedIds\)/);
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


test('Monitor exposes a dedicated Today’s Session workspace connected to the student classroom records', () => {
  const app = read('src/App.tsx');
  const page = read('src/components/MonitorTodaySession.tsx');
  assert.match(app, /Today's Session/);
  assert.match(app, /<MonitorTodaySession onCreateLesson=/);
  for (const table of ['class_sessions', 'class_session_members', 'session_lesson_notes', 'session_messages', 'session_homework', 'session_whiteboards', 'session_homework_submissions']) {
    assert.ok(page.includes(table), 'teacher workspace must use shared ' + table + ' records');
  }
  assert.match(page, /audience="teacher"/);
  assert.match(page, /postgres_changes/);
  assert.match(page, /Start live class/);
  assert.match(page, /End class/);
  assert.match(page, /monitor-board-canvas-wrap/);
});

test('Monitor has exactly one scroll surface for sidebar navigation and one for the workspace', () => {
  const styles = read('src/styles.css');
  assert.match(styles, /html,body,#root\s*\{height:100%;min-height:0;overflow:hidden\}/);
  assert.match(styles, /\.app-shell>\.sidebar>\.main-nav\s*\{[^}]*overflow-y:auto/);
  assert.match(styles, /\.app-shell>\.main-area\s*\{[^}]*overflow-y:auto/);
  assert.match(styles, /\.app-shell>\.main-area>\.topbar\s*\{position:sticky;top:0/);
});


test('Monitor uses the canonical Study Space logo and installable standalone manifest', () => {
  const app = read('src/App.tsx');
  const config = read('vite.config.ts');
  const html = read('index.html');
  const styles = read('src/styles.css');
  const logo = read('public/studyspace-monitor.svg');
  const splash = read('src/components/SplashScreen.tsx');
  assert.match(app, /brand-logo-image/);
  assert.match(app, /studyspace-monitor\.svg/);
  assert.match(styles, /\.brand-mark \.brand-logo-image/);
  assert.match(logo, /#927df5/);
  assert.match(config, /name: 'Study Space Monitor'/);
  assert.match(config, /display: 'standalone'/);
  assert.match(config, /start_url: '\/studyspace-monitor\/'/);
  assert.match(config, /scope: '\/studyspace-monitor\/'/);
  assert.match(config, /purpose: 'any'/);
  assert.match(config, /purpose: 'maskable'/);
  assert.match(config, /monitor-icon-192\.png/);
  assert.match(config, /monitor-icon-512\.png/);
  assert.match(html, /monitor-icon-192\.png/);
});

test('Monitor install helper distinguishes a standalone app from a browser shortcut', () => {
  const app = read('src/App.tsx');
  assert.match(app, /matchMedia\('\(display-mode: standalone\)'\)/);
  assert.match(app, /isStandalone \? 'Installed' : 'Install app'/);
  assert.match(app, /not offering a full standalone PWA install/);
  assert.match(app, /cannot turn a browser shortcut into a native Android package/);
});


test('Monitor navigation is ordered by the teacher operating workflow', () => {
  const app = read('src/App.tsx');
  const labels = [
    "label: 'Overview'",
    "label: \"Today's Session\"",
    "label: 'Learners'",
    "label: 'Content Studio'",
    "label: 'Classroom Studio'",
    "label: 'Timetable'",
    "label: 'Academic progress'",
    "label: 'Learning engagement'",
    "label: 'Messages'",
    "label: 'MIΛ'",
    "label: 'Access PINs'",
    "label: 'Guardian verification'",
    "label: 'Subscriptions'",
    "label: 'Testimonials'",
    "label: 'Settings'",
  ];
  let previous = -1;
  for (const label of labels) {
    const current = app.indexOf(label);
    assert.ok(current > previous, label + ' should appear in the requested navigation order');
    previous = current;
  }
});

test('MIΛ marks written assessment answers and defers uncertain marks to the teacher', () => {
  const endpoint = read('supabase/functions/submit-exercise-attempt/index.ts');
  const provider = read('supabase/functions/submit-exercise-attempt/provider.ts');
  const queue = read('src/components/AssessmentReviewQueue.tsx');
  const migration = read('supabase/migrations/20261114120000_studyspace_ai_marking_and_student_storage.sql');
  assert.ok(endpoint.includes('markWithCloudflare'));
  assert.ok(endpoint.includes('question_type === "short_answer"'));
  assert.ok(endpoint.includes('confidence >= 0.75'));
  assert.ok(endpoint.includes('teacher_review'));
  assert.ok(endpoint.includes('marking_details'));
  assert.ok(endpoint.includes('teacher_review_required'));
  assert.ok(provider.includes('GEMMA_MODEL'));
  assert.ok(provider.includes('SECONDARY_MODEL'));
  assert.ok(!provider.includes('GEMINI_API_KEY'));
  assert.ok(queue.includes('.eq("teacher_review_required", true)'));
  assert.ok(queue.includes('ai_suggested_mark'));
  assert.ok(queue.includes('marking_status: "teacher_marked"'));
  assert.ok(migration.includes('sync_studyspace_assessment_progress'));
  assert.ok(migration.includes('progress_events_one_assigned_attempt'));
});

test('live-class homework supports student submissions, MIΛ marks and final teacher overrides', () => {
  const studentFunction = read('supabase/functions/mark-class-homework/index.ts');
  const teacherSession = read('src/components/MonitorTodaySession.tsx');
  const migration = read('supabase/migrations/20261114120000_studyspace_ai_marking_and_student_storage.sql');
  assert.ok(studentFunction.includes('markWithCloudflare'));
  assert.ok(studentFunction.includes('session_homework_submissions'));
  assert.ok(studentFunction.includes('teacher_review'));
  assert.ok(studentFunction.includes('ai_marking_status'));
  assert.ok(!studentFunction.includes('GEMINI_API_KEY'));
  assert.ok(teacherSession.includes('publishSessionHomework'));
  assert.ok(teacherSession.includes('marking_rubric'));
  assert.ok(teacherSession.includes('saveTeacherHomeworkMark'));
  assert.ok(teacherSession.includes('teacher_score'));
  assert.ok(teacherSession.includes('postgres_changes'));
  assert.ok(migration.includes('sync_studyspace_class_homework_progress'));
  assert.ok(migration.includes('class_homework_results'));
});

test('per-learner storage quota is visible and can be increased securely in Monitor', () => {
  const panel = read('src/components/LearnerResourcePanel.tsx');
  const migration = read('supabase/migrations/20261114120000_studyspace_ai_marking_and_student_storage.sql');
  const sync = read('supabase/functions/mark-class-homework/index.ts');
  assert.ok(panel.includes('get_studyspace_storage_status'));
  assert.ok(panel.includes('set_studyspace_learner_storage_quota'));
  assert.ok(panel.includes('learner-storage-quota'));
  assert.ok(panel.includes('quotaChoice'));
  assert.ok(migration.includes('learner_storage_quotas'));
  assert.ok(migration.includes('learner_storage_reservations'));
  assert.ok(migration.includes('reserve_studyspace_personal_storage'));
  assert.ok(migration.includes('can_upload_studyspace_personal_object'));
  assert.ok(migration.includes('20 * 1024 * 1024 * 1024') || migration.includes('21474836480'));
  assert.ok(migration.includes('Administrator access with verified MFA is required'));
});

test('student and teacher live classroom surfaces remain connected to all existing session tools', () => {
  const teacher = read('src/components/MonitorTodaySession.tsx');
  const app = read('src/App.tsx');
  for (const feature of ['class_sessions','class_session_members','session_lesson_notes','session_messages','session_homework','session_whiteboards','session_homework_submissions']) {
    assert.ok(teacher.includes(feature), 'Today\'s Session must retain ' + feature);
  }
  assert.ok(app.includes('<MonitorTodaySession onCreateLesson='));
  assert.ok(teacher.includes('Start live class'));
  assert.ok(teacher.includes('End class'));
  assert.ok(teacher.includes('monitor-board-canvas-wrap'));
  assert.ok(teacher.includes('Class chat'));
});
