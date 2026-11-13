import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');
const studio = read('src/components/ContentStudio.tsx');
const app = read('src/App.tsx');
const styles = read('src/styles.css');

test('Monitor resource library accepts common Office and study-material formats', () => {
  assert.ok(studio.includes('pptx|txt|rtf|jpg|jpeg|png|webp|csv|xlsx|xls'));
  assert.ok(studio.includes("accept={uploadCategory==='Past paper'?'.pdf,application/pdf':'.pdf,.doc,.docx,.ppt,.pptx,.txt,.rtf,.jpg,.jpeg,.png,.webp,.csv,.xlsx,.xls'}"));
  assert.ok(studio.includes('25*1024*1024'));
});

test('Monitor resource upload supports drag and drop without removing the browse control', () => {
  assert.ok(studio.includes('resourceDragOver'));
  assert.ok(studio.includes('onDragOver='));
  assert.ok(studio.includes('onDrop='));
  assert.ok(studio.includes('event.dataTransfer.files'));
  assert.ok(studio.includes('Choose files'));
  assert.ok(styles.includes('.resource-upload-zone.is-drag-over'));
});

test('Monitor exposes the shared Study Materials label and prioritises Messages', () => {
  assert.ok(studio.includes('Study Materials &amp; Resources'));
  const nav = app.slice(app.indexOf('const navigation:'), app.indexOf('async function describeFunctionError'));
  assert.ok(nav.indexOf("label: 'Messages'") < nav.indexOf("label: 'Timetable'"));
  assert.ok(nav.indexOf("label: 'Messages'") < nav.indexOf("label: 'MIΛ'"));
});
