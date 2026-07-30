import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/payway.ts";

// How long a signed playback URL stays valid. Long enough to watch one
// episode (with re-buffering/seeking), short enough that a leaked link
// is useless a few hours later.
const SIGNED_URL_TTL_SECONDS = 4 * 60 * 60; // 4 hours

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { episodeId } = await req.json();
    if (!episodeId || typeof episodeId !== "string") {
      return new Response(
        JSON.stringify({ error: "episodeId is required" }),
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

    // Identify the caller from their own JWT (never trust a client-sent user id).
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

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Check subscription status server-side — this is the actual access
    // control now, not just a UI gate.
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("subscription_expires_at")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: "Profile not found" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const isSubscribed =
      !!profile.subscription_expires_at &&
      new Date(profile.subscription_expires_at).getTime() > Date.now();

    if (!isSubscribed) {
      return new Response(
        JSON.stringify({ error: "Subscription required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: episode, error: episodeError } = await adminClient
      .from("episodes")
      .select("video_url")
      .eq("id", episodeId)
      .maybeSingle();

    if (episodeError || !episode?.video_url) {
      return new Response(
        JSON.stringify({ error: "Episode not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const stored = episode.video_url as string;

    // Admin pasted an external URL (e.g. a CDN link) rather than uploading
    // to the videos bucket — nothing to sign, pass it through as-is.
    if (/^https?:\/\//i.test(stored)) {
      return new Response(
        JSON.stringify({ url: stored, signed: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: signedData, error: signError } = await adminClient.storage
      .from("videos")
      .createSignedUrl(stored, SIGNED_URL_TTL_SECONDS);

    if (signError || !signedData) {
      return new Response(
        JSON.stringify({ error: signError?.message ?? "Failed to sign video URL" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        url: signedData.signedUrl,
        signed: true,
        expiresInSeconds: SIGNED_URL_TTL_SECONDS,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
