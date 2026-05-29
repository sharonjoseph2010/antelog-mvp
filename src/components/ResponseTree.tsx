import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { GitBranch, ChevronDown, ChevronRight } from "lucide-react";

interface TreeRow {
  node_id: string;
  parent_node_id: string | null;
  person_name: string;
  is_antelog_user: boolean;
  is_root: boolean;
  has_responded: boolean;
  has_forwarded: boolean;
  recommendation_count: number;
  forwarded_to_count: number;
  earliest_action_at: string | null;
}

interface OrderedNode extends TreeRow {
  depth: number;
}

interface ResponseTreeProps {
  requestId: string;
  creatorId: string;
  viewerId: string;
}

type NodeStatus = "responded" | "forwarded" | "none";
type FilterMode = "all" | "antelog" | "guests";

function getNodeStatus(n: TreeRow): NodeStatus {
  if (n.has_responded) return "responded";
  if (n.has_forwarded || n.forwarded_to_count > 0) return "forwarded";
  return "none";
}

function buildTree(rows: TreeRow[]) {
  const byParent = new Map<string, TreeRow[]>();
  let root: TreeRow | null = null;
  for (const row of rows) {
    if (row.is_root) {
      root = row;
    } else if (row.parent_node_id) {
      if (!byParent.has(row.parent_node_id)) byParent.set(row.parent_node_id, []);
      byParent.get(row.parent_node_id)!.push(row);
    }
  }
  for (const children of byParent.values()) {
    children.sort((a, b) => {
      if (a.has_responded && !b.has_responded) return -1;
      if (!a.has_responded && b.has_responded) return 1;
      if (a.has_responded && b.has_responded) {
        const ta = a.earliest_action_at ? new Date(a.earliest_action_at).getTime() : 0;
        const tb = b.earliest_action_at ? new Date(b.earliest_action_at).getTime() : 0;
        return ta - tb;
      }
      return a.person_name.localeCompare(b.person_name);
    });
  }
  return { byParent, root };
}

function flattenDFS(
  rows: TreeRow[],
  keep: (n: TreeRow) => boolean
): OrderedNode[] {
  const { byParent, root } = buildTree(rows);
  const ordered: OrderedNode[] = [];
  function walk(node: TreeRow, depth: number) {
    const visible = keep(node);
    if (visible) ordered.push({ ...node, depth });
    const nextDepth = visible ? depth + 1 : depth;
    const kids = byParent.get(node.node_id) || [];
    for (const k of kids) walk(k, nextDepth);
  }
  if (root) walk(root, 0);
  return ordered;
}

export function ResponseTree({ requestId }: ResponseTreeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [rows, setRows] = useState<TreeRow[] | null>(null);

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
        document.getElementById("response-tree-section")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 50);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={toggle} className="flex items-center gap-2">
        <GitBranch className="h-4 w-4" />
        Response Tree
        {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </Button>
      {isOpen && <TreeSection rows={rows} isLoading={isLoading} />}
    </>
  );
}

