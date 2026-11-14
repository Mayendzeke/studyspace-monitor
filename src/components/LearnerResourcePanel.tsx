import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { BookOpen, CheckCircle2, FileText, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { supabase } from "../lib/supabase";

type Resource = {
  id: string;
  title: string;
  subject_name: string;
  topic: string;
  resource_type: string;
  mime_type: string;
  file_size: number;
  storage_path: string;
  created_at: string;
};

type AssignedResource = Resource & { assigned_at: string };
type StorageStatus = { used_bytes: number; quota_bytes: number; reserved_bytes: number; available_bytes: number; used_percent: number };

const ALLOWED_FILE = /\.(pdf|doc|docx|ppt|pptx|txt|rtf|jpg|jpeg|png|webp|csv|xlsx)$/i;
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const CATEGORIES = ["Notes", "Revision", "Worksheet", "Past paper", "Reference", "Other"];

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "File size unavailable";
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function safeFileName(name: string): string {
  return name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 100) || "resource";
}
function formatStorage(bytes:number):string {
  if(!Number.isFinite(bytes)||bytes<0)return "—";
  return bytes>=1024*1024*1024?(bytes/(1024*1024*1024)).toFixed(2)+" GB":(bytes/(1024*1024)).toFixed(0)+" MB";
}

