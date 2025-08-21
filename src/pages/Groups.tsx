import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Users, Plus, Settings, Trash2, Calendar } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Group {
  id: string;
  creator_id: string;
  name: string;
  description: string | null;
  created_at: string;
  member_count: number;
}

const Groups = () => {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    getCurrentUser();
  }, []);

  useEffect(() => {
    if (currentUserId) {
      loadGroups();
    }
  }, [currentUserId]);

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUserId(user.id);
    }
  };

  const loadGroups = async () => {
    if (!currentUserId) return;

    try {
      setIsLoading(true);

      // Get groups created by the user
      const { data: groupsData, error: groupsError } = await supabase
        .from('groups')
        .select('*')
        .eq('creator_id', currentUserId)
        .order('created_at', { ascending: false });

      if (groupsError) throw groupsError;

      // Get member counts for each group
      if (groupsData && groupsData.length > 0) {
        const groupIds = groupsData.map(g => g.id);
        
        const { data: memberCounts, error: memberError } = await supabase
          .from('group_members')
          .select('group_id')
          .in('group_id', groupIds);

        if (memberError) throw memberError;

        // Count members per group
        const countsByGroup = memberCounts?.reduce((acc, member) => {
          acc[member.group_id] = (acc[member.group_id] || 0) + 1;
          return acc;
        }, {} as Record<string, number>) || {};

        const groupsWithCounts = groupsData.map(group => ({
          ...group,
          member_count: countsByGroup[group.id] || 0
        }));

        setGroups(groupsWithCounts);
      } else {
        setGroups([]);
      }
    } catch (error) {
      console.error('Error loading groups:', error);
      toast({
        title: "Failed to load groups",
        description: "Could not load your groups. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const deleteGroup = async (groupId: string, groupName: string) => {
    try {
      const { error } = await supabase
        .from('groups')
        .delete()
        .eq('id', groupId);

      if (error) throw error;

      toast({
        title: "Group deleted",
        description: `"${groupName}" has been deleted successfully.`,
      });

      loadGroups();
    } catch (error) {
      console.error('Error deleting group:', error);
      toast({
        title: "Delete failed",
        description: "Failed to delete group. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="h-20 bg-muted rounded"></div>
          <div className="h-20 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Groups - Antelog</title>
        <meta name="description" content="Manage your friend groups on Antelog" />
      </Helmet>

      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Groups</h1>
            <p className="text-muted-foreground">
              Organize your friends into meaningful groups
            </p>
          </div>
          
          <Button asChild className="flex items-center gap-2">
            <Link to="/groups/new">
              <Plus className="h-4 w-4" />
              Create Group
            </Link>
          </Button>
        </div>

        {groups.length === 0 ? (
          <Card>
            <CardContent className="pt-8">
              <div className="text-center py-8">
                <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No groups yet</h3>
                <p className="text-muted-foreground mb-4">
                  Create your first group to organize your friends
                </p>
                <Button asChild>
                  <Link to="/groups/new">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Your First Group
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {groups.map((group) => (
              <Card key={group.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg mb-1">
                        <Link 
                          to={`/groups/${group.id}`}
                          className="hover:text-primary transition-colors"
                        >
                          {group.name}
                        </Link>
                      </CardTitle>
                      {group.description && (
                        <CardDescription className="text-sm">
                          {group.description}
                        </CardDescription>
                      )}
                    </div>
                    
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Group</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{group.name}"? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteGroup(group.id, group.name)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardHeader>
                
                <CardContent className="pt-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        <span>{group.member_count} members</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        <span>Created {new Date(group.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-4 flex gap-2">
                    <Button asChild variant="outline" size="sm" className="flex-1">
                      <Link to={`/groups/${group.id}`}>
                        <Settings className="h-3 w-3 mr-1" />
                        Manage
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default Groups;