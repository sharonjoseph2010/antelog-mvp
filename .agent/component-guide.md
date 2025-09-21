# Component Architecture Guide

## Overview

Antelog's frontend follows an atomic design pattern with shadcn/ui as the foundation, organized into layers from basic UI primitives to complex page-level components.

## Component Hierarchy

```
src/
├── components/
│   ├── ui/                    # Atomic UI primitives (shadcn/ui based)
│   ├── layout/               # Layout and navigation components
│   ├── routes/               # Authentication and routing guards
│   ├── FriendSuggestions.tsx # Feature-specific components
│   └── NotificationCenter.tsx
├── pages/                    # Page-level route components
├── hooks/                   # Custom React hooks
└── lib/                     # Utilities and helpers
```

## UI Component Layer (`components/ui/`)

### Atomic Components
These are the building blocks based on Radix UI primitives and styled with Tailwind CSS through shadcn/ui.

#### Form Components
```typescript
// Input component with variants
<Input 
  type="email" 
  placeholder="Enter email"
  className="w-full"
/>

// Select with proper typing
<Select onValueChange={setValue} value={value}>
  <SelectTrigger>
    <SelectValue placeholder="Choose category" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="films">Films</SelectItem>
    <SelectItem value="places">Places</SelectItem>
  </SelectContent>
</Select>

// Form with validation
<Form {...form}>
  <FormField
    control={form.control}
    name="title"
    render={({ field }) => (
      <FormItem>
        <FormLabel>Title</FormLabel>
        <FormControl>
          <Input placeholder="List title" {...field} />
        </FormControl>
        <FormMessage />
      </FormItem>
    )}
  />
</Form>
```

#### Navigation Components
```typescript
// Navigation menu with sub-items
<NavigationMenu>
  <NavigationMenuList>
    <NavigationMenuItem>
      <NavigationMenuLink href="/dashboard">
        Dashboard
      </NavigationMenuLink>
    </NavigationMenuItem>
  </NavigationMenuList>
</NavigationMenu>

// Breadcrumb navigation
<Breadcrumb>
  <BreadcrumbList>
    <BreadcrumbItem>
      <BreadcrumbLink href="/lists">Lists</BreadcrumbLink>
    </BreadcrumbItem>
    <BreadcrumbSeparator />
    <BreadcrumbItem>
      <BreadcrumbPage>Edit List</BreadcrumbPage>
    </BreadcrumbItem>
  </BreadcrumbList>
</Breadcrumb>
```

#### Data Display Components
```typescript
// Table with sorting and filtering
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Name</TableHead>
      <TableHead>Status</TableHead>
      <TableHead>Actions</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {data.map((item) => (
      <TableRow key={item.id}>
        <TableCell>{item.name}</TableCell>
        <TableCell>
          <Badge variant={item.status === 'active' ? 'default' : 'secondary'}>
            {item.status}
          </Badge>
        </TableCell>
        <TableCell>
          <Button variant="ghost" size="sm">
            Edit
          </Button>
        </TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>

// Card layouts for content
<Card>
  <CardHeader>
    <CardTitle>List Title</CardTitle>
    <CardDescription>List description</CardDescription>
  </CardHeader>
  <CardContent>
    <p>List content here</p>
  </CardContent>
  <CardFooter>
    <Button variant="outline">View</Button>
    <Button>Edit</Button>
  </CardFooter>
</Card>
```

### Layout Components (`components/layout/`)

#### Header Component
```typescript
// Header.tsx - Main navigation with authentication state
interface HeaderProps {
  isAuthenticated: boolean;
  isAdmin: boolean;
  userType: 'verified' | 'guest' | null;
  onLogout: () => void;
}

const Header = ({ isAuthenticated, isAdmin, userType, onLogout }: HeaderProps) => {
  return (
    <header className="border-b">
      <div className="container mx-auto px-4">
        <nav className="flex items-center justify-between h-16">
          {/* Logo and brand */}
          <Link to="/" className="font-bold text-xl">
            Antelog
          </Link>
          
          {/* Navigation menu */}
          {isAuthenticated && (
            <NavigationMenu>
              <NavigationMenuList>
                <NavigationMenuItem>
                  <NavigationMenuLink href="/dashboard">
                    Dashboard
                  </NavigationMenuLink>
                </NavigationMenuItem>
                {/* Conditional navigation based on user type */}
                {userType === 'verified' && (
                  <NavigationMenuItem>
                    <NavigationMenuLink href="/lists">
                      Lists
                    </NavigationMenuLink>
                  </NavigationMenuItem>
                )}
              </NavigationMenuList>
            </NavigationMenu>
          )}
          
          {/* User actions */}
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <User className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={onLogout}>
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="flex gap-2">
                <Button variant="ghost" asChild>
                  <Link to="/login">Login</Link>
                </Button>
                <Button asChild>
                  <Link to="/signup">Sign Up</Link>
                </Button>
              </div>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
};
```

