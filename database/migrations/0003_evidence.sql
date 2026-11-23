CREATE TABLE ems.deployment_attempts (
  site text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  release_id uuid NOT NULL,
  node text NOT NULL,
  terminal text NOT NULL,
  desired jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES ems.actors,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site, id),
  FOREIGN KEY (site, release_id) REFERENCES ems.releases (site, id)
);
CREATE TABLE ems.deployment_readbacks (
  site text NOT NULL,
  attempt_id uuid NOT NULL,
  observed_at timestamptz NOT NULL,
  content_hash text NOT NULL,
  evidence jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site, attempt_id, observed_at),
  FOREIGN KEY (site, attempt_id) REFERENCES ems.deployment_attempts
);
