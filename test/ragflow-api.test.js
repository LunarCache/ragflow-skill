const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { createClient } = require("../skill-for-ragflow/lib/api.js");

test("agentChat normalizes non-stream workflow_finished payloads", async () => {
  const server = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/api/v1/agents/chat/completions") {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        const payload = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
        assert.equal(payload.stream, false);
        assert.equal(payload.agent_id, "agent1");
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

test("getDataset uses direct GET endpoint", async () => {
  let requestUrl = null;
  let requestMethod = null;
  const server = http.createServer((req, res) => {
    requestMethod = req.method;
    requestUrl = req.url;

    if (req.method === "GET" && req.url === "/api/v1/datasets/ds123") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        code: 0,
        data: {
          id: "ds123",
          name: "Test Dataset",
          total_size: 1024,
          connectors: [],
        },
      }));
      return;
    }

    if (req.method === "GET" && req.url.startsWith("/api/v1/datasets")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        code: 0,
        data: [],
      }));
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
    const result = await client.getDataset("ds123");

    // Assert that the direct endpoint was called
    assert.equal(requestMethod, "GET", "Should use GET method");
    assert.equal(requestUrl, "/api/v1/datasets/ds123", "Should call direct endpoint, not list endpoint");

    // Assert response includes enriched fields
    assert.equal(result.id, "ds123");
    assert.equal(result.name, "Test Dataset");
    assert.equal(result.total_size, 1024, "Should include total_size from direct endpoint");
    assert.deepEqual(result.connectors, [], "Should include connectors from direct endpoint");
  } finally {
    if (previousUrl === undefined) delete process.env.RAGFLOW_URL;
    else process.env.RAGFLOW_URL = previousUrl;
    if (previousKey === undefined) delete process.env.RAGFLOW_API_KEY;
    else process.env.RAGFLOW_API_KEY = previousKey;
    await new Promise((resolve) => server.close(resolve));
  }
});

test("getDataset falls back to not-found error on 404", async () => {
  const server = http.createServer((req, res) => {
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
    await assert.rejects(
      () => client.getDataset("nonexistent"),
      (err) => /not found/i.test(err.message),
      "Should throw not-found error on 404"
    );
  } finally {
    if (previousUrl === undefined) delete process.env.RAGFLOW_URL;
    else process.env.RAGFLOW_URL = previousUrl;
    if (previousKey === undefined) delete process.env.RAGFLOW_API_KEY;
    else process.env.RAGFLOW_API_KEY = previousKey;
    await new Promise((resolve) => server.close(resolve));
  }
});

test("listAgentTags returns tag counts", async () => {
  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/api/v1/agents/tags") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        code: 0,
        data: [
          { tag: "ml", count: 5 },
          { tag: "rag", count: 3 },
        ],
      }));
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
    const result = await client.listAgentTags();
    assert.deepEqual(result, [
      { tag: "ml", count: 5 },
      { tag: "rag", count: 3 },
    ]);
  } finally {
    if (previousUrl === undefined) delete process.env.RAGFLOW_URL;
    else process.env.RAGFLOW_URL = previousUrl;
    if (previousKey === undefined) delete process.env.RAGFLOW_API_KEY;
    else process.env.RAGFLOW_API_KEY = previousKey;
    await new Promise((resolve) => server.close(resolve));
  }
});

