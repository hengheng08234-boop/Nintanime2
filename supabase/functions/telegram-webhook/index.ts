import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// ---------------------------------------------------------------------
// Telegram webhook: auto-confirm subscriptions from ABA Merchant's
// payment-notification group.
//
// SETUP (do this once):
//   1. Create/reuse a bot via @BotFather, get its token.
//   2. In BotFather: /setprivacy -> Disable for this bot, so it can
//      read every message in a group, not just @mentions/commands.
//   3. Add the bot to the same Telegram group ABA Merchant posts
//      payment notifications into.
//   4. Register the webhook (run once from your machine or Postman):
//        curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
//          -d "url=https://<PROJECT_REF>.supabase.co/functions/v1/telegram-webhook" \
//          -d "secret_token=<A LONG RANDOM STRING YOU PICK>"
//   5. Set these Supabase Edge Function secrets:
//        TELEGRAM_WEBHOOK_SECRET   = the same secret_token from step 4
//        TELEGRAM_GROUP_ID         = the group's chat id (see note below)
//        ABA_NOTIFIER_ID           = the sender id of ABA's own
//                                    notification messages in that group
//                                    (see note below)
//        TELEGRAM_BOT_TOKEN        = optional, only needed if you want
//                                    the bot to reply/confirm in-chat
//
//   Finding TELEGRAM_GROUP_ID and ABA_NOTIFIER_ID: temporarily comment
//   out the two "ignore if it doesn't match" checks below, deploy, let
//   one real ABA notification arrive, then check the Supabase function
//   logs — every update is logged before filtering. Copy the chat.id
//   and from.id you see there into the two secrets, then restore the
//   checks and redeploy. Skipping this step means ANYONE in the group
//   could type a fake "payment received" message and unlock an account.
// ---------------------------------------------------------------------

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Telegram-Bot-Api-Secret-Token",
};

// Matches "$2.00", "USD 2", "2.00$", "7$" etc.
const AMOUNT_PATTERN = /(?:USD|\$)\s?(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s?(?:USD|\$)/i;

// A match_code is 6 uppercase letters/digits (see generate_match_code()).
const CODE_PATTERN = /\b([A-Z0-9]{6})\b/g;

function extractAmount(text: string): number | null {
  const m = text.match(AMOUNT_PATTERN);
  if (!m) return null;
  const raw = m[1] ?? m[2];
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

function extractCandidateCodes(text: string): string[] {
  const upper = text.toUpperCase();
  const codes = new Set<string>();
  let m: RegExpExecArray | null;
  CODE_PATTERN.lastIndex = 0;
  while ((m = CODE_PATTERN.exec(upper)) !== null) {
    codes.add(m[1]);
  }
  return [...codes];
}

async function replyToGroup(token: string, chatId: number, text: string) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_notification: true }),
    });
  } catch {
    // Best-effort only — never let a reply failure affect confirmation.
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  // Always ack Telegram quickly with 200, even on internal problems,
  // so it doesn't sit there retrying the same update forever.
  const ack = () => new Response("ok", { status: 200, headers: corsHeaders });

  const webhookSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  const groupId = Deno.env.get("TELEGRAM_GROUP_ID");
  const notifierId = Deno.env.get("ABA_NOTIFIER_ID");
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (webhookSecret) {
    const got = req.headers.get("x-telegram-bot-api-secret-token");
    if (got !== webhookSecret) {
      return new Response("forbidden", { status: 403, headers: corsHeaders });
    }
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return ack();
  }

  console.log("telegram-webhook update:", JSON.stringify(body));

  const message = body.message ?? body.channel_post;
  if (!message) return ack();

  const chatId: number | undefined = message.chat?.id;
  const fromId: number | undefined = message.from?.id ?? message.sender_chat?.id;
  const text: string = message.text ?? message.caption ?? "";

  if (!text) return ack();

  // Only trust messages from the configured group / sender once those
  // secrets are set. Until they are, we log-only (see setup note above).
  if (groupId && String(chatId) !== groupId) return ack();
  if (notifierId && String(fromId) !== notifierId) return ack();

  const amount = extractAmount(text);
  const candidateCodes = extractCandidateCodes(text);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  try {
    let matchedId: string | null = null;

    // Primary signal: a unique match_code found in the notification text.
    if (candidateCodes.length > 0) {
      const { data: rows } = await adminClient
        .from("subscription_requests")
        .select("id, match_code, amount")
        .eq("status", "pending")
        .in("match_code", candidateCodes);

      if (rows && rows.length === 1) {
        matchedId = rows[0].id;
      }
    }

    // Fallback: exact amount match among unambiguous, recent pending
    // requests, only if no code matched above.
    if (!matchedId && amount !== null) {
      const since = new Date(Date.now() - 20 * 60 * 1000).toISOString();
      const { data: rows } = await adminClient
        .from("subscription_requests")
        .select("id, amount, created_at")
        .eq("status", "pending")
        .eq("amount", amount)
        .gte("created_at", since);

      if (rows && rows.length === 1) {
        matchedId = rows[0].id;
      }
    }

    if (!matchedId) {
      // No unambiguous match — leave it for the existing manual/OCR
      // review flow rather than guessing.
      return ack();
    }

    const { data: updated, error } = await adminClient
      .from("subscription_requests")
      .update({ status: "confirmed", verified_method: "telegram_auto" })
      .eq("id", matchedId)
      .eq("status", "pending") // guard against a race with another confirmation
      .select("id, user_id, plan")
      .maybeSingle();

    if (!error && updated && botToken && chatId) {
      await replyToGroup(botToken, chatId, `✅ Subscription confirmed (${updated.plan}).`);
    }

    return ack();
  } catch (err) {
    console.error("telegram-webhook error:", err);
    return ack();
  }
});
