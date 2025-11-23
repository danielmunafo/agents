// Main entrypoint - exports for use in workflows and entrypoints
export { DailyWorkflow } from "./presentation/workflows/DailyWorkflow.js";
export { WeeklyWorkflow } from "./presentation/workflows/WeeklyWorkflow.js";
export { MonthlyWorkflow } from "./presentation/workflows/MonthlyWorkflow.js";

// Domain exports
export type { Post } from "./domain/entities/Post.js";
export type { Trend } from "./domain/entities/Trend.js";
export { Area, AREAS } from "./domain/value-objects/Area.js";