test("updateAgentTags sends correct payload", async () => {
  const server = http.createServer((req, res) => {
    if (req.method === "PUT" && req.url === "/api/v1/agents/agent123/tags") {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        const payload = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
        assert.deepEqual(payload, { tags: "ml,rag" });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({
          code: 0,
          data: {
            id: "agent123",
            tags: ["ml", "rag"],
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
    const result = await client.updateAgentTags("agent123", "ml,rag");
    assert.deepEqual(result, {
      id: "agent123",
      tags: ["ml", "rag"],
    });
  } finally {
    if (previousUrl === undefined) delete process.env.RAGFLOW_URL;
    else process.env.RAGFLOW_URL = previousUrl;
    if (previousKey === undefined) delete process.env.RAGFLOW_API_KEY;
    else process.env.RAGFLOW_API_KEY = previousKey;
    await new Promise((resolve) => server.close(resolve));
  }
});

test("agentChat preserves structured output", async () => {
  const server = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/api/v1/agents/chat/completions") {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        const payload = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
        assert.equal(payload.stream, false);
        assert.equal(payload.agent_id, "agent2");
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({
          code: 0,
          data: {
            answer: "structured response",
            structured: {
              items: [
                { type: "text", content: "item1" },
                { type: "text", content: "item2" },
              ],
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
    const result = await client.agentChat("agent2", "sess2", "hello", { stream: false });
    assert.ok(result.structured, "result should have structured field");
    assert.deepEqual(result.structured, {
      items: [
        { type: "text", content: "item1" },
        { type: "text", content: "item2" },
      ],
    });
  } finally {
    if (previousUrl === undefined) delete process.env.RAGFLOW_URL;
    else process.env.RAGFLOW_URL = previousUrl;
    if (previousKey === undefined) delete process.env.RAGFLOW_API_KEY;
    else process.env.RAGFLOW_API_KEY = previousKey;
    await new Promise((resolve) => server.close(resolve));
  }
});

test("downloadDocument routes correctly", async () => {
  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/api/v1/datasets/dataset1/documents/doc1") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        code: 0,
        data: {
          content: "base64encoded...",
          name: "doc.pdf",
        },
      }));
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
    const result = await client.downloadDocument("dataset1", "doc1");
    assert.deepEqual(result, {
      content: "base64encoded...",
      name: "doc.pdf",
    });
  } finally {
    if (previousUrl === undefined) delete process.env.RAGFLOW_URL;
    else process.env.RAGFLOW_URL = previousUrl;
    if (previousKey === undefined) delete process.env.RAGFLOW_API_KEY;
    else process.env.RAGFLOW_API_KEY = previousKey;
    await new Promise((resolve) => server.close(resolve));
  }
});

test("downloadDocumentById routes correctly", async () => {
  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/api/v1/documents/doc2") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        code: 0,
        data: {
          content: "base64encoded...",
          name: "doc.pdf",
        },
      }));
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
    const result = await client.downloadDocumentById("doc2");
    assert.deepEqual(result, {
      content: "base64encoded...",
      name: "doc.pdf",
    });
  } finally {
    if (previousUrl === undefined) delete process.env.RAGFLOW_URL;
    else process.env.RAGFLOW_URL = previousUrl;
    if (previousKey === undefined) delete process.env.RAGFLOW_API_KEY;
    else process.env.RAGFLOW_API_KEY = previousKey;
    await new Promise((resolve) => server.close(resolve));
  }
});

test("listConnectors returns connectors for dataset", async () => {
  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/api/v1/datasets/dataset123/connectors") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        code: 0,
        data: [
          {
            id: "conn123",
            name: "REST API",
            type: "rest",
            config: { url: "https://api.example.com", method: "GET" },
          },
        ],
      }));
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
    const result = await client.listConnectors("dataset123");
    assert.deepEqual(result, [
      {
        id: "conn123",
        name: "REST API",
        type: "rest",
        config: { url: "https://api.example.com", method: "GET" },
      },
    ]);
  } finally {
    if (previousUrl === undefined) delete process.env.RAGFLOW_URL;
    else process.env.RAGFLOW_URL = previousUrl;
    if (previousKey === undefined) delete process.env.RAGFLOW_API_KEY;
    else process.env.RAGFLOW_API_KEY = previousKey;
    await new Promise((resolve) => server.close(resolve));
  }
});

test("createConnector sends correct payload", async () => {
  const connectorData = {
    name: "REST API",
    type: "rest",
    config: { url: "https://api.example.com", method: "GET" },
  };
  const server = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/api/v1/datasets/dataset123/connectors") {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        const payload = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
        assert.deepEqual(payload, connectorData);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({
          code: 0,
          data: { id: "conn123", ...connectorData },
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
    const result = await client.createConnector("dataset123", connectorData);
    assert.deepEqual(result, { id: "conn123", ...connectorData });
  } finally {
    if (previousUrl === undefined) delete process.env.RAGFLOW_URL;
    else process.env.RAGFLOW_URL = previousUrl;
    if (previousKey === undefined) delete process.env.RAGFLOW_API_KEY;
    else process.env.RAGFLOW_API_KEY = previousKey;
    await new Promise((resolve) => server.close(resolve));
  }
});

test("getConnector returns connector details", async () => {
  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/api/v1/connectors/conn123") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        code: 0,
        data: {
          id: "conn123",
          name: "REST API",
          type: "rest",
          config: { url: "https://api.example.com", method: "GET" },
        },
      }));
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
    const result = await client.getConnector("conn123");
    assert.deepEqual(result, {
      id: "conn123",
      name: "REST API",
      type: "rest",
      config: { url: "https://api.example.com", method: "GET" },
    });
  } finally {
    if (previousUrl === undefined) delete process.env.RAGFLOW_URL;
    else process.env.RAGFLOW_URL = previousUrl;
    if (previousKey === undefined) delete process.env.RAGFLOW_API_KEY;
    else process.env.RAGFLOW_API_KEY = previousKey;
    await new Promise((resolve) => server.close(resolve));
  }
});

