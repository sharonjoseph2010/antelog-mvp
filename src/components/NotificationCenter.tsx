import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, Users, UserPlus, Check, MessageSquare, MessageCircle, ThumbsUp, Share2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { isInNetwork, getDisplayNameSync } from "@/hooks/useNetworkAwareName";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  related_user_id?: string;
  metadata?: any;
  related_profile?: {
    full_name: string;
    handle: string;
  };
}

const getNotificationRoute = (notification: Notification): string => {
  const requestId = notification.metadata?.request_id;
  switch (notification.type) {
    case 'request_response':
    case 'recommendation_voted':
    case 'forwarded_request':
    case 'request_forwarded':
    case 'new_request':
      return requestId ? `/requests/${requestId}/respond` : '/requests';
    case 'forward_suggestion': {
      if (!requestId) return '/requests';
      const expertId = notification.metadata?.expert_id;
      const expertName = notification.metadata?.expert_name;
      const params = new URLSearchParams();
      if (expertId) params.set('suggest_forward_to', expertId);
      if (expertName) params.set('expert_name', expertName);
      const qs = params.toString();
      return `/requests/${requestId}/respond${qs ? `?${qs}` : ''}`;
    }
    case 'contact_joined':
    case 'network_addition':
    case 'friend_suggestion':
      return '/contacts';
    case 'friend_request':
    case 'connection_request':
      return notification.related_user_id ? `/friend-request/${notification.related_user_id}` : '/friends';
    case 'friend_request_accepted':
      return '/friends';
    default:
      return '/dashboard';
  }
};

const getNotificationIcon = (type: string) => {
  switch (type) {
    case 'friend_suggestion':
      return <Users className="h-4 w-4" />;
    case 'friend_request':
      return <UserPlus className="h-4 w-4" />;
    case 'friend_request_accepted':
      return <UserPlus className="h-4 w-4" />;
    case 'contact_joined':
    case 'network_addition':
      return <Bell className="h-4 w-4" />;
    case 'new_request':
      return <MessageCircle className="h-4 w-4" />;
    case 'request_response':
      return <MessageSquare className="h-4 w-4" />;
    case 'forwarded_request':
      return <MessageCircle className="h-4 w-4" />;
    case 'forward_suggestion':
      return <Share2 className="h-4 w-4" />;
    case 'recommendation_voted':
      return <ThumbsUp className="h-4 w-4" />;
    default:
      return <Bell className="h-4 w-4" />;
  }
};

export const NotificationCenter = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    loadNotifications();
    
    const channel = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => {
          const newNotification = payload.new as Notification;
          setNotifications(prev => [newNotification, ...prev]);
          toast({
            title: newNotification.title,
            description: newNotification.message,
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [toast]);

  const loadNotifications = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('notifications')
        .select('id, type, title, message, is_read, created_at, related_user_id, metadata')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      
      if (data && data.length > 0) {
        const relatedUserIds = data
          .filter(n => n.related_user_id)
          .map(n => n.related_user_id!);
        
        if (relatedUserIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name, handle')
            .in('id', relatedUserIds);
          
          const networkResolvedProfiles = await Promise.all(
            (profiles || []).map(async (p) => {
              const inNetwork = await isInNetwork(user.id, p.id);
              return {
                ...p,
                full_name: getDisplayNameSync(p, inNetwork || p.id === user.id),
              };
            })
          );
          
          setNotifications(data.map(notification => ({
            ...notification,
            related_profile: notification.related_user_id 
              ? networkResolvedProfiles.find(p => p.id === notification.related_user_id)
              : undefined
          })));
        } else {
          setNotifications(data);
        }
      } else {
        setNotifications([]);
      }
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const markAsRead = async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);
      if (error) throw error;
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      );
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false);
      if (error) throw error;
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      toast({ title: "All notifications marked as read" });
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.is_read) {
      markAsRead(notification.id);
    }
    const route = getNotificationRoute(notification);
    navigate(route);
  };

  const acceptFriendRequest = async (notification: Notification) => {
    if (!notification.related_user_id) return;
    setActioning(notification.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const requesterId = notification.related_user_id;

      // Create friendship
      const { error: fErr } = await supabase
        .from('friendships')
        .insert({ user1_id: requesterId, user2_id: user.id });
      if (fErr && !`${fErr.message}`.toLowerCase().includes('duplicate')) throw fErr;

      // Update friend_request status
      await supabase
        .from('friend_requests')
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq('requester_id', requesterId)
        .eq('addressee_id', user.id);

      // Notify requester
      const { data: me } = await supabase
        .from('profiles').select('full_name, handle').eq('id', user.id).maybeSingle();
      const displayName = me?.full_name || (me?.handle ? `@${me.handle}` : 'Someone');
      await supabase.from('notifications').insert({
        user_id: requesterId,
        type: 'friend_request_accepted',
        title: `${displayName} accepted your connection request`,
        message: 'You are now connected on Antelog.',
        related_user_id: user.id,
      });

      await markAsRead(notification.id);
      toast({ title: 'Connection accepted' });
    } catch (e: any) {
      toast({ title: 'Could not accept', description: e?.message, variant: 'destructive' });
    } finally {
      setActioning(null);
    }
  };

  const declineFriendRequest = async (notification: Notification) => {
    if (!notification.related_user_id) return;
    setActioning(notification.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase
        .from('friend_requests')
        .update({ status: 'declined', updated_at: new Date().toISOString() })
        .eq('requester_id', notification.related_user_id)
        .eq('addressee_id', user.id);
      await markAsRead(notification.id);
      toast({ title: 'Request declined' });
    } catch (e: any) {
      toast({ title: 'Could not decline', description: e?.message, variant: 'destructive' });
    } finally {
      setActioning(null);
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground">Loading notifications...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifications
            {unreadCount > 0 && (
              <Badge variant="secondary" className="ml-2">
                {unreadCount} new
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={markAllAsRead}
              className="flex items-center gap-1"
            >
              <Check className="h-3 w-3" />
              Mark all read
            </Button>
          )}
        </CardTitle>
        <CardDescription>
          Stay updated on friend connections and network activity
        </CardDescription>
      </CardHeader>
      <CardContent>
        {notifications.length === 0 ? (
          <div className="text-center text-muted-foreground">
            No notifications yet
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`p-3 border rounded-lg cursor-pointer transition-colors hover:bg-muted/50 ${
                  notification.is_read 
                    ? 'bg-background' 
                    : 'bg-primary/5 border-primary/20'
                }`}
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-1">
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm">{notification.title}</h4>
                    <p className="text-sm text-muted-foreground">
                      {notification.type === 'network_addition' && notification.related_profile
                        ? `${notification.related_profile.full_name} added you to their 1st Network`
                        : notification.message}
                    </p>
                    {notification.related_profile && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {notification.related_profile.full_name}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(notification.created_at).toLocaleString()}
                    </p>
                    {notification.type === 'friend_request' && !notification.is_read && (
                      <div className="flex items-center gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm"
                          onClick={() => acceptFriendRequest(notification)}
                          disabled={actioning === notification.id}
                        >
                          <Check className="h-3 w-3" /> Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => declineFriendRequest(notification)}
                          disabled={actioning === notification.id}
                        >
                          <X className="h-3 w-3" /> Decline
                        </Button>
                      </div>
                    )}
                  </div>
                  {!notification.is_read && (
                    <div className="h-2 w-2 bg-primary rounded-full flex-shrink-0 mt-2" />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
