import pino from "pino";

const isDevelopment = process.env.NODE_ENV !== "production";
const isCI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDevelopment ? "debug" : "info"),
  transport:
    isDevelopment && !isCI
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss Z",
            ignore: "pid,hostname",
          },
        }
      : undefined,
});
