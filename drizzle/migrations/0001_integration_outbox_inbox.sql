CREATE TABLE public.integration_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  workspace_id uuid NOT NULL REFERENCES public.engineering_workspaces(id) ON DELETE CASCADE,
  consumer text NOT NULL CHECK (consumer IN ('PLMS','MES','RMS','QMS')),
  event_type text NOT NULL,
  schema_version text NOT NULL DEFAULT '1.0',
  revision integer NOT NULL,
  content_hash text NOT NULL,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  payload jsonb NOT NULL,
  technical_status text NOT NULL DEFAULT 'Pending' CHECK (technical_status IN ('Pending','Sent','Failed','Unavailable')),
  business_status text NOT NULL DEFAULT 'Pending' CHECK (business_status IN ('Pending','Accepted','Rejected')),
  business_reason text,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, consumer),
  UNIQUE (workspace_id, consumer, revision, event_type)
);
CREATE TABLE public.integration_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  source_module text NOT NULL,
  event_type text NOT NULL,
  correlation_id uuid,
  content_hash text,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'Accepted' CHECK (status IN ('Accepted','Quarantined')),
  quarantine_reason text,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, source_module)
);
GRANT SELECT, INSERT ON public.integration_outbox TO authenticated;
GRANT ALL ON public.integration_outbox TO service_role;
GRANT ALL ON public.integration_inbox TO service_role;
ALTER TABLE public.integration_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_inbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read own outbox" ON public.integration_outbox FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owners queue own outbox" ON public.integration_outbox FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid() AND technical_status='Pending' AND business_status='Pending' AND EXISTS (SELECT 1 FROM public.engineering_workspaces w WHERE w.id = workspace_id AND w.owner_id = auth.uid()));