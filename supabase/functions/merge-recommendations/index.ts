import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface MergePayload {
  request_id: string;
  chosen_source: "network" | "guest";
  chosen_rec_id: string;
  chosen_contribution_id: string | null;
  chosen_text: string;
  chosen_vote_count: number;
  other_source: "network" | "guest";
  other_rec_id: string;
  other_contribution_id: string | null;
  other_vote_count: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify the caller
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as MergePayload;
    const {
      request_id,
      chosen_source,
      chosen_rec_id,
      chosen_contribution_id,
      chosen_text,
      chosen_vote_count,
      other_source,
      other_rec_id,
      other_contribution_id,
      other_vote_count,
    } = body;

    if (!request_id || !chosen_rec_id || !other_rec_id) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Verify caller is the request creator
    const { data: reqRow, error: reqErr } = await admin
      .from("requests")
      .select("creator_id")
      .eq("id", request_id)
      .maybeSingle();
    if (reqErr || !reqRow) {
      return new Response(JSON.stringify({ error: "Request not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (reqRow.creator_id !== userData.user.id) {
      return new Response(JSON.stringify({ error: "Only the request creator can merge" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const totalVotes = (chosen_vote_count ?? 0) + (other_vote_count ?? 0);

    // 1) Update CHOSEN winner with combined votes
    if (chosen_source === "network") {
      const { error } = await admin
        .from("response_recommendations")
        .update({ vote_count: totalVotes, merged_into_id: null, merged_away: false })
        .eq("id", chosen_rec_id);
      if (error) throw error;
    } else {
      // guest winner — update JSONB via RPC
      const { error } = await admin.rpc("update_guest_recommendation_merge", {
        _guest_contribution_id: chosen_contribution_id,
        _recommendation_id: chosen_rec_id,
        _vote_count: totalVotes,
        _merged_into_id: null,
        _merged_into_text: null,
      });
      if (error) throw error;
    }

    // 2) Mark OTHER as merged away
    if (other_source === "network") {
      const updatePayload: Record<string, unknown> = {
        vote_count: 0,
        merged_away: true,
      };
      // Only set merged_into_id when winner is also a network rec (FK-safe)
      if (chosen_source === "network") {
        updatePayload.merged_into_id = chosen_rec_id;
      }
      const { error } = await admin
        .from("response_recommendations")
        .update(updatePayload)
        .eq("id", other_rec_id);
      if (error) throw error;
    } else {
      // guest losing entry — zero out via RPC and record merge target
      const { error } = await admin.rpc("update_guest_recommendation_merge", {
        _guest_contribution_id: other_contribution_id,
        _recommendation_id: other_rec_id,
        _vote_count: 0,
        _merged_into_id: chosen_source === "network" ? chosen_rec_id : null,
        _merged_into_text: chosen_text,
      });
      if (error) throw error;
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});