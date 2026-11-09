import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Building2, Download, Edit3, Eye, KeyRound, RefreshCw,
  Save, Search, ShieldAlert, Trash2, UserRound, X,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import TimetableManager from "./TimetableManager";

type Learner = {
  id: string;
  student_id: string | null;
  full_name: string;
  preferred_name: string;
  account_status: "active" | "disabled" | "pending" | "pending_guardian_verification" | string;
  date_of_birth: string | null;
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
  trial_started_at: string | null;
  trial_expires_at: string | null;
  trial_reminder_shown_at: string | null;
};

type ProfileForm = Pick<
  Learner,
  "full_name" | "preferred_name" | "country" | "institution" | "course" |
  "education_level" | "grade" | "curriculum" | "academic_year"
> & { subscription_tier: string; subscription_expires_at: string };

type GuardianRecord = {
  guardian_full_name: string;
  relationship: string;
  relationship_details: string;
  guardian_phone: string;
  consent_given: boolean;
  terms_version: string;
  terms_accepted_at: string;
  verification_source: "in_person" | "guardian_link";
  approval_status: "pending" | "approved" | "rejected";
  verified_at: string | null;
};

type ManageAction = "disable" | "enable" | "reset_password";

const SUBSCRIPTION_PLANS = [
  { value: "Weekly", label: "Weekly — 7 days — E100", days: 7 },
  { value: "2 Weeks", label: "2 Weeks — 14 days — E200", days: 14 },
  { value: "Monthly", label: "Monthly — 28 days — E350", days: 28 },
] as const;

