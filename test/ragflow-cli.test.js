const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const skillDir = path.resolve(__dirname, "..", "ragflow-skill");
const cliPath = path.join(skillDir, "scripts", "ragflow.js");

function apiResponse(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

function jsonResponse(res, data) {
  apiResponse(res, 200, { code: 0, data });
}

function sseResponse(res, data) {
  res.writeHead(200, { "content-type": "text/event-stream" });
  res.end(`data: ${JSON.stringify({ code: 0, data })}\n\n`);
}

function agentEventResponse(res) {
  res.writeHead(200, { "content-type": "text/event-stream" });
  res.end(
    [
      `data:${JSON.stringify({ event: "message", data: { content: "hello" } })}`,
      "",
      `data:${JSON.stringify({ event: "message", data: { content: " world" } })}`,
      "",
      `data:${JSON.stringify({ event: "message_end", data: { reference: { chunks: [] } } })}`,
      "",
      "data:[DONE]",
      "",
    ].join("\n")
  );
}

function createMockServer(options = {}) {
  const requests = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const record = {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: Buffer.concat(chunks),
      };
      requests.push(record);

      const { pathname } = new URL(req.url, "http://127.0.0.1");
      if (pathname.endsWith("/completions")) {
        if (options.agentEventStream && pathname.includes("/agents/")) {
          agentEventResponse(res);
          return;
        }
        sseResponse(res, { answer: "ok", reference: { chunks: [] } });
        return;
      }

      if (pathname === "/api/v1/system/version" && req.method === "GET") {
        jsonResponse(res, "v0.25.0");
        return;
      }
      if (pathname === "/api/v1/system/config/log" && req.method === "GET") {
        jsonResponse(res, { "ragflow": "INFO" });
        return;
      }
      if (pathname === "/api/v1/system/config/log" && req.method === "PUT") {
        jsonResponse(res, { pkg_name: "ragflow", level: "DEBUG" });
        return;
      }

      if (pathname === "/api/v1/datasets/ds1/metadata/summary" && req.method === "GET") {
        jsonResponse(res, { summary: { author: { Alice: 1 } } });
        return;
      }

      if (pathname === "/v1/llm/my_llms") {
        if (options.modelsUnauthorized) {
          apiResponse(res, 401, { code: 401, message: "Unauthorized" });
          return;
        }
        jsonResponse(res, {
          OpenAI: {
            llm: [
              { id: "model-a", name: "Model A", type: "chat", status: 1, used_token: 7 },
              { id: "model-b", name: "Model B", type: "embedding", status: 0 },
            ],
          },
        });
        return;
      }

      if (pathname === "/api/v1/datasets" && req.method === "GET") {
        jsonResponse(res, options.emptyDatasets ? [] : [{ id: "ds1", name: "Docs" }]);
        return;
      }
      if (pathname === "/api/v1/datasets/ds1/documents" && req.method === "GET") {
        jsonResponse(res, { total: 1, docs: [{ id: "doc1", name: "Doc", run: "DONE", chunk_count: 2 }] });
        return;
      }
      if (pathname === "/api/v1/datasets/ds1/documents/doc1/chunks" && req.method === "GET") {
        if (options.deleteChunkMissingOnExactGet && new URL(req.url, "http://127.0.0.1").searchParams.get("id")) {
          apiResponse(res, 200, { code: 404, message: "Chunk not found: ds1/chunk1" });
          return;
        }
        jsonResponse(res, { total: 1, chunks: [{ id: "chunk1", content: "Chunk" }] });
        return;
      }
      if (pathname === "/api/v1/datasets/ds1/documents/doc1/chunks" && req.method === "DELETE") {
        if (options.deleteChunkFailsOnce && !options.deleteChunkFailed) {
          options.deleteChunkFailed = true;
          apiResponse(res, 200, { code: 102, message: "rm_chunk deleted chunks 0, expect 1" });
          return;
        }
        jsonResponse(res, {});
        return;
      }
      if (pathname === "/api/v1/chats" && req.method === "GET") {
        jsonResponse(res, { total: 1, chats: [{ id: "chat1", name: "Bot" }] });
        return;
      }
      if (pathname === "/api/v1/chats/chat1" && req.method === "GET") {
        jsonResponse(res, { id: "chat1", name: "Bot" });
        return;
      }
      if (pathname === "/api/v1/chats/chat1" && req.method === "PATCH") {
        jsonResponse(res, { id: "chat1", name: "Bot2" });
        return;
      }
      if (pathname === "/api/v1/chats/chat1/sessions" && req.method === "GET") {
        jsonResponse(res, { total: 1, sessions: [{ id: "sess1", name: "Session" }] });
        return;
      }
      if (pathname === "/api/v1/agents" && req.method === "POST") {
        jsonResponse(res, true);
        return;
      }
      if (pathname === "/api/v1/agents" && req.method === "GET") {
        jsonResponse(res, [{ id: "agent1", title: "Agent" }]);
        return;
      }
      if (pathname === "/api/v1/agents/agent1/sessions" && req.method === "GET") {
        jsonResponse(res, [{ id: "asess1", name: "Agent Session" }]);
        return;
      }
      if (pathname === "/api/v1/retrieval") {
        jsonResponse(res, [{ id: "chunk1", content: "Match" }]);
        return;
      }

      jsonResponse(res, { id: "ok", name: "ok" });
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        requests,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

function runCli(baseUrl, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: skillDir,
      env: {
        ...process.env,
        RAGFLOW_URL: baseUrl,
        RAGFLOW_API_KEY: "test-key",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf-8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf-8");
    });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

function requestJson(record) {
  if (!record.body.length) return undefined;
  const contentType = record.headers["content-type"] || "";
  assert.match(contentType, /application\/json/);
  return JSON.parse(record.body.toString("utf-8"));
}

function assertSubset(actual, expected) {
  for (const [key, value] of Object.entries(expected)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      assertSubset(actual[key], value);
    } else {
      assert.deepEqual(actual[key], value);
    }
  }
}

function assertRequest(record, expected) {
  const url = new URL(record.url, "http://127.0.0.1");
  assert.equal(record.method, expected.method);
  assert.equal(url.pathname, expected.path);
  for (const [key, value] of Object.entries(expected.query || {})) {
    if (Array.isArray(value)) {
      assert.deepEqual(url.searchParams.getAll(key), value.map(String));
    } else {
      assert.equal(url.searchParams.get(key), String(value));
    }
  }
  if (expected.body) {
    assertSubset(requestJson(record), expected.body);
  }
}

test("CLI help exits successfully", async () => {
  const result = await new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath, "--help"], { cwd: skillDir, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf-8");
    });
    child.on("close", (status) => resolve({ status, stdout }));
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /--json/);
  assert.doesNotMatch(result.stdout, /probe-defaults|RAGFLOW_DOCUMENT_UPDATE_METHOD/);
});

