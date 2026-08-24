export interface WindowGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CalendarSettings {
  backgroundColor: string;
  opacity: number;
  titleColor: string;
  titleFontSize: number;
  dateColor: string;
  dateFontSize: number;
  cellTextColor: string;
  cellFontSize: number;
  eventMarkerStyle: 'dot' | 'bar';
  mailMasterDbPath: string;
  lockWindow: boolean;
  visibleWeeks: number;
  firstWeekOffset: number;
  geometry?: WindowGeometry;
}
