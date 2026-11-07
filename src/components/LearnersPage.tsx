import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Building2, Download, Edit3, Eye, KeyRound, RefreshCw,
  Save, Search, ShieldAlert, Trash2, UserRound, X,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import TimetableManager from "./TimetableManager";
import SharedStudyTimetable from "./SharedStudyTimetable";

type Learner = {
  id: string;
  student_id: string | null;
  full_name: string;
  preferred_name: string;
  account_status: "active" | "disabled" | "pending" | string;
  created_at: string;
  updated_at: string;
  country: string;
  institution: string;
  course: string;
  education_level: string;
  grade: string;
  curriculum: string;
  academic_year: string;
  subscription_tier: string | null;
  subscription_expires_at: string | null;
};

type ProfileForm = Pick<
  Learner,
  "full_name" | "preferred_name" | "country" | "institution" | "course" |
  "education_level" | "grade" | "curriculum" | "academic_year"
> & { subscription_tier: string; subscription_expires_at: string };

type ManageAction = "disable" | "enable" | "reset_password";

const SUBSCRIPTION_PLANS = [
  { value: "Free Trial", label: "Free Trial — 1 day — E0", days: 1 },
  { value: "Weekly", label: "Weekly — 7 days — E100", days: 7 },
  { value: "2 Weeks", label: "2 Weeks — 14 days — E200", days: 14 },
  { value: "Monthly", label: "Monthly — 28 days — E400", days: 28 },
] as const;

function expiryFromNow(days: number): string {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + days);
  expiry.setSeconds(0, 0);
  const local = new Date(expiry.getTime() - expiry.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

const emptyForm: ProfileForm = {
  full_name: "",
  preferred_name: "",
  country: "",
  institution: "",
  course: "",
  education_level: "",
  grade: "",
  curriculum: "",
  academic_year: "",
  subscription_tier: "",
  subscription_expires_at: "",
};

async function functionError(reason: unknown, fallback: string): Promise<string> {
  if (reason && typeof reason === "object" && "context" in reason) {
    const context = (reason as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const payload = await context.clone().json() as { error?: unknown; message?: unknown };
        if (typeof payload.error === "string") return payload.error;
        if (typeof payload.message === "string") return payload.message;
      } catch {
        // Fall through to the generic message.
      }
    }
  }
  return reason instanceof Error ? reason.message : fallback;
}

function learnerName(learner: Learner): string {
  return learner.preferred_name || learner.full_name || "Learner";
}

