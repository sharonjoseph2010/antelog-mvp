# Antelog Architecture Overview

## System Architecture

Antelog is built as a modern web application with a React frontend and Supabase backend, implementing a trust-based social recommendation platform.

### Technology Stack

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│    Frontend     │    │     Backend      │    │    Database     │
│                 │    │                  │    │                 │
│ React 18        │◄──►│ Supabase API     │◄──►│ PostgreSQL      │
│ TypeScript      │    │ Auth + Realtime  │    │ Row Level Sec   │
│ Vite            │    │ Edge Functions   │    │ Full Text Search│
│ TailwindCSS     │    │ Storage          │    │ Triggers & Funcs│
│ Radix UI        │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### High-Level Data Flow

```
User Action → React Component → Supabase Client → Database Query
     ↓              ↓                ↓               ↓
UI Update ← React State ← Query Result ← Database Response
```

## Core Entities and Relationships

### Entity Relationship Diagram

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Colleges  │     │  Profiles   │     │    Lists    │
│             │     │             │     │             │
│ - id        │◄────│ - id        │────►│ - id        │
│ - name      │     │ - handle    │     │ - title     │
│ - domain    │     │ - user_type │     │ - category  │
└─────────────┘     │ - is_verified│    │ - visibility│
                    └─────────────┘     └─────────────┘
                           │                    │
                           │                    ▼
                           │            ┌─────────────┐
                           │            │ List Items  │
                           │            │             │
                           │            │ - id        │
                           │            │ - content   │
                           │            │ - position  │
                           │            │ - url       │
                           │            └─────────────┘
                           │
                           ▼
                    ┌─────────────┐     ┌─────────────┐
                    │ Friendships │     │   Groups    │
                    │             │     │             │
                    │ - user1_id  │     │ - id        │
                    │ - user2_id  │     │ - name      │
                    │ - created_at│     │ - creator_id│
                    └─────────────┘     └─────────────┘
                           │                    │
                           │                    ▼
                           │            ┌─────────────┐
                           │            │Group Members│
                           │            │             │
                           │            │ - group_id  │
                           │            │ - user_id   │
                           │            └─────────────┘
                           │
                           ▼
                    ┌─────────────┐     ┌─────────────┐
                    │  Requests   │     │Request Resp │
                    │             │     │             │
                    │ - id        │◄────│ - request_id│
                    │ - title     │     │ - responder │
                    │ - category  │     │ - content   │
                    │ - audience  │     │ - type      │
                    └─────────────┘     └─────────────┘
```

### Key Relationships

1. **User-Centric Design**: All entities link back to user profiles
2. **Hierarchical Content**: Lists contain items, responses can reference lists
3. **Social Graph**: Friendships and groups enable content sharing
4. **Discovery Layer**: Directory aggregates public content for search

## Application Layers

### 1. Presentation Layer (React Components)

```
src/
├── pages/              # Route-level components (business logic)
│   ├── Dashboard.tsx   # Main user hub
│   ├── Lists.tsx       # Content management
│   ├── Friends.tsx     # Social network
│   ├── Directory.tsx   # Content discovery
│   └── ...
├── components/
│   ├── ui/            # Atomic design components (shadcn/ui)
│   ├── layout/        # Page structure components
│   └── routes/        # Authentication guards
└── hooks/             # Custom React hooks for state management
```

### 2. State Management Layer

```
TanStack Query (React Query)
├── Server State Management
├── Caching & Synchronization
├── Background Updates
└── Optimistic Updates

Supabase Realtime
├── Live Data Subscriptions
├── Real-time Notifications
└── Collaborative Features
```

### 3. API Layer (Supabase)

```
Supabase Client
├── Authentication
├── Database Queries (PostgREST)
├── Real-time Subscriptions
├── File Storage
└── Edge Functions
```

### 4. Data Layer (PostgreSQL)

```
Database Functions & Triggers
├── Business Logic Enforcement
├── Data Integrity Constraints
├── Automated Data Sync
└── Security Policy Enforcement

Row Level Security (RLS)
├── User-based Access Control
├── Relationship-based Permissions
├── Role-based Administration
└── Audit Trail Logging
```

## Security Architecture

### Authentication & Authorization

```
┌─────────────────┐
│   User Login    │
└─────────┬───────┘
          │
          ▼
┌─────────────────┐    ┌─────────────────┐
│ Supabase Auth   │───►│ JWT Token       │
└─────────┬───────┘    └─────────┬───────┘
          │                      │
          ▼                      ▼
┌─────────────────┐    ┌─────────────────┐
│ Profile Check   │    │ RLS Policy      │
│ - User Type     │    │ Evaluation      │
│ - Verification  │    │                 │
└─────────┬───────┘    └─────────┬───────┘
          │                      │
          ▼                      ▼
