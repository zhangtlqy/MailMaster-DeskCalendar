export interface WindowGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CalendarSettings {
  backgroundColor: string;
  opacity: number;
  lockWindow: boolean;
  visibleWeeks: number;
  firstWeekOffset: number;
  geometry?: WindowGeometry;
}

