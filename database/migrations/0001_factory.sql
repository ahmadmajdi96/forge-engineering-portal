CREATE SCHEMA ems;
REVOKE ALL ON SCHEMA ems FROM PUBLIC;

CREATE TABLE ems.sites (
  key text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9-]{1,63}$'),
  organization text NOT NULL,
  name text NOT NULL,
  ams_site_id uuid UNIQUE
);
CREATE TABLE ems.actors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer text NOT NULL,
  subject text NOT NULL,
  UNIQUE (issuer, subject)
);
CREATE TABLE ems.oidc_requests (
  key_hash text PRIMARY KEY,
  nonce text NOT NULL,
  verifier text NOT NULL,
  return_path text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE TABLE ems.sessions (
  key_hash text PRIMARY KEY,
  actor uuid NOT NULL REFERENCES ems.actors,
  display_name text NOT NULL,
  bearer text,
  expires_at timestamptz NOT NULL
);
CREATE TABLE ems.workspaces (
  site text NOT NULL REFERENCES ems.sites,
  key text NOT NULL CHECK (key IN ('spatial','studio','process')),
  head integer NOT NULL DEFAULT 0 CHECK (head >= 0),
  PRIMARY KEY (site, key)
);
CREATE TABLE ems.revisions (
  site text NOT NULL,
  workspace text NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  digest text NOT NULL CHECK (digest ~ '^[a-f0-9]{64}$'),
  actor uuid NOT NULL REFERENCES ems.actors,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site, workspace, revision),
  FOREIGN KEY (site, workspace) REFERENCES ems.workspaces
);
CREATE TABLE ems.audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  site text NOT NULL REFERENCES ems.sites,
  actor uuid NOT NULL REFERENCES ems.actors,
  action text NOT NULL,
  object_key text NOT NULL,
  revision integer,
  digest text,
  reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 500),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ems_audit_site_idx ON ems.audit (site, id DESC);
