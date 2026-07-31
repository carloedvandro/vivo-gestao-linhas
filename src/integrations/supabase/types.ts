export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type LineStatus =
  | "ativa"
  | "reduzida"
  | "bloqueada_fatura"
  | "bloqueada_pagamento"
  | "aguardando"

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          name: string
          phone: string | null
          is_admin: boolean
          created_at: string
        }
        Insert: {
          id: string
          name?: string
          phone?: string | null
          is_admin?: boolean
        }
        Update: {
          name?: string
          phone?: string | null
          is_admin?: boolean
        }
        Relationships: []
      }
      lines: {
        Row: {
          id: string
          number: string
          user_id: string | null
          plan: string
          total_gb: number
          bonus_gb: number
          used_gb: number
          status: LineStatus
          cycle_closing_day: number
          cycle_renewal_day: number
          vivo_portal_url: string | null
          vivo_line_id: string | null
          last_scraped_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          number: string
          user_id?: string | null
          plan?: string
          total_gb?: number
          bonus_gb?: number
          used_gb?: number
          status?: LineStatus
          cycle_closing_day?: number
          cycle_renewal_day?: number
          vivo_portal_url?: string | null
          vivo_line_id?: string | null
          last_scraped_at?: string | null
        }
        Update: {
          id?: string
          number?: string
          user_id?: string | null
          plan?: string
          total_gb?: number
          bonus_gb?: number
          used_gb?: number
          status?: LineStatus
          cycle_closing_day?: number
          cycle_renewal_day?: number
          vivo_portal_url?: string | null
          vivo_line_id?: string | null
          last_scraped_at?: string | null
        }
        Relationships: []
      }
      available_lines: {
        Row: {
          id: string
          number: string
          display: string | null
          group_name: string | null
          linked: boolean
          created_at: string
        }
        Insert: {
          id?: string
          number: string
          display?: string | null
          group_name?: string | null
          linked?: boolean
        }
        Update: {
          id?: string
          number?: string
          display?: string | null
          group_name?: string | null
          linked?: boolean
        }
        Relationships: []
      }
      consumption_snapshots: {
        Row: {
          id: string
          line_id: string
          used_gb: number
          total_gb: number
          status: LineStatus | null
          scraped_at: string
        }
        Insert: {
          id?: string
          line_id: string
          used_gb: number
          total_gb: number
          status?: LineStatus | null
          scraped_at?: string
        }
        Update: {
          id?: string
          line_id?: string
          used_gb?: number
          total_gb?: number
          status?: LineStatus | null
          scraped_at?: string
        }
        Relationships: [
          { foreignKeyName: "consumption_snapshots_line_id_fkey"; columns: ["line_id"]; referencedRelation: "lines"; referencedColumns: ["id"] },
        ]
      }
      thresholds: {
        Row: {
          id: string
          line_id: string
          warn_pct: number
          warn_gb: number | null
          enabled: boolean
          created_at: string
        }
        Insert: {
          id?: string
          line_id: string
          warn_pct?: number
          warn_gb?: number | null
          enabled?: boolean
        }
        Update: {
          id?: string
          line_id?: string
          warn_pct?: number
          warn_gb?: number | null
          enabled?: boolean
        }
        Relationships: [
          { foreignKeyName: "thresholds_line_id_fkey"; columns: ["line_id"]; referencedRelation: "lines"; referencedColumns: ["id"] },
        ]
      }
      alerts: {
        Row: {
          id: string
          line_id: string
          user_id: string | null
          kind: string
          message: string
          used_gb: number | null
          total_gb: number | null
          pct: number | null
          notified: boolean
          read: boolean
          created_at: string
        }
        Insert: {
          id?: string
          line_id: string
          user_id?: string | null
          kind?: string
          message: string
          used_gb?: number | null
          total_gb?: number | null
          pct?: number | null
          notified?: boolean
          read?: boolean
        }
        Update: {
          id?: string
          line_id?: string
          user_id?: string | null
          kind?: string
          message?: string
          used_gb?: number | null
          total_gb?: number | null
          pct?: number | null
          notified?: boolean
          read?: boolean
        }
        Relationships: [
          { foreignKeyName: "alerts_line_id_fkey"; columns: ["line_id"]; referencedRelation: "lines"; referencedColumns: ["id"] },
        ]
      }
      push_subscriptions: {
        Row: {
          id: string
          user_id: string
          endpoint: string
          p256dh: string
          auth_key: string
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          endpoint: string
          p256dh: string
          auth_key: string
          user_agent?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          endpoint?: string
          p256dh?: string
          auth_key?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      scraping_runs: {
        Row: {
          id: string
          started_at: string
          finished_at: string | null
          status: string
          lines_ok: number
          lines_err: number
          error: string | null
        }
        Insert: {
          id?: string
          started_at?: string
          finished_at?: string | null
          status?: string
          lines_ok?: number
          lines_err?: number
          error?: string | null
        }
        Update: {
          id?: string
          started_at?: string
          finished_at?: string | null
          status?: string
          lines_ok?: number
          lines_err?: number
          error?: string | null
        }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      is_admin: { Args: Record<never, never>; Returns: boolean }
    }
    Enums: {
      line_status: LineStatus
    }
    CompositeTypes: { [_ in never]: never }
  }
}

// Conveniência: tipos de linha prontos pra uso.
export type LineRow = Database["public"]["Tables"]["lines"]["Row"]
export type LineInsert = Database["public"]["Tables"]["lines"]["Insert"]
export type LineUpdate = Database["public"]["Tables"]["lines"]["Update"]
export type ThresholdRow = Database["public"]["Tables"]["thresholds"]["Row"]
export type AlertRow = Database["public"]["Tables"]["alerts"]["Row"]
export type SnapshotRow = Database["public"]["Tables"]["consumption_snapshots"]["Row"]
