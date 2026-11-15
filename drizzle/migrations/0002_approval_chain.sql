CREATE TYPE public.app_role AS ENUM ('engineering_approver','release_manager');
CREATE TABLE public.user_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, role public.app_role NOT NULL, UNIQUE(user_id,role));
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own roles readable" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role) $$;

CREATE TABLE public.engineering_signatures (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), revision_id uuid NOT NULL REFERENCES public.engineering_revisions(id), stage text NOT NULL CHECK (stage IN ('In Review','Approved','Released','Effective','Rejected')), signer_id uuid NOT NULL, signer_email text NOT NULL, meaning text NOT NULL, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.engineering_signatures TO authenticated;
GRANT ALL ON public.engineering_signatures TO service_role;
ALTER TABLE public.engineering_signatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signatures readable by signer, owner or approvers" ON public.engineering_signatures FOR SELECT TO authenticated USING (
  signer_id = auth.uid()
  OR public.has_role(auth.uid(),'engineering_approver') OR public.has_role(auth.uid(),'release_manager')
  OR EXISTS (SELECT 1 FROM public.engineering_revisions r JOIN public.engineering_workspaces w ON w.id=r.workspace_id WHERE r.id=revision_id AND w.owner_id=auth.uid()));

CREATE POLICY "approvers read revisions" ON public.engineering_revisions FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'engineering_approver') OR public.has_role(auth.uid(),'release_manager'));

CREATE OR REPLACE FUNCTION public.sign_engineering_revision(p_revision uuid, p_stage text, p_meaning text, p_reason text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_rev public.engineering_revisions; v_owner uuid; v_cur text; v_email text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF length(trim(coalesce(p_reason,''))) < 3 OR length(trim(coalesce(p_meaning,''))) < 3 THEN RAISE EXCEPTION 'reason and signature meaning required'; END IF;
  SELECT * INTO v_rev FROM public.engineering_revisions WHERE id=p_revision;
  IF NOT FOUND THEN RAISE EXCEPTION 'revision not found'; END IF;
  SELECT owner_id INTO v_owner FROM public.engineering_workspaces WHERE id=v_rev.workspace_id;
  SELECT stage INTO v_cur FROM public.engineering_signatures WHERE revision_id=p_revision ORDER BY created_at DESC LIMIT 1;
  v_cur := coalesce(v_cur, CASE WHEN v_rev.lifecycle='In Review' THEN 'In Review' ELSE 'Draft' END);
  IF p_stage='In Review' THEN
    IF v_cur NOT IN ('Draft','Rejected') OR v_uid<>v_owner THEN RAISE EXCEPTION 'only the author can submit a draft for review'; END IF;
  ELSIF p_stage IN ('Approved','Rejected') THEN
    IF v_cur<>'In Review' THEN RAISE EXCEPTION 'revision is not in review'; END IF;
    IF NOT public.has_role(v_uid,'engineering_approver') THEN RAISE EXCEPTION 'approver role required'; END IF;
    IF v_uid=v_rev.actor_id OR v_uid=v_owner THEN RAISE EXCEPTION 'authors cannot approve their own revision'; END IF;
  ELSIF p_stage='Released' THEN
    IF v_cur<>'Approved' THEN RAISE EXCEPTION 'revision is not approved'; END IF;
    IF NOT public.has_role(v_uid,'release_manager') THEN RAISE EXCEPTION 'release manager role required'; END IF;
  ELSIF p_stage='Effective' THEN
    IF v_cur<>'Released' THEN RAISE EXCEPTION 'revision is not released'; END IF;
    IF NOT public.has_role(v_uid,'release_manager') THEN RAISE EXCEPTION 'release manager role required'; END IF;
  ELSE RAISE EXCEPTION 'invalid stage'; END IF;
  SELECT email INTO v_email FROM auth.users WHERE id=v_uid;
  INSERT INTO public.engineering_signatures(revision_id,stage,signer_id,signer_email,meaning,reason) VALUES (p_revision,p_stage,v_uid,coalesce(v_email,''),trim(p_meaning),trim(p_reason));
  INSERT INTO public.engineering_audit(workspace_id,revision_id,actor_id,action,reason,before_revision) VALUES (v_rev.workspace_id,p_revision,v_uid,'sign:'||p_stage,trim(p_reason),v_rev.revision);
  RETURN p_stage;
END $$;
REVOKE ALL ON FUNCTION public.sign_engineering_revision(uuid,text,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sign_engineering_revision(uuid,text,text,text) TO authenticated;