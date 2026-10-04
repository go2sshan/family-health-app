import { supabase } from './supabase';
import type { RecordKind } from './types';

export type ScanItem = {
  kind: Exclude<RecordKind, 'document'>;
  date: string | null;
  title: string;
  value: number | null;
  unit: string | null;
  ongoing: boolean;
  notes: string;
  confidence: 'high' | 'medium' | 'low';
  amountPaid: number | null;
  currency: string | null;
};

export type ScanResult = {
  documentType?: string;
  documentDate?: string | null;
  facility?: string | null;
  doctor?: string | null;
  country?: string | null;
  language?: string;
  items: ScanItem[];
};

const KINDS = ['visit', 'diagnosis', 'lab', 'medicine', 'vaccination', 'procedure', 'allergy'];

/** Send photos to the scan-document function; it asks Claude to read them. */
export async function scanDocument(
  imagesBase64: string[],
  opts: { hint?: 'prescription' | 'bill' | null; country?: string | null; knownLabs?: string[] },
): Promise<ScanResult> {
  const { data, error } = await supabase.functions.invoke('scan-document', {
    body: {
      images: imagesBase64.map((data) => ({ data, mediaType: 'image/jpeg' })),
      hint: opts.hint ?? null,
      country: opts.country ?? null,
      knownLabs: opts.knownLabs ?? [],
    },
  });
  if (error) {
    // The function returns {error: "..."} with a readable message.
    let msg = 'The document could not be read. Check your connection and try again.';
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body?.error) msg = body.error;
    } catch { /* keep default */ }
    throw new Error(msg);
  }
  const res = (data ?? {}) as ScanResult;
  res.items = (Array.isArray(res.items) ? res.items : [])
    .filter((it) => it && typeof it.title === 'string' && it.title.trim())
    .map((it) => ({
      ...it,
      kind: (KINDS.includes(it.kind) ? it.kind : 'visit') as ScanItem['kind'],
      confidence: (['high', 'medium', 'low'].includes(it.confidence) ? it.confidence : 'medium') as ScanItem['confidence'],
      notes: String(it.notes ?? ''),
      ongoing: Boolean(it.ongoing),
    }));
  return res;
}
