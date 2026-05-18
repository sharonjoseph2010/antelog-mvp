import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { GitBranch, ChevronDown, ChevronRight } from "lucide-react";

interface TreeRow {
  link_id: string;
  parent_link_id: string | null;
  depth: number;
  person_name: string;
  is_antelog_user: boolean;
  has_responded: boolean;
  recommendation_count: number;
  forwarded_to_count: number;
  is_root: boolean;
}

interface ResponseTreeProps {
  requestId: string;
  creatorId: string;
  viewerId: string;
}

type NodeStatus = "responded" | "forwarded" | "none";

function getNodeStatus(node: TreeRow): NodeStatus {
  if (node.has_responded) return "responded";
  if (node.forwarded_to_count > 0) return "forwarded";
  return "none";
}

export function ResponseTree({ requestId }: ResponseTreeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [rows, setRows] = useState<TreeRow[] | null>(null);
  const [showAll, setShowAll] = useState(true);

  const toggle = async () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next && !rows) {
      setIsLoading(true);
      try {
        const { data, error } = await supabase.rpc("get_response_tree", {
          p_request_id: requestId,
        });
        if (error) throw error;
        setRows((data as unknown as TreeRow[]) || []);
      } catch (e) {
        console.error("get_response_tree failed", e);
        setRows([]);
      } finally {
        setIsLoading(false);
      }
    }
    if (next) {
      setTimeout(() => {
        document
          .getElementById("response-tree-section")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={toggle}
        className="flex items-center gap-2"
      >
        <GitBranch className="h-4 w-4" />
        Response Tree
        {isOpen ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
      </Button>

      {isOpen && (
        <ResponseTreeSection
          rows={rows}
          isLoading={isLoading}
          showAll={showAll}
          setShowAll={setShowAll}
        />
      )}
    </>
  );
}

function ResponseTreeSection({
  rows,
  isLoading,
  showAll,
  setShowAll,
}: {
  rows: TreeRow[] | null;
  isLoading: boolean;
  showAll: boolean;
  setShowAll: (v: boolean) => void;
}) {
  if (isLoading) {
    return (
      <section
        id="response-tree-section"
        className="basis-full mt-6 text-sm text-muted-foreground"
      >
        Loading response tree…
      </section>
    );
  }
  if (!rows || rows.length === 0) {
    return (
      <section
        id="response-tree-section"
        className="basis-full mt-6 text-sm text-muted-foreground"
      >
        No activity yet.
      </section>
    );
  }

  const respondedCount = rows.filter((r) => r.has_responded && !r.is_root).length;
  const forwardCount = rows.filter((r) => r.forwarded_to_count > 0).length;
  const maxDepth = rows.reduce((m, r) => Math.max(m, r.depth), 0);

  const visible = showAll
    ? rows
    : rows.filter((r) => r.is_root || r.has_responded);

  return (
    <section id="response-tree-section" className="basis-full mt-6">
      <header className="mb-4">
        <h3 className="text-base font-medium m-0">Response tree</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {respondedCount} responded · {forwardCount} forwards · {maxDepth}{" "}
          {maxDepth === 1 ? "degree" : "degrees"} deep
        </p>
      </header>

      {/* Legend row 1 — avatar colors */}
      <div className="flex gap-4 mb-2 text-xs text-muted-foreground flex-wrap">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-blue-100 dark:bg-blue-900/50" />
          Antelog user
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-muted border border-border" />
          Guest
        </span>
      </div>

      {/* Legend row 2 — status pips */}
      <div className="flex gap-4 pt-2 border-t border-dashed border-border text-xs text-muted-foreground flex-wrap">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-[7px] h-[7px] rounded-full bg-emerald-600 dark:bg-emerald-400" />
          Responded
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-[7px] h-[7px] rounded-full bg-amber-600 dark:bg-amber-400" />
          Forwarded, didn't respond
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-[7px] h-[7px] rounded-full border border-border bg-transparent" />
          No response yet
        </span>
      </div>

      {/* Toggle row */}
      <div className="py-3 my-3.5 border-t border-b border-border">
        <label className="text-sm cursor-pointer inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
          />
          Show everyone, including non-responders
        </label>
      </div>

      {/* Tree */}
      <div>
        {visible.map((node) => (
          <TreeNodeRow key={node.link_id} node={node} />
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground mt-4 italic">
        Shows everyone who opened the link. People who saw it on WhatsApp but
        never clicked aren't tracked.
      </p>
    </section>
  );
}

function TreeNodeRow({ node }: { node: TreeRow }) {
  const status = getNodeStatus(node);
  const isMuted = status === "none";

  return (
    <div
      className="flex items-center gap-3 py-2"
      style={{ paddingLeft: `${node.depth * 22}px` }}
    >
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-medium flex-shrink-0 ${
          node.is_antelog_user
            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {node.person_name.charAt(0).toUpperCase()}
      </div>

      {/* Status pip */}
      <span
        title={
          status === "responded"
            ? "Submitted picks"
            : status === "forwarded"
            ? "Forwarded, didn't respond"
            : "No response yet"
        }
        className={`w-[7px] h-[7px] rounded-full flex-shrink-0 ${
          status === "responded"
            ? "bg-emerald-600 dark:bg-emerald-400"
            : status === "forwarded"
            ? "bg-amber-600 dark:bg-amber-400"
            : "border border-border bg-transparent"
        }`}
      />

      {/* Name */}
      <span
        className={`text-sm font-medium ${
          isMuted ? "text-muted-foreground" : "text-foreground"
        }`}
      >
        {node.person_name}
      </span>

      {/* Meta */}
      <span className="text-xs text-muted-foreground">
        {node.is_root && "· asked the question"}
        {!node.is_root &&
          node.has_responded &&
          ` · submitted ${node.recommendation_count} ${
            node.recommendation_count === 1 ? "pick" : "picks"
          }`}
        {!node.is_root &&
          !node.has_responded &&
          status === "forwarded" &&
          " · forwarded, didn't respond"}
        {!node.is_root &&
          !node.has_responded &&
          status === "none" &&
          " · no response yet"}
        {node.forwarded_to_count > 0 &&
          ` · forwarded to ${node.forwarded_to_count}`}
      </span>
    </div>
  );
}
