import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle, AlertCircle, Info } from "lucide-react";

type FormStatus = "idle" | "submitting" | "success" | "already_joined" | "error";

const Waitlist = () => {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<FormStatus>("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) return;
    
    setStatus("submitting");
    
    try {
      const { error } = await supabase
        .from("temp_waitlist")
        .insert({ email: trimmedEmail });
      
      if (error) {
        if (error.code === "23505") {
          setStatus("already_joined");
        } else {
          throw error;
        }
      } else {
        setStatus("success");
        setEmail("");
      }
    } catch (error) {
      console.error("Waitlist error:", error);
      setStatus("error");
    }
  };

  return (
    <>
      <Helmet>
        <title>Join the Waitlist — Antelog</title>
        <meta
          name="description"
          content="Be among the first to experience the new social platform for students."
        />
      </Helmet>

      <main className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
              Join the Waitlist
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Be among the first to experience the new social platform for students.
            </p>
          </div>

          <div className="border rounded-lg bg-card p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your.email@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={status === "submitting" || status === "success"}
                  className="w-full"
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={status === "submitting" || status === "success"}
              >
                {status === "submitting" ? "Joining..." : "Join Waitlist"}
              </Button>
            </form>

            {status === "success" && (
              <div className="mt-4 flex items-center gap-2 text-green-600 dark:text-green-400">
                <CheckCircle className="h-5 w-5 flex-shrink-0" />
                <p className="text-sm">You're on the list! We'll email you when we launch.</p>
              </div>
            )}

            {status === "already_joined" && (
              <div className="mt-4 flex items-center gap-2 text-orange-600 dark:text-orange-400">
                <Info className="h-5 w-5 flex-shrink-0" />
                <p className="text-sm">You're already on the waitlist!</p>
              </div>
            )}

            {status === "error" && (
              <div className="mt-4 flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <p className="text-sm">Something went wrong. Please try again.</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
};

export default Waitlist;
