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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      engineering_audit: {
        Row: {
          action: string
          actor_id: string
          before_revision: number | null
          created_at: string
          id: string
          reason: string
          revision_id: string
          workspace_id: string
        }
        Insert: {
          action: string
          actor_id: string
          before_revision?: number | null
          created_at?: string
          id?: string
          reason: string
          revision_id: string
          workspace_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          before_revision?: number | null
          created_at?: string
          id?: string
          reason?: string
          revision_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "engineering_audit_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "engineering_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engineering_audit_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "engineering_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      engineering_revisions: {
        Row: {
          actor_id: string
          created_at: string
          id: string
          lifecycle: string
          payload: Json
          reason: string
          revision: number
          workspace_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          id?: string
          lifecycle?: string
          payload: Json
          reason: string
          revision: number
          workspace_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          id?: string
          lifecycle?: string
          payload?: Json
          reason?: string
          revision?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "engineering_revisions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "engineering_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      engineering_signatures: {
        Row: {
          created_at: string
          id: string
          meaning: string
          reason: string
          revision_id: string
          signer_email: string
          signer_id: string
          stage: string
        }
        Insert: {
          created_at?: string
          id?: string
          meaning: string
          reason: string
          revision_id: string
          signer_email: string
          signer_id: string
          stage: string
        }
        Update: {
          created_at?: string
          id?: string
          meaning?: string
          reason?: string
          revision_id?: string
          signer_email?: string
          signer_id?: string
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "engineering_signatures_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "engineering_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      engineering_workspaces: {
        Row: {
          created_at: string
          environment: string
          id: string
          name: string
          owner_id: string
          scope: string
        }
        Insert: {
          created_at?: string
          environment?: string
          id?: string
          name: string
          owner_id: string
          scope: string
        }
        Update: {
          created_at?: string
          environment?: string
          id?: string
          name?: string
          owner_id?: string
          scope?: string
        }
        Relationships: []
      }
      integration_inbox: {
        Row: {
          content_hash: string | null
          correlation_id: string | null
          event_id: string
          event_type: string
          id: string
          payload: Json
          quarantine_reason: string | null
          received_at: string
          source_module: string
          status: string
        }
        Insert: {
          content_hash?: string | null
          correlation_id?: string | null
          event_id: string
          event_type: string
          id?: string
          payload: Json
          quarantine_reason?: string | null
          received_at?: string
          source_module: string
          status?: string
        }
        Update: {
          content_hash?: string | null
          correlation_id?: string | null
          event_id?: string
          event_type?: string
          id?: string
          payload?: Json
          quarantine_reason?: string | null
          received_at?: string
          source_module?: string
          status?: string
        }
        Relationships: []
      }
      integration_outbox: {
        Row: {
          attempts: number
          business_reason: string | null
          business_status: string
          consumer: string
          content_hash: string
          correlation_id: string
          created_at: string
          event_id: string
          event_type: string
          id: string
          last_error: string | null
          owner_id: string
          payload: Json
          revision: number
          schema_version: string
          technical_status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          attempts?: number
          business_reason?: string | null
          business_status?: string
          consumer: string
          content_hash: string
          correlation_id?: string
          created_at?: string
          event_id?: string
          event_type: string
          id?: string
          last_error?: string | null
          owner_id: string
          payload: Json
          revision: number
          schema_version?: string
          technical_status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          attempts?: number
          business_reason?: string | null
          business_status?: string
          consumer?: string
          content_hash?: string
          correlation_id?: string
          created_at?: string
          event_id?: string
          event_type?: string
          id?: string
          last_error?: string | null
          owner_id?: string
          payload?: Json
          revision?: number
          schema_version?: string
          technical_status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_outbox_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "engineering_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      save_engineering_revision: {
        Args: {
          p_expected: number
          p_lifecycle?: string
          p_payload: Json
          p_reason: string
          p_workspace: string
        }
        Returns: number
      }
      sign_engineering_revision: {
        Args: {
          p_meaning: string
          p_reason: string
          p_revision: string
          p_stage: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "engineering_approver" | "release_manager"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["engineering_approver", "release_manager"],
    },
  },
} as const
