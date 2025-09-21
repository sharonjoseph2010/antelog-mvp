# Features and User Flows

## Application Overview

Antelog is a trust-powered social recommendation platform that enables verified users to create, share, and discover authentic recommendations within their social network. The platform emphasizes privacy, quality, and authenticity over algorithmic content discovery.

## Core User Types

### 1. Guest Users
- **Access Level**: Limited, read-only access to public directory
- **Capabilities**: Browse public recommendations, sign up for verification
- **Restrictions**: Cannot create content, send requests, or access social features

### 2. Verified Users
- **Access Level**: Full platform access after college verification
- **Capabilities**: All features including content creation, social networking, recommendations
- **Verification**: Requires college email and ID card verification

### 3. Admin Users
- **Access Level**: Platform administration and moderation
- **Capabilities**: User management, content moderation, system administration
- **Access**: Hardcoded email-based admin identification

## Feature Deep Dive

### 1. Authentication & Onboarding

#### User Registration Flow
```
Landing Page → Sign Up → Email Verification → Profile Setup → College Verification → Dashboard
```

**Key Components:**
- `pages/Signup.tsx` - Initial registration form
- `pages/Verify.tsx` - Email verification step
- `pages/ProfileSetup.tsx` - Profile information collection
- College verification with ID card upload

**Technical Implementation:**
```typescript
// Signup process
const signUp = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/auth/callback`
    }
  });
  
  if (error) throw error;
  return data;
};

// Profile setup after verification
const setupProfile = async (profileData: ProfileSetupData) => {
  const { error } = await supabase
    .from('profiles')
    .insert({
      id: user.id,
      handle: profileData.handle.toLowerCase(),
      full_name: profileData.fullName,
      college_id: profileData.collegeId,
      student_id_number: profileData.studentId,
      batch: profileData.batch,
      phone_number: profileData.phoneNumber
    });
    
  if (error) throw error;
};
```

#### Guest Signup Flow
```
Directory Browse → Guest Signup → Limited Access Dashboard
```

**Features:**
- Simplified signup for directory access
- No verification required
- Upgrade path to verified status

### 2. Lists Management System

#### List Creation Flow
```
Dashboard → Create List → Add Items → Set Visibility → Auto-Directory Sync (if public)
```

**Key Features:**
- **Categories**: Films, Places, Products, Services, Other
- **Visibility Levels**: Private, Friends, Public
- **Content Types**: Text recommendations with optional URLs
- **Auto-sync**: Public lists automatically populate the directory

**Technical Implementation:**
```typescript
// List creation with items
const createList = async (listData: CreateListData) => {
  const { data: list, error: listError } = await supabase
    .from('lists')
    .insert({
      title: listData.title,
      description: listData.description,
      category: listData.category,
      visibility: listData.visibility,
      owner_id: user.id
    })
    .select()
    .single();

  if (listError) throw listError;

  // Add items to the list
  const items = listData.items.map((item, index) => ({
    list_id: list.id,
    content: item.content,
    url: item.url,
    position: index
  }));

  const { error: itemsError } = await supabase
    .from('list_items')
    .insert(items);

  if (itemsError) throw itemsError;
  return list;
};

// Database trigger automatically syncs public lists to directory
```

#### List Management Features
- **Edit Lists**: Modify titles, descriptions, visibility
- **Reorder Items**: Drag-and-drop positioning
- **Share Lists**: Direct links and social sharing
- **Analytics**: View counts and engagement metrics

### 3. Social Network System

#### Friend Connection Flow
```
Contact Import → Contact Matching → Friend Suggestions → Friend Requests → Friendships
```

**Contact Import Process:**
1. **Upload Contacts**: Users import phone/email contacts
2. **Privacy Hashing**: Contact data is hashed for privacy
3. **Match Detection**: System matches against existing users
4. **Mutual Suggestions**: Creates bidirectional friend suggestions
5. **Notification System**: Alerts when contacts join platform

**Technical Implementation:**
```typescript
// Contact import with privacy protection
const importContacts = async (contacts: ContactData[]) => {
  const contactsToImport = contacts.map(contact => ({
    user_id: user.id,
    contact_name: contact.name,
    contact_email: contact.email,
    contact_phone: contact.phone,
    import_source: 'manual'
  }));

  const { error } = await supabase
    .from('contact_imports')
    .insert(contactsToImport);

  if (error) throw error;

  // Database function automatically handles matching and suggestions
  await supabase.rpc('check_new_contact_matches', { _user_id: user.id });
};

