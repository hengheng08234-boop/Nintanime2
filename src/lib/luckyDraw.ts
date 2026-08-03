import { supabase } from '@/lib/supabase/supabaseClient';

export interface SpinResult {
  reward_days: number;
  reward_label: string;
  new_expires_at: string;
}

// The 8 reward tiers, in wheel order, mirroring the weights hard-coded in
// the claim_new_member_spin() SQL function. Keeping the order/weights here
// too lets the wheel UI pick the right segment to land on once the server
// tells us which reward was actually granted.
export const SPIN_TIERS: { days: number; label: string; weight: number }[] = [
  { days: 15, label: '15 days', weight: 80 },
  { days: 20, label: '20 days', weight: 70 },
  { days: 30, label: '1 month', weight: 60 },
  { days: 60, label: '2 months', weight: 40 },
  { days: 90, label: '3 months', weight: 30 },
  { days: 120, label: '4 months', weight: 1 },
  { days: 150, label: '5 months', weight: 1 },
  { days: 180, label: '6 months', weight: 1 },
];

export async function claimNewMemberSpin(): Promise<{
  data: SpinResult | null;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('claim_new_member_spin');
  if (error) return { data: null, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { data: null, error: 'no_reward' };
  return { data: row as SpinResult, error: null };
}
