import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  corsHeaders,
  getPaywayConfig,
  PLAN_MONTHS,
} from "../_shared/payway.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { requestId } = await req.json();
    if (!requestId) {
      return new Response(
        JSON.stringify({ error: "Missing requestId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: request, error: reqError } = await adminClient
      .from("subscription_requests")
      .select("id, user_id, plan, status, payway_tran_id, qr_expires_at")
      .eq("id", requestId)
      .maybeSingle();

    if (reqError || !request) {
      return new Response(
        JSON.stringify({ error: "Request not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Already confirmed
    if (request.status === "confirmed") {
      return new Response(
        JSON.stringify({ status: "confirmed" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Expired QR
    if (request.qr_expires_at && new Date(request.qr_expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ status: "expired" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Check PayWay transaction status
    const config = getPaywayConfig();
    if (config && request.payway_tran_id) {
      const pwRes = await fetch(`${config.apiUrl}/api/payment/qr/check`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.apiKey,
        },
        body: JSON.stringify({
          merchant_id: config.merchantId,
          tran_id: request.payway_tran_id,
        }),
      });

      if (pwRes.ok) {
        const pwData = await pwRes.json();
        const paid = pwData.status === "paid" || pwData.payment_status === "paid";

        if (paid) {
          const planMonths = PLAN_MONTHS[request.plan] ?? 1;
          const { data: profile } = await adminClient
            .from("profiles")
            .select("subscription_expires_at")
            .eq("id", request.user_id)
            .maybeSingle();

          const currentExpiry = profile?.subscription_expires_at
            ? new Date(profile.subscription_expires_at)
            : new Date();
          const base = currentExpiry > new Date() ? currentExpiry : new Date();
          const newExpiry = new Date(
            base.getTime() + planMonths * 30 * 24 * 60 * 60 * 1000,
          ).toISOString();

          await adminClient
            .from("profiles")
            .update({
              is_locked: false,
              subscription_expires_at: newExpiry,
            })
            .eq("id", request.user_id);

          await adminClient
            .from("subscription_requests")
            .update({ status: "confirmed" })
            .eq("id", requestId);

          return new Response(
            JSON.stringify({ status: "confirmed" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
    }

    return new Response(
      JSON.stringify({ status: request.status }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message ?? "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
