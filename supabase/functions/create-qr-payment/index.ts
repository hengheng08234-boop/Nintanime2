import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  corsHeaders,
  getPaywayConfig,
  generateTranId,
  PLAN_AMOUNTS,
} from "../_shared/payway.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { plan } = await req.json();
    if (!plan || !PLAN_AMOUNTS[plan]) {
      return new Response(
        JSON.stringify({ error: "Invalid plan. Use 1m, 2m, 6m, or 1y." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing auth token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const amount = PLAN_AMOUNTS[plan];
    const tranId = generateTranId();
    const expiresInSeconds = 900;
    const now = new Date();
    const qrExpiresAt = new Date(now.getTime() + expiresInSeconds * 1000).toISOString();

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: insertData, error: insertError } = await adminClient
      .from("subscription_requests")
      .insert({
        user_id: user.id,
        plan,
        amount,
        status: "pending",
        payway_tran_id: tranId,
        qr_expires_at: qrExpiresAt,
      })
      .select("id")
      .single();

    if (insertError || !insertData) {
      return new Response(
        JSON.stringify({ error: "Failed to create payment request" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const requestId = insertData.id;

    // Try PayWay generate-qr API
    const config = getPaywayConfig();
    let qrImage = "";
    let abapayDeeplink: string | undefined;

    if (config) {
      const pwRes = await fetch(`${config.apiUrl}/api/payment/qr/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.apiKey,
        },
        body: JSON.stringify({
          merchant_id: config.merchantId,
          terminal_id: config.terminalId,
          tran_id: tranId,
          amount: amount.toFixed(2),
          currency: "USD",
          expiry: qrExpiresAt,
        }),
      });
      if (pwRes.ok) {
        const pwData = await pwRes.json();
        qrImage = pwData.qr_image ?? pwData.qrImage ?? "";
        abapayDeeplink = pwData.abapay_deeplink ?? pwData.abapayDeeplink;
      }
    }

    // Fallback: static QR image per plan if PayWay not configured
    if (!qrImage) {
      const staticQrMap: Record<string, string> = {
        "1m": "subscription-1m.png",
        "2m": "subscription-1m.png",
        "6m": "subscription-1m.png",
        "1y": "subscription-1y.png",
      };
      const file = staticQrMap[plan];
      const { data: fileData } = adminClient.storage
        .from("avatars")
        .getPublicUrl(`subscription-qr/${file}`);
      qrImage = fileData.publicUrl || "";
    }

    return new Response(
      JSON.stringify({
        requestId,
        tranId,
        qrImage,
        abapayDeeplink,
        amount,
        expiresInSeconds,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message ?? "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
