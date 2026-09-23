export interface Profile {
  id: string;
  company_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  position: string | null;
  profile_photo_path: string | null;
  default_site_id: string | null;
  role: "worker" | "admin" | "accountant";
  is_active: boolean;
  is_approved: boolean;
  locale: string;
  hourly_rate: number | null;
  pricing_type: "hourly" | "area" | "quantity";
  pricing_unit: string | null;
  self_hourly_rate: number | null;
  currency: string;
  target_shift_hours: number;
  show_earnings: boolean;
  created_at: string;
  updated_at: string;
}

export interface Site {
  id: string;
  company_id: string;
  name: string;
  address: string | null;
  description: string | null;
  status: "active" | "inactive";
  lat: number | null;
  lng: number | null;
  radius_m: number;
  country_code?: string | null;
  currency?: string;
  timezone?: string;
  client_name?: string | null;
  client_reg_code?: string | null;
  client_address?: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkerRate {
  id: string;
  company_id: string;
  employee_id: string;
  site_id: string | null;
  label: string;
  pricing_type: "hourly" | "area" | "quantity";
  unit: string | null;
  rate: number;
  currency: string;
  is_net: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SiteClientRate {
  id: string;
  company_id: string;
  site_id: string;
  label: string;
  pricing_type: "hourly" | "area" | "quantity";
  unit: string | null;
  rate: number;
  currency: string;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MonthlyAdjustment {
  id: string;
  company_id: string;
  employee_id: string;
  site_id: string | null;
  period_month: string;
  amount: number;
  currency: string;
  is_net: boolean;
  note: string;
  created_at: string;
}

export interface EmployeeAssignment {
  id: string;
  company_id: string;
  employee_id: string;
  site_id: string;
  start_date: string;
  end_date: string | null;
  created_by: string | null;
  created_at: string;
}

export interface EmployeeDocument {
  id: string;
  company_id: string;
  employee_id: string;
  filename: string;
  storage_path: string;
  document_type: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface ShiftReport {
  id: string;
  user_id: string;
  site_id: string | null;
  started_at: string;
  ended_at: string | null;
  start_lat: number | null;
  start_lng: number | null;
  end_lat: number | null;
  end_lng: number | null;
  break_seconds: number;
  worked_seconds: number | null;
  worked_hours: number | null;
  pricing_type: "hourly" | "area" | "quantity";
  pricing_rate: number | null;
  quantity: number | null;
  unit: string | null;
  calculated_total: number | null;
  worker_rate_id?: string | null;
  pricing_label?: string | null;
  is_net?: boolean;
  client_rate_id?: string | null;
  client_pricing_rate?: number | null;
  client_calculated_total?: number | null;
  work_date: string;
  status: "open" | "closed";
  source: "app" | "manual";
  is_stale: boolean;
  out_of_zone: boolean | null;
  first_name: string;
  last_name: string;
  site_name: string | null;
  start_address: string | null;
  end_address: string | null;
  start_distance_m: number | null;
}
