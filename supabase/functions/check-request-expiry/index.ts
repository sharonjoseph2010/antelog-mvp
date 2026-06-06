import { adminClient } from "../_shared/auth.ts";
import { json, preflight, fail } from "../_shared/http.ts";

// System cron (verify_jwt = false): operates on global state with the service
// role. No per-user auth or rate limiting; it is not callable as a user action.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);

  try {
    const supabase = adminClient();

    // Find expired, un-notified requests
    const { data: expiredRequests, error: fetchError } = await supabase
      .from("requests")
      .select("id, title, creator_id")
      .lte("expires_at", new Date().toISOString())
      .neq("status", "closed")
      .eq("expiry_notified", false);

    if (fetchError) throw fetchError;

    if (!expiredRequests || expiredRequests.length === 0) {
      return json(req, { message: "No expired requests to process", count: 0 });
    }

    let totalNotifications = 0;

    for (const request of expiredRequests) {
      const notifications: Array<Record<string, unknown>> = [];

      // Notify creator
      notifications.push({
        user_id: request.creator_id,
        type: "request_expired",
        title: "Your request has expired",
        message: `Your request "${request.title}" has expired. You can extend it or close it.`,
      });

      // Find unique responders
      const { data: responses } = await supabase
        .from("request_responses")
        .select("responder_id")
        .eq("request_id", request.id);

      const uniqueResponders = new Set(
        (responses || [])
          .map((r) => r.responder_id)
          .filter((id) => id !== request.creator_id)
      );

      for (const responderId of uniqueResponders) {
        notifications.push({
          user_id: responderId,
          type: "request_expired",
          title: "A request you responded to has expired",
          message: `The request "${request.title}" you responded to has expired.`,
          related_user_id: request.creator_id,
        });
      }

      // Insert notifications
      if (notifications.length > 0) {
        const { error: notifError } = await supabase
          .from("notifications")
          .insert(notifications);

        if (notifError) {
          console.error(`Error inserting notifications for request ${request.id}:`, notifError);
          continue;
        }
      }

      // Mark as notified
      const { error: updateError } = await supabase
        .from("requests")
        .update({ expiry_notified: true })
        .eq("id", request.id);

      if (updateError) {
        console.error(`Error updating expiry_notified for ${request.id}:`, updateError);
      }

      totalNotifications += notifications.length;
    }

    return json(req, {
      message: "Expiry check complete",
      expired_requests: expiredRequests.length,
      notifications_sent: totalNotifications,
    });
  } catch (error) {
    return fail(req, "check-request-expiry", error);
  }
});