function TreeSection({ rows, isLoading }: { rows: TreeRow[] | null; isLoading: boolean }) {
  const [filter, setFilter] = useState<FilterMode>("all");
  const [showAll, setShowAll] = useState(true);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const avatarRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const safeRows = rows || [];

  const keep = useCallback(
    (n: TreeRow): boolean => {
      if (n.is_root) return true;
      if (!showAll && !n.has_responded) return false;
      if (filter === "antelog") return n.is_antelog_user;
      if (filter === "guests") return !n.is_antelog_user;
      return true;
    },
    [filter, showAll]
  );

  const ordered = useMemo(() => flattenDFS(safeRows, keep), [safeRows, keep]);
  const visibleIds = useMemo(() => new Set(ordered.map((n) => n.node_id)), [ordered]);

  // Stats (computed from all rows, not filtered)
  const stats = useMemo(() => {
    const nonRoot = safeRows.filter((r) => !r.is_root);
    const responded = nonRoot.filter((r) => r.has_responded);
    const antelogResp = responded.filter((r) => r.is_antelog_user).length;
    const guestResp = responded.filter((r) => !r.is_antelog_user).length;
    const forwards = safeRows.filter((r) => r.forwarded_to_count > 0).length;
    let maxDepth = 0;
    const { byParent, root } = buildTree(safeRows);
    function walk(n: TreeRow, d: number) {
      maxDepth = Math.max(maxDepth, d);
      const kids = byParent.get(n.node_id) || [];
      for (const k of kids) walk(k, d + 1);
    }
    if (root) walk(root, 0);
    return { responded: responded.length, antelogResp, guestResp, forwards, maxDepth };
  }, [safeRows]);

  // Lineage of active node
  const activeId = selected || hovered;
  const lineageSet = useMemo<Set<string> | null>(() => {
    if (!activeId || !visibleIds.has(activeId)) return null;
    const result = new Set<string>();
    const orderedMap = new Map(ordered.map((n) => [n.node_id, n]));
    // Ancestors (via ordered parents)
    let cur: string | null = activeId;
    while (cur) {
      result.add(cur);
      const node = orderedMap.get(cur);
      cur = node?.parent_node_id && orderedMap.has(node.parent_node_id) ? node.parent_node_id : null;
    }
    // Descendants
    const childMap = new Map<string, string[]>();
    for (const n of ordered) {
      if (n.parent_node_id && orderedMap.has(n.parent_node_id)) {
        if (!childMap.has(n.parent_node_id)) childMap.set(n.parent_node_id, []);
        childMap.get(n.parent_node_id)!.push(n.node_id);
      }
    }
    function walk(nid: string) {
      result.add(nid);
      for (const c of childMap.get(nid) || []) walk(c);
    }
    walk(activeId);
    return result;
  }, [activeId, ordered, visibleIds]);

  // Draw connector lines
  const drawLines = useCallback(() => {
    const wrap = wrapRef.current;
    const svg = svgRef.current;
    if (!wrap || !svg) return;
    const wrapRect = wrap.getBoundingClientRect();
    svg.setAttribute("viewBox", `0 0 ${wrapRect.width} ${wrapRect.height}`);
    svg.setAttribute("width", String(wrapRect.width));
    svg.setAttribute("height", String(wrapRect.height));
    // Clear
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    for (const node of ordered) {
      if (!node.parent_node_id || node.is_root) continue;
      if (!visibleIds.has(node.parent_node_id)) continue;
      const parentEl = avatarRefs.current[node.parent_node_id];
      const childEl = avatarRefs.current[node.node_id];
      if (!parentEl || !childEl) continue;
      const pr = parentEl.getBoundingClientRect();
      const cr = childEl.getBoundingClientRect();
      const startX = pr.left - wrapRect.left + pr.width / 2;
      const startY = pr.bottom - wrapRect.top;
      const endX = cr.left - wrapRect.left;
      const endY = cr.top - wrapRect.top + cr.height / 2;
      const d = `M ${startX} ${startY} L ${startX} ${endY} L ${endX} ${endY}`;

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      path.setAttribute("data-from", node.parent_node_id);
      path.setAttribute("data-to", node.node_id);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke-width", "2");
      path.setAttribute("stroke-linecap", "square");
      path.setAttribute("stroke-linejoin", "round");
      const isDark =
        typeof document !== "undefined" &&
        document.documentElement.classList.contains("dark");
      path.setAttribute(
        "stroke",
        node.has_responded
          ? isDark
            ? "rgb(52 211 153)" // emerald-400
            : "rgb(5 150 105)"  // emerald-600
          : "hsl(var(--border))"
      );
      path.style.transition = "opacity 0.2s, stroke-width 0.2s";

      if (lineageSet) {
        const inLineage =
          lineageSet.has(node.parent_node_id) && lineageSet.has(node.node_id);
        path.style.opacity = inLineage ? "1" : "0.18";
        path.setAttribute("stroke-width", inLineage ? "3" : "2");
      }
      svg.appendChild(path);
    }
  }, [ordered, visibleIds, lineageSet]);

  // Redraw on changes / resize / fonts
  useEffect(() => {
    drawLines();
  }, [drawLines]);

  useEffect(() => {
    const handler = () => drawLines();
    window.addEventListener("resize", handler);
    let ro: ResizeObserver | null = null;
    if (wrapRef.current && "ResizeObserver" in window) {
      ro = new ResizeObserver(handler);
      ro.observe(wrapRef.current);
    }
    if (typeof document !== "undefined" && (document as any).fonts?.ready) {
      (document as any).fonts.ready.then(() => drawLines());
    }
    return () => {
      window.removeEventListener("resize", handler);
      ro?.disconnect();
    };
  }, [drawLines]);

  // Click outside to deselect
  useEffect(() => {
    if (!selected) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setSelected(null);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [selected]);

  if (isLoading) {
    return (
      <section id="response-tree-section" className="basis-full mt-6 text-sm text-muted-foreground">
        Loading response tree…
      </section>
    );
  }
  if (!rows || rows.length === 0) {
    return (
      <section id="response-tree-section" className="basis-full mt-6 text-sm text-muted-foreground">
        No activity yet.
      </section>
    );
  }

  return (
    <section id="response-tree-section" className="basis-full mt-6">
      <div className="max-w-[720px] mx-auto">
        <header className="mb-4">
          <h3 className="text-base font-medium m-0">Response tree</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {stats.responded} responded ({stats.antelogResp} Antelog ·{" "}
            {stats.guestResp} {stats.guestResp === 1 ? "guest" : "guests"}) ·{" "}
            {stats.forwards} forwards · {stats.maxDepth}{" "}
            {stats.maxDepth === 1 ? "degree" : "degrees"} deep
          </p>
        </header>

        {/* Filter segmented control */}
        <div className="inline-flex rounded-md border border-border overflow-hidden mb-3">
          {(["all", "antelog", "guests"] as const).map((m, i) => (
            <button
              key={m}
              type="button"
              onClick={() => setFilter(m)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                i > 0 ? "border-l border-border" : ""
              } ${
                filter === m
                  ? "bg-primary text-primary-foreground"
                  : "bg-transparent text-muted-foreground hover:bg-muted"
              }`}
            >
              {m === "all" ? "All" : m === "antelog" ? "Antelog" : "Guests"}
            </button>
          ))}
        </div>
        {selected && (
          <div className="mb-3">
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-[11px] underline bg-transparent border-0 cursor-pointer p-0"
              style={{ color: "var(--color-text-info)" }}
            >
              Reset view
            </button>
          </div>
        )}

        {/* Legend rows */}
        <div className="flex gap-4 mb-2 text-xs text-muted-foreground flex-wrap">
          <span className="inline-flex items-center gap-1.5">
            <span className="info-surface px-1.5 py-px rounded-full text-[9px] font-semibold uppercase tracking-wider">
              Antelog
            </span>
            Verified user
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="px-1.5 py-px rounded-full text-[9px] font-semibold uppercase tracking-wider bg-muted text-muted-foreground">
              Guest
            </span>
            Not on Antelog
          </span>
        </div>

        <div className="flex gap-4 pt-2 border-t border-dashed border-border text-xs text-muted-foreground flex-wrap">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-[7px] h-[7px] rounded-full" style={{ background: 'hsl(var(--info-fg))' }} />
            Responded
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-[7px] h-[7px] rounded-full" style={{ background: 'hsl(var(--attention-fg))' }} />
            Forwarded, didn't respond
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-[7px] h-[7px] rounded-full border border-border bg-transparent" />
            No response yet
          </span>
        </div>

        <div className="flex gap-4 pt-2 mt-2 border-t border-dashed border-border text-xs text-muted-foreground flex-wrap">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-5 h-[2px] rounded-sm" style={{ background: 'hsl(var(--info-fg))' }} />
            Connection led to a response
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-5 h-[2px] rounded-sm bg-border" />
            Connection led nowhere yet
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
        <div ref={wrapRef} className="relative">
          <svg
            ref={svgRef}
            className="absolute top-0 left-0 pointer-events-none"
            style={{ width: "100%", height: "100%", zIndex: 1 }}
          />
          <div className="relative" style={{ zIndex: 2 }}>
            {ordered.map((node) => {
              const dimmed = lineageSet ? !lineageSet.has(node.node_id) : false;
              const isSelected = selected === node.node_id;
              return (
                <NodeRow
                  key={node.node_id}
                  node={node}
                  dimmed={dimmed}
                  isSelected={isSelected}
                  onHover={(id) => !selected && setHovered(id)}
                  onClick={() =>
                    setSelected(selected === node.node_id ? null : node.node_id)
                  }
                  registerAvatar={(el) => {
                    avatarRefs.current[node.node_id] = el;
                  }}
                />
              );
            })}
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground mt-4 italic">
          Shows everyone who opened the link. People who saw it on WhatsApp but
          never clicked aren't tracked.
        </p>
      </div>
    </section>
  );
}

function NodeRow({
  node,
  dimmed,
  isSelected,
  onHover,
  onClick,
  registerAvatar,
}: {
  node: OrderedNode;
  dimmed: boolean;
  isSelected: boolean;
  onHover: (id: string | null) => void;
  onClick: () => void;
  registerAvatar: (el: HTMLDivElement | null) => void;
}) {
  const status = getNodeStatus(node);
  const isMuted = status === "none";

  return (
    <div
      className={`flex items-center gap-2.5 py-2.5 cursor-pointer transition-opacity ${
        isSelected ? "" : ""
      }`}
      style={{
        paddingLeft: `${node.depth * 40}px`,
        opacity: dimmed ? 0.3 : 1,
      }}
      onMouseEnter={() => onHover(node.node_id)}
      onMouseLeave={() => onHover(null)}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <div
        ref={registerAvatar}
        className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-medium flex-shrink-0 bg-muted text-muted-foreground"
      >
        {node.person_name.charAt(0).toUpperCase()}
      </div>
      <span
        className={`w-[7px] h-[7px] rounded-full flex-shrink-0 ${
          status === "responded" || status === "forwarded" ? "" : "border border-border bg-transparent"
        }`}
        style={
          status === "responded"
            ? { background: 'hsl(var(--info-fg))' }
            : status === "forwarded"
            ? { background: 'hsl(var(--attention-fg))' }
            : undefined
        }
      />
      <span
        className={`text-sm font-medium ${
          isMuted ? "text-muted-foreground" : "text-foreground"
        }`}
      >
        {node.person_name}
      </span>
      <span
        className={`inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-semibold uppercase tracking-wider flex-shrink-0 ${
          node.is_antelog_user ? "info-surface" : "bg-muted text-muted-foreground"
        }`}
      >
        {node.is_antelog_user ? "Antelog" : "Guest"}
      </span>
      <span className="text-xs text-muted-foreground">
        {node.is_root && "· asked the question"}
        {!node.is_root && node.has_responded &&
          ` · submitted ${node.recommendation_count} ${
            node.recommendation_count === 1 ? "pick" : "picks"
          }`}
        {!node.is_root && !node.has_responded && status === "forwarded" &&
          " · forwarded, didn't respond"}
        {!node.is_root && !node.has_responded && status === "none" &&
          " · no response yet"}
        {node.forwarded_to_count > 0 && ` · forwarded to ${node.forwarded_to_count}`}
      </span>
    </div>
  );
}
