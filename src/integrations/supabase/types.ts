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
      access_tokens: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          organization_id: string
          staff_id: string | null
          token: string
          token_type: Database["public"]["Enums"]["token_type"]
          used_at: string | null
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          organization_id: string
          staff_id?: string | null
          token: string
          token_type: Database["public"]["Enums"]["token_type"]
          used_at?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          organization_id?: string
          staff_id?: string | null
          token?: string
          token_type?: Database["public"]["Enums"]["token_type"]
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "access_tokens_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_tokens_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_staff_id: string | null
          actor_user_id: string | null
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          meta: Json
          organization_id: string
        }
        Insert: {
          action: string
          actor_staff_id?: string | null
          actor_user_id?: string | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          meta?: Json
          organization_id: string
        }
        Update: {
          action?: string
          actor_staff_id?: string | null
          actor_user_id?: string | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          meta?: Json
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_locks: {
        Row: {
          location_id: string
          locked_through_date: string
          organization_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          location_id: string
          locked_through_date: string
          organization_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          location_id?: string
          locked_through_date?: string
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_locks_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_locks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_locks_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      import_runs: {
        Row: {
          counters: Json
          created_at: string
          created_by: string | null
          file_hash: string
          finished_at: string | null
          id: string
          mode: string
          organization_id: string
          source_system: string
          started_at: string
        }
        Insert: {
          counters?: Json
          created_at?: string
          created_by?: string | null
          file_hash: string
          finished_at?: string | null
          id?: string
          mode: string
          organization_id: string
          source_system: string
          started_at?: string
        }
        Update: {
          counters?: Json
          created_at?: string
          created_by?: string | null
          file_hash?: string
          finished_at?: string | null
          id?: string
          mode?: string
          organization_id?: string
          source_system?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      location_department_defaults: {
        Row: {
          created_at: string
          default_checkin: string
          department: Database["public"]["Enums"]["staff_department"]
          id: string
          location_id: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_checkin: string
          department: Database["public"]["Enums"]["staff_department"]
          id?: string
          location_id: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_checkin?: string
          department?: Database["public"]["Enums"]["staff_department"]
          id?: string
          location_id?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_department_defaults_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_department_defaults_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          created_at: string
          id: string
          name: string
          organization_id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          organization_id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_settings: {
        Row: {
          created_at: string
          kitchen_tip_rate: number
          organization_id: string
          time_locked_through_date: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          kitchen_tip_rate?: number
          organization_id: string
          time_locked_through_date?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          kitchen_tip_rate?: number
          organization_id?: string
          time_locked_through_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_terminals: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          label: string
          location_id: string
          organization_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          location_id: string
          organization_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          location_id?: string
          organization_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_terminals_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_terminals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pin_attempts: {
        Row: {
          attempted_at: string
          id: string
          organization_id: string
          staff_id: string
        }
        Insert: {
          attempted_at?: string
          id?: string
          organization_id: string
          staff_id: string
        }
        Update: {
          attempted_at?: string
          id?: string
          organization_id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pin_attempts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pin_attempts_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_channels: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_takeaway: boolean
          kind: string
          label: string
          location_id: string
          organization_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_takeaway?: boolean
          kind: string
          label: string
          location_id: string
          organization_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_takeaway?: boolean
          kind?: string
          label?: string
          location_id?: string
          organization_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenue_channels_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_channels_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      role_assignments: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          staff_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          staff_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          staff_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_assignments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      session_advances: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          note: string | null
          organization_id: string
          session_id: string
          staff_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          id?: string
          note?: string | null
          organization_id: string
          session_id: string
          staff_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          note?: string | null
          organization_id?: string
          session_id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_advances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_advances_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_advances_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      session_bank_deposits: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          organization_id: string
          reference: string | null
          session_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          id?: string
          organization_id: string
          reference?: string | null
          session_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          organization_id?: string
          reference?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_bank_deposits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_bank_deposits_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_card_transactions: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          note: string | null
          organization_id: string
          session_id: string
          terminal_id: string | null
        }
        Insert: {
          amount_cents: number
          created_at?: string
          id?: string
          note?: string | null
          organization_id: string
          session_id: string
          terminal_id?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          note?: string | null
          organization_id?: string
          session_id?: string
          terminal_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_card_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_card_transactions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_card_transactions_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "payment_terminals"
            referencedColumns: ["id"]
          },
        ]
      }
      session_channel_amounts: {
        Row: {
          amount_cents: number
          channel_id: string
          created_at: string
          id: string
          organization_id: string
          session_id: string
          updated_at: string
        }
        Insert: {
          amount_cents?: number
          channel_id: string
          created_at?: string
          id?: string
          organization_id: string
          session_id: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          channel_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_channel_amounts_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "revenue_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_channel_amounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_channel_amounts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_expenses: {
        Row: {
          amount_cents: number
          created_at: string
          description: string
          id: string
          organization_id: string
          session_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          description: string
          id?: string
          organization_id: string
          session_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          description?: string
          id?: string
          organization_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_expenses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_expenses_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_register_transfers: {
        Row: {
          amount_cents: number
          created_at: string
          direction: Database["public"]["Enums"]["register_transfer_direction"]
          id: string
          note: string | null
          organization_id: string
          session_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          direction: Database["public"]["Enums"]["register_transfer_direction"]
          id?: string
          note?: string | null
          organization_id: string
          session_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          direction?: Database["public"]["Enums"]["register_transfer_direction"]
          id?: string
          note?: string | null
          organization_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_register_transfers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_register_transfers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_terminal_amounts: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          organization_id: string
          session_id: string
          terminal_id: string
          updated_at: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          id?: string
          organization_id: string
          session_id: string
          terminal_id: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          organization_id?: string
          session_id?: string
          terminal_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_terminal_amounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_terminal_amounts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_terminal_amounts_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "payment_terminals"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          business_date: string
          created_at: string
          einladung_cents: number
          finalized_at: string | null
          finalized_by: string | null
          finedine_vouchers_cents: number
          id: string
          location_id: string
          locked_at: string | null
          locked_by: string | null
          notes: string | null
          opening_balance_cents: number | null
          opentabs_deduction_cents: number
          organization_id: string
          sonstige_einnahme_cents: number
          status: Database["public"]["Enums"]["session_status"]
          updated_at: string
          vorschuss_cents: number
          vouchers_redeemed_cents: number
          vouchers_sold_cents: number
        }
        Insert: {
          business_date: string
          created_at?: string
          einladung_cents?: number
          finalized_at?: string | null
          finalized_by?: string | null
          finedine_vouchers_cents?: number
          id?: string
          location_id: string
          locked_at?: string | null
          locked_by?: string | null
          notes?: string | null
          opening_balance_cents?: number | null
          opentabs_deduction_cents?: number
          organization_id: string
          sonstige_einnahme_cents?: number
          status?: Database["public"]["Enums"]["session_status"]
          updated_at?: string
          vorschuss_cents?: number
          vouchers_redeemed_cents?: number
          vouchers_sold_cents?: number
        }
        Update: {
          business_date?: string
          created_at?: string
          einladung_cents?: number
          finalized_at?: string | null
          finalized_by?: string | null
          finedine_vouchers_cents?: number
          id?: string
          location_id?: string
          locked_at?: string | null
          locked_by?: string | null
          notes?: string | null
          opening_balance_cents?: number | null
          opentabs_deduction_cents?: number
          organization_id?: string
          sonstige_einnahme_cents?: number
          status?: Database["public"]["Enums"]["session_status"]
          updated_at?: string
          vorschuss_cents?: number
          vouchers_redeemed_cents?: number
          vouchers_sold_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "sessions_finalized_by_fkey"
            columns: ["finalized_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_locked_by_fkey"
            columns: ["locked_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      skills: {
        Row: {
          category: Database["public"]["Enums"]["skill_category"]
          color: string | null
          created_at: string
          id: string
          name: string
          organization_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category: Database["public"]["Enums"]["skill_category"]
          color?: string | null
          created_at?: string
          id?: string
          name: string
          organization_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["skill_category"]
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "skills_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          contracted_hours_per_month: number | null
          created_at: string
          display_name: string
          email: string | null
          first_name: string
          id: string
          is_active: boolean
          last_name: string
          organization_id: string
          participates_in_pool: boolean
          perso_nr: number | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          contracted_hours_per_month?: number | null
          created_at?: string
          display_name: string
          email?: string | null
          first_name: string
          id?: string
          is_active?: boolean
          last_name: string
          organization_id: string
          participates_in_pool?: boolean
          perso_nr?: number | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          contracted_hours_per_month?: number | null
          created_at?: string
          display_name?: string
          email?: string | null
          first_name?: string
          id?: string
          is_active?: boolean
          last_name?: string
          organization_id?: string
          participates_in_pool?: boolean
          perso_nr?: number | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_compensation: {
        Row: {
          created_at: string
          hourly_rate: number
          id: string
          organization_id: string
          staff_id: string
          updated_at: string
          valid_from: string
        }
        Insert: {
          created_at?: string
          hourly_rate: number
          id?: string
          organization_id: string
          staff_id: string
          updated_at?: string
          valid_from: string
        }
        Update: {
          created_at?: string
          hourly_rate?: number
          id?: string
          organization_id?: string
          staff_id?: string
          updated_at?: string
          valid_from?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_compensation_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_compensation_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: true
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_identity_map: {
        Row: {
          alt_id: string
          alt_name: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          id: string
          organization_id: string
          source_system: string
          staff_id: string | null
          updated_at: string
        }
        Insert: {
          alt_id: string
          alt_name: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          organization_id: string
          source_system: string
          staff_id?: string | null
          updated_at?: string
        }
        Update: {
          alt_id?: string
          alt_name?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          source_system?: string
          staff_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_identity_map_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_identity_map_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_locations: {
        Row: {
          created_at: string
          department: Database["public"]["Enums"]["staff_department"]
          id: string
          location_id: string
          organization_id: string
          staff_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          department: Database["public"]["Enums"]["staff_department"]
          id?: string
          location_id: string
          organization_id: string
          staff_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          department?: Database["public"]["Enums"]["staff_department"]
          id?: string
          location_id?: string
          organization_id?: string
          staff_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_locations_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_personal_details: {
        Row: {
          account_holder: string | null
          address: string | null
          bank_name: string | null
          child_tax_allowances: number | null
          church_tax_liable: boolean | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          employment_end_date: string | null
          employment_start_date: string | null
          health_insurance: string | null
          iban: string | null
          id: string
          is_minijob: boolean | null
          is_sv_exempt: boolean | null
          job_title: string | null
          nationality: string | null
          organization_id: string
          personnel_group: string | null
          phone: string | null
          place_of_birth: string | null
          salutation: string | null
          social_security_number: string | null
          staff_id: string
          tax_class: string | null
          tax_id: string | null
          updated_at: string
          vacation_days_contractual: number | null
          vacation_days_current_year: number | null
          vacation_days_previous_year: number | null
          vacation_days_taken: number | null
        }
        Insert: {
          account_holder?: string | null
          address?: string | null
          bank_name?: string | null
          child_tax_allowances?: number | null
          church_tax_liable?: boolean | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          employment_end_date?: string | null
          employment_start_date?: string | null
          health_insurance?: string | null
          iban?: string | null
          id?: string
          is_minijob?: boolean | null
          is_sv_exempt?: boolean | null
          job_title?: string | null
          nationality?: string | null
          organization_id: string
          personnel_group?: string | null
          phone?: string | null
          place_of_birth?: string | null
          salutation?: string | null
          social_security_number?: string | null
          staff_id: string
          tax_class?: string | null
          tax_id?: string | null
          updated_at?: string
          vacation_days_contractual?: number | null
          vacation_days_current_year?: number | null
          vacation_days_previous_year?: number | null
          vacation_days_taken?: number | null
        }
        Update: {
          account_holder?: string | null
          address?: string | null
          bank_name?: string | null
          child_tax_allowances?: number | null
          church_tax_liable?: boolean | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          employment_end_date?: string | null
          employment_start_date?: string | null
          health_insurance?: string | null
          iban?: string | null
          id?: string
          is_minijob?: boolean | null
          is_sv_exempt?: boolean | null
          job_title?: string | null
          nationality?: string | null
          organization_id?: string
          personnel_group?: string | null
          phone?: string | null
          place_of_birth?: string | null
          salutation?: string | null
          social_security_number?: string | null
          staff_id?: string
          tax_class?: string | null
          tax_id?: string | null
          updated_at?: string
          vacation_days_contractual?: number | null
          vacation_days_current_year?: number | null
          vacation_days_previous_year?: number | null
          vacation_days_taken?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_personal_details_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_personal_details_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: true
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_pins: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          pin_hash: string
          staff_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          pin_hash: string
          staff_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          pin_hash?: string
          staff_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_pins_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_pins_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: true
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_skills: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          skill_id: string
          staff_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          skill_id: string
          staff_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          skill_id?: string
          staff_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_skills_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_skills_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          break_minutes: number
          business_date: string
          created_at: string
          ended_at: string | null
          id: string
          import_key: string | null
          location_id: string | null
          organization_id: string
          source: Database["public"]["Enums"]["time_entry_source"]
          staff_id: string
          started_at: string
          updated_at: string
        }
        Insert: {
          break_minutes?: number
          business_date: string
          created_at?: string
          ended_at?: string | null
          id?: string
          import_key?: string | null
          location_id?: string | null
          organization_id: string
          source?: Database["public"]["Enums"]["time_entry_source"]
          staff_id: string
          started_at: string
          updated_at?: string
        }
        Update: {
          break_minutes?: number
          business_date?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          import_key?: string | null
          location_id?: string | null
          organization_id?: string
          source?: Database["public"]["Enums"]["time_entry_source"]
          staff_id?: string
          started_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      user_links: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          staff_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          staff_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          staff_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_links_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: true
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      waiter_settlements: {
        Row: {
          auto_clockout_time_entry_id: string | null
          card_total_cents: number
          cash_handed_in_cents: number
          corrected_from_id: string | null
          created_at: string
          differenz_cents: number
          hilf_mahl_cents: number
          id: string
          kitchen_tip_cents: number
          kitchen_tip_rate: number
          open_invoices_cents: number
          organization_id: string
          pos_sales_cents: number
          session_id: string
          staff_id: string
          status: Database["public"]["Enums"]["waiter_settlement_status"]
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          auto_clockout_time_entry_id?: string | null
          card_total_cents?: number
          cash_handed_in_cents?: number
          corrected_from_id?: string | null
          created_at?: string
          differenz_cents?: number
          hilf_mahl_cents?: number
          id?: string
          kitchen_tip_cents?: number
          kitchen_tip_rate: number
          open_invoices_cents?: number
          organization_id: string
          pos_sales_cents?: number
          session_id: string
          staff_id: string
          status?: Database["public"]["Enums"]["waiter_settlement_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          auto_clockout_time_entry_id?: string | null
          card_total_cents?: number
          cash_handed_in_cents?: number
          corrected_from_id?: string | null
          created_at?: string
          differenz_cents?: number
          hilf_mahl_cents?: number
          id?: string
          kitchen_tip_cents?: number
          kitchen_tip_rate?: number
          open_invoices_cents?: number
          organization_id?: string
          pos_sales_cents?: number
          session_id?: string
          staff_id?: string
          status?: Database["public"]["Enums"]["waiter_settlement_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "waiter_settlements_auto_clockout_time_entry_id_fkey"
            columns: ["auto_clockout_time_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiter_settlements_corrected_from_id_fkey"
            columns: ["corrected_from_id"]
            isOneToOne: false
            referencedRelation: "waiter_settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiter_settlements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiter_settlements_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiter_settlements_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_business_date: { Args: never; Returns: string }
      current_organization_id: { Args: never; Returns: string }
      current_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      current_staff_id: { Args: never; Returns: string }
      has_min_permission: {
        Args: { _min: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "manager" | "staff"
      register_transfer_direction:
        | "to_restaurant"
        | "from_restaurant"
        | "to_safe"
        | "to_other"
      session_status: "open" | "finalized" | "locked"
      skill_category: "kitchen" | "service" | "gl" | "other"
      staff_department: "kitchen" | "service" | "gl"
      time_entry_source: "clock" | "manual" | "import"
      token_type: "badge_login"
      waiter_settlement_status:
        | "draft"
        | "submitted"
        | "corrected"
        | "superseded"
        | "locked"
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
      app_role: ["admin", "manager", "staff"],
      register_transfer_direction: [
        "to_restaurant",
        "from_restaurant",
        "to_safe",
        "to_other",
      ],
      session_status: ["open", "finalized", "locked"],
      skill_category: ["kitchen", "service", "gl", "other"],
      staff_department: ["kitchen", "service", "gl"],
      time_entry_source: ["clock", "manual", "import"],
      token_type: ["badge_login"],
      waiter_settlement_status: [
        "draft",
        "submitted",
        "corrected",
        "superseded",
        "locked",
      ],
    },
  },
} as const
