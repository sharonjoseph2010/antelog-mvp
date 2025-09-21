# Database Schema Documentation

## Overview

Antelog uses PostgreSQL through Supabase with comprehensive Row Level Security (RLS) policies. The schema is designed for a social recommendation platform with strong privacy controls and viral growth mechanics.

## Core Tables

### User Management

#### `profiles`
Extended user information linked to Supabase auth.users
```sql
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id),
    handle TEXT UNIQUE NOT NULL,
    full_name TEXT,
    phone_number TEXT,
    college_id UUID REFERENCES colleges(id),
    student_id_number TEXT,
    batch TEXT,
    is_verified BOOLEAN DEFAULT false,
    verification_status verification_status DEFAULT 'pending',
    user_type user_type DEFAULT 'guest',
    trial_ends_at TIMESTAMPTZ,
    id_card_image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Key Features:**
- Unique handle system with normalization
- College verification through ID card uploads
- Trial system for verified users
- Phone number support for contact matching

#### `colleges`
Educational institutions for verification
```sql
CREATE TABLE colleges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    domain TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

### Content Management

#### `lists`
User-created recommendation lists
```sql
CREATE TABLE lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    category list_category NOT NULL,
    visibility list_visibility DEFAULT 'private',
    owner_id UUID NOT NULL REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Enums:**
- `list_category`: 'films', 'places', 'products', 'services', 'other'
- `list_visibility`: 'private', 'friends', 'public'

#### `list_items`
Individual items within lists
```sql
CREATE TABLE list_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    list_id UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    url TEXT,
    position INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

#### `directory_entries`
Aggregated public content for discovery
```sql
CREATE TABLE directory_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    list_id UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    list_item_id UUID NOT NULL REFERENCES list_items(id) ON DELETE CASCADE,
    contributor_id UUID NOT NULL REFERENCES profiles(id),
    category list_category NOT NULL,
    content TEXT NOT NULL,
    url TEXT,
    vote_count INTEGER DEFAULT 0,
    search_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Social Network

#### `friendships`
Bidirectional friend relationships
```sql
CREATE TABLE friendships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user1_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    user2_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    
    CONSTRAINT friendship_different_users CHECK (user1_id != user2_id),
    CONSTRAINT friendship_unique UNIQUE (user1_id, user2_id)
);
```

#### `friend_requests`
Friend request workflow
```sql
CREATE TABLE friend_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    addressee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    CONSTRAINT friend_request_different_users CHECK (requester_id != addressee_id),
    CONSTRAINT friend_request_unique UNIQUE (requester_id, addressee_id)
);
```

#### `friend_suggestions`
AI-powered friend suggestions based on contact matching
```sql
CREATE TABLE friend_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    suggested_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    match_type TEXT NOT NULL CHECK (match_type IN ('phone', 'email')),
    match_value TEXT NOT NULL, -- Hashed for privacy
    is_dismissed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    
    CONSTRAINT suggestion_different_users CHECK (user_id != suggested_user_id)
);
```

### Contact Import System

#### `contact_imports`
User-imported contact data for viral growth
```sql
CREATE TABLE contact_imports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    contact_name TEXT NOT NULL,
    contact_email TEXT,
    contact_phone TEXT,
    import_source TEXT DEFAULT 'manual',
    is_matched BOOLEAN DEFAULT false,
    matched_user_id UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Group Management

#### `groups`
User-created groups for content organization
```sql
CREATE TABLE groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

#### `group_members`
Group membership tracking
```sql
CREATE TABLE group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ DEFAULT now(),
    
    CONSTRAINT unique_group_membership UNIQUE (group_id, user_id)
);
```

### Request System

#### `requests`
User requests for recommendations
```sql
CREATE TABLE requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    category request_category NOT NULL,
    location TEXT,
    audience_type request_audience_type NOT NULL,
    group_id UUID REFERENCES groups(id),
    creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status request_status DEFAULT 'open',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Enums:**
- `request_category`: 'films', 'places', 'products', 'services', 'other'
- `request_audience_type`: 'friends', 'extended_network', 'specific_group'
- `request_status`: 'open', 'responded', 'closed'

#### `request_responses`
Responses to recommendation requests
```sql
CREATE TABLE request_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    responder_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    response_type response_type NOT NULL,
    content TEXT NOT NULL,
    list_id UUID REFERENCES lists(id),
    created_at TIMESTAMPTZ DEFAULT now()
);
```

