import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');

test('Monitor navigation uses the shared StudySpace brand mark while retaining its app-specific launcher icon', () => {
  const app = read('src/App.tsx');
  const index = read('index.html');
  assert.match(app, /brand-logo-image[^>]*favicon\.svg/);
  assert.equal(existsSync('public/favicon.svg'), true, 'shared StudySpace brand mark must be shipped with Monitor');
  assert.match(index, /monitor-icon-192\.png/);
  assert.match(index, /studyspace-monitor\.svg/);
});

test('testimonial PNG export quotes learner copy and uses the shared brand and product typography', () => {
  const page = read('src/components/TestimonialsInbox.tsx');
  assert.ok(page.includes("const quoteText = '“' + item.message.trim() + '”';"));
  assert.ok(page.includes("import.meta.env.BASE_URL + 'favicon.svg'"));
  assert.match(page, /Manrope/);
  assert.match(page, /DM Sans/);
  assert.doesNotMatch(page, /Georgia, serif/);
  assert.doesNotMatch(page, /Arial, sans-serif/);
  assert.ok(page.includes('canExportMarketingImage(item)'), 'marketing consent guard must remain in place');
});
