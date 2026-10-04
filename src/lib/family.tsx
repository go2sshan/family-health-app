import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { useSession } from './session';
import { supabase } from './supabase';

export type Person = { user_id: string; display_name: string; role: 'owner' | 'admin' | 'member' };
export type Family = { id: string; name: string };

type Ctx = {
  ready: boolean;
  me: { id: string; display_name: string } | null;
  family: Family | null;
  people: Person[];
  myRole: Person['role'] | null;
  isAdmin: boolean;
  reload: () => Promise<void>;
  nameOf: (userId: string | null | undefined) => string;
};

const FamilyContext = createContext<Ctx>({
  ready: false, me: null, family: null, people: [], myRole: null, isAdmin: false,
  reload: async () => {}, nameOf: () => 'Someone',
});

/** Load who I am, my family and its people. */
async function fetchFamily(uid: string) {
  const [{ data: me }, { data: mine }] = await Promise.all([
    supabase.from('profiles').select('id, display_name').eq('id', uid).maybeSingle(),
    supabase.from('family_users').select('family_id, families(id, name)').eq('user_id', uid).order('joined_at').limit(1),
  ]);
  const fam = (mine?.[0]?.families ?? null) as Family | null;
  let people: Person[] = [];
  if (fam) {
    const { data: fu } = await supabase.from('family_users').select('user_id, role').eq('family_id', fam.id).order('joined_at');
    const ids = (fu ?? []).map((r) => r.user_id);
    const { data: profs } = ids.length ? await supabase.from('profiles').select('id, display_name').in('id', ids) : { data: [] };
    const names = new Map((profs ?? []).map((p) => [p.id, p.display_name]));
    people = (fu ?? []).map((r) => ({ user_id: r.user_id, role: r.role as Person['role'], display_name: names.get(r.user_id) || 'Family member' }));
  }
  return { ready: true, me: me ?? { id: uid, display_name: '' }, family: fam, people };
}

export function FamilyProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const uid = session?.user.id ?? null;
  const [state, setState] = useState<Omit<Ctx, 'reload' | 'nameOf' | 'isAdmin' | 'myRole'>>({ ready: false, me: null, family: null, people: [] });

  const reload = useCallback(async () => {
    if (uid) setState(await fetchFamily(uid));
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    let live = true;
    fetchFamily(uid).then((next) => { if (live) setState(next); });
    return () => { live = false; };
  }, [uid]);


  const myRole = state.people.find((p) => p.user_id === uid)?.role ?? null;
  const nameOf = useCallback((id: string | null | undefined) => {
    if (!id) return 'Someone';
    if (id === uid) return 'You';
    return state.people.find((p) => p.user_id === id)?.display_name || 'Former member';
  }, [state.people, uid]);

  return (
    <FamilyContext.Provider value={{ ...state, myRole, isAdmin: myRole === 'owner' || myRole === 'admin', reload, nameOf }}>
      {children}
    </FamilyContext.Provider>
  );
}

export const useFamily = () => useContext(FamilyContext);

// ---------- actions ----------
function rpcError(e: { message: string } | null) {
  if (e) throw new Error(e.message);
}

export async function createFamily(name: string, myFirstName: string) {
  const { error } = await supabase.rpc('create_family', { family_name: name, my_first_name: myFirstName });
  rpcError(error);
}
export async function joinFamily(code: string, myFirstName: string) {
  const { error } = await supabase.rpc('join_family', { invite_code: code, my_first_name: myFirstName });
  rpcError(error);
}
export async function createInvite(familyId: string, memberId?: string | null, role: 'member' | 'admin' = 'member'): Promise<string> {
  const { data, error } = await supabase.rpc('create_invite', { fid: familyId, for_member: memberId ?? null, as_role: role });
  rpcError(error);
  return data as string;
}
export async function removeFromFamily(familyId: string, userId: string) {
  const { error } = await supabase.rpc('remove_from_family', { fid: familyId, who: userId });
  rpcError(error);
}
export async function setFamilyRole(familyId: string, userId: string, role: 'admin' | 'member') {
  const { error } = await supabase.rpc('set_family_role', { fid: familyId, who: userId, new_role: role });
  rpcError(error);
}
export async function openDirectChat(otherUserId: string): Promise<string> {
  const { data, error } = await supabase.rpc('get_or_create_direct', { other: otherUserId });
  rpcError(error);
  return data as string;
}
export function inviteMessage(code: string, familyName: string) {
  return `Join "${familyName}" on Family Health, our private family health app.\n\n1. Install Family Health (TestFlight link from me)\n2. Create your account\n3. Choose "Join a family" and enter code: ${code}\n\nThe code works once and expires in 7 days.`;
}
