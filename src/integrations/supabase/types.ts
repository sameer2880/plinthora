export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      platform_admins: {
        Row: {
          created_at: string;
          email: string | null;
          name: string | null;
          phone: string | null;
          user_id: string;
          username: string | null;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          name?: string | null;
          phone?: string | null;
          user_id: string;
          username?: string | null;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          name?: string | null;
          phone?: string | null;
          user_id?: string;
          username?: string | null;
        };
        Relationships: [];
      };
      businesses: {
        Row: {
          active: boolean;
          created_at: string;
          enabled_pages: string[];
          id: string;
          instagram_url: string | null;
          location: string | null;
          logo_url: string | null;
          maps_url: string | null;
          name: string;
          owner_line: string | null;
          phone: string | null;
          reels_url: string | null;
          short_name: string | null;
          signature_url: string | null;
          stamp_url: string | null;
          updated_at: string;
          website_url: string | null;
          whatsapp: string | null;
          youtube_url: string | null;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          enabled_pages?: string[];
          id?: string;
          instagram_url?: string | null;
          location?: string | null;
          logo_url?: string | null;
          maps_url?: string | null;
          name: string;
          owner_line?: string | null;
          phone?: string | null;
          reels_url?: string | null;
          short_name?: string | null;
          signature_url?: string | null;
          stamp_url?: string | null;
          updated_at?: string;
          website_url?: string | null;
          whatsapp?: string | null;
          youtube_url?: string | null;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          enabled_pages?: string[];
          id?: string;
          instagram_url?: string | null;
          location?: string | null;
          logo_url?: string | null;
          maps_url?: string | null;
          name?: string;
          owner_line?: string | null;
          phone?: string | null;
          reels_url?: string | null;
          short_name?: string | null;
          signature_url?: string | null;
          stamp_url?: string | null;
          updated_at?: string;
          website_url?: string | null;
          whatsapp?: string | null;
          youtube_url?: string | null;
        };
        Relationships: [];
      };
      diary_notes: {
        Row: {
          business_id: string;
          amount: number | null;
          category: string;
          content: string;
          created_at: string;
          entry_date: string;
          id: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          business_id?: string;
          amount?: number | null;
          category?: string;
          content?: string;
          created_at?: string;
          entry_date?: string;
          id?: string;
          title?: string;
          updated_at?: string;
        };
        Update: {
          business_id?: string;
          amount?: number | null;
          category?: string;
          content?: string;
          created_at?: string;
          entry_date?: string;
          id?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string;
          full_name: string;
          id: string;
          mobile: string | null;
        };
        Insert: {
          created_at?: string;
          email: string;
          full_name: string;
          id: string;
          mobile?: string | null;
        };
        Update: {
          created_at?: string;
          email?: string;
          full_name?: string;
          id?: string;
          mobile?: string | null;
        };
        Relationships: [];
      };
      rentals: {
        Row: {
          business_id: string;
          created_at: string;
          created_by: string | null;
          customer_address: string | null;
          customer_name: string;
          customer_phone: string;
          group_id: string;
          id: string;
          issue_date: string;
          material_name: string;
          notes: string | null;
          payment_status: string;
          quantity: number;
          rate_per_unit: number;
          return_date: string | null;
          security_deposit: number | null;
          status: string;
          total_amount: number;
          unit: string;
          updated_at: string;
        };
        Insert: {
          business_id?: string;
          created_at?: string;
          created_by?: string | null;
          customer_address?: string | null;
          customer_name: string;
          customer_phone: string;
          group_id?: string;
          id?: string;
          issue_date: string;
          material_name: string;
          notes?: string | null;
          payment_status?: string;
          quantity: number;
          rate_per_unit: number;
          return_date?: string | null;
          security_deposit?: number | null;
          status?: string;
          total_amount: number;
          unit?: string;
          updated_at?: string;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          created_by?: string | null;
          customer_address?: string | null;
          customer_name?: string;
          customer_phone?: string;
          group_id?: string;
          id?: string;
          issue_date?: string;
          material_name?: string;
          notes?: string | null;
          payment_status?: string;
          quantity?: number;
          rate_per_unit?: number;
          return_date?: string | null;
          security_deposit?: number | null;
          status?: string;
          total_amount?: number;
          unit?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      worker_attendance: {
        Row: {
          business_id: string;
          created_at: string;
          day_type: string;
          id: string;
          note: string | null;
          present: boolean;
          status: string;
          updated_at: string;
          work_date: string;
          worker_id: string;
        };
        Insert: {
          business_id?: string;
          created_at?: string;
          day_type?: string;
          id?: string;
          note?: string | null;
          present?: boolean;
          status?: string;
          updated_at?: string;
          work_date: string;
          worker_id: string;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          day_type?: string;
          id?: string;
          note?: string | null;
          present?: boolean;
          status?: string;
          updated_at?: string;
          work_date?: string;
          worker_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "worker_attendance_worker_id_fkey";
            columns: ["worker_id"];
            isOneToOne: false;
            referencedRelation: "workers";
            referencedColumns: ["id"];
          },
        ];
      };
      worker_payments: {
        Row: {
          business_id: string;
          amount: number;
          created_at: string;
          id: string;
          note: string | null;
          paid_at: string;
          updated_at: string;
          worker_id: string;
        };
        Insert: {
          business_id?: string;
          amount?: number;
          created_at?: string;
          id?: string;
          note?: string | null;
          paid_at?: string;
          updated_at?: string;
          worker_id: string;
        };
        Update: {
          business_id?: string;
          amount?: number;
          created_at?: string;
          id?: string;
          note?: string | null;
          paid_at?: string;
          updated_at?: string;
          worker_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "worker_payments_worker_id_fkey";
            columns: ["worker_id"];
            isOneToOne: false;
            referencedRelation: "workers";
            referencedColumns: ["id"];
          },
        ];
      };
      worker_feedback: {
        Row: {
          business_id: string;
          attendance_feedback: string | null;
          created_at: string;
          id: string;
          payment_feedback: string | null;
          updated_at: string;
          work_date: string;
          worker_id: string;
        };
        Insert: {
          business_id?: string;
          attendance_feedback?: string | null;
          created_at?: string;
          id?: string;
          payment_feedback?: string | null;
          updated_at?: string;
          work_date: string;
          worker_id: string;
        };
        Update: {
          business_id?: string;
          attendance_feedback?: string | null;
          created_at?: string;
          id?: string;
          payment_feedback?: string | null;
          updated_at?: string;
          work_date?: string;
          worker_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "worker_feedback_worker_id_fkey";
            columns: ["worker_id"];
            isOneToOne: false;
            referencedRelation: "workers";
            referencedColumns: ["id"];
          },
        ];
      };
      worker_locations: {
        Row: {
          business_id: string;
          accuracy_m: number | null;
          latitude: number | null;
          longitude: number | null;
          sharing_enabled: boolean;
          updated_at: string;
          worker_id: string;
        };
        Insert: {
          business_id?: string;
          accuracy_m?: number | null;
          latitude?: number | null;
          longitude?: number | null;
          sharing_enabled?: boolean;
          updated_at?: string;
          worker_id: string;
        };
        Update: {
          business_id?: string;
          accuracy_m?: number | null;
          latitude?: number | null;
          longitude?: number | null;
          sharing_enabled?: boolean;
          updated_at?: string;
          worker_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "worker_locations_worker_id_fkey";
            columns: ["worker_id"];
            isOneToOne: true;
            referencedRelation: "workers";
            referencedColumns: ["id"];
          },
        ];
      };
      workers: {
        Row: {
          business_id: string;
          role: string;
          auth_user_id: string | null;
          username: string | null;
          signature_url: string | null;
          active: boolean;
          created_at: string;
          daily_wage: number;
          email: string | null;
          id: string;
          must_set_password: boolean;
          name: string;
          notes: string | null;
          phone: string | null;
          session_token: string | null;
          updated_at: string;
        };
        Insert: {
          business_id?: string;
          role?: string;
          auth_user_id?: string | null;
          username?: string | null;
          signature_url?: string | null;
          active?: boolean;
          created_at?: string;
          daily_wage?: number;
          email?: string | null;
          id?: string;
          must_set_password?: boolean;
          name: string;
          notes?: string | null;
          phone?: string | null;
          session_token?: string | null;
          updated_at?: string;
        };
        Update: {
          business_id?: string;
          role?: string;
          auth_user_id?: string | null;
          username?: string | null;
          signature_url?: string | null;
          active?: boolean;
          created_at?: string;
          daily_wage?: number;
          email?: string | null;
          id?: string;
          must_set_password?: boolean;
          name?: string;
          notes?: string | null;
          phone?: string | null;
          session_token?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      claim_device: {
        Args: { p_token: string };
        Returns: undefined;
      };
      clear_must_set_password: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      is_business_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_staff: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_super_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      my_business_id: {
        Args: Record<PropertyKey, never>;
        Returns: string | null;
      };
      my_role: {
        Args: Record<PropertyKey, never>;
        Returns: string | null;
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: "admin" | "manager" | "worker";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "manager"],
    },
  },
} as const;