test("updateConnector sends correct payload", async () => {
  const updateData = {
    name: "Updated REST API",
    config: { url: "https://api.example.com/v2", method: "POST" },
  };
  const server = http.createServer((req, res) => {
    if (req.method === "PATCH" && req.url === "/api/v1/connectors/conn123") {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        const payload = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
        assert.deepEqual(payload, updateData);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({
          code: 0,
          data: { id: "conn123", type: "rest", ...updateData },
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
    const result = await client.updateConnector("conn123", updateData);
    assert.deepEqual(result, { id: "conn123", type: "rest", ...updateData });
  } finally {
    if (previousUrl === undefined) delete process.env.RAGFLOW_URL;
    else process.env.RAGFLOW_URL = previousUrl;
    if (previousKey === undefined) delete process.env.RAGFLOW_API_KEY;
    else process.env.RAGFLOW_API_KEY = previousKey;
    await new Promise((resolve) => server.close(resolve));
  }
});

test("deleteConnector sends DELETE request", async () => {
  const server = http.createServer((req, res) => {
    if (req.method === "DELETE" && req.url === "/api/v1/connectors/conn123") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        code: 0,
        data: { id: "conn123", deleted: true },
      }));
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
    const result = await client.deleteConnector("conn123");
    assert.deepEqual(result, { id: "conn123", deleted: true });
  } finally {
    if (previousUrl === undefined) delete process.env.RAGFLOW_URL;
    else process.env.RAGFLOW_URL = previousUrl;
    if (previousKey === undefined) delete process.env.RAGFLOW_API_KEY;
    else process.env.RAGFLOW_API_KEY = previousKey;
    await new Promise((resolve) => server.close(resolve));
  }
});

test("runRaptor starts raptor processing", async () => {
  const server = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/api/v1/datasets/ds456/run_raptor") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        code: 0,
        data: {
          task_id: "task123",
          status: "running",
        },
      }));
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
    const result = await client.runRaptor("ds456");
    assert.deepEqual(result, {
      task_id: "task123",
      status: "running",
    });
  } finally {
    if (previousUrl === undefined) delete process.env.RAGFLOW_URL;
    else process.env.RAGFLOW_URL = previousUrl;
    if (previousKey === undefined) delete process.env.RAGFLOW_API_KEY;
    else process.env.RAGFLOW_API_KEY = previousKey;
    await new Promise((resolve) => server.close(resolve));
  }
});

test("traceRaptor returns progress", async () => {
  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/api/v1/datasets/ds789/trace_raptor") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        code: 0,
        data: {
          progress: 50,
          status: "processing",
          tree: [
            { id: "node1", content: "summary1" },
            { id: "node2", content: "summary2" },
          ],
        },
      }));
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
    const result = await client.traceRaptor("ds789");
    assert.deepEqual(result, {
      progress: 50,
      status: "processing",
      tree: [
        { id: "node1", content: "summary1" },
        { id: "node2", content: "summary2" },
      ],
    });
  } finally {
    if (previousUrl === undefined) delete process.env.RAGFLOW_URL;
    else process.env.RAGFLOW_URL = previousUrl;
    if (previousKey === undefined) delete process.env.RAGFLOW_API_KEY;
    else process.env.RAGFLOW_API_KEY = previousKey;
    await new Promise((resolve) => server.close(resolve));
  }
});

// ── document preview / chat session feature tests ──

