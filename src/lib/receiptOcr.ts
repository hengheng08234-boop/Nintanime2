import { createWorker } from 'tesseract.js';

/**
 * The name that must appear on a payment receipt screenshot for it to be
 * accepted as proof of payment. Kept as a single source of truth so the
 * same value is used on the client (for the fast first check) and can be
 * mirrored server-side (see supabase/functions/verify-payment-proof).
 */
export const RECEIPT_MATCH_PHRASE = 'PANG SOK HENG';

/** Normalize OCR output for a forgiving, typo-tolerant comparison. */
function normalize(text: string): string {
  return text
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Very small Levenshtein-distance check so minor OCR misreads (0 vs O,
 * 1 vs I, a missing letter, etc.) don't fail a genuine match.
 */
function fuzzyContains(haystack: string, needle: string, maxErrorsPerWord = 1): boolean {
  const hWords = haystack.split(' ');
  const nWords = needle.split(' ').filter(Boolean);
  if (nWords.length === 0) return false;

  for (let start = 0; start <= hWords.length - nWords.length; start++) {
    let ok = true;
    for (let i = 0; i < nWords.length; i++) {
      if (levenshtein(hWords[start + i] || '', nWords[i]) > maxErrorsPerWord) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0),
  );
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

export interface ReceiptOcrResult {
  rawText: string;
  matched: boolean;
}

/**
 * Runs OCR on an uploaded receipt image and checks whether it contains the
 * required recipient name. This is a lightweight, best-effort check meant
 * to unlock VIP instantly for the common case — it is not a substitute for
 * real payment-gateway verification, and the uploaded proof stays attached
 * to the request so an admin can audit or revoke it later if needed.
 */
export async function verifyReceiptScreenshot(file: File): Promise<ReceiptOcrResult> {
  const worker = await createWorker('eng');
  try {
    const {
      data: { text },
    } = await worker.recognize(file);
    const normalized = normalize(text);
    const matched = fuzzyContains(normalized, normalize(RECEIPT_MATCH_PHRASE));
    return { rawText: text, matched };
  } finally {
    await worker.terminate();
  }
}
