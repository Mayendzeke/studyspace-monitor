-- Keep each MTN MoMo transaction tied to one StudySpace subscription activation.
-- A reused transaction reference must not unlock a second learner or plan.
create unique index if not exists audit_events_subscription_payment_reference_uidx
on public.audit_events ((details ->> 'payment_transaction_reference'))
where event_type = 'learner_subscription_activated'
  and nullif(details ->> 'payment_transaction_reference', '') is not null;
