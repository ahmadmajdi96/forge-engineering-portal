import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export const STAGES = ['Draft', 'In Review', 'Approved', 'Released', 'Effective'] as const;

export const listApprovals = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const sb = context.supabase;
  const [{ data: revs }, { data: sigs }, { data: roles }] = await Promise.all([
    sb.from('engineering_revisions').select('id,revision,lifecycle,actor_id,reason,created_at').order('created_at', { ascending: false }).limit(50),
    sb.from('engineering_signatures').select('id,revision_id,stage,signer_id,signer_email,meaning,reason,created_at').order('created_at', { ascending: true }),
    sb.from('user_roles').select('role').eq('user_id', context.userId),
  ]);
  return {
    userId: context.userId,
    roles: (roles ?? []).map((r) => r.role as string),
    revisions: (revs ?? []).map((r) => {
      const s = (sigs ?? []).filter((x) => x.revision_id === r.id);
      const stage = s.length ? s[s.length - 1]!.stage : r.lifecycle === 'In Review' ? 'In Review' : 'Draft';
      return { ...r, stage, signatures: s };
    }),
  };
});

export const signRevision = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ revisionId: z.string().uuid(), stage: z.enum(['In Review', 'Approved', 'Rejected']), meaning: z.string().trim().min(3).max(200), reason: z.string().trim().min(3).max(500) }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc('sign_engineering_revision', { p_revision: data.revisionId, p_stage: data.stage, p_meaning: data.meaning, p_reason: data.reason });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
