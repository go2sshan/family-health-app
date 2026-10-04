import { FILES_BUCKET, supabase } from './supabase';
import type {
  Allergy, Contact, EyeRx, HealthRecord, Measurement, Member, MemberDetail, Payment,
} from './types';

/** Throw a readable error from a Supabase response. */
function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

async function uid(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('You are signed out. Sign in again.');
  return data.user.id;
}

// ---------- family ----------
export type MemberSummary = Member & {
  allergies: { id: string }[];
  records: { kind: string; ongoing: boolean | null; occurred_on: string | null }[];
};

export async function listMembers(): Promise<MemberSummary[]> {
  return check(
    await supabase
      .from('members')
      .select('*, allergies(id), records(kind, ongoing, occurred_on)')
      .order('sort_order')
      .order('created_at'),
  ) as MemberSummary[];
}

export async function createMember(fields: Partial<Member> & { first_name: string }): Promise<Member> {
  return check(await supabase.from('members').insert(fields).select().single()) as Member;
}

export async function updateMember(id: string, patch: Partial<Member>): Promise<void> {
  check(await supabase.from('members').update(patch).eq('id', id));
}

export async function deleteMember(id: string): Promise<void> {
  const owner = await uid();
  const folder = `${owner}/${id}`;
  const listed = await supabase.storage.from(FILES_BUCKET).list(folder, { limit: 1000 });
  if (listed.data?.length) {
    await supabase.storage.from(FILES_BUCKET).remove(listed.data.map((f) => `${folder}/${f.name}`));
  }
  check(await supabase.from('members').delete().eq('id', id)); // child rows cascade
}

export async function getMemberDetail(id: string): Promise<MemberDetail> {
  const [member, allergies, measurements, eyes, contacts, records, payments] = await Promise.all([
    supabase.from('members').select('*').eq('id', id).single(),
    supabase.from('allergies').select('*').eq('member_id', id).order('created_at'),
    supabase.from('measurements').select('*').eq('member_id', id).order('measured_on', { ascending: false }),
    supabase.from('eye_prescriptions').select('*').eq('member_id', id).order('rx_date', { ascending: false }),
    supabase.from('emergency_contacts').select('*').eq('member_id', id).order('created_at'),
    supabase.from('records').select('*, record_files(id, storage_path, mime_type, file_name)').eq('member_id', id)
      .order('occurred_on', { ascending: false, nullsFirst: false }),
    supabase.from('payments').select('*').eq('member_id', id).order('paid_on', { ascending: false }),
  ]);
  return {
    member: check(member) as Member,
    allergies: check(allergies) as Allergy[],
    measurements: check(measurements) as Measurement[],
    eyes: check(eyes) as EyeRx[],
    contacts: check(contacts) as Contact[],
    records: check(records) as HealthRecord[],
    payments: check(payments) as Payment[],
  };
}

// ---------- simple child rows ----------
type Table = 'allergies' | 'measurements' | 'eye_prescriptions' | 'emergency_contacts' | 'payments';

export async function addRow<T extends object>(table: Table, row: T): Promise<void> {
  check(await supabase.from(table).insert(row));
}

export async function deleteRow(table: Table | 'records', id: string): Promise<void> {
  check(await supabase.from(table).delete().eq('id', id));
}

// ---------- records ----------
export type NewRecord = Omit<HealthRecord, 'id' | 'record_files'>;

export async function addRecords(rows: NewRecord[]): Promise<HealthRecord[]> {
  if (!rows.length) return [];
  return check(await supabase.from('records').insert(rows).select()) as HealthRecord[];
}

export async function attachFile(
  memberId: string, recordId: string, path: string, mime: string, name: string,
): Promise<void> {
  check(await supabase.from('record_files').insert({
    member_id: memberId, record_id: recordId, storage_path: path, mime_type: mime, file_name: name,
  }));
}

// ---------- files ----------
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Upload a JPEG (base64) to <user>/<member>/<random>.jpg and return its storage path. */
export async function uploadJpeg(memberId: string, base64: string): Promise<string> {
  const owner = await uid();
  const path = `${owner}/${memberId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  check(await supabase.storage.from(FILES_BUCKET).upload(path, base64ToBytes(base64), { contentType: 'image/jpeg' }));
  return path;
}

/** A short-lived link for showing a private photo. */
export async function signedUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(FILES_BUCKET).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}
