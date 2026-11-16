import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const monitor = readFileSync("src/components/LabsManagementPage.tsx", "utf8");

test("Monitor supports assigning Lab practicals to one learner or a school class", () => {
  assert.ok(monitor.includes('useState<"individual"|"class">("individual")'));
  assert.ok(monitor.includes('value="class">Class / group</option>'));
  assert.ok(monitor.includes("assignInstitution"));
  assert.ok(monitor.includes("assignEducationLevel"));
  assert.ok(monitor.includes("assignGrade"));
  assert.ok(monitor.includes("classTargetCount"));
});

test("Class assignments are expanded into learner-owned rows with unique practical keys", () => {
  assert.ok(monitor.includes('learners.filter(item=>item.account_status==="active"&&item.institution===assignInstitution&&item.education_level===assignEducationLevel&&item.grade===assignGrade)'));
  assert.ok(monitor.includes("const assignmentId=crypto.randomUUID()"));
  assert.ok(monitor.includes('activity_key:"assignment:"+assignmentId'));
  assert.ok(monitor.includes('supabase.from("lab_assignments").insert(rows)'));
});

test("Monitor shows whether an assigned practical has been submitted", () => {
  assert.ok(monitor.includes('row.activity_key==="assignment:"+item.id'));
  assert.ok(monitor.includes('submitted?"SUBMITTED":"AWAITING WORK"'));
});
