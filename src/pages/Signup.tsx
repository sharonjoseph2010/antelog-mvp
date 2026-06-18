import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PasswordInput } from "@/components/ui/password-input";
import { PhoneInput } from "@/components/ui/phone-input";
import { useEffect } from "react";

const signupSchema = z.object({
  code: z.string().trim().min(1, "Enter your Founding Member code"),
  full_name: z.string().min(2, "Full name must be at least 2 characters"),
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  phone_number: z
    .string()
    .min(1, "Phone number is required")
    .refine((val) => {
      const match = val.match(/^\+91(\d{10})$/);
      return match !== null;
    }, "Please enter a valid 10-digit phone number"),
});

type SignupValues = z.infer<typeof signupSchema>;

// Placeholder — real count wired in next step
const FOUNDING_TAKEN = 0;
const FOUNDING_TOTAL = 100;

const Signup = () => {
  const [loading, setLoading] = useState(false);
  const [showWaitlist, setShowWaitlist] = useState(false);
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false);
  const [waitlist, setWaitlist] = useState({ name: "", email: "", city: "", love: "" });
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefilledCode = searchParams.get("code") || "";

  const form = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { code: prefilledCode, full_name: "", email: "", password: "", phone_number: "" },
    mode: "onSubmit",
  });

  useEffect(() => {
    if (prefilledCode) form.setValue("code", prefilledCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefilledCode]);

const onSubmit = async (values: SignupValues) => {
  setLoading(true);
  try {
    const normalizedPhone = values.phone_number;

    const urlParams = new URLSearchParams(window.location.search);
    const requestId = urlParams.get("request_id");
    const shareLinkId = urlParams.get("share_link_id");
    const requestTitle = urlParams.get("request_title");
    const requesterName = urlParams.get("requester_name");
    const redirectUrl = requestId
      ? `${window.location.origin}/auth/callback?request_id=${encodeURIComponent(requestId)}`
      : `${window.location.origin}/auth/callback`;
    const isShareLinkSignup = Boolean(requestId || shareLinkId);

    const { data, error } = await supabase.auth.signUp({
      email: values.email.toLowerCase(),
      password: values.password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          user_type: "verified",
          phone_number: normalizedPhone,
          full_name: values.full_name.trim(),
          is_share_signup: isShareLinkSignup,
          share_request_id: requestId,
          share_link_id: shareLinkId,
          founding_code: values.code.trim(),
        }
      },
    });

    if (error) {
      const msg = error.message?.toLowerCase().includes("already registered")
        ? "This email is already registered. Try logging in or reset your password."
        : error.message;
      toast.error(msg);
      return;
    }

    // Convert guest contribution if coming from share link flow
    if (data?.user && shareLinkId) {
      try {
        await supabase
          .from("guest_contributions")
          .update({ joined_antelog: true, converted_user_id: data.user.id })
          .eq("share_link_id", shareLinkId);
      } catch (e) {
        console.error("Failed to update guest contribution:", e);
      }
    }

    // Surface the responded-to request on the new user's dashboard
    if (data?.user && data?.session && isShareLinkSignup && requestId) {
      try {
        const asker = requesterName || "Someone";
        await supabase.from("notifications").insert({
          user_id: data.user.id,
          type: "response",
          title: `You responded to ${asker}'s request`,
          message: requestTitle
            ? `${requestTitle}. See how others answered →`
            : "See how others answered →",
          metadata: { request_id: requestId },
        });
      } catch (e) {
        console.error("Failed to create activity notification:", e);
      }
    }

    if (data?.session) {
      toast.success("Account created. Redirecting…");
      if (isShareLinkSignup) {
        window.location.replace(`/dashboard`);
      } else {
        navigate("/profile-setup", { replace: true });
      }
      return;
    }

    toast.success("Check your inbox to verify your email.");
    form.reset({ code: values.code, email: values.email.toLowerCase(), password: "", full_name: "", phone_number: "" });
  } catch (e) {
    toast.error("Something went wrong. Please try again.");
  } finally {
    setLoading(false);
  }
};

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waitlist.name.trim() || !waitlist.email.trim()) {
      toast.error("Name and email are required");
      return;
    }
    setWaitlistSubmitting(true);
    // Placeholder — real table wired in next step
    await new Promise((r) => setTimeout(r, 400));
    setWaitlistSubmitting(false);
    toast.success("Thanks, you're on the list");
    setWaitlist({ name: "", email: "", city: "", love: "" });
    setShowWaitlist(false);
  };

  const pct = Math.min(100, Math.round((FOUNDING_TAKEN / FOUNDING_TOTAL) * 100));

  return (
    <>
      <Helmet>
        <title>Founding Member Beta — Antelog</title>
        <meta
          name="description"
          content="Claim your founding spot. Antelog is invite-only during beta — the first 100 in are Founding Members."
        />
        <link rel="canonical" href={window.location.href} />
      </Helmet>
      <main className="min-h-screen bg-background text-foreground">
        <section className="mx-auto max-w-[640px] px-5 pt-12 pb-16 sm:px-6 md:pt-16">
          {/* Intro */}
          <p className="mb-4 text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
            Founding Member Beta
          </p>
          <h1 className="mb-3 text-[32px] font-bold leading-[1.15] md:text-[40px]">
            Claim your founding spot.
          </h1>
          <p className="mb-5 text-[16px] leading-relaxed text-muted-foreground sm:text-[17px]">
            Antelog is where verified people share real recommendations — with the people they know,
            and the people they don't. The first 100 in are Founding Members.
          </p>
          <p className="mb-7 text-[13px] leading-relaxed text-muted-foreground">
            This is an early beta. Things may be rough — your feedback shapes what it becomes.
          </p>

          {/* Progress */}
          <div className="mb-9">
            <div className="mb-2 flex items-center justify-between text-[12px] text-muted-foreground">
              <span>Founding members</span>
              <span className="tabular-nums">{FOUNDING_TAKEN} / {FOUNDING_TOTAL}</span>
            </div>
            <div className="h-[3px] w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-foreground transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* Primary — code-gated signup */}
          <div className="rounded-lg bg-muted p-6 sm:p-7">
            <h2 className="mb-1 text-[18px] font-medium">Have a Founding Member code?</h2>
            <p className="mb-5 text-[13px] text-muted-foreground">
              Enter your code to create your account.
            </p>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Founding Member code</FormLabel>
                      <FormControl>
                        <Input
                          type="text"
                          placeholder="Enter your code"
                          autoComplete="off"
                          className="bg-background"
                          {...field}
                        />
                      </FormControl>
                      {prefilledCode && (
                        <p className="text-xs text-foreground">
                          ✓ Code applied from your invite link
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="full_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full name</FormLabel>
                      <FormControl>
                        <Input type="text" placeholder="e.g., Mike Johnson" autoComplete="name" className="bg-background" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="you@example.com" autoComplete="email" className="bg-background" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <PasswordInput placeholder="••••••••" autoComplete="new-password" className="bg-background" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone number</FormLabel>
                      <FormControl>
                        <PhoneInput {...field} />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        We'll use this to connect you with friends who have you in their contacts.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Creating account…" : "Create account"}
                </Button>
              </form>
            </Form>
          </div>

          {/* Secondary — waitlist */}
          <div className="mt-4 rounded-lg border border-border p-6 sm:p-7">
            <h2 className="mb-1 text-[18px] font-medium">No code yet?</h2>
            <p className="mb-4 text-[13px] text-muted-foreground">
              Request access and we'll let you in as spots open up.
            </p>

            {!showWaitlist ? (
              <Button variant="outline" onClick={() => setShowWaitlist(true)}>
                Join Waitlist
              </Button>
            ) : (
              <form onSubmit={handleWaitlistSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="wl-name">Name</Label>
                  <Input
                    id="wl-name"
                    value={waitlist.name}
                    onChange={(e) => setWaitlist({ ...waitlist, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wl-email">Email</Label>
                  <Input
                    id="wl-email"
                    type="email"
                    value={waitlist.email}
                    onChange={(e) => setWaitlist({ ...waitlist, email: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wl-city">City</Label>
                  <Input
                    id="wl-city"
                    value={waitlist.city}
                    onChange={(e) => setWaitlist({ ...waitlist, city: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wl-love">
                    One thing you love recommending <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Textarea
                    id="wl-love"
                    rows={2}
                    value={waitlist.love}
                    onChange={(e) => setWaitlist({ ...waitlist, love: e.target.value })}
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={waitlistSubmitting}>
                    {waitlistSubmitting ? "Submitting…" : "Join Waitlist"}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setShowWaitlist(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </div>

          {/* Tertiary */}
          <p className="mt-8 text-center text-sm text-muted-foreground">
            Already testing?{" "}
            <Link to="/login" className="text-foreground underline underline-offset-4">
              Sign in
            </Link>
          </p>
        </section>
      </main>
    </>
  );
};

export default Signup;
