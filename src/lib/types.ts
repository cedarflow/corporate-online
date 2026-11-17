export interface User { id: string; email: string; name: string; role: 'admin' | 'staff'; active: number; password_hash?: string; created_at?: string }
export interface Client { id: string; name: string; email: string | null; phone: string | null; address: string | null; notes: string | null; owner_id: string | null; created_at: string }
export interface Company {
  id: string; client_id: string | null; name_type: 'named' | 'numbered'; distinctive: string | null; descriptive: string | null;
  legal_ending: string | null; legal_name: string | null; jurisdiction: string; corp_number: string | null; business_number: string | null;
  status: string; incorporation_date: string | null; fiscal_year_end: string | null; registered_office: string | null;
  mailing_address: string | null; nuans_number: string | null; nuans_date: string | null; business_activity: string | null;
  restrictions: string | null; min_directors: number; max_directors: number; notes: string | null; created_by: string | null;
  created_at: string; updated_at: string;
  gst_number?: string | null; payroll_number?: string | null; import_export_number?: string | null; records_office?: string | null;
  registry_password?: string | null; name_request_expires?: string | null; extra_info?: string | null; uncertificated?: number;
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
export interface Doc {
  id: string; company_id: string | null; client_id: string | null; title: string; category: string; file_key: string | null; file_name: string | null;
  content_type: string | null; size: number | null; body: string | null; template: string | null; doc_date: string | null; in_minute_book: number; notes: string | null; created_at: string;
}
export interface Isc { id: string; company_id: string; name: string; address: string | null; birth_date: string | null; tax_residence: string | null; control_description: string | null; became_on: string | null; ceased_on: string | null }
export interface Worker { id: string; company_id: string; kind: 'employee' | 'contractor'; name: string; email: string | null; title: string | null; start_date: string | null; end_date: string | null; compensation: string | null; notes: string | null }
export interface Convertible { id: string; company_id: string; kind: 'note' | 'safe'; certificate_number: string | null; investor: string; issue_date: string; amount: number; interest_rate: number | null; valuation_cap: number | null; discount_rate: number | null; maturity_date: string | null; status: string; notes: string | null }
export interface OptionPlan { id: string; company_id: string; name: string; share_class_id: string | null; pool_size: number; approved_on: string | null }
export interface OptionGrant { id: string; plan_id: string; company_id: string; holder: string; quantity: number; exercise_price: number; grant_date: string; vesting_start: string | null; vesting_months: number; cliff_months: number; expiry_date: string | null; status: string; notes: string | null }