**Enums:**
- `response_type`: 'existing_list', 'new_recommendations', 'comment'

### Voting and Analytics

#### `directory_votes`
Voting system for content quality
```sql
CREATE TABLE directory_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id UUID NOT NULL REFERENCES directory_entries(id) ON DELETE CASCADE,
    voter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    vote_type TEXT NOT NULL CHECK (vote_type IN ('upvote', 'downvote')),
    created_at TIMESTAMPTZ DEFAULT now(),
    
    CONSTRAINT unique_vote UNIQUE (entry_id, voter_id)
);
```

#### `request_votes`
Voting on request responses
```sql
CREATE TABLE request_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    response_id UUID NOT NULL REFERENCES request_responses(id) ON DELETE CASCADE,
    voter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    vote_type vote_type NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    
    CONSTRAINT unique_response_vote UNIQUE (response_id, voter_id)
);
```

#### `search_analytics`
Search behavior tracking
```sql
CREATE TABLE search_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    search_query TEXT NOT NULL,
    category list_category,
    results_count INTEGER DEFAULT 0,
    user_id UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);
```

### Notifications and Audit

#### `notifications`
Real-time user notifications
```sql
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL,
    related_user_id UUID REFERENCES profiles(id),
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

#### `contact_access_logs`
Audit trail for contact data access
```sql
CREATE TABLE contact_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id),
    action TEXT NOT NULL,
    contact_id UUID,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

### Role Management

#### `user_roles`
Role-based access control
```sql
CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role app_role DEFAULT 'user',
    created_at TIMESTAMPTZ DEFAULT now()
);
```

**Enum:**
- `app_role`: 'admin', 'moderator', 'user'

## Key Database Functions

### Utility Functions

#### `normalize_profile_handle()`
Automatically converts handles to lowercase
```sql
CREATE OR REPLACE FUNCTION normalize_profile_handle()
RETURNS TRIGGER AS $$
BEGIN
    NEW.handle = LOWER(NEW.handle);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

#### `update_updated_at_column()`
Automatically updates timestamp columns
```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### Business Logic Functions

#### `create_mutual_friend_suggestions()`
Creates friend suggestions when contacts match
```sql
CREATE OR REPLACE FUNCTION create_mutual_friend_suggestions(
    _user_id UUID,
    _contact_user_id UUID,
    _match_type TEXT,
    _match_value TEXT
) RETURNS void AS $$
BEGIN
    -- Create suggestion for user who imported contact
    INSERT INTO friend_suggestions (user_id, suggested_user_id, match_type, match_value)
    VALUES (_user_id, _contact_user_id, _match_type, _match_value)
    ON CONFLICT DO NOTHING;
    
    -- Create mutual suggestion
    INSERT INTO friend_suggestions (user_id, suggested_user_id, match_type, match_value)
    VALUES (_contact_user_id, _user_id, _match_type, _match_value)
    ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;
```

#### `sync_directory_entries()`
Syncs public list items to searchable directory
```sql
CREATE OR REPLACE FUNCTION sync_directory_entries()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        -- Handle list visibility changes
        IF NEW.visibility = 'public' THEN
            -- Insert or update directory entries for all list items
            INSERT INTO directory_entries (...)
            SELECT ... FROM list_items WHERE list_id = NEW.id
            ON CONFLICT (list_item_id) DO UPDATE SET ...;
        ELSE
            -- Remove from directory if no longer public
            DELETE FROM directory_entries WHERE list_id = NEW.id;
        END IF;
        RETURN NEW;
    END IF;
    
    IF TG_OP = 'DELETE' THEN
        DELETE FROM directory_entries WHERE list_id = OLD.id;
        RETURN OLD;
    END IF;
END;
$$ LANGUAGE plpgsql;
```

