import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { normalizePhone } from "@/lib/phone-utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { PhoneInput } from "@/components/ui/phone-input";
import { Mail, Upload, Plus, Trash2 } from "lucide-react";

interface ManualContact {
  name: string;
  phone: string;
  email: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: "google" | "file" | "manual";
  onImported?: () => void;
}

const normalizeEmail = (email: string) => {
  const c = email.trim().toLowerCase();
  return c && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c) ? c : null;
};

const parseContactFile = (content: string, filename: string): ManualContact[] => {
  const contacts: ManualContact[] = [];
  if (filename.toLowerCase().endsWith(".vcf")) {
    const vcards = content.split("BEGIN:VCARD");
    for (const v of vcards) {
      if (!v.trim()) continue;
      const nameMatch = v.match(/FN:(.+)/);
      const phoneMatch = v.match(/TEL.*:(.+)/);
      const emailMatch = v.match(/EMAIL.*:(.+)/);
      if (nameMatch) {
        contacts.push({
          name: nameMatch[1].trim(),
          phone: phoneMatch ? phoneMatch[1].trim().replace(/[^\d+]/g, "") : "",
          email: emailMatch ? emailMatch[1].trim() : "",
        });
      }
    }
  } else {
    const lines = content.split("\n");
    const headers = (lines[0] || "").toLowerCase().split(",");
    const nameIdx = headers.findIndex((h) => h.includes("name"));
    const phoneIdx = headers.findIndex((h) => h.includes("phone") || h.includes("mobile"));
    const emailIdx = headers.findIndex((h) => h.includes("email"));
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",");
      if (values.length < 2) continue;
      contacts.push({
        name: (values[nameIdx] || `Contact ${i}`).trim(),
        phone: values[phoneIdx] ? values[phoneIdx].replace(/[^\d+]/g, "") : "",
        email: values[emailIdx] ? values[emailIdx].trim() : "",
      });
    }
  }
  return contacts.filter((c) => c.name.trim());
};

export default function ImportContactsDialog({ open, onOpenChange, defaultTab = "manual", onImported }: Props) {
  const { toast } = useToast();
  const [tab, setTab] = useState<"google" | "file" | "manual">(defaultTab);
  const [saving, setSaving] = useState(false);
  const [fileContacts, setFileContacts] = useState<ManualContact[]>([]);
  const [manual, setManual] = useState<ManualContact[]>([{ name: "", phone: "", email: "" }]);

  // Keep dialog in sync with the trigger that opened it
  if (open && tab !== defaultTab && fileContacts.length === 0 && manual.every((m) => !m.name && !m.phone && !m.email)) {
    // safe re-sync on first open
    setTab(defaultTab);
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = (ev.target?.result as string) || "";
      const parsed = parseContactFile(text, file.name);
      setFileContacts(parsed);
      toast({ title: "File ready", description: `Found ${parsed.length} contacts.` });
    };
    reader.readAsText(file);
  };

  const save = async (contacts: ManualContact[], source: string) => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const rows = contacts
        .filter((c) => c.name.trim())
        .map((c) => ({
          user_id: user.id,
          contact_name: c.name.trim(),
          contact_phone: normalizePhone(c.phone) || null,
          contact_email: normalizeEmail(c.email),
          import_source: source,
        }));

      if (rows.length === 0) {
        toast({ title: "Nothing to import", description: "Add at least one contact with a name.", variant: "destructive" });
        return;
      }

      const { error } = await supabase.from("contact_imports").insert(rows);
      if (error) throw error;

      const { data: matchCount } = await supabase.rpc("update_matched_contacts", { user_id_input: user.id });

      toast({
        title: "Contacts imported",
        description: `${rows.length} added. ${matchCount || 0} already on Antelog.`,
      });

      window.dispatchEvent(new Event("contacts-updated"));
      onImported?.();
      onOpenChange(false);
      setFileContacts([]);
      setManual([{ name: "", phone: "", email: "" }]);
    } catch (e: any) {
      toast({ title: "Import failed", description: e?.message || "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import contacts</DialogTitle>
          <DialogDescription>Add people you trust to your network.</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="mt-2">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="google"><Mail className="mr-1.5 h-3.5 w-3.5" />Google</TabsTrigger>
            <TabsTrigger value="file"><Upload className="mr-1.5 h-3.5 w-3.5" />File</TabsTrigger>
            <TabsTrigger value="manual"><Plus className="mr-1.5 h-3.5 w-3.5" />Manual</TabsTrigger>
          </TabsList>

          <TabsContent value="google" className="mt-4 space-y-3">
            <p className="text-[13px] text-muted-foreground">
              Direct Google Contacts import is coming soon. For now, export your Google contacts as a CSV and use the File tab.
            </p>
            <Button variant="outline" onClick={() => setTab("file")} className="w-full">
              Switch to file upload
            </Button>
          </TabsContent>

          <TabsContent value="file" className="mt-4 space-y-4">
            <div>
              <Label htmlFor="import-file">CSV or vCard (.vcf)</Label>
              <Input id="import-file" type="file" accept=".csv,.vcf" onChange={handleFile} className="mt-1" />
            </div>
            {fileContacts.length > 0 && (
              <div className="rounded-md border border-border/70 p-3">
                <p className="text-[12px] text-muted-foreground">
                  {fileContacts.length} contact{fileContacts.length === 1 ? "" : "s"} ready to import.
                </p>
                <Button
                  onClick={() => save(fileContacts, "file")}
                  disabled={saving}
                  className="mt-3 w-full"
                >
                  {saving ? "Importing…" : `Import ${fileContacts.length} contacts`}
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="manual" className="mt-4 space-y-3">
            <div className="max-h-72 space-y-3 overflow-y-auto">
              {manual.map((c, i) => (
                <div key={i} className="space-y-2 rounded-md border border-border/70 p-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-[12px] font-medium">Contact {i + 1}</Label>
                    {manual.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setManual(manual.filter((_, idx) => idx !== i))}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Remove contact"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <Input
                    placeholder="Name"
                    value={c.name}
                    onChange={(e) => {
                      const next = [...manual];
                      next[i] = { ...next[i], name: e.target.value };
                      setManual(next);
                    }}
                  />
                  <PhoneInput
                    value={c.phone}
                    onChange={(value) => {
                      const next = [...manual];
                      next[i] = { ...next[i], phone: value || "" };
                      setManual(next);
                    }}
                  />
                  <Input
                    placeholder="Email (optional)"
                    type="email"
                    value={c.email}
                    onChange={(e) => {
                      const next = [...manual];
                      next[i] = { ...next[i], email: e.target.value };
                      setManual(next);
                    }}
                  />
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setManual([...manual, { name: "", phone: "", email: "" }])}
              className="w-full"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add another
            </Button>
            <Button
              onClick={() => save(manual, "manual")}
              disabled={saving || !manual.some((m) => m.name.trim())}
              className="w-full"
            >
              {saving ? "Saving…" : "Save contacts"}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}