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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      agent_runs: {
        Row: {
          candidate_id: string | null
          created_at: string
          gap: Json | null
          id: string
          latency_ms: number | null
          mode: string | null
          plan: Json | null
          reranked_ranking: Json | null
          retries: number | null
          retrieval_ranking: Json | null
          top_matches: Json | null
          trace: Json | null
        }
        Insert: {
          candidate_id?: string | null
          created_at?: string
          gap?: Json | null
          id?: string
          latency_ms?: number | null
          mode?: string | null
          plan?: Json | null
          reranked_ranking?: Json | null
          retries?: number | null
          retrieval_ranking?: Json | null
          top_matches?: Json | null
          trace?: Json | null
        }
        Update: {
          candidate_id?: string | null
          created_at?: string
          gap?: Json | null
          id?: string
          latency_ms?: number | null
          mode?: string | null
          plan?: Json | null
          reranked_ranking?: Json | null
          retries?: number | null
          retrieval_ranking?: Json | null
          top_matches?: Json | null
          trace?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      candidates: {
        Row: {
          created_at: string
          cv_id: string | null
          id: string
          name: string | null
          parsed: Json | null
          raw_text: string | null
        }
        Insert: {
          created_at?: string
          cv_id?: string | null
          id?: string
          name?: string | null
          parsed?: Json | null
          raw_text?: string | null
        }
        Update: {
          created_at?: string
          cv_id?: string | null
          id?: string
          name?: string | null
          parsed?: Json | null
          raw_text?: string | null
        }
        Relationships: []
      }
      eval_cvs: {
        Row: {
          created_at: string
          cv_id: string
          is_eval: boolean
          level: string | null
          name: string
          parsed: Json | null
          raw_text: string
          relevant_job_ids: string[]
          track: string | null
        }
        Insert: {
          created_at?: string
          cv_id: string
          is_eval?: boolean
          level?: string | null
          name: string
          parsed?: Json | null
          raw_text: string
          relevant_job_ids?: string[]
          track?: string | null
        }
        Update: {
          created_at?: string
          cv_id?: string
          is_eval?: boolean
          level?: string | null
          name?: string
          parsed?: Json | null
          raw_text?: string
          relevant_job_ids?: string[]
          track?: string | null
        }
        Relationships: []
      }
      eval_results: {
        Row: {
          created_at: string
          cv_id: string | null
          hit_ids: Json | null
          id: string
          latency_ms: number | null
          mode: string | null
          notes: Json | null
          precision_at_5: number | null
          run_label: string | null
        }
        Insert: {
          created_at?: string
          cv_id?: string | null
          hit_ids?: Json | null
          id?: string
          latency_ms?: number | null
          mode?: string | null
          notes?: Json | null
          precision_at_5?: number | null
          run_label?: string | null
        }
        Update: {
          created_at?: string
          cv_id?: string | null
          hit_ids?: Json | null
          id?: string
          latency_ms?: number | null
          mode?: string | null
          notes?: Json | null
          precision_at_5?: number | null
          run_label?: string | null
        }
        Relationships: []
      }
      jobs: {
        Row: {
          company: string | null
          created_at: string
          description: string | null
          embedding: string | null
          employment_type: string | null
          id: string
          job_id: string | null
          location: string | null
          min_years: number | null
          required_skills: string | null
          seniority: string | null
          title: string | null
          track: string | null
          work_mode: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string
          description?: string | null
          embedding?: string | null
          employment_type?: string | null
          id?: string
          job_id?: string | null
          location?: string | null
          min_years?: number | null
          required_skills?: string | null
          seniority?: string | null
          title?: string | null
          track?: string | null
          work_mode?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string
          description?: string | null
          embedding?: string | null
          employment_type?: string | null
          id?: string
          job_id?: string | null
          location?: string | null
          min_years?: number | null
          required_skills?: string | null
          seniority?: string | null
          title?: string | null
          track?: string | null
          work_mode?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      match_jobs_keyword: {
        Args: { match_count: number; query_text: string }
        Returns: {
          company: string
          created_at: string
          description: string
          employment_type: string
          id: string
          job_id: string
          location: string
          min_years: number
          required_skills: string
          score: number
          seniority: string
          title: string
          track: string
          work_mode: string
        }[]
      }
      match_jobs_vector: {
        Args: { match_count: number; query_embedding: string }
        Returns: {
          company: string
          created_at: string
          description: string
          employment_type: string
          id: string
          job_id: string
          location: string
          min_years: number
          required_skills: string
          score: number
          seniority: string
          title: string
          track: string
          work_mode: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