test("CLI commands emit JSON only and call the expected RAGFlow endpoints", async () => {
  const server = await createMockServer();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ragflow-skill-"));
  const fileA = path.join(tempDir, "a.txt");
  const fileB = path.join(tempDir, "b.txt");
  const parserConfig = path.join(tempDir, "parser.json");
  const promptConfig = path.join(tempDir, "prompt.json");
  const metaFields = path.join(tempDir, "meta.json");
  const metadata = path.join(tempDir, "metadata.json");
  const metadataCondition = path.join(tempDir, "metadata_condition.json");
  const sessionMessages = path.join(tempDir, "messages.json");
  const dsl = path.join(tempDir, "agent.json");

  fs.writeFileSync(fileA, "alpha");
  fs.writeFileSync(fileB, "beta");
  fs.writeFileSync(parserConfig, JSON.stringify({ pages: [[1, 2]] }));
  fs.writeFileSync(promptConfig, JSON.stringify({ system: "Use only verified facts" }));
  fs.writeFileSync(metaFields, JSON.stringify({ author: "Alice", status: "published" }));
  fs.writeFileSync(metadata, JSON.stringify({ author: ["Alice"], status: "published" }));
  fs.writeFileSync(metadataCondition, JSON.stringify({ logic: "and", conditions: [{ name: "status", comparison_operator: "=", value: "published" }] }));
  fs.writeFileSync(sessionMessages, JSON.stringify([
    { role: "system", content: "Follow the dataset." },
    { role: "user", content: "Summarize the policy." },
  ]));
  fs.writeFileSync(dsl, JSON.stringify({ components: { begin: { obj: { component_name: "Begin", params: {} }, downstream: [] } }, graph: { edges: [], nodes: [] } }));

  const cases = [
    {
      args: ["create-dataset", "--name", "Docs", "--chunk-method", "naive", "--embedding-model", "emb", "--permission", "team", "--description", "Desc", "--json"],
      expect: { method: "POST", path: "/api/v1/datasets", body: { name: "Docs", chunk_method: "naive", embedding_model: "emb", permission: "team", description: "Desc" } },
    },
    {
      args: ["list-datasets", "--page", "1", "--page-size", "2", "--name", "Docs", "--id", "ds1", "--json"],
      expect: { method: "GET", path: "/api/v1/datasets", query: { page: 1, page_size: 2, name: "Docs", id: "ds1" } },
    },
    { args: ["get-dataset", "--id", "ds1", "--json"], expect: { method: "GET", path: "/api/v1/datasets", query: { id: "ds1" } } },
    { args: ["update-dataset", "--id", "ds1", "--name", "Docs2", "--json"], expect: { method: "PUT", path: "/api/v1/datasets/ds1", body: { name: "Docs2" } } },
    { args: ["delete-datasets", "--ids", "ds1", "ds2", "--json"], expect: { method: "DELETE", path: "/api/v1/datasets", body: { ids: ["ds1", "ds2"] } } },
    { args: ["upload-documents", "--dataset", "ds1", "--files", fileA, fileB, "--json"], expect: { method: "POST", path: "/api/v1/datasets/ds1/documents" }, multipart: true },
    {
      args: [
        "list-documents",
        "--dataset", "ds1",
        "--page", "1",
        "--page-size", "2",
        "--id", "doc1",
        "--name", "Doc",
        "--keywords", "policy",
        "--orderby", "name",
        "--desc", "false",
        "--suffix", "pdf", "txt",
        "--types", "pdf", "docx",
        "--run", "DONE", "FAIL",
        "--metadata", `@${metadata}`,
        "--metadata-condition", `@${metadataCondition}`,
        "--return-empty-metadata",
        "--json",
      ],
      expect: {
        method: "GET",
        path: "/api/v1/datasets/ds1/documents",
        query: {
          page: 1,
          page_size: 2,
          id: "doc1",
          name: "Doc",
          keywords: "policy",
          orderby: "name",
          desc: "false",
          suffix: ["pdf", "txt"],
          types: ["pdf", "docx"],
          run: ["DONE", "FAIL"],
          metadata: JSON.stringify({ author: ["Alice"], status: "published" }),
          metadata_condition: JSON.stringify({ logic: "and", conditions: [{ name: "status", comparison_operator: "=", value: "published" }] }),
          return_empty_metadata: "true",
        },
      },
    },
    { args: ["get-document", "--dataset", "ds1", "--id", "doc1", "--json"], expect: { method: "GET", path: "/api/v1/datasets/ds1/documents", query: { id: "doc1" } } },
    { args: ["update-document", "--dataset", "ds1", "--id", "doc1", "--parser-config", `@${parserConfig}`, "--chunk-method", "knowledge_graph", "--enabled", "1", "--meta-fields", `@${metaFields}`, "--json"], expect: { method: "PATCH", path: "/api/v1/datasets/ds1/documents/doc1", body: { parser_config: { pages: [[1, 2]] }, chunk_method: "knowledge_graph", enabled: 1, meta_fields: { author: "Alice", status: "published" } } } },
    { args: ["delete-documents", "--dataset", "ds1", "--ids", "doc1", "--json"], expect: { method: "DELETE", path: "/api/v1/datasets/ds1/documents", body: { ids: ["doc1"] } } },
    { args: ["start-parsing", "--dataset", "ds1", "--doc-ids", "doc1", "doc2", "--json"], expect: { method: "POST", path: "/api/v1/datasets/ds1/chunks", body: { document_ids: ["doc1", "doc2"] } } },
    { args: ["stop-parsing", "--dataset", "ds1", "--doc-ids", "doc1", "--json"], expect: { method: "DELETE", path: "/api/v1/datasets/ds1/chunks", body: { document_ids: ["doc1"] } } },
    { args: ["wait-parsing", "--dataset", "ds1", "--doc-ids", "doc1", "--timeout", "1", "--json"], expect: { method: "GET", path: "/api/v1/datasets/ds1/documents" } },
    { args: ["list-chunks", "--dataset", "ds1", "--document", "doc1", "--page", "1", "--page-size", "2", "--keywords", "risk", "--id", "chunk1", "--json"], expect: { method: "GET", path: "/api/v1/datasets/ds1/documents/doc1/chunks", query: { page: 1, page_size: 2, keywords: "risk", id: "chunk1" } } },
    { args: ["add-chunk", "--dataset", "ds1", "--document", "doc1", "--content", "chunk text", "--keywords", "alpha,beta", "--json"], expect: { method: "POST", path: "/api/v1/datasets/ds1/documents/doc1/chunks", body: { content: "chunk text", important_keywords: ["alpha", "beta"] } } },
    { args: ["update-chunk", "--dataset", "ds1", "--document", "doc1", "--chunk", "chunk1", "--content", "new text", "--json"], expect: { method: "PUT", path: "/api/v1/datasets/ds1/documents/doc1/chunks/chunk1", body: { content: "new text" } } },
    { args: ["delete-chunks", "--dataset", "ds1", "--document", "doc1", "--chunk-ids", "chunk1", "--json"], expect: { method: "DELETE", path: "/api/v1/datasets/ds1/documents/doc1/chunks", body: { chunk_ids: ["chunk1"] } } },
    {
      args: ["retrieve", "-q", "What is RAG?", "-d", "ds1", "ds2", "-s", "0.4", "-n", "3", "-k", "8", "-w", "0.7", "-r", "rerank1", "--keyword", "--kg", "--cross-langs", "en,zh", "--json"],
      expect: { method: "POST", path: "/api/v1/retrieval", body: { question: "What is RAG?", dataset_ids: ["ds1", "ds2"], similarity_threshold: 0.4, page_size: 3, top_k: 8, vector_similarity_weight: 0.7, rerank_id: "rerank1", keyword: true, use_kg: true, cross_languages: ["en", "zh"] } },
    },
    { args: ["list-chats", "--page", "1", "--page-size", "2", "--json"], expect: { method: "GET", path: "/api/v1/chats", query: { page: 1, page_size: 2 } } },
    { args: ["create-chat", "--name", "Bot", "--datasets", "ds1", "ds2", "--llm-id", "model-a", "--prompt", "Use docs", "--similarity-threshold", "0.2", "--top-n", "4", "--json"], expect: { method: "POST", path: "/api/v1/chats", body: { name: "Bot", dataset_ids: ["ds1", "ds2"], llm_id: "model-a", prompt_config: { system: "Use docs" }, similarity_threshold: 0.2, top_n: 4 } } },
    { args: ["get-chat", "--id", "chat1", "--json"], expect: { method: "GET", path: "/api/v1/chats/chat1" } },
    { args: ["update-chat", "--id", "chat1", "--name", "Bot2", "--prompt-config", `@${promptConfig}`, "--json"], expect: { method: "PUT", path: "/api/v1/chats/chat1", body: { name: "Bot2", prompt_config: { system: "Use only verified facts" } } } },
    { args: ["patch-chat", "--id", "chat1", "--name", "Bot3", "--prompt", "Use updated docs", "--json"], expect: { method: "PATCH", path: "/api/v1/chats/chat1", body: { name: "Bot3", prompt_config: { system: "Use updated docs" } } } },
    { args: ["delete-chats", "--ids", "chat1", "--json"], expect: { method: "DELETE", path: "/api/v1/chats", body: { ids: ["chat1"] } } },
    { args: ["list-sessions", "--chat", "chat1", "--page", "1", "--json"], expect: { method: "GET", path: "/api/v1/chats/chat1/sessions", query: { page: 1 } } },
    { args: ["create-session", "--chat", "chat1", "--name", "Session", "--json"], expect: { method: "POST", path: "/api/v1/chats/chat1/sessions", body: { name: "Session" } } },
    { args: ["delete-sessions", "--chat", "chat1", "--ids", "sess1", "--json"], expect: { method: "DELETE", path: "/api/v1/chats/chat1/sessions", body: { ids: ["sess1"] } } },
    { args: ["chat", "--chat", "chat1", "--session", "sess1", "-q", "Hello", "--json"], expect: { method: "POST", path: "/api/v1/chats/chat1/completions", body: { question: "Hello", session_id: "sess1" } } },
    { args: ["chat-session", "--chat", "chat1", "--session", "sess1", "--messages", `@${sessionMessages}`, "--llm-id", "model-a", "--temperature", "0.2", "--top-p", "0.9", "--frequency-penalty", "0.1", "--presence-penalty", "0.0", "--max-tokens", "128", "--json"], expect: { method: "POST", path: "/api/v1/chats/chat1/completions", body: { question: "Summarize the policy.", session_id: "sess1", llm_id: "model-a", temperature: 0.2, top_p: 0.9, frequency_penalty: 0.1, presence_penalty: 0, max_tokens: 128 } } },
    { args: ["list-agents", "--page", "1", "--page-size", "2", "--name", "Agent", "--json"], expect: { method: "GET", path: "/api/v1/agents", query: { page: 1, page_size: 2, title: "Agent" } } },
    { args: ["create-agent", "--title", "Agent", "--dsl", `@${dsl}`, "--description", "Desc", "--json"], expect: { method: "POST", path: "/api/v1/agents", body: { title: "Agent", description: "Desc", dsl: { components: { begin: { obj: { component_name: "Begin", params: {} }, downstream: [] } } } } } },
    { args: ["get-agent", "--id", "agent1", "--json"], expect: { method: "GET", path: "/api/v1/agents", query: { id: "agent1" } } },
    { args: ["update-agent", "--id", "agent1", "--title", "Agent2", "--dsl", `@${dsl}`, "--json"], expect: { method: "PUT", path: "/api/v1/agents/agent1", body: { title: "Agent2", dsl: { components: { begin: { obj: { component_name: "Begin", params: {} }, downstream: [] } } } } } },
    { args: ["delete-agents", "--ids", "agent1", "--json"], expect: { method: "DELETE", path: "/api/v1/agents/agent1" } },
    { args: ["list-agent-sessions", "--agent", "agent1", "--page", "1", "--json"], expect: { method: "GET", path: "/api/v1/agents/agent1/sessions", query: { page: 1 } } },
    { args: ["create-agent-session", "--agent", "agent1", "--name", "Agent Session", "--json"], expect: { method: "POST", path: "/api/v1/agents/agent1/sessions", body: { name: "Agent Session" } } },
    { args: ["delete-agent-sessions", "--agent", "agent1", "--ids", "asess1", "--json"], expect: { method: "DELETE", path: "/api/v1/agents/agent1/sessions", body: { ids: ["asess1"] } } },
    { args: ["agent-chat", "--agent", "agent1", "--session", "asess1", "-q", "Hello", "--json"], expect: { method: "POST", path: "/api/v1/agents/agent1/completions", body: { question: "Hello", session_id: "asess1" } } },
    { args: ["metadata-summary", "--dataset", "ds1", "--doc-ids", "doc1", "doc2", "--json"], expect: { method: "GET", path: "/api/v1/datasets/ds1/metadata/summary", query: { doc_ids: "doc1,doc2" } } },
    { args: ["system-version", "--json"], expect: { method: "GET", path: "/api/v1/system/version" } },
    { args: ["get-log-levels", "--json"], expect: { method: "GET", path: "/api/v1/system/config/log" } },
    { args: ["set-log-level", "--pkg-name", "ragflow", "--level", "DEBUG", "--json"], expect: { method: "PUT", path: "/api/v1/system/config/log", body: { pkg_name: "ragflow", level: "DEBUG" } } },
    { args: ["list-models", "--include-details", "--group-by", "factory", "--all", "--json"], expect: { method: "GET", path: "/v1/llm/my_llms", query: { include_details: true } } },
  ];

  try {
    for (const item of cases) {
      const start = server.requests.length;
      const result = await runCli(server.url, item.args);
      assert.equal(result.status, 0, `${item.args.join(" ")}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
      assert.doesNotMatch(result.stdout, /\u2713|\u2192|Fetching|Creating|Deleting|Updating|Found/);
      assert.doesNotThrow(() => JSON.parse(result.stdout), item.args.join(" "));
      const newRequests = server.requests.slice(start);
      assert.ok(newRequests.length >= 1, item.args.join(" "));
      assertRequest(newRequests.at(-1), item.expect);

      if (item.multipart) {
        const body = newRequests.at(-1).body.toString("binary");
        assert.match(newRequests.at(-1).headers["content-type"], /multipart\/form-data; boundary=/);
        assert.match(body, /filename="a\.txt"/);
        assert.match(body, /filename="b\.txt"/);
        assert.match(body, /alpha\r\n------FormBoundary/);
      }
    }
  } finally {
    await server.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("empty list commands still emit JSON when --json is set", async () => {
  const server = await createMockServer({ emptyDatasets: true });
  try {
    const result = await runCli(server.url, ["list-datasets", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "[]");
    assert.equal(JSON.parse(result.stdout).length, 0);
  } finally {
    await server.close();
  }
});

test("delete-chunks retries transient v0.25.0 zero-delete response", async () => {
  const server = await createMockServer({ deleteChunkFailsOnce: true });
  const previousDelay = process.env.RAGFLOW_DELETE_CHUNK_RETRY_DELAY_MS;
  process.env.RAGFLOW_DELETE_CHUNK_RETRY_DELAY_MS = "1";
  try {
    const result = await runCli(server.url, ["delete-chunks", "--dataset", "ds1", "--document", "doc1", "--chunk-ids", "chunk1", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      result: {},
      requested_chunk_ids: ["chunk1"],
      existing_chunk_ids: ["chunk1"],
      missing_chunk_ids: [],
      visibility_checked: true,
      retry_count: 1,
      retries: [
        {
          attempt: 0,
          next_attempt: 2,
          max_retries: 3,
          existing_chunk_ids: ["chunk1"],
          missing_chunk_ids: [],
        },
      ],
    });
    const deleteRequests = server.requests.filter((record) => {
      const url = new URL(record.url, "http://127.0.0.1");
      return record.method === "DELETE" && url.pathname === "/api/v1/datasets/ds1/documents/doc1/chunks";
    });
    assert.equal(deleteRequests.length, 2);
    const exactLookups = server.requests.filter((record) => {
      const url = new URL(record.url, "http://127.0.0.1");
      return record.method === "GET" && url.pathname === "/api/v1/datasets/ds1/documents/doc1/chunks" && url.searchParams.get("id") === "chunk1";
    });
    assert.equal(exactLookups.length, 1);
  } finally {
    if (previousDelay === undefined) {
      delete process.env.RAGFLOW_DELETE_CHUNK_RETRY_DELAY_MS;
    } else {
      process.env.RAGFLOW_DELETE_CHUNK_RETRY_DELAY_MS = previousDelay;
    }
    await server.close();
  }
});

test("delete-chunks reports retry diagnostics outside JSON mode", async () => {
  const server = await createMockServer({ deleteChunkFailsOnce: true });
  const previousDelay = process.env.RAGFLOW_DELETE_CHUNK_RETRY_DELAY_MS;
  process.env.RAGFLOW_DELETE_CHUNK_RETRY_DELAY_MS = "1";
  try {
    const result = await runCli(server.url, ["delete-chunks", "--dataset", "ds1", "--document", "doc1", "--chunk-ids", "chunk1"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Deleting 1 chunk/);
    assert.match(result.stdout, /delete-chunks returned 0 deletions/);
    assert.match(result.stdout, /exact ID lookup still found 1 chunk/);
    assert.match(result.stdout, /Chunks deleted/);
  } finally {
    if (previousDelay === undefined) {
      delete process.env.RAGFLOW_DELETE_CHUNK_RETRY_DELAY_MS;
    } else {
      process.env.RAGFLOW_DELETE_CHUNK_RETRY_DELAY_MS = previousDelay;
    }
    await server.close();
  }
});

test("delete-chunks does not retry zero-delete when exact chunk lookup is missing", async () => {
  const server = await createMockServer({ deleteChunkFailsOnce: true, deleteChunkMissingOnExactGet: true });
  const previousDelay = process.env.RAGFLOW_DELETE_CHUNK_RETRY_DELAY_MS;
  process.env.RAGFLOW_DELETE_CHUNK_RETRY_DELAY_MS = "1";
  try {
    const result = await runCli(server.url, ["delete-chunks", "--dataset", "ds1", "--document", "doc1", "--chunk-ids", "chunk1", "--json"]);
    assert.notEqual(result.status, 0);
    const payload = JSON.parse(result.stdout);
    assert.match(payload.error.message, /missing: chunk1/);
    assert.deepEqual(payload.requested_chunk_ids, ["chunk1"]);
    assert.deepEqual(payload.existing_chunk_ids, []);
    assert.deepEqual(payload.missing_chunk_ids, ["chunk1"]);
    assert.equal(payload.visibility_checked, true);
    assert.equal(payload.retry_count, 0);
    assert.deepEqual(payload.retries, []);
    assert.deepEqual(payload.delete_chunk_diagnostics, {
      attempt: 0,
      max_retries: 3,
      existing_chunk_ids: [],
      missing_chunk_ids: ["chunk1"],
    });
    const deleteRequests = server.requests.filter((record) => {
      const url = new URL(record.url, "http://127.0.0.1");
      return record.method === "DELETE" && url.pathname === "/api/v1/datasets/ds1/documents/doc1/chunks";
    });
    assert.equal(deleteRequests.length, 1);
  } finally {
    if (previousDelay === undefined) {
      delete process.env.RAGFLOW_DELETE_CHUNK_RETRY_DELAY_MS;
    } else {
      process.env.RAGFLOW_DELETE_CHUNK_RETRY_DELAY_MS = previousDelay;
    }
    await server.close();
  }
});

test("JSON mode emits structured errors for local validation failures", async () => {
  const result = await runCli("http://127.0.0.1:1", ["retrieve", "--json"]);
  assert.notEqual(result.status, 0);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout), {
    error: {
      message: "Missing required option: --question",
      raw_message: "Missing required option: --question",
      command: "retrieve",
    },
  });
});

test("JSON mode emits structured errors for unknown commands", async () => {
  const result = await runCli("http://127.0.0.1:1", ["does-not-exist", "--json"]);
  assert.notEqual(result.status, 0);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout), {
    error: {
      message: "Unknown command: does-not-exist",
      raw_message: "Unknown command: does-not-exist",
      command: "does-not-exist",
    },
  });
});

test("list-models fails directly on unauthorized v0.25.0 model endpoint", async () => {
  const server = await createMockServer({ modelsUnauthorized: true });
  try {
    const result = await runCli(server.url, ["list-models", "--json"]);
    assert.notEqual(result.status, 0);
    assert.equal(result.stderr, "");
    const payload = JSON.parse(result.stdout);
    assert.match(payload.error.message, /Unauthorized/);
    assert.match(payload.error.message, /RAGFLOW_WEB_TOKEN/);
    assert.equal(payload.error.raw_message, "Unauthorized. Set RAGFLOW_WEB_TOKEN from a web login session for /v1/llm/my_llms.");
    assert.equal(payload.error.code, 401);
    assert.equal(payload.error.status, 401);
    assert.equal(payload.error.command, "list-models");
    assert.equal(server.requests.length, 1);
    assertRequest(server.requests[0], { method: "GET", path: "/v1/llm/my_llms" });
  } finally {
    await server.close();
  }
});

test("agent-chat parses event-style SSE chunks", async () => {
  const server = await createMockServer({ agentEventStream: true });
  try {
    const result = await runCli(server.url, ["agent-chat", "--agent", "agent1", "--session", "asess1", "--question", "hello", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { answer: "hello world", reference: { chunks: [] } });
  } finally {
    await server.close();
  }
});
