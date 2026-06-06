import { getUser, adminClient } from "../_shared/auth.ts";
import { json, preflight, fail } from "../_shared/http.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);

  try {
    // Authorize the caller and scope all work to THEIR contacts (#4).
    // Previously this iterated every row in contact_imports for any caller,
    // re-linking the whole table globally.
    const caller = await getUser(req);
    if (!caller) return json(req, { error: "Unauthorized" }, 401);

    const supabaseClient = adminClient();

    const rl = await enforceRateLimit(supabaseClient, caller.id, "rematch-contacts", 3, 300);
    if (!rl.ok) {
      return json(req, { error: "Re-matching was run recently. Please wait a few minutes." }, 429);
    }

    // Only the caller's own imported contacts with a phone number.
    const { data: contacts, error: contactsError } = await supabaseClient
      .from("contact_imports")
      .select("id, user_id, contact_phone, is_matched, matched_user_id")
      .eq("user_id", caller.id)
      .not("contact_phone", "is", null);

    if (contactsError) throw contactsError;

    let matchedCount = 0;
    let updatedCount = 0;

    for (const contact of contacts || []) {
      if (!contact.contact_phone) continue;

      const { data: normalizedContactPhone, error: normErr } = await supabaseClient
        .rpc("normalize_phone_number", { phone_input: contact.contact_phone });
      if (normErr) {
        console.error("normalize_phone_number failed for a contact");
        continue;
      }

      // Candidate profiles to match against (excluding the caller themselves).
      const { data: allProfiles, error: profilesError } = await supabaseClient
        .from("profiles")
        .select("id, phone_number")
        .not("phone_number", "is", null)
        .neq("id", contact.user_id);

      if (profilesError) {
        console.error("profiles fetch failed during rematch");
        continue;
      }

      let matchedProfile: { id: string } | null = null;
      for (const profile of allProfiles || []) {
        const { data: normalizedProfilePhone } = await supabaseClient
          .rpc("normalize_phone_number", { phone_input: profile.phone_number });
        if (normalizedProfilePhone && normalizedProfilePhone === normalizedContactPhone) {
          matchedProfile = { id: profile.id };
          matchedCount++;
          break;
        }
      }

      if (matchedProfile) {
        const { error: updateError } = await supabaseClient
          .from("contact_imports")
          .update({ is_matched: true, matched_user_id: matchedProfile.id })
          .eq("id", contact.id)
          .eq("user_id", caller.id);
        if (!updateError) updatedCount++;
      } else if (contact.is_matched) {
        const { error: updateError } = await supabaseClient
          .from("contact_imports")
          .update({ is_matched: false, matched_user_id: null })
          .eq("id", contact.id)
          .eq("user_id", caller.id);
        if (!updateError) updatedCount++;
      }
    }

    return json(req, {
      success: true,
      message: "Re-matched contacts successfully",
      stats: {
        totalProcessed: contacts?.length || 0,
        matchesFound: matchedCount,
        contactsUpdated: updatedCount,
      },
    });
  } catch (error) {
    return fail(req, "rematch-contacts", error);
  }
});
