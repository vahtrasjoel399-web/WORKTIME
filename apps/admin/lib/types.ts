export interface Profile {
  id: string;
  company_id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  role: "worker" | "admin";
  is_active: boolean;
  is_approved: boolean;
  locale: string;
  hourly_rate: number | null;
  self_hourly_rate: number | null;
  currency: string;
  target_shift_hours: number;
}

export interface Site {
  id: string;
  company_id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  radius_m: number;
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