function csvCell(value: unknown): string {
  const raw = String(value ?? "");
  return '"' + raw.replace(/"/g, '""') + '"';
}

export default function LearnersPage({ onCreatePin }: { onCreatePin: () => void }) {
  const [learners, setLearners] = useState<Learner[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [temporary, setTemporary] = useState<{ studentId: string; password: string } | null>(null);
  const [editTarget, setEditTarget] = useState<Learner | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileForm>(emptyForm);
  const [savingProfile, setSavingProfile] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Learner | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [adminId, setAdminId] = useState("");
  const [viewTarget, setViewTarget] = useState<Learner | null>(null);
  const [viewSubjects, setViewSubjects] = useState<string[]>([]);
  const [viewSubjectsLoading, setViewSubjectsLoading] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getUser().then(({ data }) => setAdminId(data.user?.id ?? ""));
  }, []);

  async function openView(learner: Learner) {
    if (!supabase) return;
    setViewTarget(learner);
    setViewSubjects([]);
    setViewSubjectsLoading(true);
    setError("");
    const { data, error: subjectError } = await supabase.from("student_subjects")
      .select("name").eq("learner_id", learner.id).order("name");
    if (subjectError) setError("Student details opened, but subjects could not be loaded: " + subjectError.message);
    else setViewSubjects(Array.from(new Set((data ?? []).map(row => String(row.name ?? "").trim()).filter(Boolean))));
    setViewSubjectsLoading(false);
  }

  async function refresh() {
    if (!supabase) {
      setLoading(false);
      setError("Connect Supabase to load learner accounts.");
      return;
    }
    setLoading(true);
    const { data, error: queryError } = await supabase.from("profiles")
      .select("id,student_id,full_name,preferred_name,account_status,created_at,updated_at,country,institution,course,education_level,grade,curriculum,academic_year,subscription_tier,subscription_expires_at")
      .eq("role", "learner")
      .order("created_at", { ascending: false });

    if (queryError) {
      setError("Learner records could not be loaded. Check administrator access and the applied migrations.");
    } else {
      setLearners((data ?? []) as Learner[]);
      setError("");
    }
    setLoading(false);
  }

  useEffect(() => { void refresh(); }, []);

  const counts = useMemo(() => ({
    all: learners.length,
    active: learners.filter(item => item.account_status === "active").length,
    disabled: learners.filter(item => item.account_status === "disabled").length,
    pending: learners.filter(item => item.account_status === "pending").length,
  }), [learners]);

  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return learners.filter(item => {
      const matchesStatus = statusFilter === "all" || item.account_status === statusFilter;
      const searchable = [
        item.student_id, item.full_name, item.preferred_name, item.country,
        item.institution, item.course, item.education_level, item.course, item.grade, item.curriculum, item.academic_year,
      ].join(" ").toLocaleLowerCase();
      return matchesStatus && (!needle || searchable.includes(needle));
    });
  }, [learners, search, statusFilter]);

  async function manage(learner: Learner, action: ManageAction) {
    if (!supabase || busyId) return;
    if (action === "disable" && !window.confirm("Disable " + learnerName(learner) + "'s account? They will no longer be able to sign in or sync.")) return;
    if (action === "reset_password" && !window.confirm("Generate a new temporary password for " + learnerName(learner) + "? The previous password will stop working.")) return;

    setBusyId(learner.id);
    setError("");
    setNotice("");
    setTemporary(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("manage-learner-account", {
        body: { learnerId: learner.id, action },
      });
      if (invokeError) throw new Error(await functionError(invokeError, "The account action failed."));
      if (!data?.success) throw new Error(data?.error || "The account action failed.");

      if (action === "reset_password") {
        if (!data.temporaryPassword) throw new Error("The server did not return the temporary password.");
        setTemporary({
          studentId: learner.student_id || "Student ID unavailable",
          password: data.temporaryPassword,
        });
        setNotice("Password rotated. Copy the temporary password and deliver it privately. It will only be shown once.");
      } else {
        setNotice(data.message || "Account updated.");
        await refresh();
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The account action failed.");
      await refresh();
    } finally {
      setBusyId("");
    }
  }

  function openEdit(learner: Learner) {
    setEditTarget(learner);
    setProfileForm({
      full_name: learner.full_name || "",
      preferred_name: learner.preferred_name || "",
      country: learner.country || "",
      institution: learner.institution || "",
      course: learner.course || "",
      education_level: learner.education_level || "",
      grade: learner.grade || "",
      curriculum: learner.curriculum || "",
      academic_year: learner.academic_year || "",
      subscription_tier: learner.subscription_tier || "",
      subscription_expires_at: learner.subscription_expires_at ? new Date(learner.subscription_expires_at).toLocaleString("sv-SE").replace(" ", "T").slice(0, 16) : "",
    });
    setError("");
    setNotice("");
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !editTarget || savingProfile) return;
    setSavingProfile(true);
    setError("");
    setNotice("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("manage-learner-account", {
        body: { learnerId: editTarget.id, action: "update_profile", profile: { ...profileForm, subscription_expires_at: profileForm.subscription_expires_at ? new Date(profileForm.subscription_expires_at).toISOString() : "" } },
      });
      if (invokeError) throw new Error(await functionError(invokeError, "The learner profile could not be saved."));
      if (!data?.success) throw new Error(data?.error || "The learner profile could not be saved.");
      setEditTarget(null);
      setNotice("Updated " + (profileForm.preferred_name || profileForm.full_name) + "'s learner profile.");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The learner profile could not be saved.");
      await refresh();
    } finally {
      setSavingProfile(false);
    }
  }

  async function deleteLearner() {
    if (!supabase || !deleteTarget || deleting) return;
    const required = "DELETE " + (deleteTarget.student_id || deleteTarget.id);
    if (deleteConfirmation !== required) return;

    setDeleting(true);
    setBusyId(deleteTarget.id);
    setError("");
    setNotice("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("manage-learner-account", {
        body: {
          learnerId: deleteTarget.id,
          action: "delete",
          confirmation: deleteConfirmation,
        },
      });
      if (invokeError) throw new Error(await functionError(invokeError, "The learner account could not be deleted."));
      if (!data?.success || !data?.deleted) throw new Error(data?.error || "The learner account could not be deleted.");

      const name = learnerName(deleteTarget);
      setDeleteTarget(null);
      setDeleteConfirmation("");
      setTemporary(null);
      setNotice(
        name + "'s account was permanently deleted. " +
        Number(data.storageFilesRemoved || 0) + " personal cloud file(s) removed. " +
        (data.auditLogged === false ? "The deletion audit record needs attention." : "The action was recorded in the audit log.") +
        " Offline copies already saved on individual devices may still need to be cleared there."
      );
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The learner account could not be deleted.");
      await refresh();
    } finally {
      setDeleting(false);
      setBusyId("");
    }
  }

  async function copyPassword() {
    if (!temporary) return;
    if (!navigator.clipboard) {
      setNotice("Clipboard access is unavailable. Select and copy the temporary password manually.");
      return;
    }
    try {
      await navigator.clipboard.writeText(temporary.password);
      setNotice("Temporary password copied. Deliver it privately.");
    } catch {
      setNotice("Clipboard access failed. Select and copy the password manually.");
    }
  }

  function exportCsv() {
    const headings = [
      "Student ID", "Full name", "Preferred name", "School / institution", "Country",
      "Education level", "Course / programme", "Grade / year", "Curriculum", "Academic year", "Account status", "Joined",
    ];
    const rows = learners.map(item => [
      item.student_id, item.full_name, item.preferred_name, item.institution, item.country,
      item.education_level, item.course, item.grade, item.curriculum, item.academic_year,
      item.account_status, item.created_at,
    ]);
    const csv = [headings, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "studyspace-learners-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  const deletePhrase = deleteTarget ? "DELETE " + (deleteTarget.student_id || deleteTarget.id) : "";

  return (
    <div className="subpage learners-page">
      <div className="eyebrow">LEARNER MANAGEMENT</div>
      <h1>Learner accounts</h1>
      <p className="page-subtitle">Manage learner records, school placement, academic details, sign-in access and account deletion from one secure workspace.</p>

      {adminId && <TimetableManager learnerId={adminId} kind="personal" title="My teacher timetable" allowGroupEvents/>}
      <SharedStudyTimetable/>


      <div className="learners-summary">
        <button type="button" className={statusFilter === "all" ? "learner-summary-card selected" : "learner-summary-card"} onClick={() => setStatusFilter("all")}>
          <span>Total learner accounts</span><strong>{counts.all}</strong><small>All enrolled profiles</small>
        </button>
        <button type="button" className={statusFilter === "active" ? "learner-summary-card selected" : "learner-summary-card"} onClick={() => setStatusFilter("active")}>
          <span>Active</span><strong>{counts.active}</strong><small>Can sign in and sync</small>
        </button>
        <button type="button" className={statusFilter === "disabled" ? "learner-summary-card selected" : "learner-summary-card"} onClick={() => setStatusFilter("disabled")}>
          <span>Disabled</span><strong>{counts.disabled}</strong><small>Access blocked</small>
        </button>
        <button type="button" className={statusFilter === "pending" ? "learner-summary-card selected" : "learner-summary-card"} onClick={() => setStatusFilter("pending")}>
          <span>Pending</span><strong>{counts.pending}</strong><small>Not yet activated</small>
        </button>
      </div>

      <div className="panel learners-toolbar">
        <div><strong>{visible.length} learner{visible.length === 1 ? "" : "s"} shown</strong><small>Profile edits and account actions require administrator MFA.</small></div>
        <button type="button" className="subtle-button" onClick={() => void refresh()} disabled={loading || !!busyId}><RefreshCw size={14}/> Refresh</button>
        <button type="button" className="subtle-button" onClick={exportCsv} disabled={!learners.length}><Download size={14}/> Export CSV</button>
        <button type="button" className="primary-button" onClick={onCreatePin}><KeyRound size={14}/> Create enrolment PIN</button>
      </div>

      <div className="learners-filter-row">
        <label className="learners-search">
          <span><Search size={14}/> Search learner records</span>
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Student ID, name, school, grade, curriculum…" />
        </label>
        <label className="learners-status-filter">
          <span>Account status</span>
          <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
            <option value="all">All accounts</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
            <option value="pending">Pending</option>
          </select>
        </label>
      </div>

      {notice && <p className="inline-message" role="status">{notice}</p>}
      {error && <p className="inline-message error-message" role="alert">{error}</p>}

      {temporary && (
        <div className="pin-issued-card">
          <strong>Temporary password · shown once</strong>
          <div><span>Student ID</span><code>{temporary.studentId}</code></div>
          <div><span>New password</span><code>{temporary.password}</code><button type="button" className="subtle-button" onClick={() => void copyPassword()}>Copy password</button></div>
          <small>The previous password has been replaced. Deliver this password directly to the learner and do not share it in a group chat.</small>
        </div>
      )}

      <section className="panel learners-list-panel">
        {loading ? (
          <div className="classroom-empty">Loading learner accounts…</div>
        ) : visible.length ? visible.map(learner => (
          <article className="learner-row learner-admin-row" key={learner.id}>
            <div className="learner-avatar">{learnerName(learner).slice(0, 1).toUpperCase()}</div>
            <div className="learner-identity">
              <strong>{learnerName(learner)}</strong>
              <span>{learner.student_id || "No Student ID"} · {learner.grade || "Grade not set"}{learner.course ? " · " + learner.course : ""} · {learner.curriculum || "Curriculum not set"}</span>
              <small><Building2 size={12}/> {learner.institution || "School not set"} · {learner.education_level || "Level not set"} · {learner.academic_year || "Year not set"} · {learner.country || "Country not set"}</small>
              <small>Joined {learner.created_at ? new Date(learner.created_at).toLocaleDateString() : "Date unavailable"}</small>
            </div>
            <span className={"pin-status " + learner.account_status}>{learner.account_status}</span>
            <div className="learner-actions learner-admin-actions">
              <button type="button" className="text-button" disabled={!!busyId} onClick={() => void openView(learner)}><Eye size={13}/> View student</button>
              <button type="button" className="text-button" disabled={!!busyId} onClick={() => openEdit(learner)}><Edit3 size={13}/> Edit details</button>
              <button type="button" className="text-button" disabled={!!busyId || learner.account_status !== "active"} onClick={() => void manage(learner, "reset_password")}><KeyRound size={13}/> Reset password</button>
              {learner.account_status === "active" ? (
                <button type="button" className="text-button danger-text" disabled={!!busyId} onClick={() => void manage(learner, "disable")}>Disable</button>
              ) : (
                <button type="button" className="text-button" disabled={!!busyId} onClick={() => void manage(learner, "enable")}>Enable</button>
              )}
              <button type="button" className="text-button danger-text" disabled={!!busyId} onClick={() => { setDeleteTarget(learner); setDeleteConfirmation(""); setError(""); }}>
                <Trash2 size={13}/> Delete
              </button>
            </div>
          </article>
        )) : (
          <div className="classroom-empty">
            <UserRound size={25}/>
            <strong>{search || statusFilter !== "all" ? "No matching learners" : "No learner accounts yet"}</strong>
            <span>{search || statusFilter !== "all" ? "Try a different search or account-status filter." : "Generate an enrolment PIN and share the Student ID and PIN privately with a learner."}</span>
          </div>
        )}
      </section>

      {viewTarget && (
        <div className="learner-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setViewTarget(null); }}>
          <section className="learner-admin-modal learner-view-modal" role="dialog" aria-modal="true" aria-labelledby="learner-view-title">
            <div className="learner-modal-heading">
              <div><span className="eyebrow">STUDENT WORKSPACE</span><h2 id="learner-view-title">{learnerName(viewTarget)}</h2><p>{viewTarget.student_id || "Student ID unavailable"} · {viewTarget.institution || "School not set"}</p></div>
              <button type="button" className="icon-button" aria-label="Close student details" onClick={() => setViewTarget(null)}><X size={18}/></button>
            </div>
            <div className="learner-view-profile-grid">
              <div><span>{/university|college/i.test(viewTarget.education_level) ? "Year of study" : "Grade / form"}</span><strong>{viewTarget.grade || "Not set"}</strong></div>
              {viewTarget.course && <div><span>Course / programme</span><strong>{viewTarget.course}</strong></div>}
              <div><span>Curriculum</span><strong>{viewTarget.curriculum || "Not set"}</strong></div>
              <div><span>Academic year</span><strong>{viewTarget.academic_year || "Not set"}</strong></div>
              <div><span>Education level</span><strong>{viewTarget.education_level || "Not set"}</strong></div>
            </div>
            <section className="learner-view-subjects">
              <strong>Registered subjects</strong>
              {viewSubjectsLoading ? <small>Loading subjects…</small> : viewSubjects.length ? <div>{viewSubjects.map(subject => <span key={subject}>{subject}</span>)}</div> : <small>No registered subjects were found.</small>}
            </section>
            <div className="learner-view-timetables">
              <TimetableManager learnerId={viewTarget.id} kind="school" title="School timetable" subjects={viewSubjects}/>
              <TimetableManager learnerId={viewTarget.id} kind="personal" title="Personal study timetable" subjects={viewSubjects}/>
            </div>
            <div className="learner-modal-actions"><button type="button" className="subtle-button" onClick={() => setViewTarget(null)}>Close student view</button><button type="button" className="primary-button" onClick={() => { setViewTarget(null); openEdit(viewTarget); }}><Edit3 size={14}/> Edit profile</button></div>
          </section>
        </div>
      )}

      {editTarget && (
        <div className="learner-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !savingProfile) setEditTarget(null); }}>
          <section className="learner-admin-modal" role="dialog" aria-modal="true" aria-labelledby="learner-edit-title">
            <div className="learner-modal-heading">
              <div><span className="eyebrow">LEARNER RECORD</span><h2 id="learner-edit-title">Edit learner details</h2><p>{learnerName(editTarget)} · {editTarget.student_id || "Student ID unavailable"}</p></div>
              <button type="button" className="icon-button" aria-label="Close editor" disabled={savingProfile} onClick={() => setEditTarget(null)}><X size={18}/></button>
            </div>
            <form onSubmit={event => void saveProfile(event)}>
              <div className="learner-form-grid">
                <label>Full name<input required maxLength={120} value={profileForm.full_name} onChange={event => setProfileForm(current => ({ ...current, full_name: event.target.value }))}/></label>
                <label>Preferred name<input maxLength={80} value={profileForm.preferred_name} onChange={event => setProfileForm(current => ({ ...current, preferred_name: event.target.value }))}/></label>
                <label>School / institution<input maxLength={160} value={profileForm.institution} onChange={event => setProfileForm(current => ({ ...current, institution: event.target.value }))} placeholder="School or institution name"/></label>
                <label>Country<input maxLength={80} value={profileForm.country} onChange={event => setProfileForm(current => ({ ...current, country: event.target.value }))}/></label>
                <label>Education level<input maxLength={80} value={profileForm.education_level} onChange={event => setProfileForm(current => ({ ...current, education_level: event.target.value }))} placeholder="Primary, Secondary, Tertiary…"/></label>
                <label>{/university|college/i.test(profileForm.education_level) ? "Year of study" : /primary/i.test(profileForm.education_level) ? "Grade / class" : /secondary|sixth form/i.test(profileForm.education_level) ? "Form / grade" : "Grade / form / year"}<input maxLength={80} value={profileForm.grade} onChange={event => setProfileForm(current => ({ ...current, grade: event.target.value }))} placeholder={/university|college/i.test(profileForm.education_level) ? "e.g. Year 1, Year 2, Final year" : "e.g. Grade 6, Form 3"}/></label>
                {/university|college|tertiary/i.test(profileForm.education_level) && <label>Course / programme<input maxLength={160} value={profileForm.course} onChange={event => setProfileForm(current => ({ ...current, course: event.target.value }))} placeholder="e.g. BBA, BSc Nursing, Diploma in IT"/></label>}
                <label>Curriculum<input maxLength={120} value={profileForm.curriculum} onChange={event => setProfileForm(current => ({ ...current, curriculum: event.target.value }))} placeholder="e.g. IGCSE, CAPS, IB…"/></label>
                <label>Academic year<input maxLength={30} value={profileForm.academic_year} onChange={event => setProfileForm(current => ({ ...current, academic_year: event.target.value }))} placeholder="e.g. 2027"/></label>
                <label>Subscription tier<select value={profileForm.subscription_tier} onChange={event => { const tier = event.target.value; const plan = SUBSCRIPTION_PLANS.find(option => option.value === tier); setProfileForm(current => ({ ...current, subscription_tier: tier, subscription_expires_at: plan ? expiryFromNow(plan.days) : "" })); }}><option value="">No subscription / no expiry</option>{SUBSCRIPTION_PLANS.map(plan => <option key={plan.value} value={plan.value}>{plan.label}</option>)}</select></label>
                <label>Access due date<input type="datetime-local" value={profileForm.subscription_expires_at} onChange={event => setProfileForm(current => ({ ...current, subscription_expires_at: event.target.value }))}/><small>Automatically calculated from today when you choose a tier. You can adjust the date manually if needed.</small></label>
              </div>
              <div className="learner-readonly-row"><span>Student ID</span><strong>{editTarget.student_id || "Not assigned"}</strong><small>Student IDs are kept fixed because they are also used to identify the sign-in account.</small></div>
              <div className="learner-modal-actions">
                <button type="button" className="subtle-button" disabled={savingProfile} onClick={() => setEditTarget(null)}>Cancel</button>
                <button type="submit" className="primary-button" disabled={savingProfile}><Save size={14}/>{savingProfile ? "Saving…" : "Save profile"}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {deleteTarget && (
        <div className="learner-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !deleting) { setDeleteTarget(null); setDeleteConfirmation(""); } }}>
          <section className="learner-admin-modal learner-delete-modal" role="dialog" aria-modal="true" aria-labelledby="learner-delete-title">
            <div className="learner-modal-heading">
              <div><span className="eyebrow">PERMANENT ACCOUNT ACTION</span><h2 id="learner-delete-title">Delete learner account</h2><p>{learnerName(deleteTarget)} · {deleteTarget.student_id || "Student ID unavailable"}</p></div>
              <button type="button" className="icon-button" aria-label="Close deletion dialog" disabled={deleting} onClick={() => { setDeleteTarget(null); setDeleteConfirmation(""); }}><X size={18}/></button>
            </div>
            <div className="learner-delete-warning">
              <ShieldAlert size={21}/>
              <div><strong>This cannot be undone.</strong><p>The Auth account and online learner profile will be permanently removed. Cloud planner records, progress, submissions, assignments and the learner's personal cloud files will be deleted or detached according to their database relationships.</p></div>
            </div>
            <p className="learner-delete-note">Offline copies already stored in a learner's browser or device cannot be remotely erased. Those copies may remain until the browser's Studyspace data is cleared.</p>
            <label className="learner-confirm-label">
              Type <code>{deletePhrase}</code> to confirm
              <input autoComplete="off" spellCheck={false} value={deleteConfirmation} onChange={event => setDeleteConfirmation(event.target.value)} placeholder={deletePhrase}/>
            </label>
            <div className="learner-modal-actions">
              <button type="button" className="subtle-button" disabled={deleting} onClick={() => { setDeleteTarget(null); setDeleteConfirmation(""); }}>Cancel</button>
              <button type="button" className="danger-button" disabled={deleting || deleteConfirmation !== deletePhrase} onClick={() => void deleteLearner()}>
                <Trash2 size={14}/>{deleting ? "Deleting account…" : "Permanently delete"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
