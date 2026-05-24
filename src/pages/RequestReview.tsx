import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  CheckCircle2,
  XCircle,
  Split,
  Merge,
  Edit2,
  Save,
  Users,
  ThumbsUp,
  ArrowLeft,
} from "lucide-react";

interface ClusterVariation {
  id: string;
  text: string;
  votes: number;
  contributor: string;
}

interface Cluster {
  cluster_id: string;
  canonical_text: string;
  total_votes: number;
  mention_count: number;
  similarity_score: number;
  status: string;
  position: number;
  variations: ClusterVariation[];
  isEditing?: boolean;
}

export default function RequestReview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [request, setRequest] = useState<any>(null);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedClusters, setSelectedClusters] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (id) {
      loadReviewData();
    }
  }, [id]);

  const loadReviewData = async () => {
    setIsLoading(true);
    try {
      const { data: requestData, error: requestError } = await supabase
        .from("requests")
        .select("id, title, category, status, creator_id")
        .eq("id", id!)
        .single();

      if (requestError) throw requestError;
      setRequest(requestData);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.id !== requestData.creator_id) {
        toast({
          title: "Access Denied",
          description: "Only the request creator can review clusters",
          variant: "destructive",
        });
        navigate(`/requests/${id}`);
        return;
      }

      const { data: clusterData, error: clusterError } = await supabase
        .from("cluster_details")
        .select("*")
        .eq("request_id", id!)
        .order("position", { ascending: true });

      if (clusterError) throw clusterError;

      const mapped: Cluster[] = (clusterData || []).map((c: any) => ({
        cluster_id: c.cluster_id,
        canonical_text: c.canonical_text ?? "",
        total_votes: c.total_votes ?? 0,
        mention_count: c.mention_count ?? 0,
        similarity_score: c.similarity_score ?? 0,
        status: c.status ?? "pending",
        position: c.position ?? 0,
        variations: Array.isArray(c.variations) ? c.variations : [],
      }));

      setClusters(mapped);
    } catch (error) {
      console.error("Error loading review data:", error);
      toast({
        title: "Failed to Load",
        description: "Could not load review data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleApproveCluster = async (clusterId: string) => {
    try {
      await supabase
        .from("recommendation_clusters")
        .update({ status: "approved" })
        .eq("id", clusterId);

      setClusters(
        clusters.map((c) =>
          c.cluster_id === clusterId ? { ...c, status: "approved" } : c
        )
      );
      toast({ title: "Approved", description: "Cluster approved for your list" });
    } catch (error) {
      console.error("Error approving cluster:", error);
    }
  };

  const handleRejectCluster = async (clusterId: string) => {
    try {
      await supabase
        .from("recommendation_clusters")
        .update({ status: "rejected" })
        .eq("id", clusterId);

      setClusters(
        clusters.map((c) =>
          c.cluster_id === clusterId ? { ...c, status: "rejected" } : c
        )
      );
      toast({ title: "Rejected", description: "Cluster will not be included" });
    } catch (error) {
      console.error("Error rejecting cluster:", error);
    }
  };

  const handleEditCanonical = (clusterId: string) => {
    setClusters(
      clusters.map((c) =>
        c.cluster_id === clusterId ? { ...c, isEditing: true } : c
      )
    );
  };

  const handleSaveCanonical = async (clusterId: string, newText: string) => {
    try {
      await supabase
        .from("recommendation_clusters")
        .update({ canonical_text: newText })
        .eq("id", clusterId);

      setClusters(
        clusters.map((c) =>
          c.cluster_id === clusterId
            ? { ...c, canonical_text: newText, isEditing: false }
            : c
        )
      );
      toast({ title: "Updated", description: "Canonical name updated" });
    } catch (error) {
      console.error("Error updating canonical:", error);
    }
  };

  const handleSplitCluster = async (clusterId: string) => {
    const cluster = clusters.find((c) => c.cluster_id === clusterId);
    if (!cluster || !cluster.variations) return;

    try {
      await supabase
        .from("recommendation_clusters")
        .update({ status: "split" })
        .eq("id", clusterId);

      const newClusters = cluster.variations.map((variation, index) => ({
        request_id: id!,
        canonical_text: variation.text,
        recommendation_ids: [variation.id],
        total_votes: variation.votes,
        mention_count: 1,
        similarity_score: 1.0,
        cluster_method: "manual_split",
        status: "pending",
        position: (cluster.position ?? 0) + index + 1,
      }));

      await supabase.from("recommendation_clusters").insert(newClusters);
      await loadReviewData();
      toast({
        title: "Split Complete",
        description: `Created ${newClusters.length} separate items`,
      });
    } catch (error) {
      console.error("Error splitting cluster:", error);
    }
  };

  const handleMergeSelected = async () => {
    if (selectedClusters.size < 2) {
      toast({
        title: "Select Multiple Clusters",
        description: "Select at least 2 clusters to merge",
        variant: "destructive",
      });
      return;
    }

    try {
      const selectedClusterData = clusters.filter((c) =>
        selectedClusters.has(c.cluster_id)
      );

      const mergedIds = selectedClusterData.flatMap(
        (c) => c.variations?.map((v) => v.id) || []
      );
      const mergedVotes = selectedClusterData.reduce(
        (sum, c) => sum + c.total_votes,
        0
      );
      const mergedMentions = selectedClusterData.reduce(
        (sum, c) => sum + c.mention_count,
        0
      );

      const canonical = [...selectedClusterData].sort(
        (a, b) => b.total_votes - a.total_votes
      )[0].canonical_text;

      await supabase.from("recommendation_clusters").insert({
        request_id: id!,
        canonical_text: canonical,
        recommendation_ids: mergedIds,
        total_votes: mergedVotes,
        mention_count: mergedMentions,
        similarity_score: 0.85,
        cluster_method: "manual_merge",
        status: "pending",
        position: Math.min(...selectedClusterData.map((c) => c.position)),
      });

      await supabase
        .from("recommendation_clusters")
        .update({ status: "split" })
        .in("id", Array.from(selectedClusters));

      setSelectedClusters(new Set());
      await loadReviewData();
      toast({
        title: "Merged Successfully",
        description: `Combined ${selectedClusters.size} clusters`,
      });
    } catch (error) {
      console.error("Error merging clusters:", error);
    }
  };

  const handleSaveToMyLists = async () => {
    setIsSaving(true);
    try {
      const approvedClusters = clusters.filter(
        (c) => c.status === "approved" || c.status === "pending"
      );

      if (approvedClusters.length === 0) {
        toast({
          title: "No Items to Save",
          description: "Approve at least one cluster to save",
          variant: "destructive",
        });
        setIsSaving(false);
        return;
      }

      const totalVotes = approvedClusters.reduce(
        (sum, c) => sum + c.total_votes,
        0
      );
      const totalContributors = new Set(
        approvedClusters.flatMap(
          (c) => c.variations?.map((v) => v.contributor) || []
        )
      ).size;

      const { data: list, error: listError } = await supabase
        .from("lists")
        .insert({
          owner_id: request.creator_id,
          title: request.title,
          category: request.category,
          visibility: "private",
          source_request_id: id!,
          total_votes: totalVotes,
          total_contributors: totalContributors,
          item_count: approvedClusters.length,
        })
        .select()
        .single();

      if (listError) throw listError;

      const listItems = approvedClusters.map((cluster, index) => ({
        list_id: list.id,
        content: cluster.canonical_text,
        position: index + 1,
        vote_count: cluster.total_votes,
        mention_count: cluster.mention_count,
        source_recommendation_ids:
          cluster.variations?.map((v) => v.id) || [],
      }));

      const { error: itemsError } = await supabase
        .from("list_items")
        .insert(listItems);

      if (itemsError) throw itemsError;

      await supabase
        .from("requests")
        .update({ status: "closed" as any })
        .eq("id", id!);

      await supabase
        .from("recommendation_clusters")
        .delete()
        .eq("request_id", id!);

      toast({
        title: "✓ Saved to My Lists!",
        description: `${approvedClusters.length} recommendations saved`,
      });

      navigate("/lists");
    } catch (error) {
      console.error("Error saving to lists:", error);
      toast({
        title: "Save Failed",
        description: "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="space-y-4 w-full max-w-lg px-4">
          <div className="h-8 bg-muted animate-pulse rounded" />
          <div className="h-32 bg-muted animate-pulse rounded" />
          <div className="h-32 bg-muted animate-pulse rounded" />
        </div>
      </div>
    );
  }

  const approvedCount = clusters.filter(
    (c) => c.status === "approved" || c.status === "pending"
  ).length;
  const rejectedCount = clusters.filter((c) => c.status === "rejected").length;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/requests/${id}/respond`)}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Request
          </Button>

          <h1 className="text-2xl font-bold text-foreground">
            Review Recommendations
          </h1>
          <p className="text-muted-foreground mt-1">{request?.title}</p>
        </div>

        {/* Summary Stats */}
        <Card className="mb-6">
          <CardContent className="py-4">
            <div className="flex items-center justify-around text-center">
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {clusters.filter((c) => c.status !== "split").length}
                </p>
                <p className="text-xs text-muted-foreground">Unique Items</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-primary">
                  {approvedCount}
                </p>
                <p className="text-xs text-muted-foreground">To Save</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-destructive">
                  {rejectedCount}
                </p>
                <p className="text-xs text-muted-foreground">Rejected</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Merge Controls */}
        {selectedClusters.size > 0 && (
          <Card className="mb-4 border-primary">
            <CardContent className="py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {selectedClusters.size} clusters selected
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedClusters(new Set())}
                  >
                    Clear
                  </Button>
                  {selectedClusters.size >= 2 && (
                    <Button size="sm" onClick={handleMergeSelected}>
                      <Merge className="h-4 w-4 mr-1" />
                      Merge Selected
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Clusters List */}
        <div className="space-y-4">
          {clusters
            .filter((c) => c.status !== "split")
            .map((cluster, index) => (
              <Card
                key={cluster.cluster_id}
                className={
                  cluster.status === "approved"
                    ? "border-primary/50 bg-primary/5"
                    : cluster.status === "rejected"
                    ? "border-destructive/30 opacity-60"
                    : ""
                }
              >
                <CardContent className="py-4">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={selectedClusters.has(cluster.cluster_id)}
                      onCheckedChange={(checked) => {
                        const newSelected = new Set(selectedClusters);
                        if (checked) {
                          newSelected.add(cluster.cluster_id);
                        } else {
                          newSelected.delete(cluster.cluster_id);
                        }
                        setSelectedClusters(newSelected);
                      }}
                      className="mt-1"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant="outline" className="text-xs">
                          #{index + 1}
                        </Badge>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <ThumbsUp className="h-3 w-3" />
                          {cluster.total_votes}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Users className="h-3 w-3" />
                          {cluster.mention_count}
                        </span>
                      </div>

                      {cluster.isEditing ? (
                        <div className="flex items-center gap-2">
                          <Input
                            defaultValue={cluster.canonical_text}
                            className="text-sm"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                handleSaveCanonical(
                                  cluster.cluster_id,
                                  e.currentTarget.value
                                );
                              }
                            }}
                            autoFocus
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              const input = (e.currentTarget as HTMLElement)
                                .previousSibling as HTMLInputElement;
                              handleSaveCanonical(
                                cluster.cluster_id,
                                input.value
                              );
                            }}
                          >
                            <Save className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">
                            {cluster.canonical_text}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() =>
                              handleEditCanonical(cluster.cluster_id)
                            }
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}

                      {/* Variations */}
                      {cluster.variations && cluster.variations.length > 1 && (
                        <div className="mt-2">
                          <Badge variant="secondary" className="text-xs mb-1">
                            {cluster.variations.length} variations
                          </Badge>
                          <div className="space-y-1 mt-1">
                            {cluster.variations.map((variation) => (
                              <div
                                key={variation.id}
                                className="text-xs text-muted-foreground flex items-center justify-between"
                              >
                                <span>"{variation.text}"</span>
                                <span className="flex items-center gap-2">
                                  <span>{variation.contributor}</span>
                                  <Badge variant="outline" className="text-[10px]">
                                    {variation.votes} votes
                                  </Badge>
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 mt-3 ml-8">
                    {cluster.status !== "approved" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          handleApproveCluster(cluster.cluster_id)
                        }
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Approve
                      </Button>
                    )}

                    {cluster.status !== "rejected" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          handleRejectCluster(cluster.cluster_id)
                        }
                      >
                        <XCircle className="h-3 w-3 mr-1" />
                        Reject
                      </Button>
                    )}

                    {cluster.variations && cluster.variations.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          handleSplitCluster(cluster.cluster_id)
                        }
                      >
                        <Split className="h-3 w-3 mr-1" />
                        Split
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>

        {/* Save Button */}
        <div className="mt-8 sticky bottom-4">
          <Card className="border-primary">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">
                    Ready to save {approvedCount} recommendations?
                  </p>
                  <p className="text-xs text-muted-foreground">
                    This will close the request and save to your lists
                  </p>
                </div>
                <Button
                  onClick={handleSaveToMyLists}
                  disabled={isSaving || approvedCount === 0}
                >
                  <Save className="h-4 w-4 mr-1" />
                  {isSaving ? "Saving..." : "Save to My Lists"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
