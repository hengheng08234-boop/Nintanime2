// Shared PayWay (ABA KHQR) helpers — duplicated into each edge function
// per the no-shared-code rule. This file is imported by the local build
// of each function only.

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

export interface PaywayConfig {
  apiUrl: string;
  apiKey: string;
  merchantId: string;
  terminalId: string;
}

export function getPaywayConfig(): PaywayConfig | null {
  const apiUrl = Deno.env.get("PAYWAY_API_URL");
  const apiKey = Deno.env.get("PAYWAY_API_KEY");
  const merchantId = Deno.env.get("PAYWAY_MERCHANT_ID");
  const terminalId = Deno.env.get("PAYWAY_TERMINAL_ID");
  if (!apiUrl || !apiKey || !merchantId || !terminalId) return null;
  return { apiUrl, apiKey, merchantId, terminalId };
}

export function generateTranId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `NINT${ts}${rand}`.toUpperCase();
}

export const PLAN_AMOUNTS: Record<string, number> = {
  "1m": 2,
  "2m": 4,
  "6m": 7,
  "1y": 28,
};

export const PLAN_MONTHS: Record<string, number> = {
  "1m": 1,
  "2m": 2,
  "6m": 6,
  "1y": 12,
};
