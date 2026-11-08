import { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageSquareHeart, RefreshCw, UserRound, CheckCircle2, Clock3, Building2, GraduationCap, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Testimonial = {
  id: string;
  learner_id: string;
  message: string;
  created_at: string;
  status: 'new' | 'reviewing' | 'resolved' | string;
  contact_email: string | null;
  testimonial_private_consent: boolean;
  testimonial_marketing_consent: boolean;
};
type LearnerProfile = {
  id: string;
  full_name: string;
  preferred_name: string | null;
  student_id: string | null;
  education_level: string | null;
  grade: string | null;
  institution: string | null;
  course: string | null;
  avatar_path: string | null;
  date_of_birth: string | null;
};

const initials = (name: string) => name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'S';
type GuardianMarketingConsent = { testimonial_marketing_consent: boolean; approval_status: string };
function learnerAge(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) return null;
  const today = new Date();
  const dob = new Date(dateOfBirth + "T00:00:00");
  if (Number.isNaN(dob.getTime()) || dob > today) return null;
  let age = today.getFullYear() - dob.getFullYear();
  if (today.getMonth() < dob.getMonth() || (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())) age--;
  return age;
}
function wrapCanvasText(ctx: CanvasRenderingContext2D, value: string, maxWidth: number): string[] {
  const lines: string[] = [];
  const paragraphs = value.replace(/\r/g, "").split("\n");
  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(""); continue; }
    let line = "";
    for (const word of words) {
      const next = line ? line + " " + word : word;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
  }
  return lines.length ? lines : [" "];
}
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}


