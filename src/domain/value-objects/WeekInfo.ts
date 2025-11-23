export interface WeekInfo {
  weekNumber: number;
  year: number;
  startDate: Date;
  endDate: Date;
}

export function formatWeekString(weekNumber: number, year: number): string {
  return `${year}-W${weekNumber.toString().padStart(2, "0")}`;
}
