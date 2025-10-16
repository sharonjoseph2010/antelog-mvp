import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useSmartSuggestions } from "@/hooks/useSmartSuggestions";
import { Sparkles, RefreshCw } from "lucide-react";

export const AdminDeduplication = () => {
  const [loading, setLoading] = useState(false);
  const [refreshingDirectory, setRefreshingDirectory] = useState(false);
  const { toast } = useToast();
  const { normalizeEntries } = useSmartSuggestions();

  const runDeduplication = async () => {
    setLoading(true);
    try {
      // First, get all master directory entries
      const { data: entries, error } = await supabase
        .from('master_directory_entries')
        .select('*')
        .order('mention_count', { ascending: false });

      if (error) throw error;

      if (!entries || entries.length === 0) {
        toast({
          title: "No entries found",
          description: "The master directory is empty. Create some public lists first.",
        });
        return;
      }

      // Run AI normalization
      const result = await normalizeEntries(entries);
      
      if (result) {
        toast({
          title: "Deduplication Complete",
          description: result.message || `Processed ${result.normalized?.length || 0} groups`,
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to run deduplication process",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Deduplication error:', error);
      toast({
        title: "Error",
        description: "Failed to run deduplication process",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const refreshMasterDirectory = async () => {
    setRefreshingDirectory(true);
    try {
      const { error } = await supabase.rpc('refresh_master_directory');
      
      if (error) throw error;

      toast({
        title: "Directory Refreshed",
        description: "Master directory has been rebuilt from public lists",
      });
    } catch (error) {
      console.error('Refresh error:', error);
      toast({
        title: "Error",
        description: "Failed to refresh master directory",
        variant: "destructive",
      });
    } finally {
      setRefreshingDirectory(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            AI-Powered Data Management
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h3 className="font-medium">Smart Deduplication</h3>
              <p className="text-sm text-muted-foreground">
                Uses AI to identify and merge duplicate entries like "Lavonne" + "Lavonne Cafe"
              </p>
              <Button
                onClick={runDeduplication}
                disabled={loading}
                className="w-full"
              >
                {loading ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Run Deduplication
                  </>
                )}
              </Button>
            </div>

            <div className="space-y-2">
              <h3 className="font-medium">Refresh Directory</h3>
              <p className="text-sm text-muted-foreground">
                Rebuild master directory from all public lists
              </p>
              <Button
                onClick={refreshMasterDirectory}
                disabled={refreshingDirectory}
                variant="outline"
                className="w-full"
              >
                {refreshingDirectory ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Refreshing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh Directory
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="mt-6 p-4 bg-muted rounded-lg">
            <h4 className="font-medium mb-2">How it works:</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• AI analyzes all entries for variations of the same item</li>
              <li>• Consolidates vote counts from duplicate entries</li>
              <li>• Creates canonical names (e.g., "Lavonne Cafe" for all variations)</li>
              <li>• Improves search accuracy and recommendation quality</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};