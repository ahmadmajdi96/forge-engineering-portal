-- Keep legacy preview history readable via existing RLS and close direct speculative release paths.
REVOKE INSERT ON public.engineering_revisions, public.integration_outbox FROM PUBLIC, anon, authenticated;
ALTER FUNCTION public.sign_engineering_revision(uuid,text,text,text) RENAME TO sign_engineering_revision_legacy;
REVOKE ALL ON FUNCTION public.sign_engineering_revision_legacy(uuid,text,text,text) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.sign_engineering_revision(p_revision uuid, p_stage text, p_meaning text, p_reason text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR p_stage NOT IN ('In Review','Approved','Rejected') THEN
    RAISE EXCEPTION 'Sandbox signatures cannot release or activate engineering';
  END IF;
  PERFORM 1 FROM public.engineering_revisions r
  JOIN public.engineering_workspaces w ON w.id = r.workspace_id
  WHERE r.id = p_revision AND w.environment = 'sandbox' FOR UPDATE OF r;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown sandbox revision'; END IF;
  RETURN public.sign_engineering_revision_legacy(p_revision,p_stage,p_meaning,p_reason);
END $$;
REVOKE ALL ON FUNCTION public.sign_engineering_revision(uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sign_engineering_revision(uuid,text,text,text) TO authenticated;
DROP POLICY "approvers read revisions" ON public.engineering_revisions;
CREATE FUNCTION public.is_sandbox_workspace(p_workspace uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (
  SELECT 1 FROM public.engineering_workspaces WHERE id = p_workspace AND environment = 'sandbox'
) $$;
REVOKE ALL ON FUNCTION public.is_sandbox_workspace(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_sandbox_workspace(uuid) TO authenticated;
CREATE POLICY "approvers read sandbox revisions" ON public.engineering_revisions FOR SELECT TO authenticated
USING (
  (public.has_role(auth.uid(),'engineering_approver') OR public.has_role(auth.uid(),'release_manager')) AND
  public.is_sandbox_workspace(workspace_id)
);
DROP POLICY "signatures readable by signer, owner or approvers" ON public.engineering_signatures;
CREATE POLICY "sandbox signatures readable by scoped reviewers" ON public.engineering_signatures FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.engineering_revisions r WHERE r.id = revision_id AND public.is_sandbox_workspace(r.workspace_id)
));