export default function LearnerResourcePanel({
  learnerId,
  learnerName,
  subjects = [],
}: {
  learnerId: string;
  learnerName: string;
  subjects?: string[];
}) {
  const [library, setLibrary] = useState<Resource[]>([]);
  const [assigned, setAssigned] = useState<AssignedResource[]>([]);
  const [selectedResourceId, setSelectedResourceId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [subject, setSubject] = useState(subjects[0] || "General");
  const [customSubject, setCustomSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Notes");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [removingId, setRemovingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [storageStatus, setStorageStatus] = useState<StorageStatus | null>(null);
  const [storageError, setStorageError] = useState("");
  const [quotaChoice, setQuotaChoice] = useState("1");
  const [quotaSaving, setQuotaSaving] = useState(false);

  const subjectOptions = useMemo(() => [...new Set([...subjects, "General"])].filter(Boolean), [subjects]);
  const assignedIds = useMemo(() => new Set(assigned.map(item => item.id)), [assigned]);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setError("StudySpace is not connected. Learner resources cannot be loaded.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw new Error("Sign in again before managing learner resources.");
      const [libraryResult, assignmentResult, storageResult] = await Promise.all([
        supabase.from("learning_resources")
          .select("id,title,subject_name,topic,resource_type,mime_type,file_size,storage_path,created_at")
          .order("created_at", { ascending: false }).limit(150),
        supabase.from("resource_assignments")
          .select("resource_id,assigned_at")
          .eq("learner_id", learnerId)
          .order("assigned_at", { ascending: false }),
        supabase.rpc("get_studyspace_storage_status", { p_learner_id: learnerId }),
      ]);
      if (libraryResult.error) throw libraryResult.error;
      if (assignmentResult.error) throw assignmentResult.error;
      if (storageResult.error) {
        setStorageStatus(null);
        setStorageError("Storage details require active administrator access with MFA: " + storageResult.error.message);
      } else {
        const status = storageResult.data as StorageStatus;
        setStorageStatus(status);
        setStorageError("");
        setQuotaChoice(String(Math.max(1,Math.round(status.quota_bytes/1073741824))));
      }
      const resources = (libraryResult.data || []) as Resource[];
      const assignedIds = (assignmentResult.data || []).map(row => row.resource_id);
      const assignedResourceResult = assignedIds.length
        ? await supabase.from("learning_resources")
          .select("id,title,subject_name,topic,resource_type,mime_type,file_size,storage_path,created_at")
          .in("id", assignedIds)
        : { data: [] as Resource[], error: null };
      if (assignedResourceResult.error) throw assignedResourceResult.error;
      const allAssignedResources = (assignedResourceResult.data || []) as Resource[];
      const byId = new Map([...resources, ...allAssignedResources].map(resource => [resource.id, resource]));
      setLibrary(resources);
      setAssigned((assignmentResult.data || []).flatMap(row => {
        const resource = byId.get(row.resource_id);
        return resource ? [{ ...resource, assigned_at: row.assigned_at }] : [];
      }));
      setSelectedResourceId(current => resources.some(resource => resource.id === current) ? current : resources[0]?.id || "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Learner resources could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [learnerId]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function changeStorageQuota() {
    if (!supabase || quotaSaving) return;
    const gb = Number(quotaChoice);
    if (!Number.isFinite(gb) || gb < 1 || gb > 20) { setError("Choose a storage allowance from 1 to 20 GB."); return; }
    setQuotaSaving(true); setError(""); setNotice("");
    const { data, error: quotaError } = await supabase.rpc("set_studyspace_learner_storage_quota", {
      p_learner_id: learnerId,
      p_quota_bytes: Math.round(gb * 1024 * 1024 * 1024),
    });
    if (quotaError) setError("Storage allowance could not be changed: " + quotaError.message);
    else {
      setStorageStatus(data as StorageStatus);
      setNotice(learnerName + "'s personal storage allowance is now " + gb + " GB.");
    }
    setQuotaSaving(false);
  }

  async function assignExisting() {
    if (!supabase || !selectedResourceId || assigning) return;
    setAssigning(true);
    setError("");
    setNotice("");
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw new Error("Sign in again before assigning a resource.");
      const { error: assignmentError } = await supabase.from("resource_assignments").upsert({
        resource_id: selectedResourceId,
        learner_id: learnerId,
        assigned_by: authData.user.id,
      }, { onConflict: "resource_id,learner_id" });
      if (assignmentError) throw assignmentError;
      setNotice("Resource assigned. It is now available in " + learnerName + "'s Student Library.");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The resource could not be assigned.");
    } finally {
      setAssigning(false);
    }
  }

  async function uploadAndAssign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !file || uploading) return;
    if (!ALLOWED_FILE.test(file.name)) {
      setError("Choose a PDF, Word document, PowerPoint, text, image, CSV or Excel file.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError(file.name + " exceeds the 25 MB per-file limit.");
      return;
    }
    const chosenSubject = (subject === "__other__" ? customSubject : subject).trim();
    if (!chosenSubject) {
      setError("Choose or enter a subject before uploading.");
      return;
    }

    setUploading(true);
    setError("");
    setNotice("");
    let storagePath = "";
    let resourceSaved = false;
    let resourceId = "";
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw new Error("Sign in again before uploading a learner resource.");
      resourceId = crypto.randomUUID();
      storagePath = authData.user.id + "/resources/" + resourceId + "/" + safeFileName(file.name);
      const mimeType = file.type || "application/octet-stream";
      const { error: storageError } = await supabase.storage.from("studyspace-resources").upload(storagePath, file, {
        contentType: mimeType,
        upsert: false,
      });
      if (storageError) throw new Error("The file could not be uploaded: " + storageError.message);

      const { error: insertError } = await supabase.from("learning_resources").insert({
        id: resourceId,
        created_by: authData.user.id,
        title: file.name,
        description: description.trim(),
        subject_name: chosenSubject,
        topic: topic.trim(),
        resource_type: category,
        education_level: "",
        curriculum: "",
        storage_path: storagePath,
        mime_type: mimeType,
        file_size: file.size,
      });
      if (insertError) {
        await supabase.storage.from("studyspace-resources").remove([storagePath]);
        storagePath = "";
        throw new Error("The file uploaded, but its resource record could not be saved: " + insertError.message);
      }
      resourceSaved = true;

      const { error: assignmentError } = await supabase.from("resource_assignments").upsert({
        resource_id: resourceId,
        learner_id: learnerId,
        assigned_by: authData.user.id,
      }, { onConflict: "resource_id,learner_id" });
      if (assignmentError) {
        setNotice("The file is safely in the Resource Library, but could not be assigned to " + learnerName + ". Use the library selector to retry. " + assignmentError.message);
      } else {
        setNotice(file.name + " was uploaded and added to " + learnerName + "'s Student Library.");
      }
      setFile(null);
      setTopic("");
      setDescription("");
      const input = document.getElementById("learner-resource-file") as HTMLInputElement | null;
      if (input) input.value = "";
      await refresh();
    } catch (reason) {
      if (storagePath && !resourceSaved) await supabase.storage.from("studyspace-resources").remove([storagePath]);
      setError(reason instanceof Error ? reason.message : "The learner resource could not be uploaded.");
    } finally {
      setUploading(false);
    }
  }

  async function removeAssignment(resource: AssignedResource) {
    if (!supabase || removingId) return;
    setRemovingId(resource.id);
    setError("");
    setNotice("");
    try {
      const { error: removeError } = await supabase.from("resource_assignments")
        .delete().eq("resource_id", resource.id).eq("learner_id", learnerId);
      if (removeError) throw removeError;
      setNotice("Removed the resource from this learner's Student Library. The original file remains in the Resource Library.");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The learner resource assignment could not be removed.");
    } finally {
      setRemovingId("");
    }
  }

  return (
    <section className="panel learner-resource-panel">
      <div className="learner-resource-heading">
        <div><span className="eyebrow">STUDENT LIBRARY</span><h3>Learning resources</h3><p>Upload a document or assign an existing resource directly to this learner.</p></div>
        <button type="button" className="subtle-button" onClick={() => void refresh()} disabled={loading || uploading || assigning}><RefreshCw size={14} className={loading ? "spin" : ""}/> Refresh</button>
      </div>

      {notice && <p className="inline-message" role="status">{notice}</p>}
      {error && <p className="inline-message error-message" role="alert">{error}</p>}

      <section className="learner-storage-quota" aria-label="Learner personal cloud storage">
        <div className="learner-storage-quota-heading"><div><span className="eyebrow">PERSONAL STUDENT STORAGE</span><strong>Cloud storage allowance</strong><small>Counts the learner's private files. Your shared Resource Library remains separate.</small></div><span className="learner-storage-used">{storageStatus ? formatStorage(storageStatus.used_bytes) : "—"}<small>USED</small></span></div>
        {storageStatus ? <>
          <div className="learner-storage-track" role="progressbar" aria-label="Learner cloud storage usage" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100,storageStatus.used_percent)}><span style={{width:Math.min(100,Math.max(0,storageStatus.used_percent))+"%"}}/></div>
          <div className="learner-storage-stats"><strong>{formatStorage(storageStatus.used_bytes+storageStatus.reserved_bytes)} of {formatStorage(storageStatus.quota_bytes)}</strong><span>{formatStorage(storageStatus.available_bytes)} available</span></div>
        </> : <p className="learner-resource-empty">{storageError || "Loading personal storage information…"}</p>}
        <div className="learner-storage-controls"><label>Set storage allowance<select value={quotaChoice} onChange={event=>setQuotaChoice(event.target.value)}>{[1,2,5,10,15,20].map(gb=><option key={gb} value={String(gb)}>{gb} GB</option>)}</select></label><button type="button" className="secondary-button" onClick={()=>void changeStorageQuota()} disabled={quotaSaving||!storageStatus||Number(quotaChoice)*1073741824<=storageStatus.quota_bytes}>{quotaSaving?"Saving…":"Increase storage"}</button></div>
        <small className="learner-storage-note">Only an administrator with verified MFA can change this allowance. The new allowance cannot be lower than existing usage.</small>
      </section>

      <div className="learner-resource-assigned">
        <div className="learner-resource-subheading"><strong>Assigned to {learnerName}</strong><span>{assigned.length} resource{assigned.length === 1 ? "" : "s"}</span></div>
        {loading ? <p className="learner-resource-empty">Loading Student Library…</p> : assigned.length ? (
          <div className="learner-resource-list">
            {assigned.map(resource => (
              <article className="learner-resource-row" key={resource.id}>
                <span className="learner-resource-icon"><FileText size={17}/></span>
                <span className="learner-resource-copy"><strong>{resource.title}</strong><small>{resource.subject_name} · {resource.resource_type} · {formatSize(Number(resource.file_size))}</small></span>
                <button type="button" className="icon-button danger-text" aria-label={"Remove " + resource.title + " from learner library"} title="Remove from learner library" disabled={removingId === resource.id} onClick={() => void removeAssignment(resource)}><Trash2 size={15}/></button>
              </article>
            ))}
          </div>
        ) : <p className="learner-resource-empty"><BookOpen size={18}/> No resources have been assigned to this learner yet.</p>}
      </div>

      <div className="learner-resource-assign">
        <label>Assign from Resource Library
          <select value={selectedResourceId} onChange={event => setSelectedResourceId(event.target.value)}>
            <option value="">Choose an existing resource</option>
            {library.map(resource => <option key={resource.id} value={resource.id} disabled={assignedIds.has(resource.id)}>{resource.title} · {resource.subject_name}{assignedIds.has(resource.id) ? " · Already assigned" : ""}</option>)}
          </select>
        </label>
        <button type="button" className="secondary-button" onClick={() => void assignExisting()} disabled={!selectedResourceId || assigning || assignedIds.has(selectedResourceId)}><Plus size={14}/>{assigning ? "Assigning…" : "Assign resource"}</button>
      </div>

      <form className="learner-resource-upload" onSubmit={event => void uploadAndAssign(event)}>
        <div className="learner-resource-subheading"><strong>Upload directly to this learner</strong><span>Private · up to 25 MB per file</span></div>
        <div className="learner-resource-form-grid">
          <label>Subject
            <select value={subject} onChange={event => setSubject(event.target.value)}>
              {subjectOptions.map(option => <option key={option} value={option}>{option}</option>)}
              <option value="__other__">Other / enter subject</option>
            </select>
          </label>
          {subject === "__other__" && <label>Subject name<input value={customSubject} maxLength={120} onChange={event => setCustomSubject(event.target.value)} placeholder="Enter subject"/></label>}
          <label>Resource type
            <select value={category} onChange={event => setCategory(event.target.value)}>
              {CATEGORIES.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label>Topic (optional)<input value={topic} maxLength={120} onChange={event => setTopic(event.target.value)} placeholder="e.g. Algebra"/></label>
          <label className="learner-resource-wide">Description (optional)<input value={description} maxLength={500} onChange={event => setDescription(event.target.value)} placeholder="A short note about this resource"/></label>
          <label className="learner-resource-file learner-resource-wide">Document or PDF
            <input id="learner-resource-file" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.rtf,.jpg,.jpeg,.png,.webp,.csv,.xlsx" onChange={event => setFile(event.target.files?.[0] || null)} required/>
            <small>{file ? file.name + " · " + formatSize(file.size) : "PDF, Word, PowerPoint, text, image, CSV or Excel · 25 MB maximum"}</small>
          </label>
        </div>
        <div className="learner-resource-actions"><button type="submit" className="primary-button" disabled={!file || uploading}><Upload size={15}/>{uploading ? "Uploading and assigning…" : "Upload and add to Student Library"}</button></div>
      </form>
      <p className="learner-resource-footnote"><CheckCircle2 size={13}/> The file is stored in the private StudySpace resource bucket. Only this learner and authorised administrators can access assigned materials.</p>
    </section>
  );
}
