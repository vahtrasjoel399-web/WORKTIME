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
  role: "worker" | "admin";
  is_active: boolean;
  is_approved: boolean;
  locale: string;
  hourly_rate: number | null;
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
  created_at: string;
  updated_at: string;
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
