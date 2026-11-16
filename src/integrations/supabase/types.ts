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
      app_user_connections: {
        Row: {
          account_email: string | null
          connection_key_ciphertext: string
          connector_id: string
          created_at: string
          folder_id: string | null
          id: string
          owner_id: string
          owner_kind: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_email?: string | null
          connection_key_ciphertext: string
          connector_id: string
          created_at?: string
          folder_id?: string | null
          id?: string
          owner_id: string
          owner_kind?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_email?: string | null
          connection_key_ciphertext?: string
          connector_id?: string
          created_at?: string
          folder_id?: string | null
          id?: string
          owner_id?: string
          owner_kind?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      b2b_connections: {
        Row: {
          connected_at: string
          key_ciphertext: string
          provider: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          connected_at?: string
          key_ciphertext: string
          provider: string
          tenant_id: string
          user_id: string
        }
        Update: {
          connected_at?: string
          key_ciphertext?: string
          provider?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "b2b_connections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_imports: {
        Row: {
          created_at: string
          fingerprint: string
          lead_id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fingerprint: string
          lead_id: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          fingerprint?: string
          lead_id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "b2b_imports_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "b2b_imports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_jobs: {
        Row: {
          created_at: string
          domains: Json
          error: string | null
          finished_at: string | null
          id: string
          provider: string
          results: Json
          status: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          domains?: Json
          error?: string | null
          finished_at?: string | null
          id?: string
          provider: string
          results?: Json
          status?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          domains?: Json
          error?: string | null
          finished_at?: string | null
          id?: string
          provider?: string
          results?: Json
          status?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "b2b_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      commissions: {
        Row: {
          amount: number
          id: string
          lead_id: string
          rate: number
          status: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          amount: number
          id?: string
          lead_id: string
          rate: number
          status?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          amount?: number
          id?: string
          lead_id?: string
          rate?: number
          status?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commissions_tenant_id_lead_id_fkey"
            columns: ["tenant_id", "lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "commissions_tenant_id_user_id_fkey"
            columns: ["tenant_id", "user_id"]
            isOneToOne: false
            referencedRelation: "user_roles"
            referencedColumns: ["tenant_id", "user_id"]
          },
        ]
      }
      contacts: {
        Row: {
          cnae: string
          cnpj: string
          company: string
          email: string
          endereco: string
          id: string
          name: string
          phone: string
          razao_social: string
          socios: Json
          tenant_id: string
        }
        Insert: {
          cnae?: string
          cnpj?: string
          company?: string
          email?: string
          endereco?: string
          id?: string
          name: string
          phone?: string
          razao_social?: string
          socios?: Json
          tenant_id: string
        }
        Update: {
          cnae?: string
          cnpj?: string
          company?: string
          email?: string
          endereco?: string
          id?: string
          name?: string
          phone?: string
          razao_social?: string
          socios?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      forms: {
        Row: {
          created_at: string
          fields: Json
          id: string
          name: string
          slug: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          fields?: Json
          id?: string
          name: string
          slug: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          fields?: Json
          id?: string
          name?: string
          slug?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "forms_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      funnel_automation_rules: {
        Row: {
          anti_vacuo_enabled: boolean
          anti_vacuo_minutes: number
          created_at: string
          id: string
          tenant_id: string
          updated_at: string
          welcome_enabled: boolean
          welcome_message_template: string | null
        }
        Insert: {
          anti_vacuo_enabled?: boolean
          anti_vacuo_minutes?: number
          created_at?: string
          id?: string
          tenant_id: string
          updated_at?: string
          welcome_enabled?: boolean
          welcome_message_template?: string | null
        }
        Update: {
          anti_vacuo_enabled?: boolean
          anti_vacuo_minutes?: number
          created_at?: string
          id?: string
          tenant_id?: string
          updated_at?: string
          welcome_enabled?: boolean
          welcome_message_template?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "funnel_automation_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      imported_prospects: {
        Row: {
          company_name: string
          id: string
          imported_at: string
          lead_id: string | null
          phone: string
          prospect_id: string
          tenant_id: string
        }
        Insert: {
          company_name: string
          id?: string
          imported_at?: string
          lead_id?: string | null
          phone: string
          prospect_id: string
          tenant_id: string
        }
        Update: {
          company_name?: string
          id?: string
          imported_at?: string
          lead_id?: string | null
          phone?: string
          prospect_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "imported_prospects_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imported_prospects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      incoming_webhook_logs: {
        Row: {
          created_at: string
          event: string
          id: string
          payload: Json
          source: string
          status: string
          summary: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          event: string
          id?: string
          payload?: Json
          source: string
          status?: string
          summary?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          event?: string
          id?: string
          payload?: Json
          source?: string
          status?: string
          summary?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "incoming_webhook_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_settings: {
        Row: {
          asaas_active: boolean
          asaas_api_key: string | null
          auto_move_to_ganho: boolean
          auto_open_portal_project: boolean
          auto_send_portal_magic_link: boolean
          created_at: string
          google_ads_active: boolean
          google_ads_key: string
          hotmart_active: boolean
          hotmart_token: string | null
          id: string
          kiwify_active: boolean
          kiwify_secret: string | null
          mercado_pago_active: boolean
          mercado_pago_token: string | null
          meta_lead_ads_active: boolean
          meta_verify_token: string
          stripe_active: boolean
          stripe_webhook_secret: string | null
          tenant_id: string
          updated_at: string
          whatsapp_provider: string
        }
        Insert: {
          asaas_active?: boolean
          asaas_api_key?: string | null
          auto_move_to_ganho?: boolean
          auto_open_portal_project?: boolean
          auto_send_portal_magic_link?: boolean
          created_at?: string
          google_ads_active?: boolean
          google_ads_key?: string
          hotmart_active?: boolean
          hotmart_token?: string | null
          id?: string
          kiwify_active?: boolean
          kiwify_secret?: string | null
          mercado_pago_active?: boolean
          mercado_pago_token?: string | null
          meta_lead_ads_active?: boolean
          meta_verify_token?: string
          stripe_active?: boolean
          stripe_webhook_secret?: string | null
          tenant_id: string
          updated_at?: string
          whatsapp_provider?: string
        }
        Update: {
          asaas_active?: boolean
          asaas_api_key?: string | null
          auto_move_to_ganho?: boolean
          auto_open_portal_project?: boolean
          auto_send_portal_magic_link?: boolean
          created_at?: string
          google_ads_active?: boolean
          google_ads_key?: string
          hotmart_active?: boolean
          hotmart_token?: string | null
          id?: string
          kiwify_active?: boolean
          kiwify_secret?: string | null
          mercado_pago_active?: boolean
          mercado_pago_token?: string | null
          meta_lead_ads_active?: boolean
          meta_verify_token?: string
          stripe_active?: boolean
          stripe_webhook_secret?: string | null
          tenant_id?: string
          updated_at?: string
          whatsapp_provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_events: {
        Row: {
          created_at: string
          id: string
          kind: string
          lead_id: string
          tenant_id: string
          text: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          lead_id: string
          tenant_id: string
          text: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          lead_id?: string
          tenant_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_events_tenant_id_lead_id_fkey"
            columns: ["tenant_id", "lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      leads: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          owner_id: string
          priority: string
          stage: string
          temp: string
          tenant_id: string
          updated_at: string
          value: number
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          owner_id: string
          priority?: string
          stage?: string
          temp?: string
          tenant_id: string
          updated_at?: string
          value?: number
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          owner_id?: string
          priority?: string
          stage?: string
          temp?: string
          tenant_id?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "leads_tenant_id_contact_id_fkey"
            columns: ["tenant_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "leads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_tenant_id_owner_id_fkey"
            columns: ["tenant_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "user_roles"
            referencedColumns: ["tenant_id", "user_id"]
          },
          {
            foreignKeyName: "leads_tenant_id_stage_fkey"
            columns: ["tenant_id", "stage"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          id: string
          label: string
          position: number
          tenant_id: string
        }
        Insert: {
          id: string
          label: string
          position: number
          tenant_id: string
        }
        Update: {
          id?: string
          label?: string
          position?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string
          display_name: string
          id: string
        }
        Insert: {
          avatar_url?: string
          display_name?: string
          id: string
        }
        Update: {
          avatar_url?: string
          display_name?: string
          id?: string
        }
        Relationships: []
      }
      proposals: {
        Row: {
          base: number
          created_at: string
          discount: number
          id: string
          lead_id: string
          status: string
          tenant_id: string
          total: number | null
        }
        Insert: {
          base: number
          created_at?: string
          discount?: number
          id?: string
          lead_id: string
          status?: string
          tenant_id: string
          total?: number | null
        }
        Update: {
          base?: number
          created_at?: string
          discount?: number
          id?: string
          lead_id?: string
          status?: string
          tenant_id?: string
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "proposals_tenant_id_lead_id_fkey"
            columns: ["tenant_id", "lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      prospecting_searches: {
        Row: {
          city: string
          created_at: string
          id: string
          results_count: number
          segment: string
          tenant_id: string
        }
        Insert: {
          city: string
          created_at?: string
          id?: string
          results_count?: number
          segment: string
          tenant_id: string
        }
        Update: {
          city?: string
          created_at?: string
          id?: string
          results_count?: number
          segment?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospecting_searches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          converted_at: string | null
          created_at: string
          deal_value: number
          id: string
          lead_id: string | null
          magic_link: string
          magic_token: string
          referred_email: string | null
          referred_name: string
          referred_phone: string
          referrer_contact_id: string
          referrer_name: string
          reward_amount: number
          reward_pct: number
          status: string
          tenant_id: string
        }
        Insert: {
          converted_at?: string | null
          created_at?: string
          deal_value?: number
          id?: string
          lead_id?: string | null
          magic_link: string
          magic_token: string
          referred_email?: string | null
          referred_name: string
          referred_phone: string
          referrer_contact_id: string
          referrer_name: string
          reward_amount?: number
          reward_pct?: number
          status?: string
          tenant_id: string
        }
        Update: {
          converted_at?: string | null
          created_at?: string
          deal_value?: number
          id?: string
          lead_id?: string | null
          magic_link?: string
          magic_token?: string
          referred_email?: string | null
          referred_name?: string
          referred_phone?: string
          referrer_contact_id?: string
          referrer_name?: string
          reward_amount?: number
          reward_pct?: number
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          contact_id: string | null
          contact_name: string
          created_at: string
          description: string | null
          id: string
          priority: string
          protocol: string
          resolved_at: string | null
          sla_deadline: string
          sla_hours: number
          sla_label: string
          status: string
          tenant_id: string
          title: string
        }
        Insert: {
          contact_id?: string | null
          contact_name?: string
          created_at?: string
          description?: string | null
          id?: string
          priority?: string
          protocol: string
          resolved_at?: string | null
          sla_deadline?: string
          sla_hours?: number
          sla_label?: string
          status?: string
          tenant_id: string
          title: string
        }
        Update: {
          contact_id?: string | null
          contact_name?: string
          created_at?: string
          description?: string | null
          id?: string
          priority?: string
          protocol?: string
          resolved_at?: string | null
          sla_deadline?: string
          sla_hours?: number
          sla_label?: string
          status?: string
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_invitations: {
        Row: {
          accepted_at: string | null
          email: string
          expires_at: string
          id: string
          tenant_id: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          email: string
          expires_at?: string
          id?: string
          tenant_id: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          tenant_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_settings: {
        Row: {
          commission_rate: number
          pix_key: string
          structure: string
          tenant_id: string
        }
        Insert: {
          commission_rate?: number
          pix_key?: string
          structure?: string
          tenant_id: string
        }
        Update: {
          commission_rate?: number
          pix_key?: string
          structure?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          theme: string
          tour_done: boolean
          user_id: string
          view: string
        }
        Insert: {
          theme?: string
          tour_done?: boolean
          user_id: string
          view?: string
        }
        Update: {
          theme?: string
          tour_done?: boolean
          user_id?: string
          view?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          id?: string
          role: string
          tenant_id: string
          user_id: string
        }
        Update: {
          id?: string
          role?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          body: string
          created_at: string
          direction: string
          error: string | null
          id: string
          kind: string
          lead_id: string | null
          phone: string
          sent_by: string | null
          status: string
          status_at: string | null
          tenant_id: string | null
          wa_id: string | null
        }
        Insert: {
          body?: string
          created_at?: string
          direction: string
          error?: string | null
          id?: string
          kind?: string
          lead_id?: string | null
          phone: string
          sent_by?: string | null
          status?: string
          status_at?: string | null
          tenant_id?: string | null
          wa_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          direction?: string
          error?: string | null
          id?: string
          kind?: string
          lead_id?: string | null
          phone?: string
          sent_by?: string | null
          status?: string
          status_at?: string | null
          tenant_id?: string | null
          wa_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_webhook_events: {
        Row: {
          attempts: number
          delivery_id: string
          event: string
          id: string
          payload: Json
          processed_at: string | null
          processing_error: string | null
          received_at: string
        }
        Insert: {
          attempts?: number
          delivery_id: string
          event: string
          id?: string
          payload: Json
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
        }
        Update: {
          attempts?: number
          delivery_id?: string
          event?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
        }
        Relationships: []
      }
      workflow_execution_logs: {
        Row: {
          executed_at: string
          id: string
          lead_id: string
          lead_name: string
          node_id: string
          node_label: string
          output: string
          status: string
          tenant_id: string
          workflow_id: string
          workflow_name: string
        }
        Insert: {
          executed_at?: string
          id: string
          lead_id: string
          lead_name: string
          node_id: string
          node_label: string
          output?: string
          status: string
          tenant_id: string
          workflow_id: string
          workflow_name: string
        }
        Update: {
          executed_at?: string
          id?: string
          lead_id?: string
          lead_name?: string
          node_id?: string
          node_label?: string
          output?: string
          status?: string
          tenant_id?: string
          workflow_id?: string
          workflow_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_execution_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          edges: Json
          executions_count: number
          id: string
          name: string
          nodes: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          edges?: Json
          executions_count?: number
          id: string
          name: string
          nodes?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          edges?: Json
          executions_count?: number
          id?: string
          name?: string
          nodes?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflows_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: { Args: { invite_token: string }; Returns: string }
      create_lead: {
        Args: {
          contact_company: string
          contact_email: string
          contact_name: string
          contact_phone: string
          deal_value: number
          t: string
        }
        Returns: string
      }
      create_tenant: { Args: { company_name: string }; Returns: string }
      import_b2b_rows: { Args: { rows: Json; t: string }; Returns: Json }
      is_member: { Args: { t: string }; Returns: boolean }
      is_tenant_admin: { Args: { t: string }; Returns: boolean }
      tenant_members: {
        Args: { t: string }
        Returns: {
          display_name: string
          email: string
          role: string
          user_id: string
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
    Enums: {},
  },
} as const