test("previewDocument routes to /documents/{id}/preview", async () => {
  let requestUrl = null;
  let requestMethod = null;
  const server = http.createServer((req, res) => {
    requestMethod = req.method;
    requestUrl = req.url;

    if (req.method === "GET" && req.url === "/api/v1/documents/doc-preview-1/preview") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        code: 0,
        data: {
          id: "doc-preview-1",
          name: "report.pdf",
          content: "preview-content-base64",
        },
      }));
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
    const result = await client.previewDocument("doc-preview-1");
    assert.equal(requestMethod, "GET", "Should use GET method");
    assert.equal(requestUrl, "/api/v1/documents/doc-preview-1/preview", "Should call preview endpoint");
    assert.equal(result.id, "doc-preview-1");
    assert.equal(result.name, "report.pdf");
  } finally {
    if (previousUrl === undefined) delete process.env.RAGFLOW_URL;
    else process.env.RAGFLOW_URL = previousUrl;
    if (previousKey === undefined) delete process.env.RAGFLOW_API_KEY;
    else process.env.RAGFLOW_API_KEY = previousKey;
    await new Promise((resolve) => server.close(resolve));
  }
});

test("chatSession preserves messages when pass_all_history_messages is true", async () => {
  let receivedPayload = null;
  const server = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/api/v1/chat/completions") {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        receivedPayload = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({
          code: 0,
          data: { answer: "ok", reference: { chunks: [] } },
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
    await client.chatSession("chat1", "sess1", {
      question: "Hello",
      messages: [{ role: "user", content: "Hello" }],
      pass_all_history_messages: true,
      stream: false,
    });

    assert.ok(receivedPayload, "Should have received a payload");
    assert.equal(receivedPayload.pass_all_history_messages, true, "Should forward pass_all_history_messages");
    assert.ok(Array.isArray(receivedPayload.messages), "Should preserve messages array when pass_all_history_messages is true");
    assert.equal(receivedPayload.messages.length, 1);
    assert.equal(receivedPayload.messages[0].role, "user");
  } finally {
    if (previousUrl === undefined) delete process.env.RAGFLOW_URL;
    else process.env.RAGFLOW_URL = previousUrl;
    if (previousKey === undefined) delete process.env.RAGFLOW_API_KEY;
    else process.env.RAGFLOW_API_KEY = previousKey;
    await new Promise((resolve) => server.close(resolve));
  }
});

test("chatSession deletes messages when pass_all_history_messages is absent", async () => {
  let receivedPayload = null;
  const server = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/api/v1/chat/completions") {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        receivedPayload = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({
          code: 0,
          data: { answer: "ok", reference: { chunks: [] } },
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
    await client.chatSession("chat1", "sess1", {
      question: "Hello",
      messages: [{ role: "user", content: "Hello" }],
      stream: false,
    });

    assert.ok(receivedPayload, "Should have received a payload");
    assert.equal(receivedPayload.messages, undefined, "Should delete messages when pass_all_history_messages is absent");
    assert.equal(receivedPayload.question, "Hello");
  } finally {
    if (previousUrl === undefined) delete process.env.RAGFLOW_URL;
    else process.env.RAGFLOW_URL = previousUrl;
    if (previousKey === undefined) delete process.env.RAGFLOW_API_KEY;
    else process.env.RAGFLOW_API_KEY = previousKey;
    await new Promise((resolve) => server.close(resolve));
  }
});

// ── v0.26.4 provider / model management ──

test("v0.26.4 document and chunk client methods build correct method/url/body", async () => {
  let last = null;
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf-8");
      last = { method: req.method, url: req.url, body: raw ? JSON.parse(raw) : undefined };
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ code: 0, data: { ok: true } }));
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const previousUrl = process.env.RAGFLOW_URL;
  const previousKey = process.env.RAGFLOW_API_KEY;
  process.env.RAGFLOW_URL = `http://127.0.0.1:${port}`;
  process.env.RAGFLOW_API_KEY = "test-key";

  try {
    const client = createClient();

    const checks = [
      [() => client.ingestDocuments(["doc1"], { run: "1", delete: true }), "POST", "/api/v1/documents/ingest", { doc_ids: ["doc1"], run: "1", delete: true }],
      [() => client.updateChunk("ds1", "doc1", "chunk1", { content: "new text" }), "PATCH", "/api/v1/datasets/ds1/documents/doc1/chunks/chunk1", { content: "new text" }],
      [() => client.getDocumentStructureGraph("ds1", "doc1"), "GET", "/api/v1/datasets/ds1/documents/doc1/structure/graph", undefined],
      [() => client.deleteDocumentStructureGraph("ds1", "doc1"), "DELETE", "/api/v1/datasets/ds1/documents/doc1/structure/graph", undefined],
    ];

    for (const [call, method, url, body] of checks) {
      await call();
      assert.equal(last.method, method, url);
      assert.equal(last.url, url);
      if (body === undefined) {
        assert.equal(last.body, undefined, `${url} should not send a body`);
      } else {
        assert.deepEqual(last.body, body, url);
      }
    }
  } finally {
    if (previousUrl === undefined) delete process.env.RAGFLOW_URL;
    else process.env.RAGFLOW_URL = previousUrl;
    if (previousKey === undefined) delete process.env.RAGFLOW_API_KEY;
    else process.env.RAGFLOW_API_KEY = previousKey;
    await new Promise((resolve) => server.close(resolve));
  }
});

