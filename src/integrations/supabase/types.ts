export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      anonymous_handles: {
        Row: {
          anonymous_handle: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          anonymous_handle: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          anonymous_handle?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      colleges: {
        Row: {
          created_at: string
          domain: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          domain: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          domain?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      contact_access_logs: {
        Row: {
          action: string
          contact_id: string | null
          created_at: string | null
          id: string
          ip_address: unknown
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          contact_id?: string | null
          created_at?: string | null
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          contact_id?: string | null
          created_at?: string | null
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      contact_imports: {
        Row: {
          consent_given: boolean | null
          consent_timestamp: string | null
          contact_email: string | null
          contact_name: string
          contact_phone: string | null
          created_at: string
          data_retention_expires_at: string | null
          encrypted_email: string | null
          encrypted_phone: string | null
          id: string
          import_source: string
          is_matched: boolean
          matched_user_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          consent_given?: boolean | null
          consent_timestamp?: string | null
          contact_email?: string | null
          contact_name: string
          contact_phone?: string | null
          created_at?: string
          data_retention_expires_at?: string | null
          encrypted_email?: string | null
          encrypted_phone?: string | null
          id?: string
          import_source?: string
          is_matched?: boolean
          matched_user_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          consent_given?: boolean | null
          consent_timestamp?: string | null
          contact_email?: string | null
          contact_name?: string
          contact_phone?: string | null
          created_at?: string
          data_retention_expires_at?: string | null
          encrypted_email?: string | null
          encrypted_phone?: string | null
          id?: string
          import_source?: string
          is_matched?: boolean
          matched_user_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      directory_entries: {
        Row: {
          category: Database["public"]["Enums"]["list_category"]
          content: string
          contributor_id: string
          created_at: string
          id: string
          list_id: string
          list_item_id: string
          search_count: number
          updated_at: string
          url: string | null
          vote_count: number
        }
        Insert: {
          category: Database["public"]["Enums"]["list_category"]
          content: string
          contributor_id: string
          created_at?: string
          id?: string
          list_id: string
          list_item_id: string
          search_count?: number
          updated_at?: string
          url?: string | null
          vote_count?: number
        }
        Update: {
          category?: Database["public"]["Enums"]["list_category"]
          content?: string
          contributor_id?: string
          created_at?: string
          id?: string
          list_id?: string
          list_item_id?: string
          search_count?: number
          updated_at?: string
          url?: string | null
          vote_count?: number
        }
        Relationships: []
      }
      directory_preferred_terms: {
        Row: {
          aliases: Json | null
          category_group: string
          created_at: string | null
          id: string
          plural_term: string
          preferred_term: string
        }
        Insert: {
          aliases?: Json | null
          category_group: string
          created_at?: string | null
          id?: string
          plural_term: string
          preferred_term: string
        }
        Update: {
          aliases?: Json | null
          category_group?: string
          created_at?: string | null
          id?: string
          plural_term?: string
          preferred_term?: string
        }
        Relationships: []
      }
      directory_votes: {
        Row: {
          created_at: string
          entry_id: string
          id: string
          vote_type: string
          voter_id: string
        }
        Insert: {
          created_at?: string
          entry_id: string
          id?: string
          vote_type: string
          voter_id: string
        }
        Update: {
          created_at?: string
          entry_id?: string
          id?: string
          vote_type?: string
          voter_id?: string
        }
        Relationships: []
      }
      friend_requests: {
        Row: {
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          status: string
          updated_at: string
        }
        Insert: {
          addressee_id: string
          created_at?: string
          id?: string
          requester_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          addressee_id?: string
          created_at?: string
          id?: string
          requester_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      friend_suggestions: {
        Row: {
          created_at: string
          id: string
          is_dismissed: boolean
          match_type: string
          match_value: string
          suggested_user_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_dismissed?: boolean
          match_type: string
          match_value: string
          suggested_user_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_dismissed?: boolean
          match_type?: string
          match_value?: string
          suggested_user_id?: string
          user_id?: string
        }
        Relationships: []
      }
      friendships: {
        Row: {
          created_at: string
          id: string
          user1_id: string
          user2_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user1_id: string
          user2_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user1_id?: string
          user2_id?: string
        }
        Relationships: []
      }
      group_members: {
        Row: {
          added_at: string
          group_id: string
          id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          group_id: string
          id?: string
          user_id: string
        }
        Update: {
          added_at?: string
          group_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          creator_id: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          creator_id: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          creator_id?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      guest_contributions: {
        Row: {
          contributor_contact: string | null
          contributor_name: string
          converted_user_id: string | null
          created_at: string | null
          id: string
          invited_to_join: boolean | null
          joined_antelog: boolean | null
          recommendations: Json
          request_id: string | null
          share_link_id: string | null
        }
        Insert: {
          contributor_contact?: string | null
          contributor_name: string
          converted_user_id?: string | null
          created_at?: string | null
          id?: string
          invited_to_join?: boolean | null
          joined_antelog?: boolean | null
          recommendations?: Json
          request_id?: string | null
          share_link_id?: string | null
        }
        Update: {
          contributor_contact?: string | null
          contributor_name?: string
          converted_user_id?: string | null
          created_at?: string | null
          id?: string
          invited_to_join?: boolean | null
          joined_antelog?: boolean | null
          recommendations?: Json
          request_id?: string | null
          share_link_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_contributions_converted_user_id_fkey"
            columns: ["converted_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_contributions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_contributions_share_link_id_fkey"
            columns: ["share_link_id"]
            isOneToOne: false
            referencedRelation: "share_links"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_recommendation_merges: {
        Row: {
          created_at: string | null
          guest_contribution_id: string | null
          id: string
          merged_into_rec_id: string | null
          merged_into_text: string | null
          recommendation_position: number | null
        }
        Insert: {
          created_at?: string | null
          guest_contribution_id?: string | null
          id?: string
          merged_into_rec_id?: string | null
          merged_into_text?: string | null
          recommendation_position?: number | null
        }
        Update: {
          created_at?: string | null
          guest_contribution_id?: string | null
          id?: string
          merged_into_rec_id?: string | null
          merged_into_text?: string | null
          recommendation_position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_recommendation_merges_guest_contribution_id_fkey"
            columns: ["guest_contribution_id"]
            isOneToOne: false
            referencedRelation: "guest_contributions"
            referencedColumns: ["id"]
          },
        ]
      }
      list_items: {
        Row: {
          content: string
          created_at: string
          id: string
          list_id: string
          mention_count: number | null
          notes: string | null
          position: number
          source_recommendation_ids: string[] | null
          updated_at: string
          url: string | null
          vote_count: number | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          list_id: string
          mention_count?: number | null
          notes?: string | null
          position: number
          source_recommendation_ids?: string[] | null
          updated_at?: string
          url?: string | null
          vote_count?: number | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          list_id?: string
          mention_count?: number | null
          notes?: string | null
          position?: number
          source_recommendation_ids?: string[] | null
          updated_at?: string
          url?: string | null
          vote_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_list_items_list"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_list_items_list"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "master_directory_lists_view"
            referencedColumns: ["list_id"]
          },
        ]
      }
      lists: {
        Row: {
          category: Database["public"]["Enums"]["list_category"]
          created_at: string
          description: string | null
          directory_list_id: string | null
          id: string
          item_count: number | null
          owner_id: string
          source_request_id: string | null
          title: string
          total_contributors: number | null
          total_votes: number | null
          updated_at: string
          visibility: Database["public"]["Enums"]["list_visibility"]
        }
        Insert: {
          category: Database["public"]["Enums"]["list_category"]
          created_at?: string
          description?: string | null
          directory_list_id?: string | null
          id?: string
          item_count?: number | null
          owner_id: string
          source_request_id?: string | null
          title: string
          total_contributors?: number | null
          total_votes?: number | null
          updated_at?: string
          visibility?: Database["public"]["Enums"]["list_visibility"]
        }
        Update: {
          category?: Database["public"]["Enums"]["list_category"]
          created_at?: string
          description?: string | null
          directory_list_id?: string | null
          id?: string
          item_count?: number | null
          owner_id?: string
          source_request_id?: string | null
          title?: string
          total_contributors?: number | null
          total_votes?: number | null
          updated_at?: string
          visibility?: Database["public"]["Enums"]["list_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "fk_lists_owner"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lists_directory_list_id_fkey"
            columns: ["directory_list_id"]
            isOneToOne: false
            referencedRelation: "master_directory_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lists_source_request_id_fkey"
            columns: ["source_request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      master_directory_entries: {
        Row: {
          category: Database["public"]["Enums"]["list_category"]
          created_at: string
          display_content: string
          id: string
          latest_mention_at: string
          mention_count: number
          mentioned_by_users: string[]
          normalized_content: string
          searchable_text: string | null
          total_search_count: number
          updated_at: string
          url: string | null
        }
        Insert: {
          category: Database["public"]["Enums"]["list_category"]
          created_at?: string
          display_content: string
          id?: string
          latest_mention_at: string
          mention_count?: number
          mentioned_by_users?: string[]
          normalized_content: string
          searchable_text?: string | null
          total_search_count?: number
          updated_at?: string
          url?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["list_category"]
          created_at?: string
          display_content?: string
          id?: string
          latest_mention_at?: string
          mention_count?: number
          mentioned_by_users?: string[]
          normalized_content?: string
          searchable_text?: string | null
          total_search_count?: number
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
      master_directory_items: {
        Row: {
          added_by: string | null
          created_at: string | null
          id: string
          item_name: string
          item_name_normalized: string
          list_id: string | null
          vote_count: number | null
        }
        Insert: {
          added_by?: string | null
          created_at?: string | null
          id?: string
          item_name: string
          item_name_normalized: string
          list_id?: string | null
          vote_count?: number | null
        }
        Update: {
          added_by?: string | null
          created_at?: string | null
          id?: string
          item_name?: string
          item_name_normalized?: string
          list_id?: string | null
          vote_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "master_directory_items_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "master_directory_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "master_directory_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      master_directory_lists: {
        Row: {
          aliases: Json | null
          canonical_query: string | null
          canonical_signature: string | null
          canonical_title: string | null
          category: string
          category_group: string | null
          contributor_count: number | null
          created_at: string | null
          display_geography: string | null
          domain: string | null
          entity_type: string | null
          facets: Json | null
          geography: string | null
          hard_filter: string | null
          id: string
          legacy_migrated: boolean | null
          normalized_geography: string | null
          original_contributor_id: string | null
          ranking_lens: string | null
          source_title: string | null
          status: string | null
          temporal_scope: string | null
          title: string
          title_normalized: string
          total_votes: number | null
          updated_at: string | null
          use_case: string | null
        }
        Insert: {
          aliases?: Json | null
          canonical_query?: string | null
          canonical_signature?: string | null
          canonical_title?: string | null
          category?: string
          category_group?: string | null
          contributor_count?: number | null
          created_at?: string | null
          display_geography?: string | null
          domain?: string | null
          entity_type?: string | null
          facets?: Json | null
          geography?: string | null
          hard_filter?: string | null
          id?: string
          legacy_migrated?: boolean | null
          normalized_geography?: string | null
          original_contributor_id?: string | null
          ranking_lens?: string | null
          source_title?: string | null
          status?: string | null
          temporal_scope?: string | null
          title: string
          title_normalized: string
          total_votes?: number | null
          updated_at?: string | null
          use_case?: string | null
        }
        Update: {
          aliases?: Json | null
          canonical_query?: string | null
          canonical_signature?: string | null
          canonical_title?: string | null
          category?: string
          category_group?: string | null
          contributor_count?: number | null
          created_at?: string | null
          display_geography?: string | null
          domain?: string | null
          entity_type?: string | null
          facets?: Json | null
          geography?: string | null
          hard_filter?: string | null
          id?: string
          legacy_migrated?: boolean | null
          normalized_geography?: string | null
          original_contributor_id?: string | null
          ranking_lens?: string | null
          source_title?: string | null
          status?: string | null
          temporal_scope?: string | null
          title?: string
          title_normalized?: string
          total_votes?: number | null
          updated_at?: string | null
          use_case?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "master_directory_lists_original_contributor_id_fkey"
            columns: ["original_contributor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      master_directory_votes: {
        Row: {
          created_at: string | null
          id: string
          item_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          item_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          item_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "master_directory_votes_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "master_directory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "master_directory_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          metadata: Json | null
          related_user_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          metadata?: Json | null
          related_user_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          metadata?: Json | null
          related_user_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          bio: string | null
          created_at: string
          expertise_cities: Json | null
          expertise_domains: Json | null
          full_name: string | null
          handle: string
          id: string
          interests: Json | null
          is_verified: boolean
          location: string | null
          occupation: string | null
          phone_number: string | null
          questionnaire_completed: boolean | null
          questionnaire_completed_at: string | null
          trial_ends_at: string | null
          updated_at: string
          user_type: Database["public"]["Enums"]["user_type"]
          verification_status: Database["public"]["Enums"]["verification_status"]
        }
        Insert: {
          bio?: string | null
          created_at?: string
          expertise_cities?: Json | null
          expertise_domains?: Json | null
          full_name?: string | null
          handle: string
          id: string
          interests?: Json | null
          is_verified?: boolean
          location?: string | null
          occupation?: string | null
          phone_number?: string | null
          questionnaire_completed?: boolean | null
          questionnaire_completed_at?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          user_type?: Database["public"]["Enums"]["user_type"]
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Update: {
          bio?: string | null
          created_at?: string
          expertise_cities?: Json | null
          expertise_domains?: Json | null
          full_name?: string | null
          handle?: string
          id?: string
          interests?: Json | null
          is_verified?: boolean
          location?: string | null
          occupation?: string | null
          phone_number?: string | null
          questionnaire_completed?: boolean | null
          questionnaire_completed_at?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          user_type?: Database["public"]["Enums"]["user_type"]
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Relationships: []
      }
      recommendation_clusters: {
        Row: {
          canonical_text: string
          cluster_method: string | null
          created_at: string | null
          id: string
          mention_count: number | null
          position: number | null
          recommendation_ids: string[]
          request_id: string
          similarity_score: number | null
          status: string | null
          total_votes: number | null
          updated_at: string | null
        }
        Insert: {
          canonical_text: string
          cluster_method?: string | null
          created_at?: string | null
          id?: string
          mention_count?: number | null
          position?: number | null
          recommendation_ids?: string[]
          request_id: string
          similarity_score?: number | null
          status?: string | null
          total_votes?: number | null
          updated_at?: string | null
        }
        Update: {
          canonical_text?: string
          cluster_method?: string | null
          created_at?: string | null
          id?: string
          mention_count?: number | null
          position?: number | null
          recommendation_ids?: string[]
          request_id?: string
          similarity_score?: number | null
          status?: string | null
          total_votes?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_clusters_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendation_votes: {
        Row: {
          created_at: string | null
          id: string
          recommendation_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          recommendation_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          recommendation_id?: string
          user_id?: string
        }
        Relationships: []
      }
      request_anonymous_impressions: {
        Row: {
          dismissed_at: string | null
          recipient_id: string
          request_id: string
          responded: boolean
          surfaced_at: string
        }
        Insert: {
          dismissed_at?: string | null
          recipient_id: string
          request_id: string
          responded?: boolean
          surfaced_at?: string
        }
        Update: {
          dismissed_at?: string | null
          recipient_id?: string
          request_id?: string
          responded?: boolean
          surfaced_at?: string
        }
        Relationships: []
      }
      request_forwards: {
        Row: {
          created_at: string
          forwarded_by_user_id: string
          forwarded_to: string[] | null
          forwarded_to_audience: Database["public"]["Enums"]["request_audience_type"]
          forwarded_to_group_id: string | null
          id: string
          network_depth: number | null
          network_path: string[] | null
          request_id: string
        }
        Insert: {
          created_at?: string
          forwarded_by_user_id: string
          forwarded_to?: string[] | null
          forwarded_to_audience: Database["public"]["Enums"]["request_audience_type"]
          forwarded_to_group_id?: string | null
          id?: string
          network_depth?: number | null
          network_path?: string[] | null
          request_id: string
        }
        Update: {
          created_at?: string
          forwarded_by_user_id?: string
          forwarded_to?: string[] | null
          forwarded_to_audience?: Database["public"]["Enums"]["request_audience_type"]
          forwarded_to_group_id?: string | null
          id?: string
          network_depth?: number | null
          network_path?: string[] | null
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_forwards_forwarded_to_group_id_fkey"
            columns: ["forwarded_to_group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_forwards_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      request_responses: {
        Row: {
          created_at: string
          id: string
          overall_notes: string | null
          request_id: string
          responder_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          overall_notes?: string | null
          request_id: string
          responder_id: string
        }
        Update: {
          created_at?: string
          id?: string
          overall_notes?: string | null
          request_id?: string
          responder_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_request_responses_request_id"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      request_votes: {
        Row: {
          created_at: string
          id: string
          response_id: string
          vote_type: Database["public"]["Enums"]["vote_type"]
          voter_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          response_id: string
          vote_type: Database["public"]["Enums"]["vote_type"]
          voter_id: string
        }
        Update: {
          created_at?: string
          id?: string
          response_id?: string
          vote_type?: Database["public"]["Enums"]["vote_type"]
          voter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_request_votes_response_id"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "request_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      requests: {
        Row: {
          allow_forwarding: boolean | null
          audience_type: Database["public"]["Enums"]["request_audience_type"]
          audience_types: string[]
          category: Database["public"]["Enums"]["request_category"]
          created_at: string
          creator_id: string
          expires_at: string
          expiry_notified: boolean | null
          forwarding_chain: Json | null
          group_id: string | null
          id: string
          location: string | null
          routing_signal: number
          selected_users: string[] | null
          status: Database["public"]["Enums"]["request_status"]
          title: string
          updated_at: string
        }
        Insert: {
          allow_forwarding?: boolean | null
          audience_type: Database["public"]["Enums"]["request_audience_type"]
          audience_types: string[]
          category: Database["public"]["Enums"]["request_category"]
          created_at?: string
          creator_id: string
          expires_at?: string
          expiry_notified?: boolean | null
          forwarding_chain?: Json | null
          group_id?: string | null
          id?: string
          location?: string | null
          routing_signal?: number
          selected_users?: string[] | null
          status?: Database["public"]["Enums"]["request_status"]
          title: string
          updated_at?: string
        }
        Update: {
          allow_forwarding?: boolean | null
          audience_type?: Database["public"]["Enums"]["request_audience_type"]
          audience_types?: string[]
          category?: Database["public"]["Enums"]["request_category"]
          created_at?: string
          creator_id?: string
          expires_at?: string
          expiry_notified?: boolean | null
          forwarding_chain?: Json | null
          group_id?: string | null
          id?: string
          location?: string | null
          routing_signal?: number
          selected_users?: string[] | null
          status?: Database["public"]["Enums"]["request_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_requests_group_id"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      response_recommendations: {
        Row: {
          created_at: string | null
          id: string
          link: string | null
          merged_away: boolean | null
          merged_into_id: string | null
          position: number
          quick_details: string | null
          reason: string
          recommendation_text: string
          recommendation_text_normalized: string
          response_id: string
          vote_count: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          link?: string | null
          merged_away?: boolean | null
          merged_into_id?: string | null
          position: number
          quick_details?: string | null
          reason: string
          recommendation_text: string
          recommendation_text_normalized: string
          response_id: string
          vote_count?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          link?: string | null
          merged_away?: boolean | null
          merged_into_id?: string | null
          position?: number
          quick_details?: string | null
          reason?: string
          recommendation_text?: string
          recommendation_text_normalized?: string
          response_id?: string
          vote_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "response_recommendations_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "response_recommendations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "response_recommendations_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "request_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      search_analytics: {
        Row: {
          category: Database["public"]["Enums"]["list_category"] | null
          created_at: string
          id: string
          results_count: number
          search_query: string
          user_id: string | null
        }
        Insert: {
          category?: Database["public"]["Enums"]["list_category"] | null
          created_at?: string
          id?: string
          results_count?: number
          search_query: string
          user_id?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["list_category"] | null
          created_at?: string
          id?: string
          results_count?: number
          search_query?: string
          user_id?: string | null
        }
        Relationships: []
      }
      share_links: {
        Row: {
          created_at: string | null
          current_responses: number | null
          generated_by_contact: string | null
          generated_by_name: string | null
          generated_by_user_id: string | null
          id: string
          max_responses: number | null
          parent_link_id: string | null
          request_id: string | null
          times_opened: number | null
          token: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          current_responses?: number | null
          generated_by_contact?: string | null
          generated_by_name?: string | null
          generated_by_user_id?: string | null
          id?: string
          max_responses?: number | null
          parent_link_id?: string | null
          request_id?: string | null
          times_opened?: number | null
          token: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          current_responses?: number | null
          generated_by_contact?: string | null
          generated_by_name?: string | null
          generated_by_user_id?: string | null
          id?: string
          max_responses?: number | null
          parent_link_id?: string | null
          request_id?: string | null
          times_opened?: number | null
          token?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "share_links_generated_by_user_id_fkey"
            columns: ["generated_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_links_parent_link_id_fkey"
            columns: ["parent_link_id"]
            isOneToOne: false
            referencedRelation: "share_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_links_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      temp_waitlist: {
        Row: {
          created_at: string | null
          email: string
          id: string
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
        }
        Relationships: []
      }
      user_expertise: {
        Row: {
          confidence_scores: number[]
          created_at: string
          expertise_tags: string[]
          id: string
          last_updated: string
          user_id: string
        }
        Insert: {
          confidence_scores?: number[]
          created_at?: string
          expertise_tags?: string[]
          id?: string
          last_updated?: string
          user_id: string
        }
        Update: {
          confidence_scores?: number[]
          created_at?: string
          expertise_tags?: string[]
          id?: string
          last_updated?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      cluster_details: {
        Row: {
          canonical_text: string | null
          cluster_id: string | null
          mention_count: number | null
          position: number | null
          request_id: string | null
          similarity_score: number | null
          status: string | null
          total_votes: number | null
          variations: Json | null
        }
        Insert: {
          canonical_text?: string | null
          cluster_id?: string | null
          mention_count?: number | null
          position?: number | null
          request_id?: string | null
          similarity_score?: number | null
          status?: string | null
          total_votes?: number | null
          variations?: never
        }
        Update: {
          canonical_text?: string | null
          cluster_id?: string | null
          mention_count?: number | null
          position?: number | null
          request_id?: string | null
          similarity_score?: number | null
          status?: string | null
          total_votes?: number | null
          variations?: never
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_clusters_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      master_directory_lists_view: {
        Row: {
          category: Database["public"]["Enums"]["list_category"] | null
          contributor_count: number | null
          contributor_handles: string[] | null
          created_at: string | null
          creator_handle: string | null
          creator_name: string | null
          item_count: number | null
          items_array: string[] | null
          items_preview: string | null
          latest_item_at: string | null
          list_description: string | null
          list_id: string | null
          list_title: string | null
          owner_id: string | null
          primary_creator_handle: string | null
          searchable_text: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_lists_owner"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      master_directory_view: {
        Row: {
          category: Database["public"]["Enums"]["list_category"] | null
          display_content: string | null
          latest_mention_at: string | null
          mention_count: number | null
          mentioned_by_users: string[] | null
          normalized_content: string | null
          searchable_text: string | null
          total_search_count: number | null
          url: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_delete_user: {
        Args: { user_id_to_delete: string }
        Returns: undefined
      }
      anonymous_active_cap_ok: {
        Args: { p_recipient_id: string }
        Returns: boolean
      }
      anonymous_creator_cooldown_ok: {
        Args: { p_creator_id: string; p_recipient_id: string }
        Returns: boolean
      }
      anonymous_thread_label: {
        Args: { p_request_id: string; p_uid: string }
        Returns: string
      }
      build_canonical_signature: {
        Args: {
          p_entity_type: string
          p_geography?: string
          p_hard_filter?: string
          p_ranking_lens?: string
          p_temporal_scope?: string
          p_use_case?: string
        }
        Returns: string
      }
      build_canonical_title: {
        Args: {
          p_entity_type: string
          p_geography?: string
          p_hard_filter?: string
          p_plural_term?: string
          p_use_case?: string
        }
        Returns: string
      }
      calculate_request_relevance: {
        Args: { request_id_param: string; user_id_param: string }
        Returns: number
      }
      can_reveal_identity: {
        Args: {
          p_request_id: string
          p_target_user_id: string
          p_viewer_id: string
        }
        Returns: boolean
      }
      cleanup_expired_contacts: { Args: never; Returns: undefined }
      debug_anonymous_match: {
        Args: { p_request_id: string; p_uid?: string }
        Returns: Json
      }
      debug_phone_match: {
        Args: { contact_phone_input: string; profile_phone_input: string }
        Returns: {
          contact_normalized: string
          contact_original: string
          matches: boolean
          profile_normalized: string
          profile_original: string
        }[]
      }
      dismiss_anonymous_impression: {
        Args: {
          p_action?: string
          p_request_id: string
          p_snooze_days?: number
        }
        Returns: undefined
      }
      estimate_anonymous_expertise_reach:
        | {
            Args: {
              p_category: string
              p_keywords?: string[]
              p_location: string
            }
            Returns: number
          }
        | {
            Args: {
              p_category: string
              p_keywords?: string[]
              p_location: string
              p_title?: string
            }
            Returns: number
          }
      find_network_experts: {
        Args: { query_domains: string[]; viewer_id: string }
        Returns: {
          degree: number
          full_name: string
          handle: string
          matching_domains: string[]
          profile_id: string
        }[]
      }
      find_profile_by_normalized_phone: {
        Args: { exclude_user_id: string; input_phone: string }
        Returns: {
          full_name: string
          handle: string
          id: string
          phone_number: string
        }[]
      }
      find_similar_directory_lists: {
        Args: { p_threshold?: number; p_title: string }
        Returns: {
          contributor_count: number
          id: string
          similarity_score: number
          title: string
          total_votes: number
        }[]
      }
      find_similar_recommendations_unified: {
        Args: { req_id: string; threshold?: number }
        Returns: {
          rec1_source: string
          rec1_text: string
          rec2_source: string
          rec2_text: string
          similarity_score: number
        }[]
      }
      generate_anonymous_handle: { Args: never; Returns: string }
      generate_share_token: { Args: never; Returns: string }
      get_connection_path: {
        Args: { user_a: string; user_b: string }
        Returns: string[]
      }
      get_current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_degree_of_separation: {
        Args: { user_a: string; user_b: string }
        Returns: number
      }
      get_display_identity: {
        Args: { profile_id: string; viewer_id: string }
        Returns: {
          handle: string
          is_anonymous: boolean
          is_verified: boolean
          name: string
        }[]
      }
      get_extended_network: {
        Args: { user_id: string }
        Returns: {
          full_name: string
          handle: string
          mutual_friends: string[]
          profile_id: string
        }[]
      }
      get_for_you_requests: {
        Args: { p_limit?: number }
        Returns: {
          category: string
          contributor_label: string
          created_at: string
          creator_label: string
          expires_at: string
          location: string
          request_id: string
          title: string
        }[]
      }
      get_guest_page_preview: {
        Args: { p_request_id: string }
        Returns: {
          reason: string
          recommendation_text: string
          total_count: number
        }[]
      }
      get_network_contributors: {
        Args: { contributor_ids: string[]; user_id_param: string }
        Returns: {
          contributor_id: string
          full_name: string
          handle: string
          is_extended_network: boolean
          is_friend: boolean
        }[]
      }
      get_response_origin: { Args: { p_response_id: string }; Returns: string }
      get_response_tree: {
        Args: { p_request_id: string }
        Returns: {
          depth: number
          forwarded_to_count: number
          has_responded: boolean
          is_antelog_user: boolean
          is_root: boolean
          link_id: string
          parent_link_id: string
          person_name: string
          recommendation_count: number
        }[]
      }
      get_safe_profile_data: {
        Args: { profile_id: string }
        Returns: {
          batch: string
          full_name: string
          handle: string
          id: string
          id_card_image_url: string
          is_verified: boolean
          phone_number: string
          student_id_number: string
          user_type: Database["public"]["Enums"]["user_type"]
        }[]
      }
      get_safe_profile_view: {
        Args: { profile_id: string }
        Returns: {
          bio: string
          expertise_cities: Json
          expertise_domains: Json
          full_name: string
          handle: string
          id: string
          interests: Json
          is_verified: boolean
          location: string
          occupation: string
          phone_number: string
          relationship: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hash_contact_info: { Args: { contact_value: string }; Returns: string }
      increment_master_directory_search_count: {
        Args: { entry_ids: string[] }
        Returns: undefined
      }
      increment_search_count: {
        Args: { entry_ids: string[] }
        Returns: undefined
      }
      is_group_creator: {
        Args: { group_id: string; user_id: string }
        Returns: boolean
      }
      is_group_member: {
        Args: { group_id: string; user_id: string }
        Returns: boolean
      }
      is_in_network: {
        Args: { profile_id: string; viewer_id: string }
        Returns: boolean
      }
      log_contact_access: {
        Args: { action_type: string; contact_id?: string }
        Returns: undefined
      }
      match_contacts_by_phone: {
        Args: { user_id_input: string }
        Returns: {
          contact_id: string
          matched_user_id: string
        }[]
      }
      match_new_user_to_contacts: {
        Args: { new_user_id: string; new_user_phone: string }
        Returns: number
      }
      matches_anonymous_expertise: {
        Args: { p_request_id: string; p_uid: string }
        Returns: boolean
      }
      normalize_directory_text: { Args: { input: string }; Returns: string }
      normalize_for_canonical: { Args: { input: string }; Returns: string }
      normalize_phone_number: { Args: { phone_input: string }; Returns: string }
      normalize_token: { Args: { t: string }; Returns: string }
      refresh_contact_matches: {
        Args: { user_id_param?: string }
        Returns: Json
      }
      refresh_master_directory: { Args: never; Returns: undefined }
      request_is_exhausted: { Args: { p_request_id: string }; Returns: boolean }
      request_response_threshold: {
        Args: { p_category: string }
        Returns: number
      }
      resolve_preferred_term: {
        Args: { input: string }
        Returns: {
          category_group: string
          plural_term: string
          preferred_term: string
        }[]
      }
      search_directory_pool_items: {
        Args: { p_list_id: string; p_query: string; p_threshold?: number }
        Returns: {
          id: string
          item_name: string
          similarity_score: number
          vote_count: number
        }[]
      }
      search_similar_recommendations: {
        Args: {
          req_id: string
          search_term: string
          similarity_threshold?: number
        }
        Returns: {
          id: string
          recommendation_text: string
          similarity_score: number
          vote_count: number
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      sync_directory_list_edits: {
        Args: { p_list_id: string; p_new_category: string; p_new_title: string }
        Returns: undefined
      }
      tokenize_text: { Args: { t: string }; Returns: string[] }
      update_guest_recommendation_merge: {
        Args: {
          _guest_contribution_id: string
          _merged_into_id?: string
          _merged_into_text?: string
          _recommendation_id: string
          _vote_count: number
        }
        Returns: undefined
      }
      update_matched_contacts: {
        Args: { user_id_input: string }
        Returns: number
      }
      user_expertise_tokens: { Args: { p_uid: string }; Returns: string[] }
      user_in_direct_audience: {
        Args: { p_request_id: string; p_uid: string }
        Returns: boolean
      }
      user_location_tokens: { Args: { p_uid: string }; Returns: string[] }
      validate_authenticated_user: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      list_category: "films" | "places" | "products" | "services" | "other"
      list_visibility: "private" | "friends" | "public"
      request_audience_type:
        | "first_network"
        | "group"
        | "specific_people"
        | "public"
        | "anonymous_expertise"
      request_category: "films" | "places" | "products" | "services" | "other"
      request_status: "open" | "responded" | "reviewing" | "closed"
      response_type: "existing_list" | "new_recommendations" | "comment"
      user_type: "verified" | "guest"
      verification_status: "pending" | "verified" | "rejected"
      vote_type: "helpful" | "not_helpful"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
      list_category: ["films", "places", "products", "services", "other"],
      list_visibility: ["private", "friends", "public"],
      request_audience_type: [
        "first_network",
        "group",
        "specific_people",
        "public",
        "anonymous_expertise",
      ],
      request_category: ["films", "places", "products", "services", "other"],
      request_status: ["open", "responded", "reviewing", "closed"],
      response_type: ["existing_list", "new_recommendations", "comment"],
      user_type: ["verified", "guest"],
      verification_status: ["pending", "verified", "rejected"],
      vote_type: ["helpful", "not_helpful"],
    },
  },
} as const
