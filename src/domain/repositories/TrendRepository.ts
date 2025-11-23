import type { Trend } from "../entities/Trend.js";
import type { Area } from "../value-objects/Area.js";

export interface TrendRepository {
  save(
    weekNumber: number,
    year: number,
    area: Area,
    trend: Trend
  ): Promise<void>;
  load(weekNumber: number, year: number, area: Area): Promise<Trend | null>;
  loadAll(
    weekNumber: number,
    year: number,
    areas: Area[]
  ): Promise<Record<Area, Trend>>;
}
