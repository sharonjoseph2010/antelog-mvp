CREATE OR REPLACE FUNCTION public.get_response_tree(p_request_id UUID)
RETURNS TABLE (
  node_id TEXT,
  parent_node_id TEXT,
  person_name TEXT,
  is_antelog_user BOOLEAN,
  is_root BOOLEAN,
  has_responded BOOLEAN,
  has_forwarded BOOLEAN,
  recommendation_count INT,
  forwarded_to_count INT,
  earliest_action_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator_id UUID;
  v_root_node_id TEXT;
BEGIN
  SELECT r.creator_id INTO v_creator_id FROM requests r WHERE r.id = p_request_id;
  v_root_node_id := 'user:' || v_creator_id::TEXT;

  RETURN QUERY
  WITH
  antelog_nodes AS (
    SELECT
      'user:' || u.user_id::TEXT AS node_id,
      u.user_id,
      p.full_name AS person_name,
      TRUE AS is_antelog_user,
      (u.user_id = v_creator_id) AS is_root
    FROM (
      SELECT v_creator_id AS user_id
      UNION
      SELECT rr.responder_id FROM request_responses rr WHERE rr.request_id = p_request_id
      UNION
      SELECT rf.forwarded_by_user_id FROM request_forwards rf WHERE rf.request_id = p_request_id
      UNION
      SELECT UNNEST(rf.forwarded_to) FROM request_forwards rf WHERE rf.request_id = p_request_id
    ) u
    JOIN profiles p ON p.id = u.user_id
  ),
  guest_nodes AS (
    SELECT DISTINCT ON (gc.contributor_name, gc.share_link_id)
      'guest:' || gc.share_link_id::TEXT || ':' || gc.contributor_name AS node_id,
      gc.share_link_id,
      gc.contributor_name AS person_name,
      FALSE AS is_antelog_user,
      FALSE AS is_root
    FROM guest_contributions gc
    WHERE gc.request_id = p_request_id
      AND EXISTS (
        SELECT 1 FROM guest_contributions gc2
        WHERE gc2.request_id = p_request_id
          AND gc2.contributor_name = gc.contributor_name
          AND gc2.share_link_id = gc.share_link_id
          AND jsonb_array_length(gc2.recommendations) > 0
      )
    ORDER BY gc.contributor_name, gc.share_link_id, gc.created_at
  ),
  guest_with_parent AS (
    SELECT
      gn.node_id,
      gn.share_link_id,
      gn.person_name,
      gn.is_antelog_user,
      gn.is_root,
      CASE
        WHEN sl.generated_by_user_id IS NOT NULL THEN 'user:' || sl.generated_by_user_id::TEXT
        WHEN sl.generated_by_name IS NOT NULL THEN COALESCE(
          (SELECT gn2.node_id FROM guest_nodes gn2
           WHERE gn2.person_name = sl.generated_by_name
             AND gn2.share_link_id = sl.parent_link_id
           LIMIT 1),
          v_root_node_id
        )
        ELSE v_root_node_id
      END AS parent_node_id
    FROM guest_nodes gn
    JOIN share_links sl ON sl.id = gn.share_link_id
  ),
  antelog_with_parent AS (
    SELECT
      an.node_id,
      an.user_id,
      an.person_name,
      an.is_antelog_user,
      an.is_root,
      CASE
        WHEN an.is_root THEN NULL
        ELSE COALESCE(
          (SELECT 'user:' || rf.forwarded_by_user_id::TEXT
           FROM request_forwards rf
           WHERE rf.request_id = p_request_id
             AND an.user_id = ANY(rf.forwarded_to)
           LIMIT 1),
          v_root_node_id
        )
      END AS parent_node_id
    FROM antelog_nodes an
  ),
  all_nodes AS (
    SELECT
      awp.node_id, awp.parent_node_id, awp.person_name, awp.is_antelog_user, awp.is_root,
      awp.user_id AS antelog_user_id, NULL::UUID AS guest_share_link_id
    FROM antelog_with_parent awp
    UNION ALL
    SELECT
      gwp.node_id, gwp.parent_node_id, gwp.person_name, gwp.is_antelog_user, gwp.is_root,
      NULL::UUID, gwp.share_link_id
    FROM guest_with_parent gwp
  )
  SELECT
    an.node_id,
    an.parent_node_id,
    an.person_name,
    an.is_antelog_user,
    an.is_root,
    CASE
      WHEN an.is_antelog_user THEN EXISTS (
        SELECT 1 FROM request_responses rr
        WHERE rr.request_id = p_request_id AND rr.responder_id = an.antelog_user_id
      )
      ELSE EXISTS (
        SELECT 1 FROM guest_contributions gc
        WHERE gc.request_id = p_request_id
          AND gc.contributor_name = an.person_name
          AND gc.share_link_id = an.guest_share_link_id
          AND jsonb_array_length(gc.recommendations) > 0
      )
    END AS has_responded,
    CASE
      WHEN an.is_antelog_user THEN (
        EXISTS (SELECT 1 FROM share_links sl WHERE sl.request_id = p_request_id AND sl.generated_by_user_id = an.antelog_user_id AND sl.parent_link_id IS NOT NULL)
        OR EXISTS (SELECT 1 FROM request_forwards rf WHERE rf.request_id = p_request_id AND rf.forwarded_by_user_id = an.antelog_user_id)
      )
      ELSE EXISTS (
        SELECT 1 FROM share_links sl WHERE sl.request_id = p_request_id AND sl.generated_by_name = an.person_name
      )
    END AS has_forwarded,
    CASE
      WHEN an.is_antelog_user THEN (
        SELECT COUNT(*)::INT FROM response_recommendations rrec
        JOIN request_responses rr ON rr.id = rrec.response_id
        WHERE rr.request_id = p_request_id AND rr.responder_id = an.antelog_user_id
          AND (rrec.merged_away IS NULL OR rrec.merged_away = false)
      )
      ELSE COALESCE((
        SELECT SUM(jsonb_array_length(gc.recommendations))::INT FROM guest_contributions gc
        WHERE gc.request_id = p_request_id
          AND gc.contributor_name = an.person_name
          AND gc.share_link_id = an.guest_share_link_id
      ), 0)
    END AS recommendation_count,
    (SELECT COUNT(*)::INT FROM all_nodes child WHERE child.parent_node_id = an.node_id) AS forwarded_to_count,
    CASE
      WHEN an.is_antelog_user THEN (
        SELECT MIN(rr.created_at) FROM request_responses rr
        WHERE rr.request_id = p_request_id AND rr.responder_id = an.antelog_user_id
      )
      ELSE (
        SELECT MIN(gc.created_at) FROM guest_contributions gc
        WHERE gc.request_id = p_request_id
          AND gc.contributor_name = an.person_name
          AND gc.share_link_id = an.guest_share_link_id
      )
    END AS earliest_action_at
  FROM all_nodes an;
END;
$$;