test("provider and model client methods build correct method/url/body", async () => {
  let last = null;
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf-8");
      last = { method: req.method, url: req.url, body: raw ? JSON.parse(raw) : undefined };
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ code: 0, data: { ok: true } }));
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const previousUrl = process.env.RAGFLOW_URL;
  const previousKey = process.env.RAGFLOW_API_KEY;
  process.env.RAGFLOW_URL = `http://127.0.0.1:${port}`;
  process.env.RAGFLOW_API_KEY = "test-key";

  try {
    const client = createClient();

    const checks = [
      [() => client.listAddedModels({ type: "chat" }), "GET", "/api/v1/models?type=chat", undefined],
      [() => client.listDefaultModels(), "GET", "/api/v1/models/default", undefined],
      [() => client.setDefaultModel({ model_type: "chat", model_provider: "OpenAI" }), "PATCH", "/api/v1/models/default", { model_type: "chat", model_provider: "OpenAI" }],
      [() => client.listProviders({ available: "true" }), "GET", "/api/v1/providers?available=true", undefined],
      [() => client.addProvider("OpenAI"), "PUT", "/api/v1/providers", { provider_name: "OpenAI" }],
      [() => client.getProvider("OpenAI"), "GET", "/api/v1/providers/OpenAI", undefined],
      [() => client.deleteProvider("OpenAI"), "DELETE", "/api/v1/providers/OpenAI", undefined],
      [() => client.createProviderInstance("OpenAI", { instance_name: "default", api_key: "sk-x" }), "POST", "/api/v1/providers/OpenAI/instances", { instance_name: "default", api_key: "sk-x" }],
      [() => client.deleteProviderInstances("OpenAI", ["default"]), "DELETE", "/api/v1/providers/OpenAI/instances", { instances: ["default"] }],
      [() => client.verifyProvider("OpenAI", { api_key: "sk-x" }), "POST", "/api/v1/providers/OpenAI/connection", { api_key: "sk-x" }],
      [() => client.listInstanceModels("OpenAI", "default", { supported: "true" }), "GET", "/api/v1/providers/OpenAI/instances/default/models?supported=true", undefined],
      [() => client.addInstanceModel("OpenAI", "default", { model_name: "gpt-4o", model_type: "chat" }), "POST", "/api/v1/providers/OpenAI/instances/default/models", { model_name: "gpt-4o", model_type: "chat" }],
      // model names containing @ must be URL-encoded in the path
      [() => client.setInstanceModelStatus("OpenAI", "default", "text-embedding-v4@Tongyi-Qianwen", "enable"), "PATCH", "/api/v1/providers/OpenAI/instances/default/models/text-embedding-v4%40Tongyi-Qianwen", { status: "enable" }],
    ];

    for (const [call, method, url, body] of checks) {
      await call();
      assert.equal(last.method, method, url);
      assert.equal(last.url, url);
      if (body === undefined) {
        assert.equal(last.body, undefined, `${url} should not send a body`);
      } else {
        assert.deepEqual(last.body, body, url);
      }
    }
  } finally {
    if (previousUrl === undefined) delete process.env.RAGFLOW_URL;
    else process.env.RAGFLOW_URL = previousUrl;
    if (previousKey === undefined) delete process.env.RAGFLOW_API_KEY;
    else process.env.RAGFLOW_API_KEY = previousKey;
    await new Promise((resolve) => server.close(resolve));
  }
});