#### `get_extended_network()`
Returns friends-of-friends for network discovery
```sql
CREATE OR REPLACE FUNCTION get_extended_network(_user_id UUID)
RETURNS TABLE (
    profile_id UUID,
    full_name TEXT,
    handle TEXT,
    mutual_friends TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT
        p.id,
        p.full_name,
        p.handle,
        array_agg(mutual.full_name) as mutual_friends
    FROM profiles p
    JOIN friendships f2 ON (p.id = f2.user1_id OR p.id = f2.user2_id)
    JOIN friendships f1 ON (
        (f1.user1_id = _user_id AND f1.user2_id = CASE WHEN f2.user1_id = p.id THEN f2.user2_id ELSE f2.user1_id END)
        OR (f1.user2_id = _user_id AND f1.user1_id = CASE WHEN f2.user1_id = p.id THEN f2.user2_id ELSE f2.user1_id END)
    )
    JOIN profiles mutual ON (mutual.id = CASE WHEN f1.user1_id = _user_id THEN f1.user2_id ELSE f1.user1_id END)
    WHERE p.id != _user_id
    GROUP BY p.id, p.full_name, p.handle;
END;
$$ LANGUAGE plpgsql;
```

## Row Level Security (RLS) Policies

### Authentication Patterns

#### Basic Authentication Check
```sql
CREATE POLICY "Authenticated users only" ON table_name
    FOR ALL USING (auth.uid() IS NOT NULL);
```

#### Self-Ownership Pattern
```sql
CREATE POLICY "Users can access own data" ON profiles
    FOR ALL USING (auth.uid() = id);
```

#### Friendship-Based Access
```sql
CREATE POLICY "Friends can view content" ON lists
    FOR SELECT USING (
        visibility = 'public' 
        OR owner_id = auth.uid()
        OR (visibility = 'friends' AND owner_id IN (
            SELECT CASE 
                WHEN user1_id = auth.uid() THEN user2_id 
                ELSE user1_id 
            END
            FROM friendships 
            WHERE user1_id = auth.uid() OR user2_id = auth.uid()
        ))
    );
```

#### Role-Based Access
```sql
CREATE POLICY "Admins can access all" ON profiles
    FOR ALL USING (
        auth.uid() = id 
        OR has_role(auth.uid(), 'admin')
    );
```

### Privacy Protection

#### Contact Data Protection
```sql
CREATE POLICY "Contact access logging" ON contact_imports
    FOR SELECT USING (
        user_id = auth.uid() 
        AND log_contact_access('view', id::text) IS NOT NULL
    );
```

#### Audit Trail Requirements
```sql
CREATE POLICY "Logged users only" ON contact_access_logs
    FOR INSERT WITH CHECK (
        user_id = auth.uid() 
        AND validate_authenticated_user()
    );
```

## Indexes and Performance

### Primary Indexes
```sql
-- Performance-critical indexes
CREATE INDEX idx_lists_owner_visibility ON lists(owner_id, visibility);
CREATE INDEX idx_friendships_users ON friendships(user1_id, user2_id);
CREATE INDEX idx_directory_entries_category ON directory_entries(category);
CREATE INDEX idx_notifications_user_read ON notifications(user_id, is_read);

-- Full-text search
CREATE INDEX idx_directory_entries_content_fts ON directory_entries 
    USING gin(to_tsvector('english', content));
```

### Composite Indexes
```sql
-- Optimized for common queries
CREATE INDEX idx_requests_creator_status ON requests(creator_id, status);
CREATE INDEX idx_friend_suggestions_user_dismissed ON friend_suggestions(user_id, is_dismissed);
CREATE INDEX idx_list_items_list_position ON list_items(list_id, position);
```

## Data Integrity Constraints

### Business Rule Constraints
```sql
-- Prevent self-friendship
ALTER TABLE friendships ADD CONSTRAINT no_self_friendship 
    CHECK (user1_id != user2_id);

-- Ensure unique friendship pairs
ALTER TABLE friendships ADD CONSTRAINT unique_friendship_pair 
    UNIQUE (LEAST(user1_id, user2_id), GREATEST(user1_id, user2_id));

-- Validate handle format
ALTER TABLE profiles ADD CONSTRAINT valid_handle_format 
    CHECK (handle ~ '^[a-z0-9_]+$');
```

### Referential Integrity
```sql
-- Cascade deletions appropriately
ALTER TABLE list_items ADD CONSTRAINT fk_list_items_list 
    FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE;

-- Protect critical references
ALTER TABLE friendships ADD CONSTRAINT fk_friendships_user1 
    FOREIGN KEY (user1_id) REFERENCES profiles(id) ON DELETE CASCADE;
```

This database schema provides a robust foundation for a social recommendation platform with comprehensive security, performance optimization, and data integrity features.