#### Footer Component
```typescript
// Footer.tsx - Contextual footer content
interface FooterProps {
  isAuthenticated: boolean;
}

const Footer = ({ isAuthenticated }: FooterProps) => {
  return (
    <footer className="border-t mt-auto">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Brand section */}
          <div>
            <h3 className="font-semibold mb-4">Antelog</h3>
            <p className="text-sm text-muted-foreground">
              Trust-powered recommendations from your network
            </p>
          </div>
          
          {/* Navigation links */}
          <div>
            <h4 className="font-medium mb-4">Navigation</h4>
            <ul className="space-y-2 text-sm">
              {isAuthenticated ? (
                <>
                  <li><Link to="/dashboard">Dashboard</Link></li>
                  <li><Link to="/directory">Directory</Link></li>
                  <li><Link to="/friends">Friends</Link></li>
                </>
              ) : (
                <>
                  <li><Link to="/directory">Browse Directory</Link></li>
                  <li><Link to="/signup">Sign Up</Link></li>
                  <li><Link to="/login">Login</Link></li>
                </>
              )}
            </ul>
          </div>
          
          {/* Additional info */}
          <div>
            <h4 className="font-medium mb-4">Support</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="/privacy">Privacy Policy</a></li>
              <li><a href="/terms">Terms of Service</a></li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
};
```

### Route Protection (`components/routes/`)

#### Route Guards
```typescript
// RouteGuards.tsx - Authentication and authorization
interface ProtectedRouteProps {
  children: React.ReactNode;
  isAuthenticated: boolean;
}

export const ProtectedRoute = ({ children, isAuthenticated }: ProtectedRouteProps) => {
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

interface VerifiedRouteProps {
  children: React.ReactNode;
  isAuthenticated: boolean;
  userType: 'verified' | 'guest' | null;
}

export const VerifiedRoute = ({ children, isAuthenticated, userType }: VerifiedRouteProps) => {
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  if (userType !== 'verified') {
    return <Navigate to="/verify" replace />;
  }
  
  return <>{children}</>;
};

interface AdminRouteProps {
  children: React.ReactNode;
  isAuthenticated: boolean;
  isAdmin: boolean;
}

export const AdminRoute = ({ children, isAuthenticated, isAdmin }: AdminRouteProps) => {
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return <>{children}</>;
};
```

### Feature Components

#### Friend Suggestions Component
```typescript
// FriendSuggestions.tsx - Viral growth mechanism
const FriendSuggestions = () => {
  const { data: suggestions, isLoading } = useQuery({
    queryKey: ['friend-suggestions'],
    queryFn: async () => {
      const { data } = await supabase
        .from('friend_suggestions')
        .select(`
          id,
          match_type,
          suggested_user_id,
          profiles:suggested_user_id (
            id,
            handle,
            full_name
          )
        `)
        .eq('user_id', user?.id)
        .eq('is_dismissed', false);
      return data;
    }
  });

  const sendFriendRequest = useMutation({
    mutationFn: async (suggestedUserId: string) => {
      const { error } = await supabase
        .from('friend_requests')
        .insert({
          requester_id: user?.id,
          addressee_id: suggestedUserId
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friend-suggestions'] });
    }
  });

  const dismissSuggestion = useMutation({
    mutationFn: async (suggestionId: string) => {
      const { error } = await supabase
        .from('friend_suggestions')
        .update({ is_dismissed: true })
        .eq('id', suggestionId);
      if (error) throw error;
    }
  });

  if (isLoading) return <div>Loading suggestions...</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Friend Suggestions</CardTitle>
        <CardDescription>
          Connect with people from your contacts
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {suggestions?.map((suggestion) => (
            <div key={suggestion.id} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarFallback>
                    {suggestion.profiles?.full_name?.[0] || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">
                    {suggestion.profiles?.full_name || 'Unknown'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    @{suggestion.profiles?.handle}
                  </p>
                  <Badge variant="secondary" size="sm">
                    From {suggestion.match_type}
                  </Badge>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => sendFriendRequest.mutate(suggestion.suggested_user_id)}
                  disabled={sendFriendRequest.isPending}
                >
                  Connect
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => dismissSuggestion.mutate(suggestion.id)}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
```