export default function TestimonialsInbox() {
  const [items, setItems] = useState<Testimonial[]>([]);
  const [profiles, setProfiles] = useState<Record<string, LearnerProfile>>({});
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [guardianMarketingConsents, setGuardianMarketingConsents] = useState<Record<string, GuardianMarketingConsent>>({});
  const [exportingId, setExportingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!supabase) { setError('StudySpace is not connected.'); setLoading(false); return; }
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const { data, error: feedbackError } = await supabase
        .from('student_feedback')
        .select('id,learner_id,message,created_at,status,contact_email,testimonial_private_consent,testimonial_marketing_consent')
        .eq('category', 'Testimonial')
        .eq('testimonial_private_consent', true)
        .order('created_at', { ascending: false })
        .limit(120);
      if (feedbackError) throw feedbackError;
      const rows = (data || []) as Testimonial[];
      setItems(rows);
      const ids = [...new Set(rows.map(row => row.learner_id))];
      if (ids.length) {
        const { data: profileRows, error: profileError } = await supabase
          .from('profiles')
          .select('id,full_name,preferred_name,student_id,education_level,grade,institution,course,avatar_path,date_of_birth')
          .in('id', ids);
        if (profileError) throw profileError;
        const byId: Record<string, LearnerProfile> = {};
        for (const profile of (profileRows || []) as LearnerProfile[]) byId[profile.id] = profile;
        setProfiles(byId);
        const { data: guardianData, error: guardianError } = await supabase.functions.invoke('manage-guardian-verification', {
          body: { action: 'get_testimonial_marketing_consents', learnerIds: ids },
        });
        if (!guardianError && guardianData?.success) {
          const guardianMap: Record<string, GuardianMarketingConsent> = {};
          for (const consent of guardianData.consents ?? []) guardianMap[consent.learner_id] = consent;
          setGuardianMarketingConsents(guardianMap);
        } else {
          setGuardianMarketingConsents({});
          setError(guardianData?.error || guardianError?.message || 'Guardian marketing permissions could not be verified. PNG export for under-18 learners remains disabled until they can be checked.');
        }
        const signed = await Promise.all(Object.values(byId).filter(profile => profile.avatar_path).map(async profile => {
          const { data: signedData } = await supabase!.storage.from('studyspace-avatars').createSignedUrl(profile.avatar_path!, 3600);
          return [profile.id, signedData?.signedUrl || ''] as const;
        }));
        setAvatars(Object.fromEntries(signed.filter(([, url]) => !!url)));
      } else {
        setProfiles({});
        setAvatars({});
        setGuardianMarketingConsents({});
      }
      setUpdatedAt(new Date().toISOString());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The private testimonials inbox could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel("studyspace-private-testimonials-inbox")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "student_feedback", filter: "category=eq.Testimonial" },
        payload => {
          const row = payload.new as Partial<Testimonial>;
          if (row.testimonial_private_consent === true) void refresh();
        }
      )
      .subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [refresh]);

  async function updateStatus(id: string, status: Testimonial['status']) {
    if (!supabase || busyId) return;
    setBusyId(id);
    setError('');
    setNotice('');
    try {
      const { error: updateError } = await supabase.from('student_feedback').update({ status }).eq('id', id);
      if (updateError) throw updateError;
      setItems(current => current.map(item => item.id === id ? { ...item, status } : item));
      setNotice('Testimonial status updated.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The testimonial status could not be updated.');
    } finally {
      setBusyId('');
    }
  }


  function canExportMarketingImage(item: Testimonial): boolean {
    const learner = profiles[item.learner_id];
    if (!learner || !item.testimonial_marketing_consent) return false;
    const age = learnerAge(learner.date_of_birth);
    if (age === null) return false;
    if (age >= 18) return true;
    const guardian = guardianMarketingConsents[item.learner_id];
    return guardian?.approval_status === 'approved' && guardian.testimonial_marketing_consent === true;
  }

  async function downloadTestimonialImage(item: Testimonial) {
    if (!canExportMarketingImage(item)) {
      setError('This testimonial is private only. Separate learner and, where applicable, approved guardian marketing permission is required.');
      return;
    }
    setExportingId(item.id);
    setError('');
    setNotice('');
    try {
      const learner = profiles[item.learner_id];
      const displayName = learner?.preferred_name?.trim() || 'A StudySpace learner';
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      const measure = canvas.getContext('2d');
      if (!measure) throw new Error('This browser could not create the testimonial image.');
      measure.font = '42px Georgia, serif';
      const lines = wrapCanvasText(measure, item.message, 820);
      const lineHeight = 58;
      canvas.height = Math.max(1350, 570 + lines.length * lineHeight + 245);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('This browser could not render the testimonial image.');

      const background = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      background.addColorStop(0, '#101e3a');
      background.addColorStop(0.55, '#193d56');
      background.addColorStop(1, '#0b172b');
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = 'rgba(104, 226, 196, 0.13)';
      ctx.beginPath(); ctx.arc(940, 120, 230, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(125, 164, 255, 0.10)';
      ctx.beginPath(); ctx.arc(60, canvas.height - 80, 260, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = '#8be4cf';
      ctx.font = '800 27px Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('STUDYSPACE', 82, 92);
      ctx.fillStyle = '#c8d7eb';
      ctx.font = '700 15px Arial, sans-serif';
      ctx.fillText('LEARNER STORY', 82, 134);

      const cardX = 58, cardY = 185, cardW = 964, cardH = canvas.height - 300;
      roundRect(ctx, cardX, cardY, cardW, cardH, 34);
      ctx.fillStyle = '#f8fbff';
      ctx.fill();

      ctx.fillStyle = '#76cdb9';
      roundRect(ctx, cardX + 56, cardY + 54, 66, 7, 4);
      ctx.fill();

      ctx.fillStyle = '#29415b';
      ctx.font = '700 18px Arial, sans-serif';
      ctx.fillText('REAL LEARNING. REAL PROGRESS.', cardX + 58, cardY + 112);

      ctx.fillStyle = '#3b7290';
      ctx.font = '100px Georgia, serif';
      ctx.fillText('“', cardX + 45, cardY + 230);

      ctx.fillStyle = '#1c2a3c';
      ctx.font = '42px Georgia, serif';
      let y = cardY + 245;
      for (const line of lines) {
        if (line) ctx.fillText(line, cardX + 70, y, 825);
        y += lineHeight;
      }

      const attributionY = Math.max(y + 45, cardY + cardH - 135);
      ctx.fillStyle = '#5d718b';
      ctx.fillRect(cardX + 70, attributionY - 42, 824, 2);
      ctx.fillStyle = '#193653';
      ctx.font = '700 25px Arial, sans-serif';
      ctx.fillText('— ' + displayName, cardX + 70, attributionY + 12);
      ctx.fillStyle = '#64748b';
      ctx.font = '16px Arial, sans-serif';
      ctx.fillText('StudySpace learner', cardX + 70, attributionY + 45);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#dbe9f8';
      ctx.font = '600 16px Arial, sans-serif';
      ctx.fillText('LEARN • PRACTISE • GROW', 540, canvas.height - 62);

      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('The testimonial image could not be saved.');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'StudySpace-testimonial-' + new Date(item.created_at).toISOString().slice(0, 10) + '.png';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      setNotice('Testimonial PNG generated. Review the image before sharing it in marketing.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The testimonial image could not be generated.');
    } finally {
      setExportingId('');
    }
  }

  const newCount = useMemo(() => items.filter(item => item.status === 'new').length, [items]);

  return <div className="subpage testimonials-page">
    <div className="welcome-row">
      <div>
        <div className="eyebrow"><MessageSquareHeart size={14}/> PRIVATE STUDENT FEEDBACK</div>
        <h1>Student testimonials.</h1>
        <p className="page-subtitle">A private inbox of testimonials voluntarily submitted by learners. Student details and profile images are visible only inside the secured Monitor workspace. Nothing is published publicly from here.</p>
      </div>
      <button type="button" className="primary-button" onClick={() => void refresh()} disabled={loading}><RefreshCw size={15}/>{loading ? 'Refreshing…' : 'Refresh inbox'}</button>
    </div>
    <div className="testimonial-summary">
      <div><span>PRIVATE TESTIMONIALS</span><strong>{items.length}</strong></div>
      <div><span>NEEDS REVIEW</span><strong>{newCount}</strong></div>
      <small>{updatedAt ? 'Last refreshed ' + new Date(updatedAt).toLocaleString() : 'Inbox has not been refreshed yet.'}</small>
    </div>
    {error && <p className="inline-message error-message" role="alert">{error}</p>}
    {notice && <p className="inline-message" role="status">{notice}</p>}
    {loading ? <div className="panel classroom-empty">Loading private testimonials…</div>
      : !items.length ? <div className="panel classroom-empty"><MessageSquareHeart size={25}/><strong>No testimonials yet</strong><span>When a learner chooses Testimonial in the Student app and consents to private review, their message will appear here with their current profile details.</span></div>
      : <section className="testimonial-card-grid" aria-label="Student testimonials">
        {items.map(item => {
          const learner = profiles[item.learner_id];
          const displayName = learner?.preferred_name || learner?.full_name || 'StudySpace learner';
          return <article className="testimonial-3d-card" key={item.id}>
            <header className="testimonial-card-head">
              <div className="testimonial-avatar">
                {avatars[item.learner_id] ? <img src={avatars[item.learner_id]} alt={displayName + ' profile'} /> : <span>{initials(displayName)}</span>}
              </div>
              <div className="testimonial-student">
                <strong>{displayName}</strong>
                <small>{learner?.full_name || 'Learner profile unavailable'}</small>
              </div>
              <MessageSquareHeart size={20}/>
            </header>
            <blockquote>{item.message}</blockquote>
            <div className="testimonial-student-details">
              <span><GraduationCap size={14}/>{[learner?.education_level, learner?.grade].filter(Boolean).join(' · ') || 'Study level not recorded'}</span>
              <span><Building2 size={14}/>{learner?.institution || learner?.course || 'Institution not recorded'}</span>
              {learner?.student_id && <span><UserRound size={14}/>Student ID · {learner.student_id}</span>}
              {item.contact_email && <span>Reply email · {item.contact_email}</span>}
              <span><Clock3 size={14}/>{new Date(item.created_at).toLocaleString()}</span>
            </div>
            <footer className="testimonial-card-footer">
              <label>Status<select value={item.status} disabled={busyId === item.id} onChange={event => void updateStatus(item.id, event.target.value)}><option value="new">New</option><option value="reviewing">Reviewing</option><option value="resolved">Reviewed</option></select></label>
              <span className="testimonial-private-tag"><CheckCircle2 size={13}/> Private inbox</span>
              <button type="button" className="secondary-button" disabled={!canExportMarketingImage(item) || exportingId === item.id} title={canExportMarketingImage(item) ? 'Download a consented marketing PNG without student IDs, contact details or profile photos' : 'Separate marketing permission is missing or guardian approval has not been verified'} onClick={() => void downloadTestimonialImage(item)}><Download size={14}/>{exportingId === item.id ? 'Preparing…' : 'Download PNG'}</button>
            </footer>
          </article>;
        })}
      </section>}
    <p className="subtle-note">Testimonials are not marketing permissions. Ask for separate, informed consent before using any learner's name, image or words outside StudySpace. For learners under 18, obtain the appropriate guardian authorisation as well.</p>
  </div>;
}
