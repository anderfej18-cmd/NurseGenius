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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_codes: {
        Row: {
          code: string
          created_at: string
          id: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          erudite_daily_limit: number
          erudite_days: number
          erudite_price: number
          id: number
          novice_daily_limit: number
          scholar_daily_limit: number
          scholar_days: number
          scholar_price: number
        }
        Insert: {
          erudite_daily_limit?: number
          erudite_days?: number
          erudite_price?: number
          id?: number
          novice_daily_limit?: number
          scholar_daily_limit?: number
          scholar_days?: number
          scholar_price?: number
        }
        Update: {
          erudite_daily_limit?: number
          erudite_days?: number
          erudite_price?: number
          id?: number
          novice_daily_limit?: number
          scholar_daily_limit?: number
          scholar_days?: number
          scholar_price?: number
        }
        Relationships: []
      }
      custom_test_attempt_answers: {
        Row: {
          attempt_id: string
          custom_test_question_id: string
          id: string
          is_correct: boolean
          position: number
          user_answer: string | null
        }
        Insert: {
          attempt_id: string
          custom_test_question_id: string
          id?: string
          is_correct?: boolean
          position: number
          user_answer?: string | null
        }
        Update: {
          attempt_id?: string
          custom_test_question_id?: string
          id?: string
          is_correct?: boolean
          position?: number
          user_answer?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_test_attempt_answers_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "custom_test_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_test_attempt_answers_custom_test_question_id_fkey"
            columns: ["custom_test_question_id"]
            isOneToOne: false
            referencedRelation: "custom_test_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_test_attempts: {
        Row: {
          access_hash: string
          completed_at: string | null
          correct_count: number | null
          custom_test_id: string
          email: string
          id: string
          score_pct: number | null
          started_at: string
          status: string
          total_questions: number
          user_id: string | null
        }
        Insert: {
          access_hash: string
          completed_at?: string | null
          correct_count?: number | null
          custom_test_id: string
          email: string
          id?: string
          score_pct?: number | null
          started_at?: string
          status?: string
          total_questions: number
          user_id?: string | null
        }
        Update: {
          access_hash?: string
          completed_at?: string | null
          correct_count?: number | null
          custom_test_id?: string
          email?: string
          id?: string
          score_pct?: number | null
          started_at?: string
          status?: string
          total_questions?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_test_attempts_custom_test_id_fkey"
            columns: ["custom_test_id"]
            isOneToOne: false
            referencedRelation: "custom_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_test_questions: {
        Row: {
          correct_answer: string
          custom_test_id: string
          id: string
          imported_at: string | null
          imported_to_bank: boolean
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          position: number
          question_text: string
          rationale: string | null
          source_kind: string
          source_question_id: string | null
        }
        Insert: {
          correct_answer: string
          custom_test_id: string
          id?: string
          imported_at?: string | null
          imported_to_bank?: boolean
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          position: number
          question_text: string
          rationale?: string | null
          source_kind?: string
          source_question_id?: string | null
        }
        Update: {
          correct_answer?: string
          custom_test_id?: string
          id?: string
          imported_at?: string | null
          imported_to_bank?: boolean
          option_a?: string
          option_b?: string
          option_c?: string
          option_d?: string
          position?: number
          question_text?: string
          rationale?: string | null
          source_kind?: string
          source_question_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_test_questions_custom_test_id_fkey"
            columns: ["custom_test_id"]
            isOneToOne: false
            referencedRelation: "custom_tests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_test_questions_source_question_id_fkey"
            columns: ["source_question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_tests: {
        Row: {
          created_at: string
          description: string | null
          duration_minutes: number
          exam_type: Database["public"]["Enums"]["exam_type"]
          expires_at: string
          id: string
          owner_id: string
          source_mode: string
          status: Database["public"]["Enums"]["custom_test_status"]
          title: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          duration_minutes: number
          exam_type: Database["public"]["Enums"]["exam_type"]
          expires_at: string
          id?: string
          owner_id: string
          source_mode?: string
          status?: Database["public"]["Enums"]["custom_test_status"]
          title: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          duration_minutes?: number
          exam_type?: Database["public"]["Enums"]["exam_type"]
          expires_at?: string
          id?: string
          owner_id?: string
          source_mode?: string
          status?: Database["public"]["Enums"]["custom_test_status"]
          title?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: []
      }
      exam_answers: {
        Row: {
          exam_id: string
          flagged: boolean
          id: string
          is_correct: boolean | null
          position: number
          question_id: string
          user_answer: string | null
        }
        Insert: {
          exam_id: string
          flagged?: boolean
          id?: string
          is_correct?: boolean | null
          position: number
          question_id: string
          user_answer?: string | null
        }
        Update: {
          exam_id?: string
          flagged?: boolean
          id?: string
          is_correct?: boolean | null
          position?: number
          question_id?: string
          user_answer?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_answers_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      exams: {
        Row: {
          category: string
          completed_at: string | null
          correct_count: number | null
          exam_type: Database["public"]["Enums"]["exam_type"]
          id: string
          score_pct: number | null
          started_at: string
          status: string
          time_limit_minutes: number
          total_questions: number
          user_id: string
        }
        Insert: {
          category?: string
          completed_at?: string | null
          correct_count?: number | null
          exam_type: Database["public"]["Enums"]["exam_type"]
          id?: string
          score_pct?: number | null
          started_at?: string
          status?: string
          time_limit_minutes: number
          total_questions: number
          user_id: string
        }
        Update: {
          category?: string
          completed_at?: string | null
          correct_count?: number | null
          exam_type?: Database["public"]["Enums"]["exam_type"]
          id?: string
          score_pct?: number | null
          started_at?: string
          status?: string
          time_limit_minutes?: number
          total_questions?: number
          user_id?: string
        }
        Relationships: []
      }
      payment_receipts: {
        Row: {
          amount: number | null
          auto_approved: boolean
          created_at: string
          extracted_text: string | null
          file_path: string
          flag_reason: string | null
          id: string
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["receipt_status"]
          target_tier: Database["public"]["Enums"]["user_tier"]
          user_id: string
          verified_at: string | null
        }
        Insert: {
          amount?: number | null
          auto_approved?: boolean
          created_at?: string
          extracted_text?: string | null
          file_path: string
          flag_reason?: string | null
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["receipt_status"]
          target_tier: Database["public"]["Enums"]["user_tier"]
          user_id: string
          verified_at?: string | null
        }
        Update: {
          amount?: number | null
          auto_approved?: boolean
          created_at?: string
          extracted_text?: string | null
          file_path?: string
          flag_reason?: string | null
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["receipt_status"]
          target_tier?: Database["public"]["Enums"]["user_tier"]
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      plans: {
        Row: {
          created_at: string
          duration_days: number
          id: string
          is_active: boolean
          name: string
          price_ngn: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          duration_days?: number
          id?: string
          is_active?: boolean
          name: string
          price_ngn?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          duration_days?: number
          id?: string
          is_active?: boolean
          name?: string
          price_ngn?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          exam_date: string | null
          exam_preference: string | null
          expiry_date: string | null
          first_name: string | null
          id: string
          last_name: string | null
          last_question_date: string | null
          onboarded: boolean
          questions_today: number
          tier: Database["public"]["Enums"]["user_tier"]
          username: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          exam_date?: string | null
          exam_preference?: string | null
          expiry_date?: string | null
          first_name?: string | null
          id: string
          last_name?: string | null
          last_question_date?: string | null
          onboarded?: boolean
          questions_today?: number
          tier?: Database["public"]["Enums"]["user_tier"]
          username?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          exam_date?: string | null
          exam_preference?: string | null
          expiry_date?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          last_question_date?: string | null
          onboarded?: boolean
          questions_today?: number
          tier?: Database["public"]["Enums"]["user_tier"]
          username?: string | null
        }
        Relationships: []
      }
      questions: {
        Row: {
          correct_answer: string
          created_at: string
          created_by: string | null
          exam_type: Database["public"]["Enums"]["exam_type"]
          id: string
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          question_text: string
          rationale: string | null
          topic: string
          year: number | null
        }
        Insert: {
          correct_answer: string
          created_at?: string
          created_by?: string | null
          exam_type: Database["public"]["Enums"]["exam_type"]
          id?: string
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          question_text: string
          rationale?: string | null
          topic?: string
          year?: number | null
        }
        Update: {
          correct_answer?: string
          created_at?: string
          created_by?: string | null
          exam_type?: Database["public"]["Enums"]["exam_type"]
          id?: string
          option_a?: string
          option_b?: string
          option_c?: string
          option_d?: string
          question_text?: string
          rationale?: string | null
          topic?: string
          year?: number | null
        }
        Relationships: []
      }
      receipt_fingerprints: {
        Row: {
          created_at: string
          extracted_text: string | null
          fingerprint: string
          id: string
          receipt_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          extracted_text?: string | null
          fingerprint: string
          id?: string
          receipt_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          extracted_text?: string | null
          fingerprint?: string
          id?: string
          receipt_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipt_fingerprints_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "payment_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_payments: {
        Row: {
          amount_ngn: number
          created_at: string
          duration_days: number
          id: string
          plan_name: string
          reference: string | null
          user_id: string
        }
        Insert: {
          amount_ngn: number
          created_at?: string
          duration_days: number
          id?: string
          plan_name: string
          reference?: string | null
          user_id: string
        }
        Update: {
          amount_ngn?: number
          created_at?: string
          duration_days?: number
          id?: string
          plan_name?: string
          reference?: string | null
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
          role: Database["public"]["Enums"]["app_role"]
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
      activate_subscription: {
        Args: {
          _amount: number
          _reference: string
          _tier: Database["public"]["Enums"]["user_tier"]
        }
        Returns: string
      }
      activate_verified_subscription: {
        Args: {
          _amount: number
          _reference: string
          _tier: Database["public"]["Enums"]["user_tier"]
          _user_id: string
        }
        Returns: string
      }
      add_custom_test_to_question_bank: {
        Args: {
          _custom_test_id: string
          _exam_type: Database["public"]["Enums"]["exam_type"]
          _topic: string
        }
        Returns: number
      }
      approve_receipt: { Args: { _receipt_id: string }; Returns: undefined }
      assign_user_tier: {
        Args: {
          _days: number
          _tier: Database["public"]["Enums"]["user_tier"]
          _user_id: string
        }
        Returns: undefined
      }
      auto_upgrade_from_receipt: {
        Args: {
          _amount: number
          _file_path: string
          _tier: Database["public"]["Enums"]["user_tier"]
        }
        Returns: string
      }
      central_admin_search_users: {
        Args: { _search: string }
        Returns: {
          email: string
          is_admin: boolean
          tier: Database["public"]["Enums"]["user_tier"]
          user_id: string
          username: string
        }[]
      }
      check_expire_tier: { Args: { _user_id: string }; Returns: undefined }
      claim_custom_test_attempt: {
        Args: { _access_hash: string; _attempt_id: string }
        Returns: boolean
      }
      daily_reset: { Args: never; Returns: undefined }
      flag_receipt_and_revoke: {
        Args: { _reason: string; _receipt_id: string }
        Returns: undefined
      }
      get_custom_test_analytics: {
        Args: { _custom_test_id: string }
        Returns: {
          average_score: number
          fail_count: number
          participant_count: number
          pass_count: number
          pass_pct: number
        }[]
      }
      get_custom_test_attempt_results: {
        Args: { _access_hash: string; _attempt_id: string }
        Returns: {
          correct_answer: string
          is_correct: boolean
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          question_id: string
          question_position: number
          question_text: string
          rationale: string
          user_answer: string
        }[]
      }
      get_custom_test_by_token: {
        Args: { _token_hash: string }
        Returns: {
          description: string
          duration_minutes: number
          exam_type: Database["public"]["Enums"]["exam_type"]
          expires_at: string
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          question_id: string
          question_position: number
          question_text: string
          test_id: string
          title: string
        }[]
      }
      get_daily_leaderboard: {
        Args: never
        Returns: {
          attempted: number
          avg_score: number
          correct: number
          user_id: string
          username: string
        }[]
      }
      get_subadmin_user_directory: {
        Args: never
        Returns: {
          tier: Database["public"]["Enums"]["user_tier"]
          username: string
        }[]
      }
      get_weekly_leaderboard: {
        Args: never
        Returns: {
          active_days: number
          attempted: number
          avg_score: number
          correct: number
          user_id: string
          username: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_any_admin: { Args: { _user_id: string }; Returns: boolean }
      record_receipt_fingerprint: {
        Args: {
          _extracted_text: string
          _fingerprint: string
          _receipt_id: string
        }
        Returns: boolean
      }
      redeem_admin_code: { Args: { _code: string }; Returns: boolean }
      republish_custom_test: {
        Args: { _custom_test_id: string; _expires_at: string }
        Returns: string
      }
      reset_user_to_novice: { Args: { _user_id: string }; Returns: undefined }
      start_custom_test_attempt: {
        Args: { _access_hash: string; _email: string; _token_hash: string }
        Returns: {
          attempt_id: string
          duration_minutes: number
          expires_at: string
          total_questions: number
        }[]
      }
      submit_custom_test_attempt: {
        Args: { _access_hash: string; _answers: Json; _attempt_id: string }
        Returns: {
          correct_count: number
          score_pct: number
          total_questions: number
        }[]
      }
    }
    Enums: {
      app_role: "central_admin" | "admin" | "user"
      custom_test_status: "draft" | "published" | "archived"
      exam_type: "RN" | "RM"
      receipt_status: "pending" | "approved" | "rejected"
      user_tier: "novice" | "erudite" | "scholar"
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
      app_role: ["central_admin", "admin", "user"],
      custom_test_status: ["draft", "published", "archived"],
      exam_type: ["RN", "RM"],
      receipt_status: ["pending", "approved", "rejected"],
      user_tier: ["novice", "erudite", "scholar"],
    },
  },
} as const
