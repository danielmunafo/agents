import { DailyWorkflow } from "../workflows/DailyWorkflow.js";
import { logger } from "../../shared/utils/logger.js";
import { Area } from "../../domain/value-objects/Area.js";

/**
 * Test entrypoint for manual testing of agents
 */
async function main() {
  const area = (process.env.AREA as Area) || Area.BACKEND;
  const maxPosts = process.env.MAX_POSTS
    ? parseInt(process.env.MAX_POSTS, 10)
    : 5;

  logger.info({ area, maxPosts }, "Testing agent");

  const workflow = new DailyWorkflow();

  try {
    // Test with a single area
    await workflow.executeForArea(area);
    logger.info({ area }, "Test completed successfully");
  } catch (error) {
    logger.error({ error }, "Test failed");
    process.exit(1);
  } finally {
    await workflow.cleanup();
  }
}

main();
