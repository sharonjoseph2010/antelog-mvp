import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

interface Expert {
  profile_id: string;
  full_name: string | null;
  handle: string | null;
  degree: number;
  intermediate_names: string[];
  matching_domains: string[];
}

interface Props {
  expert: Expert | null;
  requestText: string;
  onClose: () => void;
  onForward: () => void;
  queued: boolean;
}

const initialsOf = (s: string | null | undefined) =>
  (s || "?")
    .split(/\s+/)
    .map((p) => p.charAt(0).toUpperCase())
    .slice(0, 2)
    .join("") || "?";

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export default function ExpertProfileModal({ expert, requestText, onClose, onForward, queued }: Props) {
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    if (!expert) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase
      .rpc("get_safe_profile_view", { profile_id: expert.profile_id })
      .then(({ data }) => {
        if (cancelled) return;
        const row = Array.isArray(data) ? data[0] : data;
        setProfile(row || null);
      })
      .then(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [expert]);

  if (!expert) return null;
  const name = expert.full_name || (expert.handle ? `@${expert.handle}` : "Someone");
  const handle = expert.handle ? `@${expert.handle}` : null;
  const location = profile?.location || null;
  const domains: string[] = Array.isArray(profile?.expertise_domains) ? profile.expertise_domains : [];
  const cities: string[] = Array.isArray(profile?.expertise_cities) ? profile.expertise_cities : [];
  const textLower = (requestText || "").toLowerCase();
  const matchSet = new Set(expert.matching_domains.map((d) => d.toLowerCase()));
  const isMatched = (s: string) => matchSet.has(s.toLowerCase()) || (s && textLower.includes(s.toLowerCase()));

  const degreeBadge =
    expert.degree <= 1
      ? "1st"
      : expert.intermediate_names.length > 0
      ? `${ordinal(expert.degree)} · via ${expert.intermediate_names.join(" → ")}`
      : ordinal(expert.degree);

  const tagStyle = (matched: boolean): React.CSSProperties =>
    matched
      ? {
          background: "#EAF3DE",
          border: "0.5px solid #C0DD97",
          color: "#27500A",
          borderRadius: 999,
          padding: "2px 8px",
          fontSize: 11,
        }
      : {
          background: "var(--color-background-secondary)",
          border: "0.5px solid var(--color-border-tertiary)",
          color: "var(--color-text-secondary)",
          borderRadius: 999,
          padding: "2px 8px",
          fontSize: 11,
        };

  const chainNodes = [
    { label: "You", color: "var(--color-text-primary)", textColor: "var(--color-background-primary)" },
    ...expert.intermediate_names.map((nm) => ({ label: nm, color: "hsl(var(--muted))", textColor: "hsl(var(--foreground))" })),
    { label: name, color: "#97C459", textColor: "#173404" },
  ];

  return (
    <Dialog open={!!expert} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="p-0 gap-0 overflow-hidden"
        style={{ maxWidth: 360, width: "calc(100% - 32px)", borderRadius: 12 }}
      >
        {/* Header */}
        <div className="p-4 flex items-start gap-3">
          <div
            className="flex items-center justify-center shrink-0"
            style={{
              width: 40,
              height: 40,
              borderRadius: "9999px",
              background: "#97C459",
              color: "#173404",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {initialsOf(expert.full_name || expert.handle)}
          </div>
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 15, fontWeight: 500 }} className="truncate text-foreground">
              {name}
            </div>
            <div style={{ fontSize: 11 }} className="truncate text-muted-foreground">
              {[handle, location].filter(Boolean).join(" · ") || "\u00A0"}
            </div>
            <div className="mt-1.5">
              <span
                style={{
                  display: "inline-block",
                  background: "#EAF3DE",
                  border: "0.5px solid #C0DD97",
                  color: "#27500A",
                  borderRadius: 999,
                  padding: "2px 8px",
                  fontSize: 10,
                  fontWeight: 500,
                }}
              >
                {degreeBadge}
              </span>
            </div>
          </div>
        </div>

        <div className="border-t border-border" />

        <div className="max-h-[60vh] overflow-y-auto px-4 py-3 space-y-4">
          {loading && (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && (
            <>
              {domains.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Usually asked about
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {domains.map((d) => (
                      <span key={d} style={tagStyle(isMatched(d))}>
                        {d}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {cities.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Knows well
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {cities.map((c) => (
                      <span key={c} style={tagStyle(isMatched(c))}>
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  How you're connected
                </div>
                <div className="flex items-start gap-1 overflow-x-auto pb-1">
                  {chainNodes.map((node, i) => (
                    <div key={i} className="flex items-center gap-1 shrink-0">
                      <div className="flex flex-col items-center gap-1" style={{ width: 56 }}>
                        <div
                          className="flex items-center justify-center"
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: "9999px",
                            background: node.color,
                            color: node.textColor,
                            fontSize: 10,
                            fontWeight: 600,
                          }}
                        >
                          {initialsOf(node.label)}
                        </div>
                        <div
                          className="text-center truncate w-full text-foreground"
                          style={{ fontSize: 10 }}
                          title={node.label}
                        >
                          {node.label}
                        </div>
                      </div>
                      {i < chainNodes.length - 1 && (
                        <div
                          style={{ height: 1, width: 16, background: "hsl(var(--border))", marginTop: 14 }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="p-3 border-t border-border">
          <button
            type="button"
            disabled={queued}
            onClick={onForward}
            style={{
              width: "100%",
              background: "#27500A",
              color: "#EAF3DE",
              borderRadius: 8,
              padding: "10px 12px",
              fontSize: 12,
              fontWeight: 500,
              border: "none",
              cursor: queued ? "default" : "pointer",
              opacity: queued ? 0.6 : 1,
            }}
          >
            {queued ? "Queued for forward ✓" : `Forward request to ${name} →`}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}