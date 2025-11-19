import { Link } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Users } from "lucide-react";

export function ContactImportBanner() {
  return (
    <Alert className="border-primary/50 bg-primary/5">
      <Users className="h-4 w-4" />
      <AlertDescription className="flex items-center justify-between gap-4">
        <span>Import your contacts to discover friends on Antelog and build your trusted network</span>
        <Button asChild variant="default" size="sm" className="shrink-0">
          <Link to="/contacts/import">Import Contacts</Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
