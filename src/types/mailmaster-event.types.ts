export interface MailMasterEvent {
  id: number;
  title: string;
  start_time: number;
  end_time: number;
  is_all_day: boolean;
  calendar_name: string;
  color: string;
  location?: string;
  description?: string;
}
