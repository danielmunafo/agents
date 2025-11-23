import { MonthlyWorkflow } from "../workflows/MonthlyWorkflow.js";
import { logger } from "../../shared/utils/logger.js";

async function main() {
  const year = process.env.YEAR ? parseInt(process.env.YEAR, 10) : undefined;
  const month = process.env.MONTH ? parseInt(process.env.MONTH, 10) : undefined;

  const workflow = new MonthlyWorkflow();

  try {
    await workflow.execute(year, month);
    process.exit(0);
  } catch (error) {
    logger.error({ error }, "Monthly workflow failed");
    process.exit(1);
  }
}

main();
