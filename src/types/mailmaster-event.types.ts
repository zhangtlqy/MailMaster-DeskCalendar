export interface MailMasterEvent {
  id: number;
  calendar_id?: number;
  instance_id?: string;
  is_recurring?: boolean;
  title: string;
  start_time: number;
  end_time: number;
  is_all_day: boolean;
  calendar_name: string;
  color: string;
  location?: string;
  description?: string;
  is_todo: boolean;
  is_completed: boolean;
}

export interface MailMasterCalendar {
  id: number;
  account_id?: string | null;
  account_email?: string | null;
  name: string;
  color: string;
  visible: boolean;
}
