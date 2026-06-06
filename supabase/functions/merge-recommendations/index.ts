import { getUser, adminClient } from "../_shared/auth.ts";
import { json, preflight, fail } from "../_shared/http.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";

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
  if (req.method === "OPTIONS") return preflight(req);

  try {
    const caller = await getUser(req);
    if (!caller) return json(req, { error: "Unauthorized" }, 401);

    const admin = adminClient();

    const rl = await enforceRateLimit(admin, caller.id, "merge-recommendations", 20, 60);
    if (!rl.ok) return json(req, { error: "Too many requests. Please wait a moment." }, 429);

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
      return json(req, { error: "Missing required fields" }, 400);
    }

    // Verify caller is the request creator before any service-key mutation.
    const { data: reqRow, error: reqErr } = await admin
      .from("requests")
      .select("creator_id")
      .eq("id", request_id)
      .maybeSingle();
    if (reqErr || !reqRow) return json(req, { error: "Request not found" }, 404);
    if (reqRow.creator_id !== caller.id) {
      return json(req, { error: "Only the request creator can merge" }, 403);
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
      const updatePayload: Record<string, unknown> = { vote_count: 0, merged_away: true };
      if (chosen_source === "network") updatePayload.merged_into_id = chosen_rec_id;
      const { error } = await admin
        .from("response_recommendations")
        .update(updatePayload)
        .eq("id", other_rec_id);
      if (error) throw error;
    } else {
      const { error } = await admin.rpc("update_guest_recommendation_merge", {
        _guest_contribution_id: other_contribution_id,
        _recommendation_id: other_rec_id,
        _vote_count: 0,
        _merged_into_id: chosen_source === "network" ? chosen_rec_id : null,
        _merged_into_text: chosen_text,
      });
      if (error) throw error;
    }

    return json(req, { success: true });
  } catch (e) {
    return fail(req, "merge-recommendations", e);
  }
});
