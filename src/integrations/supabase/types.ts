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
          ip_address: unknown | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          contact_id?: string | null
          created_at?: string | null
          id?: string
          ip_address?: unknown | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          contact_id?: string | null
          created_at?: string | null
          id?: string
          ip_address?: unknown | null
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
      list_items: {
        Row: {
          content: string
          created_at: string
          id: string
          list_id: string
          position: number
          updated_at: string
          url: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          list_id: string
          position: number
          updated_at?: string
          url?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          list_id?: string
          position?: number
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_list_items_list"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["id"]
          },
        ]
      }
      lists: {
        Row: {
          category: Database["public"]["Enums"]["list_category"]
          created_at: string
          description: string | null
          id: string
          owner_id: string
          title: string
          updated_at: string
          visibility: Database["public"]["Enums"]["list_visibility"]
        }
        Insert: {
          category: Database["public"]["Enums"]["list_category"]
          created_at?: string
          description?: string | null
          id?: string
          owner_id: string
          title: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["list_visibility"]
        }
        Update: {
          category?: Database["public"]["Enums"]["list_category"]
          created_at?: string
          description?: string | null
          id?: string
          owner_id?: string
          title?: string
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
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
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
          related_user_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          batch: string | null
          college_id: string | null
          created_at: string
          full_name: string | null
          handle: string
          id: string
          id_card_image_url: string | null
          is_verified: boolean
          phone_number: string | null
          student_id_number: string | null
          trial_ends_at: string | null
          updated_at: string
          user_type: Database["public"]["Enums"]["user_type"]
          verification_status: Database["public"]["Enums"]["verification_status"]
        }
        Insert: {
          batch?: string | null
          college_id?: string | null
          created_at?: string
          full_name?: string | null
          handle: string
          id: string
          id_card_image_url?: string | null
          is_verified?: boolean
          phone_number?: string | null
          student_id_number?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          user_type?: Database["public"]["Enums"]["user_type"]
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Update: {
          batch?: string | null
          college_id?: string | null
          created_at?: string
          full_name?: string | null
          handle?: string
          id?: string
          id_card_image_url?: string | null
          is_verified?: boolean
          phone_number?: string | null
          student_id_number?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          user_type?: Database["public"]["Enums"]["user_type"]
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Relationships: [
          {
            foreignKeyName: "profiles_college_id_fkey"
            columns: ["college_id"]
            isOneToOne: false
            referencedRelation: "colleges"
            referencedColumns: ["id"]
          },
        ]
      }
      request_responses: {
        Row: {
          content: string
          created_at: string
          id: string
          list_id: string | null
          request_id: string
          responder_id: string
          response_type: Database["public"]["Enums"]["response_type"]
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          list_id?: string | null
          request_id: string
          responder_id: string
          response_type: Database["public"]["Enums"]["response_type"]
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          list_id?: string | null
          request_id?: string
          responder_id?: string
          response_type?: Database["public"]["Enums"]["response_type"]
        }
        Relationships: [
          {
            foreignKeyName: "fk_request_responses_list_id"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["id"]
          },
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
          audience_type: Database["public"]["Enums"]["request_audience_type"]
          category: Database["public"]["Enums"]["request_category"]
          created_at: string
          creator_id: string
          group_id: string | null
          id: string
          location: string | null
          status: Database["public"]["Enums"]["request_status"]
          title: string
          updated_at: string
        }
        Insert: {
          audience_type: Database["public"]["Enums"]["request_audience_type"]
          category: Database["public"]["Enums"]["request_category"]
          created_at?: string
          creator_id: string
          group_id?: string | null
          id?: string
          location?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          title: string
          updated_at?: string
        }
        Update: {
          audience_type?: Database["public"]["Enums"]["request_audience_type"]
          category?: Database["public"]["Enums"]["request_category"]
          created_at?: string
          creator_id?: string
          group_id?: string | null
          id?: string
          location?: string | null
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
      [_ in never]: never
    }
    Functions: {
      cleanup_expired_contacts: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      get_current_user_role: {
        Args: Record<PropertyKey, never>
        Returns: Database["public"]["Enums"]["app_role"]
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
          full_name: string
          handle: string
          id: string
          is_verified: boolean
          phone_number: string
          student_id_number: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hash_contact_info: {
        Args: { contact_value: string }
        Returns: string
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
      log_contact_access: {
        Args: { action_type: string; contact_id?: string }
        Returns: undefined
      }
      validate_authenticated_user: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      list_category: "films" | "places" | "products" | "services" | "other"
      list_visibility: "private" | "friends" | "public"
      request_audience_type:
        | "friends"
        | "extended_network"
        | "specific_group"
        | "public"
      request_category: "films" | "places" | "products" | "services" | "other"
      request_status: "open" | "responded" | "closed"
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
        "friends",
        "extended_network",
        "specific_group",
        "public",
      ],
      request_category: ["films", "places", "products", "services", "other"],
      request_status: ["open", "responded", "closed"],
      response_type: ["existing_list", "new_recommendations", "comment"],
      user_type: ["verified", "guest"],
      verification_status: ["pending", "verified", "rejected"],
      vote_type: ["helpful", "not_helpful"],
    },
  },
} as const
