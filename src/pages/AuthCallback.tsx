import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const AuthCallback = () => {
  const [mode, setMode] = useState<"verifying" | "reset">("verifying");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
    const queryParams = url.searchParams;
    const isRecovery = hashParams.get("type") === "recovery" || queryParams.get("type") === "recovery";

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || isRecovery) {
        setMode("reset");
        return;
      }
      if (session) {
        window.location.replace("/profile-setup");
      }
    });

    // Handle case where session is already set from URL hash
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (isRecovery) {
        setMode("reset");
        return;
      }
      if (session) {
        window.location.replace("/profile-setup");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleReset = async () => {
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password updated. You can now sign in.");
    window.location.replace("/login");
  };

  return (
    <>
      <Helmet>
        <title>{mode === "reset" ? "Reset password | Antelog" : "Email verification | Antelog"}</title>
        <meta name="description" content={mode === "reset" ? "Set a new password for your Antelog account." : "Completing your Antelog email verification."} />
        <link rel="canonical" href={window.location.href} />
      </Helmet>
      <main className="min-h-screen bg-background flex items-center justify-center px-4">
        <section className="w-full max-w-md text-center space-y-4">
          {mode === "reset" ? (
            <>
              <h1 className="text-2xl font-semibold">Set a new password</h1>
              <div className="text-left space-y-3">
                <div>
                  <label className="block text-sm mb-1">New password</label>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
                </div>
                <div>
                  <label className="block text-sm mb-1">Confirm password</label>
                  <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" />
                </div>
                <Button className="w-full" onClick={handleReset} disabled={submitting}>{submitting ? "Saving…" : "Save new password"}</Button>
              </div>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-semibold mb-2">Verifying your email…</h1>
              <p className="text-muted-foreground">Please wait while we complete the sign-in. You will be redirected.</p>
            </>
          )}
        </section>
      </main>
    </>
  );
};

export default AuthCallback;
