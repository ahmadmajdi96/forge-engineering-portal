ALTER TABLE ems.workspaces DROP CONSTRAINT workspaces_key_check,
  ADD CONSTRAINT workspaces_key_check CHECK (key IN ('spatial','studio','process','engineering'));