function expiryFromNow(days: number): string {
  const expiry = new Date();
  expiry.setTime(expiry.getTime() + days * 24 * 60 * 60 * 1000);
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
  const publicEnrolmentEnabled = import.meta.env.VITE_STUDYSPACE_PUBLIC_ENROLMENT_ENABLED === "true";
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
  const [verifiedDateOfBirth, setVerifiedDateOfBirth] = useState("");
  const [ageVerificationConfirmed, setAgeVerificationConfirmed] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [paymentTransactionReference, setPaymentTransactionReference] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Learner | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [viewTarget, setViewTarget] = useState<Learner | null>(null);
  const [viewSubjects, setViewSubjects] = useState<string[]>([]);
  const [viewSubjectsLoading, setViewSubjectsLoading] = useState(false);
  const [guardianRecord, setGuardianRecord] = useState<GuardianRecord | null>(null);

  useEffect(() => {
    const modalOpen = Boolean(editTarget || deleteTarget || viewTarget)
    if (!modalOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || savingProfile || deleting) return
      setEditTarget(null)
      setDeleteTarget(null)
      setDeleteConfirmation("")
      setViewTarget(null)
    }
    window.addEventListener("keydown", closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", closeOnEscape)
    }
  }, [editTarget, deleteTarget, viewTarget, savingProfile, deleting])

  async function openView(learner: Learner) {
    if (!supabase) return;
    setViewTarget(learner);
    setViewSubjects([]);
    setGuardianRecord(null);
    setViewSubjectsLoading(true);
    setError("");
    const { data, error: subjectError } = await supabase.from("student_subjects")
      .select("name").eq("learner_id", learner.id).order("name");
    if (subjectError) setError("Student details opened, but subjects could not be loaded: " + subjectError.message);
    else setViewSubjects(Array.from(new Set((data ?? []).map(row => String(row.name ?? "").trim()).filter(Boolean))));
    const { data: guardianData, error: guardianError } = await supabase.functions.invoke("manage-guardian-verification", {
      body: { action: "get_record", learnerId: learner.id },
    });
    if (guardianError || !guardianData?.success) {
      setError(current => current || "Student details opened, but the guardian verification record could not be loaded.");
    } else {
      setGuardianRecord(guardianData.record as GuardianRecord | null);
    }
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
      .select("id,student_id,full_name,preferred_name,account_status,date_of_birth,created_at,updated_at,country,institution,course,education_level,grade,curriculum,academic_year,subscription_tier,subscription_expires_at,trial_started_at,trial_expires_at,trial_reminder_shown_at")
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

  const paymentVerificationRequired = Boolean(editTarget && profileForm.subscription_tier && (
    profileForm.subscription_tier !== (editTarget.subscription_tier ?? "") ||
    new Date(profileForm.subscription_expires_at).getTime() !== new Date(editTarget.subscription_expires_at ?? "").getTime()
  ));

  const counts = useMemo(() => ({
    all: learners.length,
    active: learners.filter(item => item.account_status === "active").length,
    disabled: learners.filter(item => item.account_status === "disabled").length,
    pending: learners.filter(item => item.account_status === "pending").length,
    pendingGuardian: learners.filter(item => item.account_status === "pending_guardian_verification").length,
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
    setPaymentConfirmed(false);
    setPaymentTransactionReference("");
    setVerifiedDateOfBirth("");
    setAgeVerificationConfirmed(false);
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

  async function verifyLearnerAge() {
    if (!supabase || !editTarget || !verifiedDateOfBirth || !ageVerificationConfirmed || savingProfile) return;
    setSavingProfile(true);
    setError("");
    setNotice("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("manage-learner-account", {
        body: { learnerId: editTarget.id, action: "verify_age", dateOfBirth: verifiedDateOfBirth, administratorConfirmed: true },
      });
      if (invokeError) throw new Error(await functionError(invokeError, "The age record could not be saved."));
      if (!data?.success) throw new Error(data?.error || "The age record could not be saved.");
      setEditTarget(null);
      setNotice("Verified date of birth recorded for " + learnerName(editTarget) + ". The learner must sign in again to continue.");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The age record could not be saved.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !editTarget || savingProfile) return;
    setSavingProfile(true);
    setError("");
    setNotice("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("manage-learner-account", {
        body: { learnerId: editTarget.id, action: "update_profile", paymentConfirmed, paymentTransactionReference: paymentTransactionReference.trim(), profile: { ...profileForm, subscription_expires_at: profileForm.subscription_expires_at ? new Date(profileForm.subscription_expires_at).toISOString() : "" } },
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
        <button type="button" className={statusFilter === "pending_guardian_verification" ? "learner-summary-card selected" : "learner-summary-card"} onClick={() => setStatusFilter("pending_guardian_verification")}>
          <span>Guardian verification</span><strong>{counts.pendingGuardian}</strong><small>Awaiting in-person consent</small>
        </button>
      </div>

      <div className="panel learners-toolbar">
        <div><strong>{visible.length} learner{visible.length === 1 ? "" : "s"} shown</strong><small>Profile edits and account actions require administrator MFA.</small></div>
        <button type="button" className="subtle-button" onClick={() => void refresh()} disabled={loading || !!busyId}><RefreshCw size={14}/> Refresh</button>
        <button type="button" className="subtle-button" onClick={exportCsv} disabled={!learners.length}><Download size={14}/> Export CSV</button>
        {publicEnrolmentEnabled ? <button type="button" className="primary-button" onClick={onCreatePin}><KeyRound size={14}/> Create enrolment PIN</button> : <button type="button" className="secondary-button" disabled title="New learner invitations remain paused until registration is complete."><KeyRound size={14}/> New enrolment paused</button>}
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
            <option value="pending_guardian_verification">Guardian verification</option>
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
              <small>{learner.date_of_birth ? "Date of birth " + new Date(learner.date_of_birth + "T00:00:00").toLocaleDateString() : "Date of birth not recorded"} · Joined {learner.created_at ? new Date(learner.created_at).toLocaleDateString() : "Date unavailable"}</small>
              <small>{learner.subscription_tier
                ? "Paid plan: " + learner.subscription_tier + (learner.subscription_expires_at ? " · expires " + new Date(learner.subscription_expires_at).toLocaleString() : " · no expiry")
                : learner.trial_expires_at
                  ? "48-hour trial · " + (new Date(learner.trial_expires_at).getTime() <= Date.now() ? "expired" : "ends " + new Date(learner.trial_expires_at).toLocaleString())
                  : "No active trial or paid plan"}</small>
            </div>
            <span className={"pin-status " + learner.account_status}>{learner.account_status}</span>
            <div className="learner-actions learner-admin-actions">
              <button type="button" className="text-button" disabled={!!busyId} onClick={() => void openView(learner)}><Eye size={13}/> View student</button>
              <button type="button" className="text-button" disabled={!!busyId} onClick={() => openEdit(learner)}><Edit3 size={13}/> Edit details</button>
              <button type="button" className="text-button" disabled={!!busyId || learner.account_status !== "active"} onClick={() => void manage(learner, "reset_password")}><KeyRound size={13}/> Reset password</button>
              {learner.account_status === "active" ? (
                <button type="button" className="text-button danger-text" disabled={!!busyId} onClick={() => void manage(learner, "disable")}>Disable</button>
              ) : learner.account_status === "disabled" ? (
                <button type="button" className="text-button" disabled={!!busyId} onClick={() => void manage(learner, "enable")}>Enable</button>
              ) : (
                <span className="learner-pending-action">{learner.account_status === "pending_guardian_verification" ? "Guardian verification required" : "Registration pending"}</span>
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
            {guardianRecord && <section className="learner-view-subjects guardian-record-view">
              <strong>Guardian verification record</strong>
              <div className="guardian-record-grid">
                <span>Guardian</span><b>{guardianRecord.guardian_full_name}</b>
                <span>Relationship</span><b>{guardianRecord.relationship === "legal_guardian" ? "Legal guardian" : guardianRecord.relationship.charAt(0).toUpperCase() + guardianRecord.relationship.slice(1)}{guardianRecord.relationship_details ? " · " + guardianRecord.relationship_details : ""}</b>
                <span>Contact</span><b>{guardianRecord.guardian_phone}</b>
                <span>Consent</span><b>{guardianRecord.consent_given ? (guardianRecord.verification_source === "guardian_link" ? "Submitted online" : "Given in person") : "Not recorded"}</b>
                <span>Approval status</span><b>{guardianRecord.approval_status === "approved" ? "Approved" : guardianRecord.approval_status === "pending" ? "Awaiting administrator review" : "Rejected"}</b>
                <span>Terms version</span><b>{guardianRecord.terms_version}</b>
                <span>Verified</span><b>{guardianRecord.verified_at ? new Date(guardianRecord.verified_at).toLocaleString() : "Not yet verified"}</b>
              </div>
            </section>}
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
            {!editTarget.date_of_birth && <section className="learner-age-verification">
              <strong>Age verification required</strong>
              <p>This account has no recorded date of birth. Enter the date checked using the approved age-verification method. StudySpace accepts learners aged 9 or older.</p>
              <label>Verified date of birth<input type="date" value={verifiedDateOfBirth} max={new Date().toISOString().slice(0, 10)} onChange={event => setVerifiedDateOfBirth(event.target.value)}/></label>
              <label className="learner-age-confirm"><input type="checkbox" checked={ageVerificationConfirmed} onChange={event => setAgeVerificationConfirmed(event.target.checked)}/> I confirm that I checked this date using the approved age-verification method.</label>
              <button type="button" className="primary-button" disabled={savingProfile || !verifiedDateOfBirth || !ageVerificationConfirmed} onClick={() => void verifyLearnerAge()}><ShieldAlert size={14}/>{savingProfile ? "Recording…" : "Record verified age"}</button>
            </section>}
            {editTarget.date_of_birth && <div className="learner-readonly-row"><span>Date of birth</span><strong>{new Date(editTarget.date_of_birth + "T00:00:00").toLocaleDateString()}</strong><small>Date-of-birth records cannot be changed after verification.</small></div>}
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
              {paymentVerificationRequired && <><label>MTN MoMo transaction reference<input type="text" value={paymentTransactionReference} onChange={event => setPaymentTransactionReference(event.target.value.slice(0, 120))} minLength={4} maxLength={120} autoComplete="off" placeholder="Enter the transaction ID from the MTN MoMo receipt" required/><small>Record the reference shown on the payment receipt. Do not enter the learner’s Student ID here.</small></label><label className="payment-confirmation-check"><input type="checkbox" checked={paymentConfirmed} onChange={event => setPaymentConfirmed(event.target.checked)}/><span><strong>Payment verified</strong><small>I confirm that the amount and recipient match the plan, and that the payment reference above was verified against this learner’s Student ID.</small></span></label></>}
              <div className="learner-modal-actions">
                <button type="button" className="subtle-button" disabled={savingProfile} onClick={() => setEditTarget(null)}>Cancel</button>
                <button type="submit" className="primary-button" disabled={savingProfile || (paymentVerificationRequired && (!paymentConfirmed || paymentTransactionReference.trim().length < 4))}><Save size={14}/>{savingProfile ? "Saving…" : "Save profile"}</button>
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