// Friend request system
const sendFriendRequest = async (addresseeId: string) => {
  const { error } = await supabase
    .from('friend_requests')
    .insert({
      requester_id: user.id,
      addressee_id: addresseeId,
      status: 'pending'
    });

  if (error) throw error;
};
```

#### Extended Network Discovery
```
Friends → Friends-of-Friends → Mutual Connection Display → Connect Options
```

**Features:**
- View friends-of-friends with mutual connection context
- Discover new connections through trusted network
- Privacy-respecting connection suggestions

### 4. Group Management

#### Group Creation and Management Flow
```
Dashboard → Create Group → Add Members → Group-Targeted Requests → Group Lists
```

**Key Features:**
- **Private Groups**: Organize friends into categories
- **Group Requests**: Target recommendations to specific groups
- **Member Management**: Add/remove group members
- **Group Analytics**: Track group engagement

**Technical Implementation:**
```typescript
// Group creation
const createGroup = async (groupData: CreateGroupData) => {
  const { data: group, error: groupError } = await supabase
    .from('groups')
    .insert({
      name: groupData.name,
      description: groupData.description,
      creator_id: user.id
    })
    .select()
    .single();

  if (groupError) throw groupError;

  // Add initial members
  if (groupData.memberIds.length > 0) {
    const members = groupData.memberIds.map(memberId => ({
      group_id: group.id,
      user_id: memberId
    }));

    const { error: membersError } = await supabase
      .from('group_members')
      .insert(members);

    if (membersError) throw membersError;
  }

  return group;
};
```

### 5. Request-Response System

#### Recommendation Request Flow
```
Create Request → Target Audience → Send Notifications → Receive Responses → Vote on Quality
```

**Request Types:**
- **Audience Targeting**: Friends, Extended Network, Specific Groups
- **Category-Based**: Films, Places, Products, Services, Other
- **Location Context**: Optional location-based requests
- **Status Tracking**: Open, Responded, Closed

**Response Types:**
- **Existing List**: Share an existing list as response
- **New Recommendations**: Create new recommendations
- **Comment**: Text-based advice or suggestions

**Technical Implementation:**
```typescript
// Create recommendation request
const createRequest = async (requestData: CreateRequestData) => {
  const { data: request, error } = await supabase
    .from('requests')
    .insert({
      title: requestData.title,
      category: requestData.category,
      location: requestData.location,
      audience_type: requestData.audienceType,
      group_id: requestData.groupId,
      creator_id: user.id,
      status: 'open'
    })
    .select()
    .single();

  if (error) throw error;

  // Trigger notifications to target audience
  await notifyTargetAudience(request);
  return request;
};

// Respond to request
const respondToRequest = async (response: CreateResponseData) => {
  const { error } = await supabase
    .from('request_responses')
    .insert({
      request_id: response.requestId,
      responder_id: user.id,
      response_type: response.type,
      content: response.content,
      list_id: response.listId // Optional, for existing list responses
    });

  if (error) throw error;
};

