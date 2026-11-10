import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Award, Flame, RefreshCw, Search, ShieldCheck, Sparkles, Users, UserPlus, TrendingUp } from "lucide-react";
import { supabase } from "../lib/supabase";

type LearnerEngagement = {
  learner_id: string;
  display_name: string;
  institution: string;
  grade: string;
  total_xp: number;
  current_streak: number;
  longest_streak: number;
  qualified_referrals: number;
  last_activity_date: string | null;
};

function dateLabel(value: string | null) {
  if (!value) return "No recorded activity";
  const date = new Date(value + "T12:00:00");
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

export default function LearnerEngagementPage() {
  const [rows, setRows] = useState<LearnerEngagement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [learnerId, setLearnerId] = useState("");
  const [points, setPoints] = useState("25");
  const [reason, setReason] = useState("");

  const refresh = useCallback(async () => {
    if (!supabase) { setError("StudySpace is not connected."); setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const { data, error: resultError } = await supabase.rpc("get_studyspace_monitor_gamification_overview");
      if (resultError) throw resultError;
      setRows((data || []) as LearnerEngagement[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Learner engagement could not be loaded.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const visible = useMemo(() => rows.filter(row =>
    [row.display_name, row.institution, row.grade].join(" ").toLowerCase().includes(query.trim().toLowerCase())
  ), [rows, query]);
  const activeToday = rows.filter(row => row.last_activity_date === new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Mbabane" })).length;
  const totalXp = rows.reduce((sum, row) => sum + Number(row.total_xp || 0), 0);
  const referrals = rows.reduce((sum, row) => sum + Number(row.qualified_referrals || 0), 0);
  const streaking = rows.filter(row => Number(row.current_streak || 0) > 0).length;

  const adjust = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase || !learnerId || saving) return;
    const amount = Number(points);
    if (!Number.isInteger(amount) || amount === 0 || amount < -500 || amount > 500) {
      setError("Enter a whole-number adjustment between -500 and 500, excluding zero.");
      return;
    }
    if (reason.trim().length < 5 || reason.trim().length > 200) {
      setError("Enter a reason between 5 and 200 characters for the audit trail.");
      return;
    }
    setSaving(true); setError(""); setNotice("");
    const { error: saveError } = await supabase.rpc("adjust_studyspace_learner_xp", {
      p_learner_id: learnerId, p_points: amount, p_reason: reason.trim(),
    });
    if (saveError) setError(saveError.message);
    else {
      setNotice("XP adjustment recorded in the audit ledger.");
      setLearnerId(""); setReason("");
      await refresh();
    }
    setSaving(false);
  };

  return <div className="monitor-engagement-page">
    <section className="monitor-engagement-header">
      <div><span className="eyebrow"><Sparkles size={14}/> STUDENT EXPERIENCE</span><h2>Learning engagement</h2><p>Monitor learner progress, healthy study consistency, rewards and verified referrals. XP is earned from recorded learning activity, not app-opening time.</p></div>
      <button type="button" className="secondary-button" onClick={() => void refresh()} disabled={loading}><RefreshCw size={15}/>{loading ? "Refreshing…" : "Refresh"}</button>
    </section>
    {error && <p className="inline-message error-message" role="alert">{error}</p>}
    {notice && <p className="inline-message" role="status">{notice}</p>}
    <section className="monitor-engagement-kpis">
      <article><span><Users size={15}/> ACTIVE LEARNERS</span><strong>{rows.length}</strong><small>Accounts in the engagement overview</small></article>
      <article><span><Activity size={15}/> ACTIVE TODAY</span><strong>{activeToday}</strong><small>At least one meaningful activity record</small></article>
      <article><span><Flame size={15}/> ON A STREAK</span><strong>{streaking}</strong><small>Current streak of one or more days</small></article>
      <article><span><Award size={15}/> TOTAL XP AWARDED</span><strong>{totalXp.toLocaleString()}</strong><small>Across listed learners</small></article>
      <article><span><UserPlus size={15}/> QUALIFIED REFERRALS</span><strong>{referrals}</strong><small>Referral profiles completed</small></article>
    </section>
    <section className="monitor-engagement-grid">
      <div className="monitor-engagement-table-panel">
        <div className="monitor-engagement-section-head"><div><h3>Learner leaderboard</h3><p>Sorted by total XP. Streaks and last activity help identify consistency without comparing academic marks.</p></div><TrendingUp size={19}/></div>
        <label className="monitor-engagement-search"><Search size={15}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search learner, school or grade"/></label>
        <div className="monitor-engagement-table-wrap"><table className="monitor-engagement-table"><thead><tr><th>Learner</th><th>XP</th><th>Current / best streak</th><th>Referrals</th><th>Last activity</th></tr></thead><tbody>
          {visible.map((row,index)=><tr key={row.learner_id}><td><strong>{row.display_name}</strong><small>{[row.institution,row.grade].filter(Boolean).join(" · ") || "Learner"}</small></td><td><b>{Number(row.total_xp).toLocaleString()}</b><small>Level {Math.floor(Math.sqrt(Math.max(0,Number(row.total_xp))/100))+1}</small></td><td><b>{row.current_streak} days</b><small>Best {row.longest_streak} days</small></td><td><b>{row.qualified_referrals}</b></td><td>{dateLabel(row.last_activity_date)}</td></tr>)}
          {!visible.length && <tr><td colSpan={5}>{loading ? "Loading learner engagement…" : "No learners match this search."}</td></tr>}
        </tbody></table></div>
      </div>
      <section className="monitor-engagement-adjust-panel">
        <div className="monitor-engagement-section-head"><div><h3>Manual XP adjustment</h3><p>Use only for verified corrections or approved recognition. Every adjustment is recorded with the administrator and reason.</p></div><ShieldCheck size={19}/></div>
        <form onSubmit={adjust}>
          <label>Learner<select required value={learnerId} onChange={e=>setLearnerId(e.target.value)}><option value="">Choose a learner</option>{rows.map(row=><option key={row.learner_id} value={row.learner_id}>{row.display_name} · {row.grade || row.institution}</option>)}</select></label>
          <label>XP change<input type="number" min="-500" max="500" step="1" value={points} onChange={e=>setPoints(e.target.value)}/><small>Positive adds XP; negative removes an incorrect award.</small></label>
          <label>Reason<textarea value={reason} onChange={e=>setReason(e.target.value)} minLength={5} maxLength={200} rows={3} placeholder="Explain the verified reason for this adjustment…"/></label>
          <button type="submit" className="primary-button" disabled={saving || !learnerId || reason.trim().length < 5}>{saving ? "Recording…" : "Record XP adjustment"}</button>
        </form>
      </section>
    </section>
    <p className="monitor-engagement-privacy"><ShieldCheck size={14}/> XP and streaks are separate from official school marks. Learner academic results remain in Academic progress; this screen shows only participation, rewards and referral milestones.</p>
  </div>;
}
