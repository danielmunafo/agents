import { DailyWorkflow } from "../workflows/DailyWorkflow.js";
import { logger } from "../../shared/utils/logger.js";
import { Area } from "../../domain/value-objects/Area.js";

async function main() {
  const areaEnv = process.env.AREA;
  const weekNumber = process.env.WEEK_NUMBER
    ? parseInt(process.env.WEEK_NUMBER, 10)
    : undefined;
  const year = process.env.YEAR ? parseInt(process.env.YEAR, 10) : undefined;

  const workflow = new DailyWorkflow();

  try {
    // Check if a specific area is provided
    if (areaEnv) {
      // Try to find matching area (case-insensitive, handle variations)
      const area = Object.values(Area).find(
        (a) => a.toLowerCase() === areaEnv.toLowerCase()
      ) as Area | undefined;

      if (area) {
        // Run for a specific area
        logger.info({ area }, "Running daily workflow for area");
        await workflow.executeForArea(area, weekNumber, year);
      } else {
        logger.error({ area: areaEnv }, "Invalid area");
        logger.info({ areas: Object.values(Area) }, "Valid areas");
        process.exit(1);
      }
    } else {
      // Run for all areas
      logger.info("Running daily workflow for all areas");
      await workflow.executeAll(weekNumber, year);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error(
      {
        error: errorMessage,
        stack: errorStack,
        errorType: error?.constructor?.name,
        errorString: String(error),
      },
      "Daily workflow failed"
    );
    process.exit(1);
  } finally {
    await workflow.cleanup();
  }

  process.exit(0);
}

main();
