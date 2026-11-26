CREATE TABLE ems.assignment_targets (
  site text NOT NULL REFERENCES ems.sites,
  node_id text NOT NULL CHECK (node_id ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$'),
  context jsonb NOT NULL CHECK (jsonb_typeof(context) = 'object'),
  capabilities jsonb NOT NULL CHECK (jsonb_typeof(capabilities) = 'object'),
  provenance text NOT NULL CHECK (provenance IN ('fixture', 'enrolled')),
  verified_at timestamptz NOT NULL,
  revoked_at timestamptz,
  PRIMARY KEY (site, node_id),
  CHECK (context->>'siteId' IS NOT DISTINCT FROM site),
  CHECK (context->>'nodeId' IS NOT DISTINCT FROM node_id),
  CHECK (capabilities->>'nodeId' IS NOT DISTINCT FROM node_id)
);

CREATE TABLE ems.assignments (
  site text NOT NULL REFERENCES ems.sites,
  id uuid PRIMARY KEY,
  node_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('operator','hmi')),
  release_id uuid NOT NULL,
  release_digest text NOT NULL CHECK (release_digest ~ '^[a-f0-9]{64}$'),
  effective_from timestamptz NOT NULL,
  effective_until timestamptz CHECK (effective_until > effective_from),
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition) = 'object'),
  actor uuid NOT NULL REFERENCES ems.actors,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (site, release_id) REFERENCES ems.releases (site, id),
  CHECK (definition->>'siteId' IS NOT DISTINCT FROM site),
  CHECK (definition->>'id' IS NOT DISTINCT FROM id::text),
  CHECK (definition->>'nodeId' IS NOT DISTINCT FROM node_id),
  CHECK (definition->>'kind' IS NOT DISTINCT FROM kind),
  CHECK (definition->>'releaseId' IS NOT DISTINCT FROM release_id::text),
  CHECK (definition->>'releaseDigest' IS NOT DISTINCT FROM release_digest)
);

CREATE INDEX ems_assignment_lookup_idx ON ems.assignments (site, node_id, kind, effective_from, effective_until);
CREATE INDEX ems_assignment_page_idx ON ems.assignments (site, id);

CREATE FUNCTION ems.guard_assignment_release() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, ems AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM ems.releases release
    WHERE release.site = NEW.site AND release.id = NEW.release_id
      AND release.status = 'published' AND release.artifact->>'contentDigest' = NEW.release_digest
      AND release.artifact->'value'->>'kind' = NEW.kind
  ) THEN
    RAISE EXCEPTION 'Assignment requires the exact published package in this site' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER ems_assignment_published BEFORE INSERT ON ems.assignments
FOR EACH ROW EXECUTE FUNCTION ems.guard_assignment_release();
