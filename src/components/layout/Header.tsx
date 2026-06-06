import { log } from "@/lib/logger";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useFypUnread } from "@/hooks/useFypUnread";

interface HeaderProps {
  isAuthenticated: boolean;
  isAdmin: boolean;
  userType?: 'verified' | 'guest' | null;
  onLogout: () => Promise<void>;
}

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

const Header = ({ isAuthenticated, isAdmin, userType, onLogout }: HeaderProps) => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const fypUnread = useFypUnread();

  useEffect(() => {
    log('[Header] Component mounted, checking authentication...');
    log('[Header] isAuthenticated:', isAuthenticated, 'userType:', userType);
    
    if (isAuthenticated) {
      log('[Header] ✅ User is authenticated, loading notifications...');
      loadNotifications();
      
      log('[Header] Setting up real-time subscription to notifications...');
      // Set up real-time notifications
      const channel = supabase
        .channel('header-notifications')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications'
          },
          (payload) => {
            log('[Header] 🔔 Real-time notification received:', payload);
            loadNotifications();
          }
        )
        .subscribe((status) => {
          log('[Header] Real-time subscription status:', status);
        });

      return () => {
        log('[Header] Cleaning up real-time subscription...');
        supabase.removeChannel(channel);
      };
    } else {
      log('[Header] ⚠️ User not authenticated, skipping notifications');
    }
  }, [isAuthenticated, userType]);

  const loadNotifications = async () => {
    try {
      log('[Header] loadNotifications called');
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        log('[Header] ⚠️ No user found, skipping notification load');
        return;
      }

      log('[Header] Fetching notifications for user:', user.id);

      const { data, error } = await supabase
        .from('notifications')
        .select(`
          id,
          type,
          title,
          message,
          is_read,
          created_at,
          related_user_id,
          metadata
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        console.error('[Header] ❌ Error loading notifications:', error);
        throw error;
      }

      log('[Header] Notifications fetched:', {
        count: data?.length || 0,
        data: data
      });
      
      // Get profile info for related users
      if (data && data.length > 0) {
        const relatedUserIds = data
          .filter(n => n.related_user_id)
          .map(n => n.related_user_id!);
        
        log('[Header] Related user IDs to fetch:', relatedUserIds);
        
        if (relatedUserIds.length > 0) {
          const { data: profiles, error: profileError } = await supabase
            .from('profiles')
            .select('id, full_name, handle')
            .in('id', relatedUserIds);
          
          if (profileError) {
            console.error('[Header] ❌ Error fetching profiles:', profileError);
          }
          
          log('[Header] Profiles fetched:', profiles);
          
          const enrichedNotifications = data.map(notification => ({
            ...notification,
            related_profile: notification.related_user_id 
              ? profiles?.find(p => p.id === notification.related_user_id)
              : undefined
          }));
          
          log('[Header] Enriched notifications:', enrichedNotifications);
          
          setNotifications(enrichedNotifications);
          const unreadCnt = enrichedNotifications.filter(n => !n.is_read).length;
          log('[Header] Unread count:', unreadCnt);
          setUnreadCount(unreadCnt);
        } else {
          log('[Header] No related users to fetch');
          setNotifications(data);
          const unreadCnt = data.filter(n => !n.is_read).length;
          log('[Header] Unread count:', unreadCnt);
          setUnreadCount(unreadCnt);
        }
      } else {
        log('[Header] No notifications found');
        setNotifications([]);
        setUnreadCount(0);
      }
    } catch (error) {
      console.error('[Header] ❌ Exception in loadNotifications:', error);
    }
  };

  const markAsRead = async (notificationId: string) => {
    try {
      log('[Header] Marking notification as read:', notificationId);
      
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);

      if (error) {
        console.error('[Header] ❌ Error marking notification as read:', error);
        throw error;
      }

      log('[Header] ✅ Notification marked as read');

      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('[Header] ❌ Exception in markAsRead:', error);
    }
  };

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
      case 'connection_accepted':
        return '/friends';
      default:
        return '/dashboard';
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id);
    navigate(getNotificationRoute(notification));
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <header className="border-b bg-background">
      <nav className="container mx-auto flex h-14 items-center justify-between px-4" aria-label="Main navigation">
        <Link to={isAuthenticated ? "/dashboard" : "/"} className="font-bold text-2xl md:text-3xl" aria-label="Antelog home">
          Antelog
        </Link>
        
        <div className="flex items-center gap-4">
          <ThemeToggle />
          {/* Master Directory requires authentication */}
          {isAuthenticated ? (
            <Link to="/directory" className="hover:underline">
              Master Directory
            </Link>
          ) : (
            <Link to="/guest-signup" className="hidden sm:inline hover:underline">
              Master Directory
            </Link>
          )}
          
          {isAuthenticated && userType === 'verified' ? (
            <>
              <Link to="/dashboard" className="hover:underline">Dashboard</Link>
              <Link to="/for-you" className="hover:underline inline-flex items-center">
                For You
                {fypUnread && (
                  <span
                    aria-label="New requests"
                    className="ml-1.5 inline-block h-[6px] w-[6px] rounded-full"
                    style={{ backgroundColor: "hsl(var(--info-fg))" }}
                  />
                )}
              </Link>
              <Link to="/lists" className="hover:underline">My Lists</Link>
              <Link to="/friends" className="hover:underline">Network</Link>
              <Link to="/groups" className="hover:underline">Groups</Link>
              <Link to="/requests" className="hover:underline">Requests</Link>
              <Link to="/contacts" className="hover:underline">Contacts</Link>
              <Link to="/profile" className="hover:underline">Profile</Link>
              {isAdmin && <Link to="/admin" className="hover:underline">Admin</Link>}
              
              {/* Notifications Bell */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="relative">
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                      <Badge 
                        variant="destructive" 
                        className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
                      >
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="end">
                  <div className="flex items-center justify-between p-4 border-b">
                    <h3 className="font-semibold">Notifications</h3>
                    {unreadCount > 0 && (
                      <Badge variant="secondary">{unreadCount} new</Badge>
                    )}
                  </div>
                  <ScrollArea className="h-[400px]">
                    {notifications.length === 0 ? (
                      <div className="p-8 text-center text-muted-foreground">
                        No notifications yet
                      </div>
                    ) : (
                      <div className="divide-y">
                        {notifications.map((notification) => (
                          <div
                            key={notification.id}
                            className={`p-4 cursor-pointer hover:bg-muted/50 transition-colors ${
                              !notification.is_read ? 'bg-primary/5' : ''
                            }`}
                            onClick={() => handleNotificationClick(notification)}
                          >
                            <div className="flex items-start gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <h4 className="font-medium text-sm">{notification.title}</h4>
                                  {!notification.is_read && (
                                    <div className="h-2 w-2 bg-primary rounded-full flex-shrink-0" />
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground line-clamp-2">
                                  {notification.message}
                                </p>
                                {notification.related_profile && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    from @{notification.related_profile.handle}
                                  </p>
                                )}
                                <p className="text-xs text-muted-foreground mt-1">
                                  {formatTimeAgo(notification.created_at)}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </PopoverContent>
              </Popover>
              
              <Button variant="outline" size="sm" onClick={async () => {
                await onLogout();
                navigate("/", { replace: true });
              }}>
                Logout
              </Button>
            </>
          ) : isAuthenticated && userType === 'guest' ? (
            <>
              <Link to="/signup">
                <Button variant="outline" size="sm">Upgrade to Verified</Button>
              </Link>
              <Button variant="outline" size="sm" onClick={async () => {
                await onLogout();
                navigate("/", { replace: true });
              }}>
                Logout
              </Button>
            </>
          ) : (
            <>
              <Link to="/login" className="hover:underline">Sign In</Link>
              <Button asChild size="sm">
                <Link to="/signup">Get Verified</Link>
              </Button>
            </>
          )}
        </div>
      </nav>
    </header>
  );
};

export default Header;
