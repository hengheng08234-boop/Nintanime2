import { createWorker } from 'tesseract.js';

/**
 * The name that must appear on a payment receipt screenshot for it to be
 * accepted as proof of payment. Kept as a single source of truth so the
 * same value is used on the client (for the fast first check) and is
 * mirrored server-side in confirm_subscription_via_ocr, which never
 * trusts the client's result and re-checks the raw OCR text itself.
 */
export const RECEIPT_MATCH_PHRASE = 'PANG SOK HENG';

/**
 * A short reference tag that should also appear on the receipt/QR note
 * (e.g. as the transfer memo) so a screenshot can't be reused for a
 * different app or account. Also re-checked server-side.
 */
export const RECEIPT_REF_PHRASE = 'S2 NINT ANI';

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

/** Loosely matches DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, or "04 Aug 2026". */
const DATE_PATTERN =
  /\b(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}|\d{4}[/\-.]\d{1,2}[/\-.]\d{1,2}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\b/i;

/** Loosely matches HH:MM or HH:MM:SS, optionally with AM/PM. */
const TIME_PATTERN = /\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\s*(AM|PM|am|pm)?\b/;

function extractDate(rawText: string): string | null {
  const match = rawText.match(DATE_PATTERN);
  return match ? match[0] : null;
}

function extractTime(rawText: string): string | null {
  const match = rawText.match(TIME_PATTERN);
  return match ? match[0] : null;
}

/**
 * Best-effort check of whether an extracted date string falls within
 * `windowHours` of now. Returns null (unknown/unparseable) rather than
 * false, since OCR date reads are unreliable and shouldn't hard-fail a
 * genuine receipt on their own — recency is a supporting signal, not the
 * primary gate (name + reference tag are).
 */
function isRecentDate(dateStr: string | null, windowHours = 48): boolean | null {
  if (!dateStr) return null;
  const normalized = dateStr.replace(/[.\-]/g, '/');
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  const diffHours = Math.abs(Date.now() - parsed.getTime()) / (1000 * 60 * 60);
  return diffHours <= windowHours;
}

export interface ReceiptOcrResult {
  rawText: string;
  /** True only when both the name and the reference tag were found. */
  matched: boolean;
  nameMatched: boolean;
  refMatched: boolean;
  dateText: string | null;
  timeText: string | null;
  /** true / false / null (couldn't parse a date on the receipt) */
  dateRecent: boolean | null;
}

/**
 * Runs OCR on an uploaded receipt image and checks whether it contains the
 * required recipient name and app reference tag, and pulls out a date/time
 * if one is visible. This is a lightweight, best-effort check meant to
 * unlock VIP instantly for the common case — it is not a substitute for
 * real payment-gateway verification, and the uploaded proof stays attached
 * to the request so an admin can audit or revoke it later if needed. The
 * name + reference check is always re-verified server-side before anything
 * is actually confirmed (see confirm_subscription_via_ocr).
 */
export async function verifyReceiptScreenshot(file: File): Promise<ReceiptOcrResult> {
  const worker = await createWorker('eng');
  try {
    const {
      data: { text },
    } = await worker.recognize(file);
    const normalized = normalize(text);
    const nameMatched = fuzzyContains(normalized, normalize(RECEIPT_MATCH_PHRASE));
    const refMatched = fuzzyContains(normalized, normalize(RECEIPT_REF_PHRASE));
    const dateText = extractDate(text);
    const timeText = extractTime(text);
    return {
      rawText: text,
      matched: nameMatched && refMatched,
      nameMatched,
      refMatched,
      dateText,
      timeText,
      dateRecent: isRecentDate(dateText),
    };
  } finally {
    await worker.terminate();
  }
}
