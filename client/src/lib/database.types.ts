export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string
          role: 'business' | 'customer' | 'employee'
          display_name: string | null
          bio: string | null
          job_title: string | null
          location: string | null
          phone_number: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          username: string
          role: 'business' | 'customer' | 'employee'
          display_name?: string | null
          bio?: string | null
          job_title?: string | null
          location?: string | null
          phone_number?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          username?: string
          role?: 'business' | 'customer' | 'employee'
          display_name?: string | null
          bio?: string | null
          job_title?: string | null
          location?: string | null
          phone_number?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      tickets: {
        Row: {
          id: string
          title: string
          description: string
          status: 'open' | 'in_progress' | 'resolved'
          category: 'technical' | 'billing' | 'feature_request' | 'general_inquiry' | 'bug_report'
          priority: 'low' | 'medium' | 'high' | 'urgent'
          customer_id: string
          business_id: string
          assigned_to_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          title: string
          description: string
          status?: 'open' | 'in_progress' | 'resolved'
          category?: 'technical' | 'billing' | 'feature_request' | 'general_inquiry' | 'bug_report'
          priority?: 'low' | 'medium' | 'high' | 'urgent'
          customer_id: string
          business_id: string
          assigned_to_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          title?: string
          description?: string
          status?: 'open' | 'in_progress' | 'resolved'
          category?: 'technical' | 'billing' | 'feature_request' | 'general_inquiry' | 'bug_report'
          priority?: 'low' | 'medium' | 'high' | 'urgent'
          customer_id?: string
          business_id?: string
          assigned_to_id?: string | null
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}