CREATE TABLE ems.releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site text NOT NULL,
  workspace text NOT NULL DEFAULT 'studio' CHECK (workspace = 'studio'),
  workspace_revision integer NOT NULL,
  application_id text NOT NULL,
  baseline_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','approved','published')),
  author uuid NOT NULL REFERENCES ems.actors,
  reviewer uuid REFERENCES ems.actors,
  approval_evidence uuid UNIQUE,
  artifact jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  CHECK (reviewer IS NULL OR reviewer <> author),
  CHECK ((status = 'submitted') = (approval_evidence IS NULL)),
  CHECK ((status = 'published') = (artifact IS NOT NULL AND published_at IS NOT NULL)),
  UNIQUE (site, workspace_revision, application_id),
  UNIQUE (site, id),
  FOREIGN KEY (site, workspace, workspace_revision) REFERENCES ems.revisions
);

CREATE TABLE ems.outbox (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer text NOT NULL CHECK (consumer IN ('PLMS','MES','RMS','QMS','APS','OMS','WMS','CMMS')),
  site text NOT NULL,
  release_id uuid NOT NULL,
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  send_state text NOT NULL DEFAULT 'pending' CHECK (send_state IN ('pending','sent','dead')),
  business_state text NOT NULL DEFAULT 'pending' CHECK (business_state IN ('pending','accepted','rejected')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_id uuid,
  lease_until timestamptz,
  last_error text,
  UNIQUE (consumer, release_id),
  FOREIGN KEY (site, release_id) REFERENCES ems.releases (site, id)
);
CREATE INDEX ems_outbox_pending_idx ON ems.outbox (next_attempt_at, created_at) WHERE send_state = 'pending';

CREATE TABLE ems.inbox (
  consumer text NOT NULL,
  acknowledgement_id uuid NOT NULL,
  event_id uuid NOT NULL REFERENCES ems.outbox,
  body_hash text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('accepted','rejected')),
  reason text,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer, acknowledgement_id),
  UNIQUE (event_id)
);
CREATE TABLE ems.worker_heartbeat (
  service text PRIMARY KEY,
  checked_at timestamptz NOT NULL,
  state text NOT NULL CHECK (state IN ('idle','working','error'))
);

CREATE FUNCTION ems.guard_published_release() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF OLD.status = 'published' OR
     ROW(NEW.site, NEW.workspace, NEW.workspace_revision, NEW.application_id, NEW.baseline_refs, NEW.content_hash, NEW.author)
       IS DISTINCT FROM ROW(OLD.site, OLD.workspace, OLD.workspace_revision, OLD.application_id, OLD.baseline_refs, OLD.content_hash, OLD.author)
  THEN
    RAISE EXCEPTION 'Release content is immutable';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER ems_release_immutable BEFORE UPDATE ON ems.releases
FOR EACH ROW EXECUTE FUNCTION ems.guard_published_release();
