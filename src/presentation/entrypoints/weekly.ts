import { WeeklyWorkflow } from "../workflows/WeeklyWorkflow.js";
import { logger } from "../../shared/utils/logger.js";

async function main() {
  const weekNumber = process.env.WEEK_NUMBER
    ? parseInt(process.env.WEEK_NUMBER, 10)
    : undefined;
  const year = process.env.YEAR ? parseInt(process.env.YEAR, 10) : undefined;

  const workflow = new WeeklyWorkflow();

  try {
    await workflow.execute(weekNumber, year);
    process.exit(0);
  } catch (error) {
    logger.error({ error }, "Weekly workflow failed");
    process.exit(1);
  }
}

main();
