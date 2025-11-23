export enum Area {
  GENERAL_IT = "General IT",
  BACKEND = "Back end",
  FRONTEND = "Front end",
  AI_LLM = "AI, LLM and Machine learning",
  DATABASE = "Database",
  DEVOPS = "DevOps and infrastructure",
  ARCHITECTURE = "Architecture, governance and design",
  TESTING = "Testing and QA",
}

export const AREAS = Object.values(Area);

export function getAreaSlug(area: Area): string {
  return area
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
