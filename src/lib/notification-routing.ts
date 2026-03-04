import { supabase } from "@/integrations/supabase/client";

const REQUEST_NOTIFICATION_TYPES = new Set([
  "request_response",
  "recommendation_voted",
  "request_forwarded",
  "forwarded_request",
  "new_request",
]);

const FRIEND_NOTIFICATION_TYPES = new Set([
  "contact_joined",
  "network_addition",
  "friend_suggestion",
  "friend_request",
]);

interface RouteNotification {
  type: string;
  message: string;
  related_user_id?: string | null;
  request_id?: string | null;
  related_request_id?: string | null;
  metadata?: Record<string, unknown> | null;
  data?: Record<string, unknown> | null;
}

const extractRequestTitle = (type: string, message: string): string | null => {
  const trimmed = message?.trim();
  if (!trimmed) return null;

  if (type === "new_request") {
    const split = trimmed.split(":");
    return split.length > 1 ? split.slice(1).join(":").trim() : null;
  }

  if (type === "request_forwarded" || type === "forwarded_request") {
    const quotedTitleMatch = trimmed.match(/^"(.+?)"\s*-\s*from\s+/i);
    if (quotedTitleMatch?.[1]) return quotedTitleMatch[1].trim();
  }

  if (type === "recommendation_voted") {
    const inRequestMatch = trimmed.match(/in request\s+"(.+?)"/i);
    if (inRequestMatch?.[1]) return inRequestMatch[1].trim();
  }

  return trimmed;
};

const extractRequestIdFromPayload = (notification: RouteNotification): string | null => {
  const maybeFromMetadata =
    (notification.metadata?.request_id as string | undefined) ||
    (notification.metadata?.requestId as string | undefined) ||
    (notification.data?.request_id as string | undefined) ||
    (notification.data?.requestId as string | undefined);

  const candidates = [
    notification.request_id,
    notification.related_request_id,
    maybeFromMetadata,
  ];

  return candidates.find((candidate) => typeof candidate === "string" && candidate.length > 0) ?? null;
};

const resolveRequestIdByTitle = async (notification: RouteNotification): Promise<string | null> => {
  const requestTitle = extractRequestTitle(notification.type, notification.message);
  if (!requestTitle) return null;

  let query = supabase
    .from("requests")
    .select("id, title, created_at")
    .ilike("title", requestTitle)
    .order("created_at", { ascending: false })
    .limit(5);

  if (notification.type === "new_request" && notification.related_user_id) {
    query = query.eq("creator_id", notification.related_user_id);
  }

  const { data, error } = await query;
  if (error || !data?.length) return null;

  const normalizedTitle = requestTitle.toLowerCase();
  const exactMatch = data.find((item) => item.title?.toLowerCase() === normalizedTitle);
  return exactMatch?.id ?? data[0].id;
};

export const getNotificationRoute = async (notification: RouteNotification): Promise<string> => {
  if (REQUEST_NOTIFICATION_TYPES.has(notification.type)) {
    const requestIdFromPayload = extractRequestIdFromPayload(notification);
    if (requestIdFromPayload) return `/requests/${requestIdFromPayload}`;

    const resolvedRequestId = await resolveRequestIdByTitle(notification);
    return resolvedRequestId ? `/requests/${resolvedRequestId}` : "/requests";
  }

  if (FRIEND_NOTIFICATION_TYPES.has(notification.type)) {
    return "/friends";
  }

  return "/dashboard";
};

export const isRequestRelatedNotification = (type: string): boolean => {
  return REQUEST_NOTIFICATION_TYPES.has(type);
};
