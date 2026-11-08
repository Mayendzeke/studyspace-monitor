import { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageSquareHeart, RefreshCw, UserRound, CheckCircle2, Clock3, Building2, GraduationCap } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Testimonial = {
  id: string;
  learner_id: string;
  message: string;
  created_at: string;
  status: 'new' | 'reviewing' | 'resolved' | string;
  contact_email: string | null;
  testimonial_private_consent: boolean;
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
};

const initials = (name: string) => name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'S';

export default function TestimonialsInbox() {
  const [items, setItems] = useState<Testimonial[]>([]);
  const [profiles, setProfiles] = useState<Record<string, LearnerProfile>>({});
  const [avatars, setAvatars] = useState<Record<string, string>>({});
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
        .select('id,learner_id,message,created_at,status,contact_email,testimonial_private_consent')
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
          .select('id,full_name,preferred_name,student_id,education_level,grade,institution,course,avatar_path')
          .in('id', ids);
        if (profileError) throw profileError;
        const byId: Record<string, LearnerProfile> = {};
        for (const profile of (profileRows || []) as LearnerProfile[]) byId[profile.id] = profile;
        setProfiles(byId);
        const signed = await Promise.all(Object.values(byId).filter(profile => profile.avatar_path).map(async profile => {
          const { data: signedData } = await supabase!.storage.from('studyspace-avatars').createSignedUrl(profile.avatar_path!, 3600);
          return [profile.id, signedData?.signedUrl || ''] as const;
        }));
        setAvatars(Object.fromEntries(signed.filter(([, url]) => !!url)));
      } else {
        setProfiles({});
        setAvatars({});
      }
      setUpdatedAt(new Date().toISOString());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The private testimonials inbox could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

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
              <span className="testimonial-private-tag"><CheckCircle2 size={13}/> Private only</span>
            </footer>
          </article>;
        })}
      </section>}
    <p className="subtle-note">Testimonials are not marketing permissions. Ask for separate, informed consent before using any learner's name, image or words outside StudySpace. For learners under 18, obtain the appropriate guardian authorisation as well.</p>
  </div>;
}
