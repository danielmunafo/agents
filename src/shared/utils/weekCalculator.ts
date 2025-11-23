import { getWeek, getYear, startOfWeek, endOfWeek } from "date-fns";
import type { WeekInfo } from "../../domain/value-objects/WeekInfo.js";

/**
 * Calculate calendar week (Sunday-Saturday, week 1 = first week of year)
 */
export function getCurrentWeek(): WeekInfo {
  const now = new Date();
  return getWeekInfo(now);
}

export function getWeekInfo(date: Date): WeekInfo {
  // Start of week is Sunday (0)
  const start = startOfWeek(date, { weekStartsOn: 0 });
  const end = endOfWeek(date, { weekStartsOn: 0 });

  // Get week number (1-based, first week of year)
  const weekNumber = getWeek(date, {
    weekStartsOn: 0,
    firstWeekContainsDate: 1,
  });
  const year = getYear(date);

  return {
    weekNumber,
    year,
    startDate: start,
    endDate: end,
  };
}
