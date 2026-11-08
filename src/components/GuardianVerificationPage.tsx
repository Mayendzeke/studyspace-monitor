import { useEffect, useState } from "react";
import { CheckCircle2, RefreshCw, ShieldCheck, UserRound, Users } from "lucide-react";
import { supabase } from "../lib/supabase";

type PendingLearner = {
  id: string;
  student_id: string;
  full_name: string;
  preferred_name: string;
  date_of_birth: string;
  created_at: string;
  age: number;
};

const TERMS_VERSION = "2026-11-07-v3";
const RELATIONSHIPS = [
  { value: "mother", label: "Mother" },
  { value: "father", label: "Father" },
  { value: "legal_guardian", label: "Legal guardian" },
  { value: "grandparent", label: "Grandparent" },
  { value: "other", label: "Other" },
];

export default function GuardianVerificationPage() {
  const [learners, setLearners] = useState<PendingLearner[]>([]);
  const [selected, setSelected] = useState<PendingLearner | null>(null);
  const [guardianFullName, setGuardianFullName] = useState("");
  const [relationship, setRelationship] = useState("mother");
  const [relationshipDetails, setRelationshipDetails] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [guardianConsent, setGuardianConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refresh() {
    if (!supabase) {
      setError("StudySpace is not connected.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const { data, error: invokeError } = await supabase.functions.invoke("manage-guardian-verification", {
      body: { action: "list_pending" },
    });
    if (invokeError || !data?.success) {
      setError(data?.error || invokeError?.message || "The verification queue could not be loaded.");
      setLoading(false);
      return;
    }
    const next = (data.learners ?? []) as PendingLearner[];
    setLearners(next);
    if (selected) {
      const refreshed = next.find(item => item.id === selected.id);
      if (!refreshed) setSelected(null);
      else setSelected(refreshed);
    }
    setLoading(false);
  }

  useEffect(() => { void refresh(); }, []);

  function chooseLearner(learner: PendingLearner) {
    setSelected(learner);
    setGuardianFullName("");
    setRelationship("mother");
    setRelationshipDetails("");
    setGuardianPhone("");
    setGuardianConsent(false);
    setError("");
    setNotice("");
  }

  async function approve(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !selected || saving) return;
    if (!guardianConsent) {
      setError("The guardian must personally review the terms and give consent before activation.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    const { data, error: invokeError } = await supabase.functions.invoke("manage-guardian-verification", {
      body: {
        action: "approve",
        learnerId: selected.id,
        guardianFullName: guardianFullName.trim(),
        relationship,
        relationshipDetails: relationship === "other" ? relationshipDetails.trim() : "",
        guardianPhone: guardianPhone.trim(),
        guardianConsent,
        termsVersion: TERMS_VERSION,
      },
    });
    if (invokeError || !data?.success) {
      setError(data?.error || invokeError?.message || "Guardian verification could not be completed.");
      setSaving(false);
      return;
    }
    setNotice(data.message || "Guardian consent recorded and learner account activated.");
    setSelected(null);
    setGuardianFullName("");
    setGuardianPhone("");
    setRelationshipDetails("");
    setGuardianConsent(false);
    await refresh();
    setSaving(false);
  }

  return (
    <div className="subpage guardian-verification-page">
      <div className="eyebrow">SAFE STUDENT ENROLMENT</div>
      <h1>Guardian verification</h1>
      <p className="page-subtitle">Meet the parent or legal guardian in person, record their details and explicit consent, then activate the learner’s account. This queue is available only to administrators with verified MFA.</p>

      {notice && <p className="inline-message" role="status">{notice}</p>}
      {error && <p className="inline-message error-message" role="alert">{error}</p>}

      <div className="panel guardian-verification-panel">
        <div className="guardian-queue-heading">
          <div><strong>Awaiting in-person verification</strong><small>{learners.length} learner account{learners.length === 1 ? "" : "s"} waiting</small></div>
          <button type="button" className="subtle-button" onClick={() => void refresh()} disabled={loading || saving}><RefreshCw size={14}/>{loading ? "Refreshing…" : "Refresh queue"}</button>
        </div>
        {loading ? <div className="classroom-empty">Loading verification queue…</div> : learners.length === 0 ? (
          <div className="classroom-empty"><CheckCircle2 size={24}/><strong>No accounts awaiting guardian verification</strong><span>New under-18 registrations will appear here automatically.</span></div>
        ) : (
          <div className="guardian-queue-list">
            {learners.map(learner => (
              <button type="button" key={learner.id} className={selected?.id === learner.id ? "guardian-queue-item selected" : "guardian-queue-item"} onClick={() => chooseLearner(learner)}>
                <span className="guardian-queue-avatar"><UserRound size={18}/></span>
                <span className="guardian-queue-copy"><strong>{learner.preferred_name || learner.full_name}</strong><small>{learner.student_id} · Age {learner.age} · DOB {new Date(learner.date_of_birth + "T00:00:00").toLocaleDateString()}</small><small>Registered {new Date(learner.created_at).toLocaleString()}</small></span>
                <span className="guardian-pending-tag">Awaiting guardian</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <section className="panel guardian-consent-panel">
          <div className="guardian-queue-heading">
            <div><span className="eyebrow">IN-PERSON CONSENT RECORD</span><h2>{selected.full_name}</h2><small>{selected.student_id} · Date of birth {new Date(selected.date_of_birth + "T00:00:00").toLocaleDateString()} · Age {selected.age}</small></div>
            <span className="guardian-pending-tag">Dashboard locked</span>
          </div>
          <p className="guardian-consent-instruction">Complete this form only while the parent or legal guardian is physically present. Read the current StudySpace Terms and Conditions and Privacy Notice with them, explain the data collected and how the learner’s account works, and answer their questions before recording consent. The full read-only terms are available in the <a href="https://mayendzeke.github.io/planner/" target="_blank" rel="noreferrer">StudySpace Student App</a>; on its First-time enrolment screen, entering the learner’s date of birth displays the terms without allowing a minor to accept them online.</p>
          <form onSubmit={event => void approve(event)}>
            <div className="guardian-form-grid">
              <label>Guardian’s full name<input required minLength={2} maxLength={120} value={guardianFullName} onChange={event => setGuardianFullName(event.target.value)} autoComplete="name" placeholder="Full name of parent or guardian"/></label>
              <label>Relationship to learner<select value={relationship} onChange={event => setRelationship(event.target.value)}>{RELATIONSHIPS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              {relationship === "other" && <label>Describe relationship<input required minLength={2} maxLength={100} value={relationshipDetails} onChange={event => setRelationshipDetails(event.target.value)} placeholder="e.g. aunt, uncle, foster carer"/></label>}
              <label>Guardian contact number<input required type="tel" maxLength={30} value={guardianPhone} onChange={event => setGuardianPhone(event.target.value)} placeholder="e.g. +268 7XXX XXXX"/></label>
            </div>
            <div className="guardian-consent-statement">
              <ShieldCheck size={20}/>
              <div><strong>Guardian consent and representative confirmation</strong><p>The guardian confirms that they have authority to act for this learner, have reviewed and understood the current StudySpace Terms and Conditions and Privacy Notice, agree to the processing needed to provide the learner’s account and services, and consent to the learner’s StudySpace account being activated. The representative confirms that this agreement was given in person.</p></div>
            </div>
            <label className="guardian-consent-check">
              <input type="checkbox" checked={guardianConsent} onChange={event => setGuardianConsent(event.target.checked)}/>
              <span>I confirm the guardian is present and has personally given the consent described above. I am recording the guardian’s decision accurately.</span>
            </label>
            <div className="guardian-form-actions">
              <button type="button" className="subtle-button" disabled={saving} onClick={() => setSelected(null)}>Cancel</button>
              <button type="submit" className="primary-button" disabled={saving || !guardianConsent || guardianFullName.trim().length < 2 || guardianPhone.trim().length < 7 || (relationship === "other" && relationshipDetails.trim().length < 2)}><Users size={15}/>{saving ? "Recording consent…" : "Record consent & activate account"}</button>
            </div>
            <p className="guardian-privacy-note">The guardian’s contact details and consent record are stored in a restricted verification record. Learners cannot view, change or approve this record. No identity-document upload is required by this workflow.</p>
          </form>
        </section>
      )}
    </div>
  );
}
