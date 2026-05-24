import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find expired, un-notified requests
    const { data: expiredRequests, error: fetchError } = await supabase
      .from("requests")
      .select("id, title, creator_id")
      .lte("expires_at", new Date().toISOString())
      .neq("status", "closed")
      .eq("expiry_notified", false);

    if (fetchError) throw fetchError;

    if (!expiredRequests || expiredRequests.length === 0) {
      return new Response(
        JSON.stringify({ message: "No expired requests to process", count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalNotifications = 0;

    for (const request of expiredRequests) {
      const notifications: any[] = [];

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

    return new Response(
      JSON.stringify({
        message: "Expiry check complete",
        expired_requests: expiredRequests.length,
        notifications_sent: totalNotifications,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in check-request-expiry:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
