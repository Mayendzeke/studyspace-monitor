import { useEffect, useState } from "react";
import { CheckCircle2, RefreshCw, ShieldCheck, UserRound, Users } from "lucide-react";
import { supabase } from "../lib/supabase";

type GuardianSubmission = {
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
  testimonial_marketing_consent: boolean;
};

type PendingLearner = {
  id: string;
  student_id: string;
  full_name: string;
  preferred_name: string;
  date_of_birth: string;
  created_at: string;
  age: number;
  guardianSubmission: GuardianSubmission | null;
};

const TERMS_VERSION = "2026-11-08-v6";
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
  const [testimonialMarketingConsent, setTestimonialMarketingConsent] = useState(false);
  const [forceInPerson, setForceInPerson] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [generatedLink, setGeneratedLink] = useState<{ learnerId: string; url: string; copied: boolean } | null>(null);

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
    setGuardianFullName(learner.guardianSubmission?.guardian_full_name ?? "");
    setRelationship(learner.guardianSubmission?.relationship ?? "mother");
    setRelationshipDetails(learner.guardianSubmission?.relationship_details ?? "");
    setGuardianPhone(learner.guardianSubmission?.guardian_phone ?? "");
    setGuardianConsent(false);
    setTestimonialMarketingConsent(learner.guardianSubmission?.testimonial_marketing_consent ?? false);
    setForceInPerson(false);
    setError("");
    setNotice("");
  }

  async function createGuardianLink(learner: PendingLearner) {
    if (!supabase || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    const { data, error: invokeError } = await supabase.functions.invoke("manage-guardian-verification", {
      body: { action: "create_invite", learnerId: learner.id },
    });
    if (invokeError || !data?.success || typeof data.guardianUrl !== "string") {
      setError(data?.error || invokeError?.message || "A guardian invitation link could not be generated.");
      setSaving(false);
      return;
    }
    setGeneratedLink({ learnerId: learner.id, url: data.guardianUrl, copied: false });
    setNotice("A new 14-day guardian invitation link has been generated. The previous link, if any, has been replaced.");
    setSaving(false);
  }

  async function copyGuardianLink() {
    if (!generatedLink) return;
    try {
      await navigator.clipboard.writeText(generatedLink.url);
      setGeneratedLink(current => current ? { ...current, copied: true } : current);
      setNotice("Guardian invitation link copied. Send it privately to the parent or legal guardian.");
    } catch {
      setNotice("Copy is unavailable in this browser. Select the link text and copy it manually.");
    }
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
    const onlineSubmission = !forceInPerson
      && selected.guardianSubmission?.verification_source === "guardian_link"
      && selected.guardianSubmission.approval_status === "pending";
    const { data, error: invokeError } = await supabase.functions.invoke("manage-guardian-verification", {
      body: onlineSubmission
        ? { action: "approve_submitted", learnerId: selected.id, administratorConfirmed: guardianConsent }
        : {
            action: "approve",
            learnerId: selected.id,
            guardianFullName: guardianFullName.trim(),
            relationship,
            relationshipDetails: relationship === "other" ? relationshipDetails.trim() : "",
            guardianPhone: guardianPhone.trim(),
            guardianConsent,
            termsVersion: TERMS_VERSION,
            testimonialMarketingConsent,
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
    setTestimonialMarketingConsent(false);
    setForceInPerson(false);
    await refresh();
    setSaving(false);
  }

  return (
    <div className="subpage guardian-verification-page">
      <div className="eyebrow">SAFE STUDENT ENROLMENT</div>
      <h1>Guardian verification</h1>
      <p className="page-subtitle">Use either route: send a one-time invitation link to a parent or legal guardian, or record their consent in person when they are with you. Every learner remains locked until an authorised administrator approves the verification. This queue is protected by administrator MFA.</p>

      {notice && <p className="inline-message" role="status">{notice}</p>}
      {error && <p className="inline-message error-message" role="alert">{error}</p>}

      <div className="panel guardian-verification-panel">
        <div className="guardian-queue-heading">
          <div><strong>Awaiting guardian verification</strong><small>{learners.length} learner account{learners.length === 1 ? "" : "s"} waiting</small></div>
          <button type="button" className="subtle-button" onClick={() => void refresh()} disabled={loading || saving}><RefreshCw size={14}/>{loading ? "Refreshing…" : "Refresh queue"}</button>
        </div>
        {loading ? <div className="classroom-empty">Loading verification queue…</div> : learners.length === 0 ? (
          <div className="classroom-empty"><CheckCircle2 size={24}/><strong>No accounts awaiting guardian verification</strong><span>New under-18 registrations will appear here automatically.</span></div>
        ) : (
          <div className="guardian-queue-list">
            {learners.map(learner => (
              <div className="guardian-queue-row" key={learner.id}>
                <button type="button" className={selected?.id === learner.id ? "guardian-queue-item selected" : "guardian-queue-item"} onClick={() => chooseLearner(learner)}>
                  <span className="guardian-queue-avatar"><UserRound size={18}/></span>
                  <span className="guardian-queue-copy"><strong>{learner.preferred_name || learner.full_name}</strong><small>{learner.student_id} · Age {learner.age} · DOB {new Date(learner.date_of_birth + "T00:00:00").toLocaleDateString()}</small><small>Registered {new Date(learner.created_at).toLocaleString()}</small></span>
                  <span className="guardian-pending-tag">{learner.guardianSubmission?.approval_status === "pending" ? "Consent submitted" : "Awaiting guardian"}</span>
                </button>
                {!learner.guardianSubmission && <button type="button" className="subtle-button guardian-create-link" disabled={saving} onClick={() => void createGuardianLink(learner)}>Create guardian link</button>}
              </div>
            ))}
          </div>
        )}
      </div>

      {generatedLink && (
        <section className="panel guardian-link-panel">
          <strong>Guardian invitation link</strong>
          <p>For {learners.find(item => item.id === generatedLink.learnerId)?.full_name ?? "this learner"}. This link expires after 14 days and can be used once. Generating another link replaces this one.</p>
          <input aria-label="Guardian invitation link" readOnly value={generatedLink.url} onFocus={event => event.currentTarget.select()}/>
          <button type="button" className="primary-button" onClick={() => void copyGuardianLink()}>{generatedLink.copied ? "Copied" : "Copy link"}</button>
        </section>
      )}

      {selected && (
        <section className="panel guardian-consent-panel">
          <div className="guardian-queue-heading">
            <div><span className="eyebrow">{selected.guardianSubmission?.verification_source === "guardian_link" && !forceInPerson ? "ONLINE GUARDIAN SUBMISSION" : "IN-PERSON CONSENT RECORD"}</span><h2>{selected.full_name}</h2><small>{selected.student_id} · Date of birth {new Date(selected.date_of_birth + "T00:00:00").toLocaleDateString()} · Age {selected.age}</small></div>
            <span className="guardian-pending-tag">Dashboard locked</span>
          </div>
          {selected.guardianSubmission?.verification_source === "guardian_link" && !forceInPerson ? (
            <>
              <p className="guardian-consent-instruction">The parent or legal guardian has submitted these details online. The learner is still locked. Review the submission and independently confirm the guardian’s authority and consent before approval. An online link submission is not, by itself, proof of identity or guardian authority.</p>
              <button type="button" className="subtle-button guardian-switch-inperson" onClick={() => { setForceInPerson(true); setGuardianConsent(false); }}>Guardian is here — complete verification in person</button>
            </>
          ) : (
            <p className="guardian-consent-instruction">Use this route only when the parent or legal guardian is physically with you. Read the current StudySpace Terms and Conditions and Privacy Notice with them, explain the data collected and how the learner’s account works, and answer their questions before recording consent. The full terms are available in the <a href="https://mayendzeke.github.io/planner/?studyspace_terms=1" target="_blank" rel="noreferrer">StudySpace Student App</a>. This route will replace any earlier unapproved online submission with the details you confirm in person.</p>
          )}
          <form onSubmit={event => void approve(event)}>
            <div className="guardian-form-grid">
              <label>Guardian’s full name<input required minLength={2} maxLength={120} readOnly={selected.guardianSubmission?.verification_source === "guardian_link" && !forceInPerson} value={guardianFullName} onChange={event => setGuardianFullName(event.target.value)} autoComplete="name" placeholder="Full name of parent or guardian"/></label>
              <label>Relationship to learner<select disabled={selected.guardianSubmission?.verification_source === "guardian_link" && !forceInPerson} value={relationship} onChange={event => setRelationship(event.target.value)}>{RELATIONSHIPS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              {relationship === "other" && <label>Describe relationship<input readOnly={selected.guardianSubmission?.verification_source === "guardian_link" && !forceInPerson} required minLength={2} maxLength={100} value={relationshipDetails} onChange={event => setRelationshipDetails(event.target.value)} placeholder="e.g. aunt, uncle, foster carer"/></label>}
              <label>Guardian contact number<input readOnly={selected.guardianSubmission?.verification_source === "guardian_link" && !forceInPerson} required type="tel" maxLength={30} value={guardianPhone} onChange={event => setGuardianPhone(event.target.value)} placeholder="e.g. +268 7XXX XXXX"/></label>
            </div>
            <div className="guardian-consent-statement">
              <ShieldCheck size={20}/>
              <div><strong>{selected.guardianSubmission?.verification_source === "guardian_link" && !forceInPerson ? "Guardian online consent submission" : "Guardian consent and representative confirmation"}</strong><p>{selected.guardianSubmission?.verification_source === "guardian_link" && !forceInPerson ? "The guardian has submitted consent using the one-time link. You must now review the details and independently confirm the guardian’s authority and consent before activation." : "The guardian confirms that they have authority to act for this learner, have reviewed and understood the current StudySpace Terms and Conditions and Privacy Notice, agree to the processing needed to provide the learner’s account and services, and consent to the learner’s StudySpace account being activated. The representative confirms that this agreement was given in person."}</p></div>
            </div>
            <label className="guardian-consent-check">
              <input type="checkbox" checked={guardianConsent} onChange={event => setGuardianConsent(event.target.checked)}/>
              <span>{selected.guardianSubmission?.verification_source === "guardian_link" && !forceInPerson ? "I have reviewed the online submission and independently confirmed the guardian’s details, authority and consent before approving this learner’s account." : "I confirm the guardian is present and has personally given the consent described above. I am recording the guardian’s decision accurately."}</span>
            </label>
            {selected.guardianSubmission?.verification_source === "guardian_link" && !forceInPerson
              ? <p className="guardian-privacy-note">Marketing permission: {selected.guardianSubmission.testimonial_marketing_consent ? "The guardian opted in to limited use of testimonial words and preferred name." : "The guardian did not give marketing permission."}</p>
              : <label className="testimonial-consent"><input type="checkbox" checked={testimonialMarketingConsent} onChange={event => setTestimonialMarketingConsent(event.target.checked)}/><span><strong>Optional: guardian authorises limited testimonial marketing.</strong><small>Only testimonial words and the learner’s preferred name may appear in promotional images. No student ID, contact details or profile photo. This is voluntary and does not affect account activation.</small></span></label>}
            <div className="guardian-form-actions">
              <button type="button" className="subtle-button" disabled={saving} onClick={() => setSelected(null)}>Cancel</button>
              <button type="submit" className="primary-button" disabled={saving || !guardianConsent || guardianFullName.trim().length < 2 || guardianPhone.trim().length < 7 || (relationship === "other" && relationshipDetails.trim().length < 2)}><Users size={15}/>{saving ? "Recording consent…" : selected.guardianSubmission?.verification_source === "guardian_link" && !forceInPerson ? "Approve guardian consent & activate" : "Record consent & activate account"}</button>
            </div>
            <p className="guardian-privacy-note">The guardian’s contact details and consent record are stored in a restricted verification record. Learners cannot view, change or approve this record. No identity-document upload is required. A submitted link is not identity proof; confirm the guardian’s details and authority before approving.</p>
          </form>
        </section>
      )}
    </div>
  );
}