┌─────────────────┐    ┌─────────────────┐
│ Role Assignment │    │ Data Access     │
│ - Admin         │    │ Granted         │
│ - Moderator     │    │                 │
│ - User          │    │                 │
└─────────────────┘    └─────────────────┘
```

### Row Level Security (RLS) Patterns

1. **Self-Ownership**: Users can only access their own data
```sql
CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);
```

2. **Friendship-Based Access**: Access based on social connections
```sql
CREATE POLICY "Users can view friends' content" ON lists
    FOR SELECT USING (
        visibility = 'friends' AND 
        owner_id IN (SELECT friend_id FROM user_friends WHERE user_id = auth.uid())
    );
```

3. **Role-Based Access**: Admin/moderator overrides
```sql
CREATE POLICY "Admins can access all data" ON profiles
    FOR ALL USING (has_role(auth.uid(), 'admin'));
```

## Data Flow Patterns

### 1. Content Creation Flow

```
User Input → Form Validation → Supabase Insert → Database Trigger → 
Real-time Update → Directory Sync → Search Index Update
```

### 2. Social Connection Flow

```
Contact Import → Hash Generation → Match Detection → Friend Suggestion → 
Friend Request → Acceptance → Friendship Creation → Content Access Update
```

### 3. Recommendation Request Flow

```
Request Creation → Audience Targeting → Notification Send → Response Creation → 
Voting System → Quality Ranking → Discovery Integration
```

## Performance Considerations

### Frontend Optimization

1. **Code Splitting**: Route-based code splitting with React Router
2. **Lazy Loading**: Components loaded on demand
3. **Caching**: TanStack Query for server state caching
4. **Optimistic Updates**: Immediate UI feedback

### Backend Optimization

1. **Database Indexing**: Strategic indexes on frequently queried columns
2. **Query Optimization**: Efficient joins and filtering
3. **Connection Pooling**: Supabase handles connection management
4. **CDN Integration**: Static asset delivery optimization

### Scalability Patterns

1. **Horizontal Database Scaling**: PostgreSQL read replicas
2. **Edge Functions**: Compute at the edge for low latency
3. **Real-time Optimization**: Selective subscriptions
4. **Caching Strategy**: Multi-layer caching (browser, CDN, database)

## Integration Points

### External Services

```
Antelog Application
├── Supabase (Backend as a Service)
│   ├── Authentication
│   ├── Database
│   ├── Storage
│   └── Real-time
├── Email Services (Supabase Auth)
├── File Storage (Supabase Storage)
└── Analytics (Built-in tracking)
```

### API Design Patterns

1. **RESTful APIs**: Standard HTTP methods via PostgREST
2. **Real-time Subscriptions**: WebSocket connections for live data
3. **Batch Operations**: Efficient bulk data operations
4. **Error Handling**: Consistent error response patterns

## Development Workflow

### Local Development

```bash
# Development Stack
npm run dev          # Vite dev server
supabase start       # Local Supabase instance
supabase db reset    # Reset local database
supabase functions serve  # Local edge functions
```

### Testing Strategy

1. **Frontend Testing**: Component tests with React Testing Library
2. **Integration Testing**: End-to-end tests with Playwright
3. **Database Testing**: Migration testing and RLS verification
4. **Performance Testing**: Load testing with realistic data

### Deployment Pipeline

```
Code Commit → Build Process → Test Suite → Deploy to Staging → 
Production Deploy → Database Migration → Cache Invalidation
```

## Monitoring & Observability

### Application Monitoring

1. **Error Tracking**: Frontend error monitoring
2. **Performance Metrics**: Core Web Vitals tracking
3. **User Analytics**: Feature usage and engagement
4. **Database Monitoring**: Query performance and connections

### Security Monitoring

1. **Authentication Logs**: Login attempts and failures
2. **Access Logs**: Data access patterns
3. **Audit Trails**: Contact access tracking
4. **Security Alerts**: Suspicious activity detection

## Future Architecture Considerations

### Scalability Improvements

1. **Microservices**: Break out specific domains
2. **Event-Driven Architecture**: Decouple services with events
3. **Caching Layer**: Redis for session and application caching
4. **Search Service**: Dedicated search infrastructure

### Feature Enhancements

1. **Mobile Applications**: React Native or native apps
2. **API Gateway**: Centralized API management
3. **Machine Learning**: Recommendation algorithms
4. **Internationalization**: Multi-language support

This architecture provides a solid foundation for a social recommendation platform while maintaining flexibility for future growth and feature additions.