#### Notification Center Component
```typescript
// NotificationCenter.tsx - Real-time notifications
const NotificationCenter = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  // Real-time subscription
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setNotifications(prev => [payload.new as Notification, ...prev]);
            // Show toast notification
            toast({
              title: payload.new.title,
              description: payload.new.message,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const markAsRead = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);
      if (error) throw error;
    }
  });

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0"
            >
              {unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="space-y-2">
          <h3 className="font-medium">Notifications</h3>
          <Separator />
          <div className="max-h-80 overflow-y-auto space-y-2">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`p-3 rounded-lg border ${
                  notification.is_read ? 'bg-muted/30' : 'bg-background'
                }`}
                onClick={() => {
                  if (!notification.is_read) {
                    markAsRead.mutate(notification.id);
                  }
                }}
              >
                <p className="font-medium text-sm">{notification.title}</p>
                <p className="text-xs text-muted-foreground">
                  {notification.message}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                </p>
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
```

## Page Components (`pages/`)

### Component Structure Pattern
Page components follow a consistent structure:

```typescript
const PageComponent = () => {
  // 1. Authentication and user state
  const user = useUser();
  
  // 2. Data fetching with TanStack Query
  const { data, isLoading, error } = useQuery({
    queryKey: ['data-key'],
    queryFn: fetchFunction
  });
  
  // 3. Mutations for data modifications
  const mutation = useMutation({
    mutationFn: mutationFunction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-key'] });
    }
  });
  
  // 4. Local state and form handling
  const [localState, setLocalState] = useState();
  const form = useForm();
  
  // 5. Event handlers
  const handleAction = () => {
    // Event logic
  };
  
  // 6. Loading and error states
  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;
  
  // 7. Main component render
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="space-y-6">
        {/* Page header */}
        <div>
          <h1 className="text-3xl font-bold">Page Title</h1>
          <p className="text-muted-foreground">Page description</p>
        </div>
        
        {/* Main content */}
        <div className="grid gap-6">
          {/* Content sections */}
        </div>
      </div>
    </div>
  );
};
```

## Custom Hooks (`hooks/`)

### Data Fetching Hooks
```typescript
// hooks/useProfile.ts
export const useProfile = () => {
  const user = useUser();
  
  return useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user?.id) throw new Error('No user');
      
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
        
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id
  });
};

// hooks/useLists.ts
export const useLists = () => {
  const user = useUser();
  
  return useQuery({
    queryKey: ['lists', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lists')
        .select(`
          *,
          list_items (count)
        `)
        .eq('owner_id', user?.id)
        .order('updated_at', { ascending: false });
        
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id
  });
};
```

### Utility Hooks
```typescript
// hooks/use-mobile.tsx
export const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  return isMobile;
};
```

## Component Development Guidelines

### 1. Component Organization
- Keep components focused and single-purpose
- Use composition over inheritance
- Follow the container/presentational pattern where appropriate

### 2. State Management
- Use TanStack Query for server state
- Use local useState for component-specific state
- Lift state up when needed by multiple components

### 3. TypeScript Usage
- Always type component props
- Use the generated database types from Supabase
- Prefer interfaces over types for component props

### 4. Styling Patterns
- Use Tailwind utility classes consistently
- Follow shadcn/ui patterns for component variants
- Use CSS variables for theme-based styling

### 5. Performance Considerations
- Use React.memo for expensive components
- Implement proper loading and error states
- Optimize re-renders with proper dependency arrays

This component architecture provides a scalable foundation while maintaining consistency across the application.