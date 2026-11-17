export interface User { id: string; email: string; name: string; role: 'admin' | 'staff'; active: number; password_hash?: string; created_at?: string }
export interface Client { id: string; name: string; email: string | null; phone: string | null; address: string | null; notes: string | null; owner_id: string | null; created_at: string }
export interface Company {
  id: string; client_id: string | null; name_type: 'named' | 'numbered'; distinctive: string | null; descriptive: string | null;
  legal_ending: string | null; legal_name: string | null; jurisdiction: string; corp_number: string | null; business_number: string | null;
  status: string; incorporation_date: string | null; fiscal_year_end: string | null; registered_office: string | null;
  mailing_address: string | null; nuans_number: string | null; nuans_date: string | null; business_activity: string | null;
  restrictions: string | null; min_directors: number; max_directors: number; notes: string | null; created_by: string | null;
  created_at: string; updated_at: string;
}
export interface Director { id: string; company_id: string; name: string; address: string | null; email: string | null; resident_canadian: number; appointed_on: string | null; ceased_on: string | null }
export interface Officer { id: string; company_id: string; name: string; title: string; appointed_on: string | null; ceased_on: string | null }
export interface ShareClass { id: string; company_id: string; name: string; voting: number; participating: number; max_shares: number | null; rights: string | null; sort: number }
export interface Shareholder { id: string; company_id: string; name: string; kind: 'individual' | 'corporation' | 'trust'; address: string | null; email: string | null }
export interface ShareTx {
  id: string; company_id: string; share_class_id: string; kind: 'issuance' | 'transfer' | 'redemption';
  from_shareholder_id: string | null; to_shareholder_id: string | null; quantity: number; price_per_share: number;
  tx_date: string; certificate_number: string | null; notes: string | null; created_at?: string;
}
export interface Resolution { id: string; company_id: string; kind: string; body_type: 'directors' | 'shareholders'; title: string; body: string; resolution_date: string; signed_on: string | null; created_at: string }
export interface BusinessName { id: string; client_id: string | null; name: string; jurisdiction: string; registration_number: string | null; registered_on: string | null; expires_on: string | null; activity: string | null; address: string | null; status: string; created_at: string }
export interface ComplianceItem { id: string; company_id: string | null; business_name_id: string | null; kind: string; title: string; due_date: string; completed_on: string | null; notes: string | null; auto: number }
export interface Task { id: string; company_id: string | null; client_id: string | null; title: string; due_date: string | null; assignee_id: string | null; done_at: string | null; sort: number; created_at: string }
