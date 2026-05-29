import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck, MapPin, Briefcase, Pencil, Lock } from "lucide-react";

interface SafeProfile {
  id: string;
  full_name: string | null;
  handle: string | null;
  is_verified: boolean | null;
  phone_number: string | null;
  location: string | null;
  occupation: string | null;
  bio: string | null;
  interests: any;
  expertise_domains: any;
  expertise_cities: any;
  relationship: "self" | "first_degree" | "second_degree" | "public";
}

const toArray = (v: any): string[] =>
  Array.isArray(v) ? v.map(String) : [];

// Profile tag styling is decorative metadata, not a semantic signal. Stay neutral.
const expertiseChip = "border border-border bg-secondary text-secondary-foreground";
const interestChip = "border border-border bg-secondary text-secondary-foreground";

const relationshipLabel: Record<string, string> = {
  first_degree: "Friend",
  second_degree: "Friend of a friend",
};

interface PublicProfileProps {
  userIdOverride?: string;
  embedded?: boolean;
}

const PublicProfile = ({ userIdOverride, embedded = false }: PublicProfileProps = {}) => {
  const params = useParams<{ userId: string }>();
  const userId = userIdOverride ?? params.userId;
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<SafeProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (!embedded) navigate("/login");
          return;
        }
        if (cancelled) return;
        setViewerId(user.id);

        // Self → redirect to /profile
        if (userId && userId === user.id) {
          if (!embedded) {
            navigate("/profile", { replace: true });
            return;
          }
        }

        const { data, error } = await supabase.rpc("get_safe_profile_view", {
          profile_id: userId,
        });
        if (cancelled) return;
        if (error) {
          setError(error.message);
          return;
        }
        const row = Array.isArray(data) ? data[0] : data;
        if (!row) {
          setError("Profile not found");
          return;
        }
        setProfile(row as SafeProfile);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load profile");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    if (userId) load();
    return () => { cancelled = true; };
  }, [userId, navigate, embedded]);

  if (loading) {
    return (
      <div className={`${embedded ? "py-16" : "min-h-screen"} flex items-center justify-center`}>
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <main className={embedded ? "px-4 py-6" : "container mx-auto px-4 py-8 max-w-2xl"}>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">{error ?? "Profile unavailable"}</p>
            {!embedded && (
              <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>Go back</Button>
            )}
          </CardContent>
        </Card>
      </main>
    );
  }

  const displayName = profile.full_name || (profile.handle ? `@${profile.handle}` : "Someone");
  const isOutOfNetwork = profile.relationship === "public";
  const isSelf = profile.relationship === "self";
  const expertise = toArray(profile.expertise_domains);
  const interests = toArray(profile.interests);
  const cities = toArray(profile.expertise_cities);
  const ctxLabel = relationshipLabel[profile.relationship];

  return (
    <>
      {!embedded && <Helmet>
        <title>{displayName} | Antelog</title>
        <meta name="description" content={`View ${displayName}'s profile on Antelog`} />
      </Helmet>}

      <main className={embedded ? "px-4 py-4" : "container mx-auto px-4 py-8 max-w-2xl"}>
        <Card>
          <CardContent className="p-6 space-y-6">
            {/* 1. Connection context bar */}
            {ctxLabel && (
              <div className="flex items-center gap-3 flex-wrap">
                <Badge variant="secondary" className="text-xs font-normal text-muted-foreground">
                  {ctxLabel}
                </Badge>
              </div>
            )}

            {isOutOfNetwork ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold">
                    {profile.handle ? `@${profile.handle}` : "Someone"}
                  </h1>
                  {profile.is_verified && (
                    <ShieldCheck className="h-5 w-5 text-primary" aria-label="Verified" />
                  )}
                </div>
                <div className="flex items-start gap-3 rounded-md border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
                  <Lock className="h-4 w-4 mt-0.5 shrink-0" />
                  <p>
                    This profile is only visible to people in @{profile.handle}'s network.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* 2. Identity row */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-2xl font-bold leading-tight">{profile.full_name || "Unnamed"}</h1>
                    {profile.is_verified && (
                      <ShieldCheck className="h-5 w-5 text-primary" aria-label="Verified" />
                    )}
                  </div>
                  {profile.handle && (
                    <p className="text-sm text-muted-foreground">@{profile.handle}</p>
                  )}
                  {profile.location && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5 pt-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {profile.location}
                    </p>
                  )}
                </div>

                {/* 3. Occupation + Bio */}
                {(profile.occupation || profile.bio) && (
                  <div className="space-y-2">
                    {profile.occupation && (
                      <p className="text-sm flex items-center gap-1.5">
                        <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                        {profile.occupation}
                      </p>
                    )}
                    {profile.bio && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{profile.bio}</p>
                    )}
                  </div>
                )}

                {/* 4. Expertise */}
                {(expertise.length > 0 || cities.length > 0) && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Usually asked about
                    </p>
                    {expertise.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {expertise.map((tag) => (
                          <span
                            key={tag}
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs ${expertiseChip}`}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    {cities.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Knows well: {cities.join(", ")}
                      </p>
                    )}
                  </div>
                )}

                {/* 5. Interests */}
                {interests.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Always looking for
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {interests.map((tag) => (
                        <span
                          key={tag}
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs ${interestChip}`}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Self edit */}
                {isSelf && (
                  <div>
                    <Button variant="outline" size="sm" asChild>
                      <Link to="/profile">
                        <Pencil className="mr-2 h-4 w-4" /> Edit Profile
                      </Link>
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* 6. Contributions placeholder */}
        {!isOutOfNetwork && (
          <Card className="mt-6 opacity-60">
            <CardHeader>
              <CardTitle className="text-base text-muted-foreground">Contributions</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Coming soon — see what {profile.full_name || "this person"} has recommended
              </p>
            </CardContent>
          </Card>
        )}
      </main>
    </>
  );
};

export default PublicProfile;