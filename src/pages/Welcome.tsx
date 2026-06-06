import { useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { X, Award, Compass } from "lucide-react";

const TOPIC_OPTIONS = [
  "Food & Cafes",
  "Travel & Hotels",
  "Electronics & Gadgets",
  "Fashion & Clothing",
  "Fitness & Health",
  "Books & Media",
  "Home & Appliances",
  "Finance & Banking",
  "Beauty & Skincare",
  "Parenting",
  "Pets",
  "Sports",
  "Cars & Bikes",
  "Education",
  "Real Estate",
];

const CITY_SUGGESTIONS = [
  "Bengaluru",
  "Mumbai",
  "Delhi",
  "Hyderabad",
  "Chennai",
  "Kolkata",
  "Pune",
  "Ahmedabad",
  "Jaipur",
  "Goa",
];

const TOTAL_STEPS = 4;

const Welcome = () => {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);

  // Step 1
  const [fullName, setFullName] = useState("");
  const [city, setCity] = useState("");
  const [expertiseCities, setExpertiseCities] = useState<string[]>([]);
  const [cityInput, setCityInput] = useState("");
  const [cityOpen, setCityOpen] = useState(false);
  const [expCityOpen, setExpCityOpen] = useState(false);
  const cityWrapRef = useRef<HTMLDivElement>(null);
  const expCityWrapRef = useRef<HTMLDivElement>(null);

  // Step 2
  const [occupation, setOccupation] = useState("");
  const [bio, setBio] = useState("");

  // Step 3 — combined expertise + interests
  const [expertiseDomains, setExpertiseDomains] = useState<string[]>([]);
  const [expertiseOtherInput, setExpertiseOtherInput] = useState("");
  const [expertiseCustom, setExpertiseCustom] = useState<string[]>([]);

  const [interests, setInterests] = useState<string[]>([]);
  const [interestsOtherInput, setInterestsOtherInput] = useState("");
  const [interestsCustom, setInterestsCustom] = useState<string[]>([]);
  const [topicTab, setTopicTab] = useState<"expertise" | "interest">("expertise");

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (cityWrapRef.current && !cityWrapRef.current.contains(e.target as Node)) setCityOpen(false);
      if (expCityWrapRef.current && !expCityWrapRef.current.contains(e.target as Node)) setExpCityOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const filterCities = (q: string) => {
    const v = q.trim().toLowerCase();
    if (!v) return CITY_SUGGESTIONS;
    return CITY_SUGGESTIONS.filter((c) => c.toLowerCase().includes(v));
  };

  const CityDropdown = ({ query, onPick }: { query: string; onPick: (v: string) => void }) => {
    const matches = filterCities(query);
    if (matches.length === 0) return null;
    return (
      <ul className="absolute left-0 right-0 top-full mt-1 max-h-56 overflow-auto bg-slate-800 border border-slate-700 rounded-md shadow-lg z-50">
        {matches.map((c) => (
          <li
            key={c}
            onMouseDown={(e) => { e.preventDefault(); onPick(c); }}
            className="px-3 py-2 text-sm text-white hover:bg-slate-700 cursor-pointer"
          >
            {c}
          </li>
        ))}
      </ul>
    );
  };

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        navigate("/login", { replace: true });
        return;
      }
      setUserId(session.user.id);
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, location, occupation, bio, expertise_cities, expertise_domains, interests, questionnaire_completed")
        .eq("id", session.user.id)
        .maybeSingle();

      if (profile?.questionnaire_completed) {
        navigate("/dashboard", { replace: true });
        return;
      }
      if (profile) {
        setFullName(profile.full_name || "");
        setCity(profile.location || "");
        setOccupation(profile.occupation || "");
        setBio(profile.bio || "");
        setExpertiseCities(Array.isArray(profile.expertise_cities) ? (profile.expertise_cities as any[]).map(String) : []);
        const exp = Array.isArray(profile.expertise_domains) ? (profile.expertise_domains as any[]).map(String) : [];
        setExpertiseDomains(exp.filter((t) => TOPIC_OPTIONS.includes(t)));
        setExpertiseCustom(exp.filter((t) => !TOPIC_OPTIONS.includes(t)));
        const intr = Array.isArray(profile.interests) ? (profile.interests as any[]).map(String) : [];
        setInterests(intr.filter((t) => TOPIC_OPTIONS.includes(t)));
        setInterestsCustom(intr.filter((t) => !TOPIC_OPTIONS.includes(t)));
      }
      setLoading(false);
    })();
  }, [navigate]);

  const progress = useMemo(() => (step / TOTAL_STEPS) * 100, [step]);

  const addExpertiseCity = (val: string) => {
    const v = val.trim();
    if (!v || expertiseCities.includes(v)) return;
    setExpertiseCities([...expertiseCities, v]);
    setCityInput("");
  };
  const removeExpertiseCity = (v: string) => setExpertiseCities(expertiseCities.filter((c) => c !== v));

  const addCustom = (val: string, list: string[], setList: (v: string[]) => void, setInput: (v: string) => void) => {
    const v = val.trim();
    if (!v || list.includes(v)) { setInput(""); return; }
    setList([...list, v]);
    setInput("");
  };

  const toggle = (arr: string[], setArr: (v: string[]) => void, val: string) => {
    if (arr.includes(val)) setArr(arr.filter((v) => v !== val));
    else setArr([...arr, val]);
  };

  const finalExpertise = useMemo(() => [...expertiseDomains, ...expertiseCustom], [expertiseDomains, expertiseCustom]);
  const finalInterests = useMemo(() => [...interests, ...interestsCustom], [interests, interestsCustom]);

  const canNext = () => {
    if (step === 1) return fullName.trim().length > 0 && city.trim().length > 0;
    if (step === 2) return occupation.trim().length > 0;
    if (step === 3) return finalExpertise.length > 0 && finalInterests.length > 0;
    return true;
  };

  const handleNext = () => {
    if (!canNext()) {
      toast({ title: "Please fill in the required fields", variant: "destructive" });
      return;
    }
    setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  };

  const handleBack = () => setStep((s) => Math.max(1, s - 1));

  const handleFinish = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          location: city.trim(),
          occupation: occupation.trim(),
          bio: bio.trim() || null,
          expertise_cities: expertiseCities as any,
          expertise_domains: finalExpertise as any,
          interests: finalInterests as any,
          questionnaire_completed: true,
          questionnaire_completed_at: new Date().toISOString(),
        })
        .eq("id", userId);
      if (error) throw error;
      toast({ title: "All set!", description: "Welcome to Antelog." });
      navigate("/dashboard", { replace: true });
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message || "Please try again", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }

  const renderTopicColumn = (
    title: string,
    subtitle: string,
    selected: string[],
    setSelected: (v: string[]) => void,
    customs: string[],
    setCustoms: (v: string[]) => void,
    customInput: string,
    setCustomInput: (v: string) => void,
    inputId: string,
    variant: "expertise" | "interest",
  ) => {
    const Icon = variant === "expertise" ? Award : Compass;
    const microLabel = variant === "expertise" ? "You know this well" : "You want to explore this";
    // Topic category styling is decorative — no semantic colour. Stay neutral.
    const activeChip = "border-foreground bg-foreground text-background hover:opacity-90";
    const accentText = "text-muted-foreground";
    return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${accentText}`} />
          <h3 className="font-semibold">{title}</h3>
        </div>
        <p className={`text-xs font-medium ${accentText}`}>{microLabel}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {TOPIC_OPTIONS.map((t) => {
          const active = selected.includes(t);
          return (
            <button
              key={t}
              type="button"
              onClick={() => toggle(selected, setSelected, t)}
              className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${active ? activeChip : "bg-background border-input text-foreground hover:bg-accent"}`}
            >
              {t}
            </button>
          );
        })}
      </div>
      <div className="space-y-2 pt-1">
        <Label htmlFor={inputId}>Other</Label>
        <div className="flex gap-2">
          <Input
            id={inputId}
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom(customInput, customs, setCustoms, setCustomInput);
              }
            }}
            placeholder="Type a topic and press Enter"
          />
          <Button type="button" variant="outline" onClick={() => addCustom(customInput, customs, setCustoms, setCustomInput)}>Add</Button>
        </div>
        {customs.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {customs.map((c) => (
              <Badge
                key={c}
                className="gap-1 bg-secondary text-secondary-foreground border border-border hover:bg-secondary/80"
              >
                {c}
                <button onClick={() => setCustoms(customs.filter((x) => x !== c))} aria-label={`Remove ${c}`}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
    );
  };

  return (
    <>
      <Helmet>
        <title>Welcome | Antelog</title>
        <meta name="description" content="Tell us a bit about yourself to get the most out of Antelog." />
      </Helmet>
      <div className="min-h-screen bg-background py-10 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2 text-sm text-muted-foreground">
              <span>Step {step} of {TOTAL_STEPS}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">
                {step === 1 && "Your name & location"}
                {step === 2 && "What do you do?"}
                {step === 3 && "Your expertise & interests"}
                {step === 4 && "You're all set"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {step === 1 && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Full name</Label>
                    <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" />
                  </div>
                  <div className="space-y-2 relative" ref={cityWrapRef}>
                    <Label htmlFor="city">City you're based in</Label>
                    <div className="relative">
                      <Input
                        id="city"
                        value={city}
                        onChange={(e) => { setCity(e.target.value); setCityOpen(true); }}
                        onFocus={() => setCityOpen(true)}
                        onKeyDown={(e) => { if (e.key === "Escape") setCityOpen(false); }}
                        placeholder="e.g. Bengaluru"
                        autoComplete="off"
                      />
                      {cityOpen && (
                        <CityDropdown query={city} onPick={(v) => { setCity(v); setCityOpen(false); }} />
                      )}
                    </div>
                  </div>
                  <div className="space-y-2 relative" ref={expCityWrapRef}>
                    <Label>Cities you know well</Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          value={cityInput}
                          onChange={(e) => { setCityInput(e.target.value); setExpCityOpen(true); }}
                          onFocus={() => setExpCityOpen(true)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addExpertiseCity(cityInput);
                              setExpCityOpen(false);
                            } else if (e.key === "Escape") {
                              setExpCityOpen(false);
                            }
                          }}
                          placeholder="Type a city and press Enter"
                          autoComplete="off"
                        />
                        {expCityOpen && (
                          <CityDropdown
                            query={cityInput}
                            onPick={(v) => { addExpertiseCity(v); setExpCityOpen(false); }}
                          />
                        )}
                      </div>
                      <Button type="button" variant="outline" onClick={() => addExpertiseCity(cityInput)}>Add</Button>
                    </div>
                    {expertiseCities.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-2">
                        {expertiseCities.map((c) => (
                          <Badge key={c} variant="secondary" className="gap-1">
                            {c}
                            <button onClick={() => removeExpertiseCity(c)} aria-label={`Remove ${c}`}>
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="occupation">Occupation</Label>
                    <Input id="occupation" value={occupation} onChange={(e) => setOccupation(e.target.value)} placeholder="e.g. Software Engineer, Chef, Architect" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bio">One line about yourself</Label>
                    <Textarea
                      id="bio"
                      value={bio}
                      onChange={(e) => setBio(e.target.value.slice(0, 120))}
                      placeholder="A short line about you"
                      maxLength={120}
                    />
                    <div className="text-xs text-muted-foreground text-right">{bio.length}/120</div>
                  </div>
                </>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  <Tabs value={topicTab} onValueChange={(v) => setTopicTab(v as "expertise" | "interest")}>
                    <TabsList className="w-full grid grid-cols-2 bg-transparent p-0 h-auto border-b border-border rounded-none">
                      <TabsTrigger
                        value="expertise"
                        className="rounded-none border-b-2 border-transparent bg-transparent text-muted-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-foreground data-[state=active]:text-foreground gap-2 py-3"
                      >
                        <Award className="h-4 w-4" />
                        Expert in
                        {expertiseDomains.length + expertiseCustom.length > 0 && (
                          <span className="text-xs opacity-80">({expertiseDomains.length + expertiseCustom.length})</span>
                        )}
                      </TabsTrigger>
                      <TabsTrigger
                        value="interest"
                        className="rounded-none border-b-2 border-transparent bg-transparent text-muted-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-foreground data-[state=active]:text-foreground gap-2 py-3"
                      >
                        <Compass className="h-4 w-4" />
                        Interested in
                        {interests.length + interestsCustom.length > 0 && (
                          <span className="text-xs opacity-80">({interests.length + interestsCustom.length})</span>
                        )}
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="expertise" className="mt-6">
                      {renderTopicColumn(
                        "What are you an expert in?",
                        "What topics can you give great recommendations on?",
                        expertiseDomains,
                        setExpertiseDomains,
                        expertiseCustom,
                        setExpertiseCustom,
                        expertiseOtherInput,
                        setExpertiseOtherInput,
                        "expOther",
                        "expertise",
                      )}
                    </TabsContent>
                    <TabsContent value="interest" className="mt-6">
                      {renderTopicColumn(
                        "What are you interested in?",
                        "What are you always looking for recommendations on?",
                        interests,
                        setInterests,
                        interestsCustom,
                        setInterestsCustom,
                        interestsOtherInput,
                        setInterestsOtherInput,
                        "intOther",
                        "interest",
                      )}
                    </TabsContent>
                  </Tabs>
                  {(finalExpertise.length === 0 || finalInterests.length === 0) && (
                    <p className="text-xs text-muted-foreground text-center">
                      Select at least one topic on each tab to continue.
                    </p>
                  )}
                </div>
              )}

              {step === 4 && (
                <div className="space-y-4">
                  <p className="text-muted-foreground">You're all set! Your network will now know what you're great at recommending.</p>
                  <div className="rounded-lg border p-4 space-y-3 text-sm">
                    <div><span className="text-muted-foreground">Name:</span> {fullName || "—"}</div>
                    <div><span className="text-muted-foreground">Based in:</span> {city || "—"}</div>
                    {expertiseCities.length > 0 && (
                      <div><span className="text-muted-foreground">Knows well:</span> {expertiseCities.join(", ")}</div>
                    )}
                    <div><span className="text-muted-foreground">Occupation:</span> {occupation || "—"}</div>
                    {bio && <div><span className="text-muted-foreground">Bio:</span> {bio}</div>}
                    {finalExpertise.length > 0 && (
                      <div><span className="text-muted-foreground">Expert in:</span> {finalExpertise.join(", ")}</div>
                    )}
                    {finalInterests.length > 0 && (
                      <div><span className="text-muted-foreground">Interests:</span> {finalInterests.join(", ")}</div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-4">
                <Button type="button" variant="ghost" onClick={handleBack} disabled={step === 1 || saving}>
                  Back
                </Button>
                <div className="flex gap-2">
                  {step < TOTAL_STEPS ? (
                    <Button type="button" onClick={handleNext} disabled={!canNext()}>
                      Next
                    </Button>
                  ) : (
                    <Button type="button" onClick={handleFinish} disabled={saving}>
                      {saving ? "Saving…" : "Go to Dashboard"}
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};

export default Welcome;
