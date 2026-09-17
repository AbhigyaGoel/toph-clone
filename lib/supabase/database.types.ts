/**
 * Generated from the live schema with the Supabase MCP
 * (`generate_typescript_types`) after applying supabase/migrations. Regenerate
 * rather than edit.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      activity_logs: {
        Row: {
          activity_type_id: string;
          created_at: string;
          employee_id: string;
          ended_at: string;
          field_id: string;
          id: string;
          org_id: string;
          started_at: string;
          status: Database['public']['Enums']['log_status'];
        };
        Insert: {
          activity_type_id: string;
          created_at?: string;
          employee_id: string;
          ended_at: string;
          field_id: string;
          id?: string;
          org_id: string;
          started_at: string;
          status?: Database['public']['Enums']['log_status'];
        };
        Update: {
          activity_type_id?: string;
          created_at?: string;
          employee_id?: string;
          ended_at?: string;
          field_id?: string;
          id?: string;
          org_id?: string;
          started_at?: string;
          status?: Database['public']['Enums']['log_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'activity_logs_activity_type_id_fkey';
            columns: ['activity_type_id'];
            isOneToOne: false;
            referencedRelation: 'activity_types';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activity_logs_employee_id_fkey';
            columns: ['employee_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activity_logs_field_id_fkey';
            columns: ['field_id'];
            isOneToOne: false;
            referencedRelation: 'fields';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activity_logs_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'dashboard_stats';
            referencedColumns: ['org_id'];
          },
          {
            foreignKeyName: 'activity_logs_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      activity_types: {
        Row: {
          id: string;
          name: string;
          requires_product: boolean;
        };
        Insert: {
          id?: string;
          name: string;
          requires_product?: boolean;
        };
        Update: {
          id?: string;
          name?: string;
          requires_product?: boolean;
        };
        Relationships: [];
      };
      applications: {
        Row: {
          air_temp_f: number | null;
          area_acres: number | null;
          created_at: string;
          id: string;
          log_id: string;
          product_id: string;
          rate: number;
          wind_speed_mph: number | null;
        };
        Insert: {
          air_temp_f?: number | null;
          area_acres?: number | null;
          created_at?: string;
          id?: string;
          log_id: string;
          product_id: string;
          rate: number;
          wind_speed_mph?: number | null;
        };
        Update: {
          air_temp_f?: number | null;
          area_acres?: number | null;
          created_at?: string;
          id?: string;
          log_id?: string;
          product_id?: string;
          rate?: number;
          wind_speed_mph?: number | null;
        };
        /**
         * Declared so `select('… products ( name )')` types the embed. The
         * other tables leave this empty because nothing embeds through them;
         * the audit trail reads a product's name alongside its application, so
         * these two have to be spelled out.
         */
        Relationships: [
          {
            foreignKeyName: 'applications_log_id_fkey';
            columns: ['log_id'];
            isOneToOne: false;
            referencedRelation: 'activity_logs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'applications_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
        ];
      };
      products: {
        Row: {
          active_ingredient: string | null;
          created_at: string;
          epa_registration: string | null;
          id: string;
          kind: Database['public']['Enums']['product_kind'];
          name: string;
          org_id: string;
          phi_days: number | null;
          rate_unit: string;
          rei_hours: number | null;
        };
        Insert: {
          active_ingredient?: string | null;
          created_at?: string;
          epa_registration?: string | null;
          id?: string;
          kind: Database['public']['Enums']['product_kind'];
          name: string;
          org_id: string;
          phi_days?: number | null;
          rate_unit: string;
          rei_hours?: number | null;
        };
        Update: {
          active_ingredient?: string | null;
          created_at?: string;
          epa_registration?: string | null;
          id?: string;
          kind?: Database['public']['Enums']['product_kind'];
          name?: string;
          org_id?: string;
          phi_days?: number | null;
          rate_unit?: string;
          rei_hours?: number | null;
        };
        Relationships: [];
      };
      audit_events: {
        Row: {
          action: Database['public']['Enums']['audit_action'];
          actor_id: string | null;
          actor_label: string;
          changes: Json;
          created_at: string;
          entity_id: string;
          entity_type: string;
          id: string;
          org_id: string;
          summary: string;
        };
        /** `seq`, `hash` and `prev_hash` are assigned by the insert trigger. */
        Insert: {
          action: Database['public']['Enums']['audit_action'];
          actor_id?: string | null;
          actor_label: string;
          changes?: Json;
          created_at?: string;
          entity_id: string;
          entity_type: string;
          id?: string;
          org_id: string;
          summary: string;
        };
        /** Present because the generator emits it; no policy grants UPDATE. */
        Update: {
          action?: Database['public']['Enums']['audit_action'];
          actor_id?: string | null;
          actor_label?: string;
          changes?: Json;
          created_at?: string;
          entity_id?: string;
          entity_type?: string;
          id?: string;
          org_id?: string;
          summary?: string;
        };
        Relationships: [];
      };
      employees: {
        Row: {
          created_at: string;
          full_name: string;
          id: string;
          is_active: boolean;
          org_id: string;
        };
        Insert: {
          created_at?: string;
          full_name: string;
          id?: string;
          is_active?: boolean;
          org_id: string;
        };
        Update: {
          created_at?: string;
          full_name?: string;
          id?: string;
          is_active?: boolean;
          org_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'employees_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'dashboard_stats';
            referencedColumns: ['org_id'];
          },
          {
            foreignKeyName: 'employees_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      fields: {
        Row: {
          id: string;
          map_plot: Json;
          name: string;
          org_id: string;
        };
        Insert: {
          id?: string;
          map_plot: Json;
          name: string;
          org_id: string;
        };
        Update: {
          id?: string;
          map_plot?: Json;
          name?: string;
          org_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'fields_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'dashboard_stats';
            referencedColumns: ['org_id'];
          },
          {
            foreignKeyName: 'fields_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      log_tags: {
        Row: {
          log_id: string;
          tag_id: string;
        };
        Insert: {
          log_id: string;
          tag_id: string;
        };
        Update: {
          log_id?: string;
          tag_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'log_tags_log_id_fkey';
            columns: ['log_id'];
            isOneToOne: false;
            referencedRelation: 'activity_log_rows';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'log_tags_log_id_fkey';
            columns: ['log_id'];
            isOneToOne: false;
            referencedRelation: 'activity_logs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'log_tags_tag_id_fkey';
            columns: ['tag_id'];
            isOneToOne: false;
            referencedRelation: 'tags';
            referencedColumns: ['id'];
          },
        ];
      };
      members: {
        Row: {
          created_at: string;
          display_name: string;
          id: string;
          org_id: string;
          role: Database['public']['Enums']['member_role'];
        };
        Insert: {
          created_at?: string;
          display_name: string;
          id?: string;
          org_id: string;
          role?: Database['public']['Enums']['member_role'];
        };
        Update: {
          created_at?: string;
          display_name?: string;
          id?: string;
          org_id?: string;
          role?: Database['public']['Enums']['member_role'];
        };
        Relationships: [
          {
            foreignKeyName: 'members_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'dashboard_stats';
            referencedColumns: ['org_id'];
          },
          {
            foreignKeyName: 'members_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      organizations: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          id: string;
          name: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          id?: string;
          name: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      recordings: {
        Row: {
          audio_path: string | null;
          language: string;
          audio_url: string | null;
          duration_seconds: number;
          id: string;
          log_id: string;
          map_pin: Json;
          recorded_at: string;
          extracted_fields: Json | null;
          transcript: string;
          transcript_en: string | null;
          transcription_confidence: number;
          waveform: Json;
        };
        Insert: {
          audio_path?: string | null;
          language?: string;
          audio_url?: string | null;
          duration_seconds: number;
          extracted_fields?: Json | null;
          id?: string;
          log_id: string;
          map_pin: Json;
          recorded_at: string;
          transcript: string;
          transcript_en?: string | null;
          transcription_confidence: number;
          waveform: Json;
        };
        Update: {
          audio_path?: string | null;
          language?: string;
          audio_url?: string | null;
          duration_seconds?: number;
          id?: string;
          log_id?: string;
          map_pin?: Json;
          recorded_at?: string;
          extracted_fields?: Json | null;
          transcript?: string;
          transcript_en?: string | null;
          transcription_confidence?: number;
          waveform?: Json;
        };
        Relationships: [
          {
            foreignKeyName: 'recordings_log_id_fkey';
            columns: ['log_id'];
            isOneToOne: true;
            referencedRelation: 'activity_log_rows';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'recordings_log_id_fkey';
            columns: ['log_id'];
            isOneToOne: true;
            referencedRelation: 'activity_logs';
            referencedColumns: ['id'];
          },
        ];
      };
      tags: {
        Row: {
          id: string;
          name: string;
          org_id: string;
        };
        Insert: {
          id?: string;
          name: string;
          org_id: string;
        };
        Update: {
          id?: string;
          name?: string;
          org_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'tags_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'dashboard_stats';
            referencedColumns: ['org_id'];
          },
          {
            foreignKeyName: 'tags_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      activity_log_rows: {
        Row: {
          activity_name: string | null;
          created_at: string | null;
          employee_name: string | null;
          ended_at: string | null;
          field_name: string | null;
          has_recording: boolean | null;
          id: string | null;
          org_id: string | null;
          started_at: string | null;
          status: Database['public']['Enums']['log_status'] | null;
        };
        Relationships: [
          {
            foreignKeyName: 'activity_logs_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'dashboard_stats';
            referencedColumns: ['org_id'];
          },
          {
            foreignKeyName: 'activity_logs_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      application_records: {
        Row: {
          active_ingredient: string | null;
          activity_name: string | null;
          air_temp_f: number | null;
          applicator: string | null;
          area_acres: number | null;
          ended_at: string | null;
          epa_registration: string | null;
          field_id: string | null;
          field_name: string | null;
          id: string | null;
          kind: Database['public']['Enums']['product_kind'] | null;
          log_id: string | null;
          org_id: string | null;
          phi_clears_on: string | null;
          phi_days: number | null;
          product_id: string | null;
          product_name: string | null;
          rate: number | null;
          rate_unit: string | null;
          rei_expires_at: string | null;
          rei_hours: number | null;
          started_at: string | null;
          status: Database['public']['Enums']['log_status'] | null;
          wind_speed_mph: number | null;
        };
        Relationships: [];
      };
      employee_activity: {
        Row: {
          employee_id: string | null;
          field_count: number | null;
          full_name: string | null;
          is_active: boolean | null;
          last_logged_at: string | null;
          log_count: number | null;
          mean_confidence: number | null;
          org_id: string | null;
          recording_count: number | null;
          unreviewed_count: number | null;
          worked_seconds: number | null;
        };
        Relationships: [];
      };
      field_activity: {
        Row: {
          field_id: string | null;
          last_worked_at: string | null;
          log_count: number | null;
          map_plot: Json | null;
          name: string | null;
          org_id: string | null;
          unreviewed_count: number | null;
        };
        Relationships: [];
      };
      dashboard_stats: {
        Row: {
          active_workers: number | null;
          new_logs: number | null;
          org_id: string | null;
          response_accuracy: number | null;
          todays_recordings: number | null;
        };
        Insert: {
          active_workers?: never;
          new_logs?: never;
          org_id?: string | null;
          response_accuracy?: never;
          todays_recordings?: never;
        };
        Update: {
          active_workers?: never;
          new_logs?: never;
          org_id?: string | null;
          response_accuracy?: never;
          todays_recordings?: never;
        };
        Relationships: [];
      };
    };
    Functions: {
      show_limit: { Args: never; Returns: number };
      show_trgm: { Args: { '': string }; Returns: string[] };
      search_everything: {
        Args: { target_org: string; needle: string; max_results?: number };
        Returns: {
          kind: string;
          id: string;
          label: string;
          sublabel: string;
          score: number;
        }[];
      };
      audit_coverage: {
        Args: { target_org: string };
        Returns: {
          entity_type: string;
          entity_id: string;
          changes: number;
          recorded: number;
          unrecorded: number;
        }[];
      };
      verify_audit_chain: {
        Args: { target_org: string };
        Returns: { broken_seq: number; reason: string }[];
      };
    };
    Enums: {
      audit_action: 'create' | 'update' | 'delete' | 'restore';
      log_status: 'new' | 'reviewed';
      member_role: 'admin' | 'manager' | 'worker';
      product_kind: 'chemical' | 'fertilizer' | 'amendment';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      ingest_status: ['received', 'transcribing', 'extracting', 'complete', 'failed'],
      log_status: ['new', 'reviewed'],
      member_role: ['admin', 'worker'],
      product_kind: ['chemical', 'fertilizer', 'amendment'],
    },
  },
} as const;
