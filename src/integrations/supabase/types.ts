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
      articles: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          food_pairings: string | null
          grape_variety: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          order_unit_id: string | null
          organization_id: string
          origin_country: string | null
          packaging_unit: number | null
          price_cents: number
          sku: string | null
          sort_order: number
          special_attributes: string[] | null
          supplier_id: string
          unit: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          food_pairings?: string | null
          grape_variety?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          order_unit_id?: string | null
          organization_id: string
          origin_country?: string | null
          packaging_unit?: number | null
          price_cents?: number
          sku?: string | null
          sort_order?: number
          special_attributes?: string[] | null
          supplier_id: string
          unit?: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          food_pairings?: string | null
          grape_variety?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          order_unit_id?: string | null
          organization_id?: string
          origin_country?: string | null
          packaging_unit?: number | null
          price_cents?: number
          sku?: string | null
          sort_order?: number
          special_attributes?: string[] | null
          supplier_id?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "articles_order_unit_id_fkey"
            columns: ["order_unit_id"]
            isOneToOne: false
            referencedRelation: "order_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
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
      cart_draft_items: {
        Row: {
          article_id: string | null
          created_at: string
          draft_id: string
          free_text_name: string | null
          free_text_unit: string | null
          id: string
          is_free_text_item: boolean
          organization_id: string
          quantity: number
          supplier_id: string | null
        }
        Insert: {
          article_id?: string | null
          created_at?: string
          draft_id: string
          free_text_name?: string | null
          free_text_unit?: string | null
          id?: string
          is_free_text_item?: boolean
          organization_id: string
          quantity?: number
          supplier_id?: string | null
        }
        Update: {
          article_id?: string | null
          created_at?: string
          draft_id?: string
          free_text_name?: string | null
          free_text_unit?: string | null
          id?: string
          is_free_text_item?: boolean
          organization_id?: string
          quantity?: number
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cart_draft_items_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_draft_items_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "cart_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_draft_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_draft_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_drafts: {
        Row: {
          created_at: string
          delivery_address: string | null
          desired_delivery_date: string | null
          desired_time_window: string | null
          id: string
          location_id: string | null
          name: string
          notes: string | null
          organization_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          delivery_address?: string | null
          desired_delivery_date?: string | null
          desired_time_window?: string | null
          id?: string
          location_id?: string | null
          name?: string
          notes?: string | null
          organization_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          delivery_address?: string | null
          desired_delivery_date?: string | null
          desired_time_window?: string | null
          id?: string
          location_id?: string | null
          name?: string
          notes?: string | null
          organization_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_drafts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_drafts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_items: {
        Row: {
          article_id: string | null
          cart_id: string
          created_at: string
          free_text_name: string | null
          free_text_unit: string | null
          id: string
          is_free_text_item: boolean
          organization_id: string
          quantity: number
          supplier_id: string | null
        }
        Insert: {
          article_id?: string | null
          cart_id: string
          created_at?: string
          free_text_name?: string | null
          free_text_unit?: string | null
          id?: string
          is_free_text_item?: boolean
          organization_id: string
          quantity?: number
          supplier_id?: string | null
        }
        Update: {
          article_id?: string | null
          cart_id?: string
          created_at?: string
          free_text_name?: string | null
          free_text_unit?: string | null
          id?: string
          is_free_text_item?: boolean
          organization_id?: string
          quantity?: number
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          created_at: string
          delivery_date: string | null
          id: string
          location_id: string | null
          organization_id: string
          time_window: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          delivery_date?: string | null
          id?: string
          location_id?: string | null
          organization_id: string
          time_window?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          delivery_date?: string | null
          id?: string
          location_id?: string | null
          organization_id?: string
          time_window?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "carts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carts_organization_id_fkey"
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
      day_off_wishes: {
        Row: {
          created_at: string
          id: string
          note: string | null
          organization_id: string
          staff_id: string
          wish_date: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          organization_id: string
          staff_id: string
          wish_date: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          organization_id?: string
          staff_id?: string
          wish_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "day_off_wishes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_off_wishes_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      display_settings: {
        Row: {
          created_at: string
          display_token: string
          id: string
          is_enabled: boolean
          location_id: string
          organization_id: string
          refresh_interval_seconds: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_token?: string
          id?: string
          is_enabled?: boolean
          location_id: string
          organization_id: string
          refresh_interval_seconds?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_token?: string
          id?: string
          is_enabled?: boolean
          location_id?: string
          organization_id?: string
          refresh_interval_seconds?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "display_settings_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: true
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "display_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      inventory_items: {
        Row: {
          article_id: string
          created_at: string
          id: string
          line_value_cents: number
          organization_id: string
          session_id: string
          storage_1: number
          storage_2: number
          total_qty: number | null
          unit_price_cents: number
          updated_at: string
        }
        Insert: {
          article_id: string
          created_at?: string
          id?: string
          line_value_cents?: number
          organization_id: string
          session_id: string
          storage_1?: number
          storage_2?: number
          total_qty?: number | null
          unit_price_cents?: number
          updated_at?: string
        }
        Update: {
          article_id?: string
          created_at?: string
          id?: string
          line_value_cents?: number
          organization_id?: string
          session_id?: string
          storage_1?: number
          storage_2?: number
          total_qty?: number | null
          unit_price_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "inventory_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_sessions: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          location_id: string
          name: string
          notes: string | null
          organization_id: string
          status: string
          total_value_cents: number
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          location_id: string
          name?: string
          notes?: string | null
          organization_id: string
          status?: string
          total_value_cents?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          location_id?: string
          name?: string
          notes?: string | null
          organization_id?: string
          status?: string
          total_value_cents?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_sessions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by_staff_id: string | null
          decision_note: string | null
          end_date: string
          id: string
          organization_id: string
          reason: string | null
          staff_id: string
          start_date: string
          status: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by_staff_id?: string | null
          decision_note?: string | null
          end_date: string
          id?: string
          organization_id: string
          reason?: string | null
          staff_id: string
          start_date: string
          status?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by_staff_id?: string | null
          decision_note?: string | null
          end_date?: string
          id?: string
          organization_id?: string
          reason?: string | null
          staff_id?: string
          start_date?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_decided_by_staff_id_fkey"
            columns: ["decided_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
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
          cash_balance_target_cents: number | null
          city: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          delivery_notes: string | null
          geocoded_address: string | null
          geocoded_at: string | null
          geofence_radius_m: number
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          organization_id: string
          phone: string | null
          postal_code: string | null
          street: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          cash_balance_target_cents?: number | null
          city?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          delivery_notes?: string | null
          geocoded_address?: string | null
          geocoded_at?: string | null
          geofence_radius_m?: number
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          organization_id: string
          phone?: string | null
          postal_code?: string | null
          street?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          cash_balance_target_cents?: number | null
          city?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          delivery_notes?: string | null
          geocoded_address?: string | null
          geocoded_at?: string | null
          geofence_radius_m?: number
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          organization_id?: string
          phone?: string | null
          postal_code?: string | null
          street?: string | null
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
      order_items: {
        Row: {
          article_id: string | null
          article_name: string
          created_at: string
          id: string
          is_free_text_item: boolean
          order_id: string
          organization_id: string
          quantity: number
          sku: string | null
          total_price_cents: number
          unit: string
          unit_price_cents: number
        }
        Insert: {
          article_id?: string | null
          article_name: string
          created_at?: string
          id?: string
          is_free_text_item?: boolean
          order_id: string
          organization_id: string
          quantity: number
          sku?: string | null
          total_price_cents?: number
          unit?: string
          unit_price_cents?: number
        }
        Update: {
          article_id?: string | null
          article_name?: string
          created_at?: string
          id?: string
          is_free_text_item?: boolean
          order_id?: string
          organization_id?: string
          quantity?: number
          sku?: string | null
          total_price_cents?: number
          unit?: string
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      order_units: {
        Row: {
          abbreviation: string
          created_at: string
          id: string
          is_default: boolean
          name: string
          organization_id: string | null
        }
        Insert: {
          abbreviation: string
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          organization_id?: string | null
        }
        Update: {
          abbreviation?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_units_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          confirmation_token: string | null
          confirmed_at: string | null
          created_at: string
          delivery_address: string | null
          delivery_date: string | null
          email_error: string | null
          email_message_id: string | null
          email_sent: boolean
          email_sent_at: string | null
          id: string
          location_id: string | null
          notes: string | null
          order_number: string
          organization_id: string
          status: string
          supplier_id: string
          time_window: string | null
          total_amount_cents: number
          updated_at: string
        }
        Insert: {
          confirmation_token?: string | null
          confirmed_at?: string | null
          created_at?: string
          delivery_address?: string | null
          delivery_date?: string | null
          email_error?: string | null
          email_message_id?: string | null
          email_sent?: boolean
          email_sent_at?: string | null
          id?: string
          location_id?: string | null
          notes?: string | null
          order_number?: string
          organization_id: string
          status?: string
          supplier_id: string
          time_window?: string | null
          total_amount_cents?: number
          updated_at?: string
        }
        Update: {
          confirmation_token?: string | null
          confirmed_at?: string | null
          created_at?: string
          delivery_address?: string | null
          delivery_date?: string | null
          email_error?: string | null
          email_message_id?: string | null
          email_sent?: boolean
          email_sent_at?: string | null
          id?: string
          location_id?: string | null
          notes?: string | null
          order_number?: string
          organization_id?: string
          status?: string
          supplier_id?: string
          time_window?: string | null
          total_amount_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_settings: {
        Row: {
          created_at: string
          kitchen_tip_rate: number
          order_email_bcc: string | null
          order_email_reply_to: string | null
          organization_id: string
          test_mode_email: string | null
          test_mode_enabled: boolean
          time_locked_through_date: string | null
          tip_pool_min_hours: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          kitchen_tip_rate?: number
          order_email_bcc?: string | null
          order_email_reply_to?: string | null
          organization_id: string
          test_mode_email?: string | null
          test_mode_enabled?: boolean
          time_locked_through_date?: string | null
          tip_pool_min_hours?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          kitchen_tip_rate?: number
          order_email_bcc?: string | null
          order_email_reply_to?: string | null
          organization_id?: string
          test_mode_email?: string | null
          test_mode_enabled?: boolean
          time_locked_through_date?: string | null
          tip_pool_min_hours?: number
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
          cash_balance_target_cents: number
          created_at: string
          id: string
          name: string
          opening_safe_balance_cents: number
          updated_at: string
        }
        Insert: {
          cash_balance_target_cents?: number
          created_at?: string
          id?: string
          name: string
          opening_safe_balance_cents?: number
          updated_at?: string
        }
        Update: {
          cash_balance_target_cents?: number
          created_at?: string
          id?: string
          name?: string
          opening_safe_balance_cents?: number
          updated_at?: string
        }
        Relationships: []
      }
      payment_terminals: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_gl: boolean
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
          is_gl?: boolean
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
          is_gl?: boolean
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
      payroll_notes: {
        Row: {
          besonderheiten: string | null
          created_at: string
          id: string
          location_id: string
          organization_id: string
          period_end: string
          period_start: string
          staff_id: string
          updated_at: string
          vorschuss: number
        }
        Insert: {
          besonderheiten?: string | null
          created_at?: string
          id?: string
          location_id: string
          organization_id: string
          period_end: string
          period_start: string
          staff_id: string
          updated_at?: string
          vorschuss?: number
        }
        Update: {
          besonderheiten?: string | null
          created_at?: string
          id?: string
          location_id?: string
          organization_id?: string
          period_end?: string
          period_start?: string
          staff_id?: string
          updated_at?: string
          vorschuss?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_notes_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_notes_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      periods: {
        Row: {
          created_at: string
          end_date: string
          id: string
          label: string
          organization_id: string
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          label: string
          organization_id: string
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          label?: string
          organization_id?: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "periods_organization_id_fkey"
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
      roster_absence: {
        Row: {
          created_at: string
          date: string
          id: string
          organization_id: string
          staff_id: string
          type: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          organization_id: string
          staff_id: string
          type?: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          organization_id?: string
          staff_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "roster_absence_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_absence_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      roster_availability: {
        Row: {
          created_at: string
          date: string
          id: string
          organization_id: string
          staff_id: string
          type: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          organization_id: string
          staff_id: string
          type?: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          organization_id?: string
          staff_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "roster_availability_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_availability_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      roster_shifts: {
        Row: {
          area: Database["public"]["Enums"]["staff_department"]
          created_at: string
          id: string
          location_id: string
          notes: string | null
          organization_id: string
          shift_date: string
          skill_id: string | null
          staff_id: string
          status: string
          updated_at: string
        }
        Insert: {
          area: Database["public"]["Enums"]["staff_department"]
          created_at?: string
          id?: string
          location_id: string
          notes?: string | null
          organization_id: string
          shift_date: string
          skill_id?: string | null
          staff_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          area?: Database["public"]["Enums"]["staff_department"]
          created_at?: string
          id?: string
          location_id?: string
          notes?: string | null
          organization_id?: string
          shift_date?: string
          skill_id?: string | null
          staff_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roster_shifts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_shifts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_shifts_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_shifts_staff_id_fkey"
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
      session_tip_pool_entries: {
        Row: {
          created_at: string
          created_by: string | null
          department: Database["public"]["Enums"]["staff_department"]
          hours_minutes: number
          id: string
          note: string | null
          organization_id: string
          session_id: string
          staff_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department: Database["public"]["Enums"]["staff_department"]
          hours_minutes: number
          id?: string
          note?: string | null
          organization_id: string
          session_id: string
          staff_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department?: Database["public"]["Enums"]["staff_department"]
          hours_minutes?: number
          id?: string
          note?: string | null
          organization_id?: string
          session_id?: string
          staff_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_tip_pool_entries_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_tip_pool_entries_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          business_date: string
          cash_actual_cents: number | null
          created_at: string
          einladung_cents: number
          finalized_at: string | null
          finalized_by: string | null
          finedine_vouchers_cents: number
          guest_count: number
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
          tip_pool_settlement_only: boolean
          updated_at: string
          vectron_daily_total_cents: number
          vorschuss_cents: number
          vouchers_redeemed_cents: number
          vouchers_sold_cents: number
        }
        Insert: {
          business_date: string
          cash_actual_cents?: number | null
          created_at?: string
          einladung_cents?: number
          finalized_at?: string | null
          finalized_by?: string | null
          finedine_vouchers_cents?: number
          guest_count?: number
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
          tip_pool_settlement_only?: boolean
          updated_at?: string
          vectron_daily_total_cents?: number
          vorschuss_cents?: number
          vouchers_redeemed_cents?: number
          vouchers_sold_cents?: number
        }
        Update: {
          business_date?: string
          cash_actual_cents?: number | null
          created_at?: string
          einladung_cents?: number
          finalized_at?: string | null
          finalized_by?: string | null
          finedine_vouchers_cents?: number
          guest_count?: number
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
          tip_pool_settlement_only?: boolean
          updated_at?: string
          vectron_daily_total_cents?: number
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
          can_easyorder_auto_send: boolean
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
          can_easyorder_auto_send?: boolean
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
          can_easyorder_auto_send?: boolean
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
          hourly_rate_2: number | null
          id: string
          organization_id: string
          staff_id: string
          updated_at: string
          valid_from: string
        }
        Insert: {
          created_at?: string
          hourly_rate: number
          hourly_rate_2?: number | null
          id?: string
          organization_id: string
          staff_id: string
          updated_at?: string
          valid_from: string
        }
        Update: {
          created_at?: string
          hourly_rate?: number
          hourly_rate_2?: number | null
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
      staff_easyorder_access: {
        Row: {
          can_add_free_items: boolean
          created_at: string
          id: string
          is_active: boolean
          location_id: string
          organization_id: string
          staff_id: string
          updated_at: string
        }
        Insert: {
          can_add_free_items?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          location_id: string
          organization_id: string
          staff_id: string
          updated_at?: string
        }
        Update: {
          can_add_free_items?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          location_id?: string
          organization_id?: string
          staff_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_easyorder_access_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_easyorder_access_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_easyorder_access_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_easyorder_suppliers: {
        Row: {
          created_at: string
          id: string
          location_id: string
          organization_id: string
          staff_id: string
          supplier_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_id: string
          organization_id: string
          staff_id: string
          supplier_id: string
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string
          organization_id?: string
          staff_id?: string
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_easyorder_suppliers_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_easyorder_suppliers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_easyorder_suppliers_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_easyorder_suppliers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
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
          children_count: number | null
          church_tax_liable: boolean | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          employment_end_date: string | null
          employment_start_date: string | null
          has_parent_status: boolean | null
          health_insurance: string | null
          iban: string | null
          id: string
          is_minijob: boolean | null
          is_sv_exempt: boolean | null
          job_title: string | null
          kk_zusatzbeitrag: number | null
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
          children_count?: number | null
          church_tax_liable?: boolean | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          employment_end_date?: string | null
          employment_start_date?: string | null
          has_parent_status?: boolean | null
          health_insurance?: string | null
          iban?: string | null
          id?: string
          is_minijob?: boolean | null
          is_sv_exempt?: boolean | null
          job_title?: string | null
          kk_zusatzbeitrag?: number | null
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
          children_count?: number | null
          church_tax_liable?: boolean | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          employment_end_date?: string | null
          employment_start_date?: string | null
          has_parent_status?: boolean | null
          health_insurance?: string | null
          iban?: string | null
          id?: string
          is_minijob?: boolean | null
          is_sv_exempt?: boolean | null
          job_title?: string | null
          kk_zusatzbeitrag?: number | null
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
      suppliers: {
        Row: {
          address: string | null
          contact_person: string | null
          created_at: string
          customer_number: string | null
          delivery_days: string[] | null
          email: string | null
          id: string
          is_active: boolean
          min_order_value_cents: number | null
          name: string
          notes: string | null
          order_deadline: string | null
          organization_id: string
          phone: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          customer_number?: string | null
          delivery_days?: string[] | null
          email?: string | null
          id?: string
          is_active?: boolean
          min_order_value_cents?: number | null
          name: string
          notes?: string | null
          order_deadline?: string | null
          organization_id: string
          phone?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          customer_number?: string | null
          delivery_days?: string[] | null
          email?: string | null
          id?: string
          is_active?: boolean
          min_order_value_cents?: number | null
          name?: string
          notes?: string | null
          order_deadline?: string | null
          organization_id?: string
          phone?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          additional_waiters: Json
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
          partner_staff_id: string | null
          pos_sales_cents: number
          second_waiter_name: string | null
          session_id: string
          staff_id: string
          status: Database["public"]["Enums"]["waiter_settlement_status"]
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          additional_waiters?: Json
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
          partner_staff_id?: string | null
          pos_sales_cents?: number
          second_waiter_name?: string | null
          session_id: string
          staff_id: string
          status?: Database["public"]["Enums"]["waiter_settlement_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          additional_waiters?: Json
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
          partner_staff_id?: string | null
          pos_sales_cents?: number
          second_waiter_name?: string | null
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
            foreignKeyName: "waiter_settlements_partner_staff_id_fkey"
            columns: ["partner_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
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
      wine_quiz_scores: {
        Row: {
          correct_answers: number
          id: string
          level_reached: number
          organization_id: string
          played_at: string
          questions_answered: number
          score: number
          staff_id: string | null
          staff_name: string
        }
        Insert: {
          correct_answers?: number
          id?: string
          level_reached?: number
          organization_id: string
          played_at?: string
          questions_answered?: number
          score?: number
          staff_id?: string | null
          staff_name: string
        }
        Update: {
          correct_answers?: number
          id?: string
          level_reached?: number
          organization_id?: string
          played_at?: string
          questions_answered?: number
          score?: number
          staff_id?: string | null
          staff_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "wine_quiz_scores_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wine_quiz_scores_staff_id_fkey"
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
      approve_leave_request: {
        Args: { p_decided_by: string; p_note: string; p_request_id: string }
        Returns: undefined
      }
      create_order_from_cart: {
        Args: {
          p_notes?: string
          p_org_id: string
          p_supplier_id?: string
          p_user_id: string
        }
        Returns: string[]
      }
      current_business_date: { Args: never; Returns: string }
      current_organization_id: { Args: never; Returns: string }
      current_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      current_staff_id: { Args: never; Returns: string }
      generate_order_number: { Args: never; Returns: string }
      has_min_permission: {
        Args: { _min: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      has_role: {
        Args: { _role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "manager" | "staff" | "payroll"
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
      app_role: ["admin", "manager", "staff", "payroll"],
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
