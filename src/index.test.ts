import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";

const PORT = 3001; // Use different port for testing
let testServer: http.Server;

describe("HTTP Server", () => {
  beforeAll(() => {
    testServer = http.createServer((req, res) => {
      if (req.url === "/" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("Hello World");
      } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
      }
    });

    return new Promise<void>((resolve) => {
      testServer.listen(PORT, () => {
        resolve();
      });
    });
  });

  afterAll(() => {
    return new Promise<void>((resolve) => {
      testServer.close(() => {
        resolve();
      });
    });
  });

  it("should return Hello World on GET /", async () => {
    const response = await fetch(`http://localhost:${PORT}/`);
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(text).toBe("Hello World");
  });

  it("should return 404 for unknown routes", async () => {
    const response = await fetch(`http://localhost:${PORT}/unknown`);
    expect(response.status).toBe(404);
  });
});
