import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { getMemberDetail } from '@/lib/api';
import type { MemberDetail } from '@/lib/types';

/** Loads one family member's full record and reloads whenever the screen comes back into view. */
export function useMember(id: string | undefined) {
  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    if (!id) return;
    try {
      setDetail(await getMemberDetail(id));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this person. Pull down to try again.');
    }
  }, [id]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  return { detail, error, reload };
}
