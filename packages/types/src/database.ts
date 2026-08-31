/**
 * Stable local contract for the Supabase schema. In a connected project this
 * file should be replaced by `supabase gen types typescript --local` output.
 */
export interface Database {
  public: {
    Tables: {
      profiles: { Row: { id: string; email: string; display_name: string; status: 'active' | 'suspended' | 'disabled'; created_at: string; updated_at: string }; Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at' | 'updated_at'> & { created_at?: string; updated_at?: string }; Update: Partial<Database['public']['Tables']['profiles']['Insert']> }
      user_devices: { Row: { id: string; user_id: string; public_key: string; platform: 'windows' | 'macos'; device_name: string; app_version: string; status: 'active' | 'revoked'; last_seen_at: string; created_at: string }; Insert: Omit<Database['public']['Tables']['user_devices']['Row'], 'id' | 'created_at' | 'last_seen_at'> & { id?: string; created_at?: string; last_seen_at?: string }; Update: Partial<Database['public']['Tables']['user_devices']['Insert']> }
      accounts: { Row: { id: string; provider: string; external_id: string; display_name: string; region: string; status: 'available' | 'maintenance' | 'disabled'; vault_secret_id: string | null; metadata: Record<string, unknown>; created_at: string; updated_at: string }; Insert: Omit<Database['public']['Tables']['accounts']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string }; Update: Partial<Database['public']['Tables']['accounts']['Insert']> }
      account_assignments: { Row: { id: string; account_id: string; user_id: string; status: 'active' | 'revoked' | 'expired'; assigned_at: string; expires_at: string | null; created_at: string }; Insert: Omit<Database['public']['Tables']['account_assignments']['Row'], 'id' | 'created_at' | 'assigned_at'> & { id?: string; created_at?: string; assigned_at?: string }; Update: Partial<Database['public']['Tables']['account_assignments']['Insert']> }
      account_sessions: { Row: { id: string; account_id: string; user_id: string; device_id: string; status: 'starting' | 'active' | 'stopping' | 'ended' | 'stale' | 'error'; runtime_state: 'LAUNCHING' | 'IN_CLIENT' | 'IN_GAME' | 'RECONNECTING' | 'EXITED'; started_at: string; last_heartbeat_at: string; ended_at: string | null; reconnect_grace_until: string | null; release_reason: string | null; metadata: Record<string, unknown>; created_at: string }; Insert: Omit<Database['public']['Tables']['account_sessions']['Row'], 'id' | 'created_at' | 'started_at' | 'last_heartbeat_at'> & { id?: string; created_at?: string; started_at?: string; last_heartbeat_at?: string }; Update: Partial<Database['public']['Tables']['account_sessions']['Insert']> }
      audit_logs: { Row: { id: string; actor_id: string | null; action: string; entity_type: string; entity_id: string; payload: Record<string, unknown>; created_at: string }; Insert: Omit<Database['public']['Tables']['audit_logs']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }; Update: never }
    }
    Functions: {
      acquire_account_lease: { Args: { p_account_id: string; p_device_id: string }; Returns: { success: boolean; code?: string; session_id?: string; is_reconnect?: boolean } }
      acquire_account_lease_for_user: { Args: { p_user_id: string; p_account_id: string; p_device_id: string; p_nonce?: string | null; p_signature?: string | null }; Returns: { success: boolean; code?: string; session_id?: string; is_reconnect?: boolean } }
      heartbeat_account_session: { Args: { p_session_id: string; p_runtime_state: string }; Returns: { success: boolean; code?: string } }
      heartbeat_account_session_for_user: { Args: { p_user_id: string; p_session_id: string; p_runtime_state: string }; Returns: { success: boolean; code?: string } }
      release_account_lease: { Args: { p_session_id: string; p_reason?: string }; Returns: { success: boolean; code?: string } }
      release_account_lease_for_user: { Args: { p_actor_id: string; p_session_id: string; p_reason?: string; p_is_admin?: boolean }; Returns: { success: boolean; code?: string } }
      reap_stale_account_sessions: { Args: Record<string, never>; Returns: number }
    }
  }
}
