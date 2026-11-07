import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, CreditCard, RefreshCw, Search, Users } from "lucide-react";
import { supabase } from "../lib/supabase";

type SubscriptionLearner = {
  id: string;
  student_id: string | null;
  full_name: string;
  preferred_name: string | null;
  account_status: string;
  subscription_tier: string | null;
  subscription_expires_at: string | null;
};

type Filter = "all" | "active" | "expiring" | "expired" | "no-expiry";

function tierLabel(value: string | null): string {
  if (!value) return "Not assigned";
  const known: Record<string, string> = {
    free_trial: "Free Trial", trial: "Free Trial", weekly: "Weekly", two_weeks: "2 Weeks",
    fortnightly: "2 Weeks", monthly: "Monthly", month: "Monthly",
  };
  return known[value.trim().toLowerCase()] || value;
}

function learnerLabel(item: SubscriptionLearner): string {
  return item.preferred_name?.trim() || item.full_name?.trim() || "Learner";
}

function remainingDays(value: string, now: number): number {
  return Math.ceil((new Date(value).getTime() - now) / 86400000);
}

function dateLabel(value: string | null): string {
  if (!value) return "No expiry set";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Invalid expiry date" : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function SubscriptionsPage() {
  const [learners, setLearners] = useState<SubscriptionLearner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  async function refresh() {
    if (!supabase) {
      setError("Studyspace is not connected. Subscription records cannot be loaded.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const { data, error: queryError } = await supabase.from("profiles")
      .select("id,student_id,full_name,preferred_name,account_status,subscription_tier,subscription_expires_at")
      .eq("role", "learner")
      .order("subscription_expires_at", { ascending: true, nullsFirst: false });
    if (queryError) {
      setError("Subscription records could not be loaded. Check administrator access and the subscription migration.");
    } else {
      setLearners((data ?? []) as SubscriptionLearner[]);
      setRefreshedAt(new Date());
    }
    setLoading(false);
  }

  useEffect(() => { void refresh(); }, []);

  const now = Date.now();
  const classified = useMemo(() => learners.map(item => {
    const days = item.subscription_expires_at ? remainingDays(item.subscription_expires_at, now) : null;
    const expired = days !== null && days <= 0;
    const expiring = days !== null && days > 0 && days <= 14;
    const accessDisabled = item.account_status !== "active";
    return { ...item, days, expired, expiring, accessDisabled };
  }), [learners, now]);

  const counts = useMemo(() => ({
    total: learners.length,
    active: classified.filter(x => !x.accessDisabled && !x.expired).length,
    expiring: classified.filter(x => !x.accessDisabled && x.expiring).length,
    expired: classified.filter(x => x.expired).length,
    noExpiry: classified.filter(x => !x.subscription_expires_at).length,
  }), [learners, classified]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return classified.filter(item => {
      const matches = filter === "all"
        || (filter === "active" && !item.accessDisabled && !item.expired)
        || (filter === "expiring" && !item.accessDisabled && item.expiring)
        || (filter === "expired" && item.expired)
        || (filter === "no-expiry" && !item.subscription_expires_at);
      const haystack = [item.student_id, item.full_name, item.preferred_name, item.subscription_tier].filter(Boolean).join(" ").toLowerCase();
      return matches && (!needle || haystack.includes(needle));
    }).sort((a,b) => {
      if (!a.subscription_expires_at) return 1;
      if (!b.subscription_expires_at) return -1;
      return new Date(a.subscription_expires_at).getTime() - new Date(b.subscription_expires_at).getTime();
    });
  }, [classified, filter, search]);

  return <div className="subpage subscriptions-page">
    <div className="eyebrow">ACCOUNT &amp; BILLING OVERSIGHT</div>
    <div className="subscription-heading-row">
      <div><h1>Subscriptions</h1><p className="page-subtitle">Monitor each learner's current access plan, expiry date and accounts that need renewal.</p></div>
      <button type="button" className="secondary-button subscription-refresh" onClick={() => void refresh()} disabled={loading}><RefreshCw size={15} className={loading ? "spin" : ""}/> Refresh</button>
    </div>

    <div className="subscription-metrics">
      <button type="button" className={filter === "all" ? "subscription-metric selected" : "subscription-metric"} onClick={() => setFilter("all")}><span><Users size={17}/> Total learners</span><strong>{counts.total}</strong><small>All learner accounts</small></button>
      <button type="button" className={filter === "active" ? "subscription-metric selected" : "subscription-metric"} onClick={() => setFilter("active")}><span><CheckCircle2 size={17}/> Current access</span><strong>{counts.active}</strong><small>Active and not expired</small></button>
      <button type="button" className={filter === "expiring" ? "subscription-metric selected" : "subscription-metric"} onClick={() => setFilter("expiring")}><span><CalendarClock size={17}/> Due within 14 days</span><strong>{counts.expiring}</strong><small>Renewal attention</small></button>
      <button type="button" className={filter === "expired" ? "subscription-metric selected" : "subscription-metric"} onClick={() => setFilter("expired")}><span><AlertTriangle size={17}/> Expired</span><strong>{counts.expired}</strong><small>Past expiry date</small></button>
      <button type="button" className={filter === "no-expiry" ? "subscription-metric selected" : "subscription-metric"} onClick={() => setFilter("no-expiry")}><span><Clock3 size={17}/> No expiry</span><strong>{counts.noExpiry}</strong><small>Legacy or unconfigured</small></button>
    </div>

    <section className="subscription-table-panel">
      <div className="subscription-table-header"><div><h2>Subscription register</h2><p>Sorted by nearest expiry date. Expiring soon means 14 days or less.</p></div><label className="subscription-search"><Search size={16}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search learner or Student ID"/></label></div>
      {error && <div className="subscription-error" role="alert">{error}</div>}
      {loading ? <div className="subscription-empty">Loading subscription records…</div> : visible.length === 0 ? <div className="subscription-empty">No learners match this view.</div> : <div className="subscription-table-scroll"><table className="subscription-table">
        <thead><tr><th>Learner</th><th>Student ID</th><th>Current tier</th><th>Access status</th><th>Expires</th><th>Time remaining</th></tr></thead>
        <tbody>{visible.map(item => {
          const status = item.accessDisabled ? "Account disabled" : item.expired ? "Expired" : item.expiring ? "Expiring soon" : item.subscription_expires_at ? "Active" : "No expiry";
          const statusClass = item.accessDisabled || item.expired ? "danger" : item.expiring ? "warning" : "good";
          const remaining = item.days === null ? "Not limited" : item.days <= 0 ? "Expired" : item.days === 1 ? "1 day" : item.days + " days";
          return <tr key={item.id}>
            <td><strong>{learnerLabel(item)}</strong><small>{item.account_status}</small></td>
            <td>{item.student_id || "—"}</td>
            <td><span className="subscription-tier"><CreditCard size={14}/>{tierLabel(item.subscription_tier)}</span></td>
            <td><span className={"subscription-status " + statusClass}>{status}</span></td>
            <td>{dateLabel(item.subscription_expires_at)}</td>
            <td>{remaining}</td>
          </tr>;
        })}</tbody>
      </table></div>}
      <div className="subscription-table-footer"><span>{visible.length} of {learners.length} learner accounts</span>{refreshedAt && <span>Updated {refreshedAt.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</span>}</div>
    </section>
    <p className="subscription-admin-note">This page is a monitoring view. To change a learner's tier or extend access after payment, open Learners and edit that learner's subscription details.</p>
  </div>;
}
