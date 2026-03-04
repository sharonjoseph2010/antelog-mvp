import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { isInNetwork, getDisplayNameSync } from "@/hooks/useNetworkAwareName";
import { GitBranch, ChevronDown, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ForwardNode {
  id: string;
  forwarded_by_user_id: string;
  forwarded_to: string[];
  network_depth: number;
  network_path: string[];
  created_at: string;
  // resolved
  forwarder_name: string;
  recipients: { id: string; name: string }[];
}

interface TreeNode {
  userId: string;
  name: string;
  timestamp: string;
  depth: number;
  children: TreeNode[];
}

interface ResponseTreeProps {
  requestId: string;
  creatorId: string;
  viewerId: string;
}

export function ResponseTree({ requestId, creatorId, viewerId }: ResponseTreeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [totalReach, setTotalReach] = useState(0);
  const [maxDepth, setMaxDepth] = useState(0);

  const loadTree = async () => {
    if (tree) {
      setIsOpen(!isOpen);
      return;
    }

    setIsLoading(true);
    setIsOpen(true);

    try {
      const { data: forwards, error } = await supabase
        .from("request_forwards")
        .select("id, forwarded_by_user_id, forwarded_to, network_depth, network_path, created_at")
        .eq("request_id", requestId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      if (!forwards || forwards.length === 0) {
        setTree({ userId: creatorId, name: "You", timestamp: "", depth: 0, children: [] });
        setIsLoading(false);
        return;
      }

      // Collect all unique user IDs
      const allUserIds = new Set<string>();
      allUserIds.add(creatorId);
      forwards.forEach(f => {
        allUserIds.add(f.forwarded_by_user_id);
        (f.forwarded_to || []).forEach((id: string) => allUserIds.add(id));
      });

      // Fetch profiles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, handle")
        .in("id", Array.from(allUserIds));

      const profileMap = new Map((profiles || []).map(p => [p.id, p]));

      // Resolve names with network awareness
      const nameMap = new Map<string, string>();
      await Promise.all(
        Array.from(allUserIds).map(async (uid) => {
          if (uid === viewerId) {
            nameMap.set(uid, "You");
            return;
          }
          const profile = profileMap.get(uid);
          const inNet = await isInNetwork(viewerId, uid);
          nameMap.set(uid, getDisplayNameSync(profile || null, inNet));
        })
      );

      // Build tree: creator is root
      const root: TreeNode = {
        userId: creatorId,
        name: nameMap.get(creatorId) || "You",
        timestamp: "",
        depth: 0,
        children: [],
      };

      // Map: userId -> their TreeNode
      const nodeMap = new Map<string, TreeNode>();
      nodeMap.set(creatorId, root);

      // Process forwards to build hierarchy
      let deepest = 0;
      const allRecipients = new Set<string>();

      forwards.forEach(f => {
        const forwarderId = f.forwarded_by_user_id;
        const depth = f.network_depth || 1;
        if (depth > deepest) deepest = depth;

        // Ensure forwarder node exists
        if (!nodeMap.has(forwarderId)) {
          nodeMap.set(forwarderId, {
            userId: forwarderId,
            name: nameMap.get(forwarderId) || "Someone",
            timestamp: f.created_at,
            depth: depth - 1,
            children: [],
          });
        }

        const parentNode = nodeMap.get(forwarderId)!;

        (f.forwarded_to || []).forEach((recipientId: string) => {
          allRecipients.add(recipientId);
          const childNode: TreeNode = {
            userId: recipientId,
            name: nameMap.get(recipientId) || "Someone",
            timestamp: f.created_at,
            depth,
            children: [],
          };
          nodeMap.set(recipientId, childNode);
          parentNode.children.push(childNode);
        });
      });

      // Attach forwarder nodes that aren't already in tree
      // (direct recipients of the creator who then forwarded)
      forwards.forEach(f => {
        const forwarderId = f.forwarded_by_user_id;
        if (forwarderId !== creatorId && !root.children.some(c => c.userId === forwarderId)) {
          // Check if this forwarder is a child of someone else
          let isChild = false;
          nodeMap.forEach((node, id) => {
            if (id !== forwarderId && node.children.some(c => c.userId === forwarderId)) {
              isChild = true;
            }
          });
          if (!isChild) {
            root.children.push(nodeMap.get(forwarderId)!);
          }
        }
      });

      setTree(root);
      setTotalReach(allRecipients.size);
      setMaxDepth(deepest);
    } catch (err) {
      console.error("Error loading response tree:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const renderNode = (node: TreeNode, isLast: boolean = false) => {
    const indent = node.depth * 24;

    return (
      <div key={node.userId}>
        <div
          className="flex items-center gap-2 py-1.5"
          style={{ paddingLeft: `${indent}px` }}
        >
          {node.depth > 0 && (
            <span className="text-muted-foreground text-xs">
              {isLast ? "└─" : "├─"}
            </span>
          )}
          <span className="text-sm font-medium">{node.name}</span>
          {node.timestamp && (
            <span className="text-xs text-muted-foreground">
              · {formatDistanceToNow(new Date(node.timestamp), { addSuffix: true })}
            </span>
          )}
          {node.children.length > 0 && (
            <span className="text-xs text-muted-foreground">
              → forwarded to {node.children.length}
            </span>
          )}
        </div>
        {node.children.map((child, idx) =>
          renderNode(child, idx === node.children.length - 1)
        )}
      </div>
    );
  };

  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        onClick={loadTree}
        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5"
      >
        <GitBranch className="h-3.5 w-3.5" />
        Response Tree
        {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </Button>

      {isOpen && (
        <div className="mt-2 p-3 rounded-md border bg-muted/30 text-sm">
          {isLoading ? (
            <p className="text-muted-foreground text-xs">Loading tree...</p>
          ) : tree ? (
            <div>
              {(totalReach > 0 || maxDepth > 0) && (
                <p className="text-xs text-muted-foreground mb-2">
                  Reached {totalReach} {totalReach === 1 ? "person" : "people"}
                  {maxDepth > 0 && ` · ${maxDepth} degree${maxDepth > 1 ? "s" : ""} deep`}
                </p>
              )}
              {renderNode(tree)}
              {tree.children.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  No one has forwarded this request yet.
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No forwarding data available.</p>
          )}
        </div>
      )}
    </div>
  );
}
