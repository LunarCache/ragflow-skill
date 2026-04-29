const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { createClient } = require("../skill-for-ragflow/lib/api.js");

test("agentChat normalizes non-stream workflow_finished payloads", async () => {
  const server = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/api/v1/agents/agent1/completions") {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        const payload = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
        assert.equal(payload.stream, false);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({
          code: 0,
          data: {
            event: "workflow_finished",
            session_id: "sess1",
            message_id: "msg1",
            data: {
              content: "final answer",
              reference: { chunks: [{ id: "chunk1" }] },
            },
          },
        }));
      });
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ code: 404, message: "not found" }));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const previousUrl = process.env.RAGFLOW_URL;
  const previousKey = process.env.RAGFLOW_API_KEY;
  process.env.RAGFLOW_URL = `http://127.0.0.1:${port}`;
  process.env.RAGFLOW_API_KEY = "test-key";

  try {
    const client = createClient();
    const result = await client.agentChat("agent1", "sess1", "hello", { stream: false });
    assert.deepEqual(result, {
      answer: "final answer",
      reference: { chunks: [{ id: "chunk1" }] },
      session_id: "sess1",
      id: "msg1",
    });
  } finally {
    if (previousUrl === undefined) delete process.env.RAGFLOW_URL;
    else process.env.RAGFLOW_URL = previousUrl;
    if (previousKey === undefined) delete process.env.RAGFLOW_API_KEY;
    else process.env.RAGFLOW_API_KEY = previousKey;
    await new Promise((resolve) => server.close(resolve));
  }
});