// Vote on response quality
const voteOnResponse = async (responseId: string, voteType: 'helpful' | 'not_helpful') => {
  const { error } = await supabase
    .from('request_votes')
    .upsert({
      response_id: responseId,
      voter_id: user.id,
      vote_type: voteType
    });

  if (error) throw error;
};
```

### 6. Directory & Discovery System

#### Content Discovery Flow
```
Public Lists → Auto-Sync → Directory Entries → Search & Filter → Vote on Quality
```

**Search Features:**
- **Full-Text Search**: Search across all public content
- **Category Filtering**: Filter by recommendation categories
- **Quality Ranking**: Sort by vote scores and engagement
- **Network Context**: Show connections to content creators

**Technical Implementation:**
```typescript
// Directory search with filters
const searchDirectory = async (searchParams: SearchParams) => {
  let query = supabase
    .from('directory_entries')
    .select(`
      *,
      profiles:contributor_id (
        id,
        handle,
        full_name,
        is_verified
      )
    `);

  // Apply search filter
  if (searchParams.query) {
    query = query.textSearch('content', searchParams.query);
  }

  // Apply category filter
  if (searchParams.category) {
    query = query.eq('category', searchParams.category);
  }

  // Apply sorting
  switch (searchParams.sortBy) {
    case 'relevance':
      // Default PostgreSQL ranking
      break;
    case 'popularity':
      query = query.order('vote_count', { ascending: false });
      break;
    case 'recent':
      query = query.order('created_at', { ascending: false });
      break;
  }

  const { data, error } = await query;
  if (error) throw error;

  // Log search analytics
  await supabase
    .from('search_analytics')
    .insert({
      search_query: searchParams.query,
      category: searchParams.category,
      results_count: data.length,
      user_id: user?.id
    });

  return data;
};

// Vote on directory content
const voteOnDirectoryEntry = async (entryId: string, voteType: 'upvote' | 'downvote') => {
  const { error } = await supabase
    .from('directory_votes')
    .upsert({
      entry_id: entryId,
      voter_id: user.id,
      vote_type: voteType
    });

  if (error) throw error;
};
```

### 7. Notification System

#### Real-Time Notification Flow
```
Trigger Event → Database Function → Real-Time Broadcast → UI Notification → Action Handling
```

**Notification Types:**
- **Friend Requests**: New connection requests
- **Request Responses**: Answers to your recommendation requests
- **Friend Activity**: New lists from friends
- **System Updates**: Platform announcements

**Technical Implementation:**
```typescript
// Real-time notification subscription
useEffect(() => {
  if (!user?.id) return;

  const channel = supabase
    .channel('user_notifications')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`
      },
      (payload) => {
        const notification = payload.new as Notification;
        
        // Add to local state
        setNotifications(prev => [notification, ...prev]);
        
        // Show toast notification
        toast({
          title: notification.title,
          description: notification.message,
          action: notification.related_user_id ? (
            <Button variant="outline" size="sm">
              View
            </Button>
          ) : undefined
        });
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [user?.id]);
```

## User Journey Examples

### New User Complete Journey
```
1. Landing Page Browse → Interest in platform
2. Guest Signup → Limited directory access
3. Find Valuable Content → Motivation to verify
4. Full Signup → Email and profile setup
5. College Verification → ID card upload and approval
6. Contact Import → Connect with existing network
7. First List Creation → Share recommendations
8. Friend Connections → Build social network
9. Request Creation → Ask for recommendations
10. Community Participation → Vote and engage
```

### Daily Active User Flow
```
1. Dashboard → Check stats and recent activity
2. Notifications → Review friend requests and responses
3. Directory Browse → Discover new content
4. Response to Requests → Help friends with recommendations
5. List Management → Update and organize content
6. Social Activity → Connect with new suggestions
```

### Power User Advanced Flow
```
1. Group Management → Organize network strategically
2. Advanced Requests → Target specific audiences
3. Content Curation → Create high-quality lists
4. Network Expansion → Leverage extended network
5. Quality Control → Vote on community content
6. Analytics Review → Track content performance
```

## Feature Integration Points

### Cross-Feature Data Flow
```
Contact Import → Friend Suggestions → Friend Requests → Friendships → 
Content Access → Group Formation → Targeted Requests → Quality Responses → 
Directory Contribution → Community Discovery
```

### Viral Growth Mechanics
1. **Contact Matching**: Import contacts to find existing users
2. **Friend Suggestions**: Mutual contact discovery
3. **Network Effects**: Friends-of-friends expansion
4. **Content Sharing**: High-quality recommendations drive signups
5. **Social Proof**: Verified user status encourages verification

### Quality Control Systems
1. **Verification Requirements**: College email and ID verification
2. **Community Voting**: Quality-based content ranking
3. **Audit Logging**: Contact access monitoring
4. **Admin Oversight**: Role-based moderation capabilities
5. **Privacy Protection**: Hashed contact data storage

This comprehensive feature set creates a closed-loop social recommendation ecosystem that incentivizes quality content creation, authentic connections, and community-driven discovery.