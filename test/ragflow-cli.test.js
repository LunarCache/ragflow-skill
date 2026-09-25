const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const skillDir = path.resolve(__dirname, "..", "skill-for-ragflow");
const cliPath = path.join(skillDir, "scripts", "ragflow.js");
const examplesDir = path.join(skillDir, "references", "examples", "agents");

function readAgentExample(name) {
  return JSON.parse(fs.readFileSync(path.join(examplesDir, name), "utf-8"));
}

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
  const tokens = options.tokens || [{ token: "ragflow-token", beta: "beta-token" }];
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
      const isChatCompletion = pathname === "/api/v1/chat/completions";
      const isAgentCompletion = pathname === "/api/v1/agents/chat/completions";
      const isEmbeddedChatCompletion = pathname.startsWith("/api/v1/chatbots/") && pathname.endsWith("/completions");
      const isEmbeddedAgentCompletion = pathname.startsWith("/api/v1/agentbots/") && pathname.endsWith("/completions");
      if (isChatCompletion || isAgentCompletion || isEmbeddedChatCompletion || isEmbeddedAgentCompletion) {
        if (options.embeddedChatBootstrap && isEmbeddedChatCompletion) {
          const body = requestJson(record) || {};
          if (!body.session_id) {
            sseResponse(res, { answer: "Welcome", reference: {}, session_id: "embed-sess", id: null });
            return;
          }
          jsonResponse(res, { answer: "embedded ok", reference: { chunks: [] }, session_id: body.session_id });
          return;
        }
        if (options.agentEventStream && isAgentCompletion) {
          agentEventResponse(res);
          return;
        }
        if (requestJson(record)?.stream === false) {
          jsonResponse(res, { answer: "ok", reference: { chunks: [] } });
          return;
        }
        sseResponse(res, { answer: "ok", reference: { chunks: [] } });
        return;
      }

      if (pathname === "/api/v1/system/tokens" && req.method === "GET") {
        jsonResponse(res, tokens);
        return;
      }
      if (pathname === "/api/v1/system/tokens" && req.method === "POST") {
        const token = { token: "ragflow-created", beta: "beta-created" };
        tokens.push(token);
        jsonResponse(res, token);
        return;
      }
      if (pathname === "/api/v1/system/tokens/ragflow-token" && req.method === "DELETE") {
        jsonResponse(res, true);
        return;
      }

      if (pathname === "/api/v1/chatbots/chat1/info" && req.method === "GET") {
        jsonResponse(res, { title: "Bot", avatar: "", prologue: "Hello", has_tavily_key: false });
        return;
      }
      if (pathname === "/api/v1/agentbots/agent1/inputs" && req.method === "GET") {
        jsonResponse(res, { title: "Agent", avatar: "", inputs: [], prologue: "Hi", mode: "conversational" });
        return;
      }

      if (pathname === "/api/v1/system/version" && req.method === "GET") {
        jsonResponse(res, "v0.27.0");
        return;
      }
      if (pathname === "/api/v1/system/healthz" && req.method === "GET") {
        apiResponse(
          res,
          options.healthUnhealthy ? 500 : 200,
          options.healthUnhealthy
            ? { status: "red", db: "red", redis: "green" }
            : { status: "green", db: "green", redis: "green" }
        );
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

      if (["/api/v1/documents/doc1/preview", "/api/v1/datasets/ds1/documents/doc1"].includes(pathname) && req.method === "GET") {
        res.writeHead(200, { "content-type": "application/pdf", "content-disposition": "inline; filename*=UTF-8''%E6%8A%A5%E5%91%8A.pdf" });
        res.end(Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff]));
        return;
      }

      if (pathname === "/api/v1/models") {
        if (options.modelsMissing) {
          apiResponse(res, 404, { code: 404, message: "Not found" });
          return;
        }
        if (options.modelsUnauthorized) {
          apiResponse(res, 401, { code: 401, message: "Unauthorized" });
          return;
        }
        jsonResponse(res, options.models || [
          { model_id: "model-a", name: "Model A", model_type: "chat", provider_name: "OpenAI", enable: true },
          { model_id: "model-b", name: "Model B", model_type: "embedding", provider_name: "OpenAI", enable: false },
        ]);
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
      if (pathname === "/api/v1/datasets/ds1/documents/doc1/chunks/chunk1" && req.method === "GET") {
        if (options.deleteChunkMissingOnExactGet) {
          apiResponse(res, 200, { code: 404, message: "Chunk not found: ds1/chunk1" });
          return;
        }
        jsonResponse(res, { id: "chunk1", content: "Chunk" });
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
        jsonResponse(res, { chunks: [{ id: "chunk1", content: "Match" }], total: 1, doc_aggs: [] });
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

function runCli(baseUrl, args, input = "") {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: skillDir,
      env: {
        ...process.env,
        RAGFLOW_URL: baseUrl,
        RAGFLOW_API_KEY: "test-key",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf-8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf-8");
    });
    child.on("error", (err) => resolve({ status: -1, stdout, stderr: err.message }));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(input);
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
  if (expected.path === "/api/v1/retrieval" && expected.body?.knn_top_k !== undefined) {
    assert.equal(requestJson(record).top_k, undefined, "do not send the deprecated retrieval field");
  }
  const url = new URL(record.url, "http://127.0.0.1");
  assert.equal(record.method, expected.method);
  assert.equal(url.pathname, expected.path);
  if (expected.auth) {
    assert.equal(record.headers.authorization, `Bearer ${expected.auth}`);
  }
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
    child.on("error", (err) => resolve({ status: -1, stdout, stderr: err.message }));
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
  const metadataUpdate = path.join(tempDir, "metadata_update.json");
  const providerApiKey = path.join(tempDir, "provider_api_key.txt");
  const sessionMessages = path.join(tempDir, "messages.json");
  const dsl = path.join(tempDir, "agent.json");
  const canonicalDsl = readAgentExample("01-conversational-message.json");
  const inlineDsl = JSON.stringify(canonicalDsl);

  fs.writeFileSync(fileA, "alpha");
  fs.writeFileSync(fileB, "beta");
  fs.writeFileSync(parserConfig, JSON.stringify({ pages: [[1, 2]] }));
  fs.writeFileSync(promptConfig, JSON.stringify({ system: "Use only verified facts" }));
  fs.writeFileSync(metaFields, JSON.stringify({ author: "Alice", status: "published" }));
  fs.writeFileSync(metadata, JSON.stringify({ author: ["Alice"], status: "published" }));
  fs.writeFileSync(metadataCondition, JSON.stringify({ logic: "and", conditions: [{ name: "status", comparison_operator: "=", value: "published" }] }));
  fs.writeFileSync(metadataUpdate, JSON.stringify({ selector: { document_ids: ["doc1"] }, updates: [{ key: "status", value: "reviewed" }] }));
  fs.writeFileSync(providerApiKey, "sk-file\n");
  fs.writeFileSync(sessionMessages, JSON.stringify([
    { role: "system", content: "Follow the dataset." },
    { role: "user", content: "Summarize the policy." },
  ]));
  fs.writeFileSync(dsl, JSON.stringify(canonicalDsl));

  const cases = [
    {
      args: ["create-dataset", "--name", "Docs", "--chunk-method", "naive", "--embedding-model", "emb", "--permission", "team", "--description", "Desc", "--json"],
      expect: { method: "POST", path: "/api/v1/datasets", body: { name: "Docs", chunk_method: "naive", embedding_model: "emb", permission: "team", description: "Desc" } },
    },
    {
      args: ["list-datasets", "--page", "1", "--page-size", "2", "--name", "Docs", "--id", "ds1", "--json"],
      expect: { method: "GET", path: "/api/v1/datasets", query: { page: 1, page_size: 2, name: "Docs", id: "ds1" } },
    },
    { args: ["get-dataset", "--id", "ds1", "--json"], expect: { method: "GET", path: "/api/v1/datasets/ds1" } },
    { args: ["update-dataset", "--id", "ds1", "--name", "Docs2", "--json"], expect: { method: "PUT", path: "/api/v1/datasets/ds1", body: { name: "Docs2" } } },
    { args: ["delete-datasets", "--confirm-destructive", "--ids", "ds1", "ds2", "--json"], expect: { method: "DELETE", path: "/api/v1/datasets", body: { ids: ["ds1", "ds2"] } } },
    { args: ["upload-documents", "--dataset", "ds1", "--files", fileA, fileB, "--json"], expect: { method: "POST", path: "/api/v1/datasets/ds1/documents" }, multipart: true },
    { args: ["upload-documents", "--dataset", "ds1", "--files", `contract.pdf=${fileA}`, `spec.md=${fileB}`, "--json"], expect: { method: "POST", path: "/api/v1/datasets/ds1/documents" }, multipartNames: ["contract.pdf", "spec.md"] },
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
    { args: ["delete-documents", "--confirm-destructive", "--dataset", "ds1", "--ids", "doc1", "--json"], expect: { method: "DELETE", path: "/api/v1/datasets/ds1/documents", body: { ids: ["doc1"] } } },
    { args: ["start-parsing", "--dataset", "ds1", "--doc-ids", "doc1", "doc2", "--json"], expect: { method: "POST", path: "/api/v1/datasets/ds1/chunks", body: { document_ids: ["doc1", "doc2"] } } },
    { args: ["stop-parsing", "--dataset", "ds1", "--doc-ids", "doc1", "--json"], expect: { method: "DELETE", path: "/api/v1/datasets/ds1/chunks", body: { document_ids: ["doc1"] } } },
    { args: ["wait-parsing", "--dataset", "ds1", "--doc-ids", "doc1", "--timeout", "1", "--json"], expect: { method: "GET", path: "/api/v1/datasets/ds1/documents" } },
    { args: ["list-chunks", "--dataset", "ds1", "--document", "doc1", "--page", "1", "--page-size", "2", "--keywords", "risk", "--id", "chunk1", "--json"], expect: { method: "GET", path: "/api/v1/datasets/ds1/documents/doc1/chunks", query: { page: 1, page_size: 2, keywords: "risk", id: "chunk1" } } },
    { args: ["get-chunk", "--dataset", "ds1", "--document", "doc1", "--chunk", "chunk1", "--json"], expect: { method: "GET", path: "/api/v1/datasets/ds1/documents/doc1/chunks/chunk1" } },
    { args: ["add-chunk", "--dataset", "ds1", "--document", "doc1", "--content", "chunk text", "--keywords", "alpha,beta", "--json"], expect: { method: "POST", path: "/api/v1/datasets/ds1/documents/doc1/chunks", body: { content: "chunk text", important_keywords: ["alpha", "beta"] } } },
    { args: ["update-chunk", "--dataset", "ds1", "--document", "doc1", "--chunk", "chunk1", "--content", "new text", "--json"], expect: { method: "PATCH", path: "/api/v1/datasets/ds1/documents/doc1/chunks/chunk1", body: { content: "new text" } } },
    { args: ["delete-chunks", "--confirm-destructive", "--dataset", "ds1", "--document", "doc1", "--chunk-ids", "chunk1", "--json"], expect: { method: "DELETE", path: "/api/v1/datasets/ds1/documents/doc1/chunks", body: { chunk_ids: ["chunk1"] } } },
    { args: ["get-document-graph", "--dataset", "ds1", "--document", "doc1", "--json"], expect: { method: "GET", path: "/api/v1/datasets/ds1/documents/doc1/structure/graph" } },
    { args: ["delete-document-graph", "--confirm-destructive", "--dataset", "ds1", "--document", "doc1", "--json"], expect: { method: "DELETE", path: "/api/v1/datasets/ds1/documents/doc1/structure/graph" } },
    { args: ["update-metadata", "--dataset", "ds1", "--config", `@${metadataUpdate}`, "--json"], expect: { method: "POST", path: "/api/v1/datasets/ds1/metadata/update", body: { selector: { document_ids: ["doc1"] }, updates: [{ key: "status", value: "reviewed" }] } } },
    {
      args: ["retrieve", "-q", "What is RAG?", "-d", "ds1", "ds2", "-s", "0.4", "-n", "3", "--knn-top-k", "8", "-w", "0.7", "-r", "rerank1", "--keyword", "--kg", "--cross-langs", "en,zh", "--json"],
      expect: { method: "POST", path: "/api/v1/retrieval", body: { question: "What is RAG?", dataset_ids: ["ds1", "ds2"], similarity_threshold: 0.4, page_size: 3, knn_top_k: 8, vector_similarity_weight: 0.7, rerank_id: "rerank1", keyword: true, use_kg: true, cross_languages: ["en", "zh"] } },
    },
    {
      args: ["retrieve", "--question", "policy", "--datasets", "ds1", "--knn-top-k", "128", "--knn-num-candidates", "256", "--page", "3", "--top-n", "30", "--rerank-candidates-count", "90", "--doc-ids", "doc1", "doc2", "--metadata-condition", '{"logic":"and","conditions":[]}', "--highlight", "true", "--include-knowledge-compilation", "false", "--json"],
      expect: { method: "POST", path: "/api/v1/retrieval", body: { question: "policy", dataset_ids: ["ds1"], knn_top_k: 128, knn_num_candidates: 256, page: 3, page_size: 30, rerank_candidates_count: 90, document_ids: ["doc1", "doc2"], metadata_condition: { logic: "and", conditions: [] }, highlight: true, include_knowledge_compilation: false } },
    },
    {
      args: ["retrieve", "--question", "policy", "--datasets", "ds1", "--highlight", "false", "--include-knowledge-compilation", "true", "--json"],
      expect: { method: "POST", path: "/api/v1/retrieval", body: { question: "policy", dataset_ids: ["ds1"], highlight: false, include_knowledge_compilation: true } },
    },
    { args: ["list-chats", "--page", "1", "--page-size", "2", "--json"], expect: { method: "GET", path: "/api/v1/chats", query: { page: 1, page_size: 2 } } },
    { args: ["create-chat", "--name", "Bot", "--datasets", "ds1", "ds2", "--llm-id", "model-a", "--prompt", "Use docs", "--similarity-threshold", "0.2", "--top-n", "4", "--json"], expect: { method: "POST", path: "/api/v1/chats", body: { name: "Bot", dataset_ids: ["ds1", "ds2"], llm_id: "model-a", prompt_config: { system: "Use docs" }, similarity_threshold: 0.2, top_n: 4 } } },
    { args: ["get-chat", "--id", "chat1", "--json"], expect: { method: "GET", path: "/api/v1/chats/chat1" } },
    { args: ["update-chat", "--id", "chat1", "--name", "Bot2", "--prompt-config", `@${promptConfig}`, "--json"], expect: { method: "PUT", path: "/api/v1/chats/chat1", body: { name: "Bot2", prompt_config: { system: "Use only verified facts" } } } },
    { args: ["patch-chat", "--id", "chat1", "--name", "Bot3", "--prompt", "Use updated docs", "--json"], expect: { method: "PATCH", path: "/api/v1/chats/chat1", body: { name: "Bot3", prompt_config: { system: "Use updated docs" } } } },
    { args: ["delete-chats", "--confirm-destructive", "--ids", "chat1", "--json"], expect: { method: "DELETE", path: "/api/v1/chats", body: { ids: ["chat1"] } } },
    { args: ["list-sessions", "--chat", "chat1", "--page", "1", "--json"], expect: { method: "GET", path: "/api/v1/chats/chat1/sessions", query: { page: 1 } } },
    { args: ["create-session", "--chat", "chat1", "--name", "Session", "--json"], expect: { method: "POST", path: "/api/v1/chats/chat1/sessions", body: { name: "Session" } } },
    { args: ["get-session", "--chat", "chat1", "--session", "sess1", "--json"], expect: { method: "GET", path: "/api/v1/chats/chat1/sessions/sess1" } },
    { args: ["update-session", "--chat", "chat1", "--session", "sess1", "--name", "Renamed", "--json"], expect: { method: "PATCH", path: "/api/v1/chats/chat1/sessions/sess1", body: { name: "Renamed" } } },
    { args: ["delete-sessions", "--confirm-destructive", "--chat", "chat1", "--ids", "sess1", "--json"], expect: { method: "DELETE", path: "/api/v1/chats/chat1/sessions", body: { ids: ["sess1"] } } },
    { args: ["chat", "--chat", "chat1", "--session", "sess1", "-q", "Hello", "--json"], expect: { method: "POST", path: "/api/v1/chat/completions", body: { chat_id: "chat1", question: "Hello", session_id: "sess1" } } },
    { args: ["chat-session", "--chat", "chat1", "--session", "sess1", "--messages", `@${sessionMessages}`, "--llm-id", "model-a", "--temperature", "0.2", "--top-p", "0.9", "--frequency-penalty", "0.1", "--presence-penalty", "0.0", "--max-tokens", "128", "--json"], expect: { method: "POST", path: "/api/v1/chat/completions", body: { chat_id: "chat1", question: "Summarize the policy.", session_id: "sess1", llm_id: "model-a", temperature: 0.2, top_p: 0.9, frequency_penalty: 0.1, presence_penalty: 0, max_tokens: 128 } } },
    { args: ["list-agents", "--page", "1", "--page-size", "2", "--name", "Agent", "--json"], expect: { method: "GET", path: "/api/v1/agents", query: { page: 1, page_size: 2, title: "Agent" } } },
    { args: ["create-agent", "--title", "Agent", "--dsl", `@${dsl}`, "--description", "Desc", "--json"], expect: { method: "POST", path: "/api/v1/agents", body: { title: "Agent", description: "Desc", dsl: canonicalDsl } } },
    { args: ["create-agent", "--title", "Agent Inline", "--dsl", inlineDsl, "--json"], expect: { method: "POST", path: "/api/v1/agents", body: { title: "Agent Inline", dsl: canonicalDsl } } },
    { args: ["get-agent", "--id", "agent1", "--json"], expect: { method: "GET", path: "/api/v1/agents", query: { id: "agent1" } } },
    { args: ["update-agent", "--id", "agent1", "--title", "Agent2", "--dsl", `@${dsl}`, "--json"], expect: { method: "PUT", path: "/api/v1/agents/agent1", body: { title: "Agent2", dsl: canonicalDsl } } },
    { args: ["delete-agents", "--confirm-destructive", "--ids", "agent1", "--json"], expect: { method: "DELETE", path: "/api/v1/agents/agent1" } },
    { args: ["list-agent-sessions", "--agent", "agent1", "--page", "1", "--json"], expect: { method: "GET", path: "/api/v1/agents/agent1/sessions", query: { page: 1 } } },
    { args: ["create-agent-session", "--agent", "agent1", "--name", "Agent Session", "--json"], expect: { method: "POST", path: "/api/v1/agents/agent1/sessions", body: { name: "Agent Session" } } },
    { args: ["delete-agent-sessions", "--confirm-destructive", "--agent", "agent1", "--ids", "asess1", "--json"], expect: { method: "DELETE", path: "/api/v1/agents/agent1/sessions", body: { ids: ["asess1"] } } },
    { args: ["agent-chat", "--agent", "agent1", "--session", "asess1", "-q", "Hello", "--json"], expect: { method: "POST", path: "/api/v1/agents/chat/completions", body: { agent_id: "agent1", question: "Hello", session_id: "asess1" } } },
    { args: ["agent-chat", "--agent", "agent1", "--session", "asess1", "-q", "Hello", "--stream", "false", "--json"], expect: { method: "POST", path: "/api/v1/agents/chat/completions", body: { agent_id: "agent1", question: "Hello", session_id: "asess1", stream: false } } },
    { args: ["metadata-summary", "--dataset", "ds1", "--doc-ids", "doc1", "doc2", "--json"], expect: { method: "GET", path: "/api/v1/datasets/ds1/metadata/summary", query: { doc_ids: "doc1,doc2" } } },
    { args: ["system-version", "--json"], expect: { method: "GET", path: "/api/v1/system/version" } },
    { args: ["system-health", "--json"], expect: { method: "GET", path: "/api/v1/system/healthz" } },
    { args: ["get-log-levels", "--json"], expect: { method: "GET", path: "/api/v1/system/config/log" } },
    { args: ["set-log-level", "--pkg-name", "ragflow", "--level", "DEBUG", "--json"], expect: { method: "PUT", path: "/api/v1/system/config/log", body: { pkg_name: "ragflow", level: "DEBUG" } } },
    { args: ["list-system-tokens", "--json"], expect: { method: "GET", path: "/api/v1/system/tokens" } },
    { args: ["create-system-token", "--json"], expect: { method: "POST", path: "/api/v1/system/tokens" } },
    { args: ["delete-system-token", "--confirm-destructive", "--token-stdin", "--json"], stdin: "ragflow-token\n", expect: { method: "DELETE", path: "/api/v1/system/tokens/ragflow-token" } },
    { args: ["embed-info", "--chat", "chat1", "--beta", "beta-token", "--json"], expect: { method: "GET", path: "/api/v1/chatbots/chat1/info", auth: "beta-token" } },
    { args: ["embed-info", "--agent", "agent1", "--beta", "beta-token", "--json"], expect: { method: "GET", path: "/api/v1/agentbots/agent1/inputs", auth: "beta-token" } },
    { args: ["embed-chat", "--chat", "chat1", "--beta", "beta-token", "--question", "Hello", "--session", "sess1", "--quote", "--stream", "false", "--json"], expect: { method: "POST", path: "/api/v1/chatbots/chat1/completions", auth: "beta-token", body: { question: "Hello", session_id: "sess1", quote: true, stream: false } } },
    { args: ["embed-agent-chat", "--agent", "agent1", "--beta", "beta-token", "--question", "Hello", "--session", "asess1", "--inputs", "{\"city\":{\"value\":\"Shanghai\"}}", "--user-id", "user1", "--published", "--stream", "false", "--json"], expect: { method: "POST", path: "/api/v1/agentbots/agent1/completions", auth: "beta-token", body: { id: "agent1", query: "Hello", session_id: "asess1", inputs: { city: { value: "Shanghai" } }, user_id: "user1", release: "true", stream: false } } },
    { args: ["list-models", "--include-details", "--group-by", "factory", "--all", "--json"], expect: { method: "GET", path: "/api/v1/models" } },
    { args: ["download-document", "--dataset", "ds1", "--id", "doc1", "--json"], expect: { method: "GET", path: "/api/v1/datasets/ds1/documents/doc1" } },
    { args: ["list-agent-tags", "--json"], expect: { method: "GET", path: "/api/v1/agents/tags" } },
    { args: ["update-agent-tags", "--id", "agent1", "--tags", "ml", "rag", "--json"], expect: { method: "PUT", path: "/api/v1/agents/agent1/tags", body: { tags: "ml,rag" } } },
    { args: ["list-agents", "--tags", "ml", "--json"], expect: { method: "GET", path: "/api/v1/agents", query: { tags: "ml" } } },
    { args: ["list-connectors", "--json"], expect: { method: "GET", path: "/api/v1/connectors" } },
    { args: ["create-connector", "--config", '{"name":"Docs","source":"sitemap","config":{"sitemap_url":"https://example.com/sitemap.xml"}}', "--json"], expect: { method: "POST", path: "/api/v1/connectors", body: { name: "Docs", source: "sitemap", config: { sitemap_url: "https://example.com/sitemap.xml" } } } },
    { args: ["run-raptor", "--dataset", "ds1", "--json"], expect: { method: "POST", path: "/api/v1/datasets/ds1/index", query: { type: "raptor" } } },
    { args: ["trace-raptor", "--dataset", "ds1", "--json"], expect: { method: "GET", path: "/api/v1/datasets/ds1/index", query: { type: "raptor" } } },
    { args: ["get-knowledge-graph", "--dataset", "ds1", "--json"], expect: { method: "GET", path: "/api/v1/datasets/ds1/graph" } },
    { args: ["delete-knowledge-graph", "--confirm-destructive", "--dataset", "ds1", "--json"], expect: { method: "DELETE", path: "/api/v1/datasets/ds1/graph" } },
    { args: ["run-graphrag", "--dataset", "ds1", "--json"], expect: { method: "POST", path: "/api/v1/datasets/ds1/index", query: { type: "graph" } } },
    { args: ["trace-graphrag", "--dataset", "ds1", "--json"], expect: { method: "GET", path: "/api/v1/datasets/ds1/index", query: { type: "graph" } } },
    // chat/agent session features
    { args: ["preview-document", "--id", "doc1", "--json"], expect: { method: "GET", path: "/api/v1/documents/doc1/preview" } },
    { args: ["ingest-documents", "--doc-ids", "doc1", "doc2", "--run", "1", "--delete", "--confirm-destructive", "--json"], expect: { method: "POST", path: "/api/v1/documents/ingest", body: { doc_ids: ["doc1", "doc2"], run: "1", delete: true } } },
    // v0.27.0 page_size cap: oversized --page-size is clamped to 100
    { args: ["list-datasets", "--page-size", "500", "--json"], expect: { method: "GET", path: "/api/v1/datasets", query: { page_size: 100 } } },
    { args: ["chat-session", "--chat", "chat1", "--session", "sess1", "-q", "Hello", "--pass-all-history", "--json"], expect: { method: "POST", path: "/api/v1/chat/completions", body: { chat_id: "chat1", question: "Hello", session_id: "sess1", pass_all_history_messages: true } } },
    { args: ["create-agent", "--title", "Agent Canvas", "--dsl", inlineDsl, "--canvas-type", "flow", "--json"], expect: { method: "POST", path: "/api/v1/agents", body: { title: "Agent Canvas", dsl: canonicalDsl, canvas_type: "flow" } } },
    { args: ["update-agent", "--id", "agent1", "--title", "Agent2", "--dsl", `@${dsl}`, "--canvas-type", "flow", "--json"], expect: { method: "PUT", path: "/api/v1/agents/agent1", body: { title: "Agent2", dsl: canonicalDsl, canvas_type: "flow" } } },
    { args: ["agent-chat", "--agent", "agent1", "--session", "asess1", "-q", "Hello", "--chat-template-kwargs", "{\"temperature\": 0.5}", "--json"], expect: { method: "POST", path: "/api/v1/agents/chat/completions", body: { agent_id: "agent1", question: "Hello", session_id: "asess1", chat_template_kwargs: { temperature: 0.5 } } } },
    // v0.27.0 tenant models
    { args: ["list-added-models", "--type", "chat", "--json"], expect: { method: "GET", path: "/api/v1/models", query: { type: "chat" } } },
    { args: ["list-default-models", "--json"], expect: { method: "GET", path: "/api/v1/models/default" } },
    { args: ["set-default-model", "--model-type", "chat", "--model-provider", "OpenAI", "--model-instance", "default", "--model-name", "gpt-4o", "--json"], expect: { method: "PATCH", path: "/api/v1/models/default", body: { model_type: "chat", model_provider: "OpenAI", model_instance: "default", model_name: "gpt-4o" } } },
    // v0.27.0 model providers
    { args: ["list-providers", "--available", "--json"], expect: { method: "GET", path: "/api/v1/providers", query: { available: "true" } } },
    { args: ["get-provider", "--name", "OpenAI", "--json"], expect: { method: "GET", path: "/api/v1/providers/OpenAI" } },
    { args: ["add-provider", "--name", "OpenAI", "--json"], expect: { method: "PUT", path: "/api/v1/providers", body: { provider_name: "OpenAI" } } },
    { args: ["delete-provider", "--confirm-destructive", "--name", "OpenAI", "--json"], expect: { method: "DELETE", path: "/api/v1/providers/OpenAI" } },
    { args: ["list-provider-models", "--name", "OpenAI", "--api-key-file", providerApiKey, "--json"], expect: { method: "GET", path: "/api/v1/providers/OpenAI/models", query: { api_key: "sk-file" } } },
    { args: ["list-provider-instances", "--name", "OpenAI", "--json"], expect: { method: "GET", path: "/api/v1/providers/OpenAI/instances" } },
    { args: ["get-provider-instance", "--name", "OpenAI", "--instance", "default", "--json"], expect: { method: "GET", path: "/api/v1/providers/OpenAI/instances/default" } },
    { args: ["create-provider-instance", "--name", "OpenAI", "--instance", "default", "--api-key-file", providerApiKey, "--json"], expect: { method: "POST", path: "/api/v1/providers/OpenAI/instances", body: { instance_name: "default", api_key: "sk-file" } } },
    { args: ["delete-provider-instances", "--confirm-destructive", "--name", "OpenAI", "--instances", "default", "--json"], expect: { method: "DELETE", path: "/api/v1/providers/OpenAI/instances", body: { instances: ["default"] } } },
    { args: ["verify-provider", "--name", "OpenAI", "--api-key-file", providerApiKey, "--json"], expect: { method: "POST", path: "/api/v1/providers/OpenAI/connection", body: { api_key: "sk-file" } } },
    { args: ["list-instance-models", "--name", "OpenAI", "--instance", "default", "--supported", "--json"], expect: { method: "GET", path: "/api/v1/providers/OpenAI/instances/default/models", query: { supported: "true" } } },
    { args: ["add-instance-model", "--name", "OpenAI", "--instance", "default", "--model-name", "gpt-4o", "--model-type", "chat", "--json"], expect: { method: "POST", path: "/api/v1/providers/OpenAI/instances/default/models", body: { model_name: "gpt-4o", model_type: "chat" } } },
    { args: ["set-model-status", "--name", "OpenAI", "--instance", "default", "--model-name", "text-embedding-v4@Tongyi-Qianwen", "--status", "enable", "--json"], expect: { method: "PATCH", path: "/api/v1/providers/OpenAI/instances/default/models/text-embedding-v4%40Tongyi-Qianwen", body: { status: "enable" } } },
  ];

  try {
    for (const item of cases) {
      const start = server.requests.length;
      const result = await runCli(server.url, item.args, item.stdin);
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
      if (item.multipartNames) {
        const body = newRequests.at(-1).body.toString("binary");
        assert.match(newRequests.at(-1).headers["content-type"], /multipart\/form-data; boundary=/);
        for (const name of item.multipartNames) {
          assert.match(body, new RegExp(`filename="${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
        }
        assert.doesNotMatch(body, /filename="a\.txt"/);
        assert.doesNotMatch(body, /filename="b\.txt"/);
      }
    }
  } finally {
    await server.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("CLI rejects unknown options before making a request", async () => {
  const server = await createMockServer();
  try {
    const result = await runCli(server.url, ["run-raptor", "--dataset", "ds1", "--method", "raptor", "--json"]);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /Unknown option for run-raptor: --method/);
    const irrelevant = await runCli(server.url, ["run-raptor", "--dataset", "ds1", "--name", "typo", "--json"]);
    assert.equal(irrelevant.status, 1);
    assert.match(irrelevant.stdout, /Unknown option for run-raptor: --name/);
    const streaming = await runCli(server.url, ["agent-chat", "--agent", "agent1", "--session", "asess1", "--question", "Hello", "--name", "typo", "--json"]);
    assert.equal(streaming.status, 1);
    assert.match(streaming.stdout, /Unknown option for agent-chat: --name/);
    assert.equal(server.requests.length, 0);
  } finally {
    await server.close();
  }
});

test("system-health preserves dependency diagnostics on an unhealthy response", async () => {
  const server = await createMockServer({ healthUnhealthy: true });
  try {
    const result = await runCli(server.url, ["system-health", "--json"]);
    assert.equal(result.status, 1);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.error.status, 500);
    assert.deepEqual(payload.response, { status: "red", db: "red", redis: "green" });
  } finally {
    await server.close();
  }
});

test("delete-system-token rejects argv token input", async () => {
  const server = await createMockServer();
  try {
    const result = await runCli(server.url, ["delete-system-token", "--confirm-destructive", "--token", "ragflow-token", "--json"]);
    assert.notEqual(result.status, 0);
    assert.equal(result.stderr, "");
    const payload = JSON.parse(result.stdout);
    assert.match(payload.error.message, /no longer accepts --token/);
    assert.equal(server.requests.length, 0);
  } finally {
    await server.close();
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

test("oversized --page-size is clamped to 100 and warns in human-readable mode", async () => {
  const server = await createMockServer();
  try {
    const result = await runCli(server.url, ["list-datasets", "--page-size", "500"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /page_size capped at 100/);
    const datasetRequest = server.requests.find((r) => new URL(r.url, "http://127.0.0.1").pathname === "/api/v1/datasets");
    assert.ok(datasetRequest, "expected a /api/v1/datasets request");
    assert.equal(new URL(datasetRequest.url, "http://127.0.0.1").searchParams.get("page_size"), "100");
  } finally {
    await server.close();
  }
});

test("embed-code reuses an existing beta token and generates fullscreen iframe", async () => {
  const server = await createMockServer();
  try {
    const result = await runCli(server.url, ["embed-code", "--chat", "chat1", "--type", "fullscreen", "--theme", "dark", "--locale", "en", "--hide-avatar", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.type, "fullscreen");
    assert.equal(payload.from, "chat");
    assert.equal(payload.id, "chat1");
    assert.equal(payload.beta, "beta-token");
    assert.match(payload.src, /\/chats\/share\?/);
    assert.match(payload.src, /shared_id=chat1/);
    assert.match(payload.src, /from=chat/);
    assert.match(payload.src, /auth=beta-token/);
    assert.match(payload.src, /theme=dark/);
    assert.match(payload.src, /locale=en/);
    assert.match(payload.src, /visible_avatar=1/);
    assert.match(payload.html, /<iframe/);
    assert.equal(server.requests.length, 1);
    assertRequest(server.requests[0], { method: "GET", path: "/api/v1/system/tokens" });
  } finally {
    await server.close();
  }
});

test("embed-code creates a system token when no reusable beta token exists", async () => {
  const server = await createMockServer({ tokens: [] });
  try {
    const result = await runCli(server.url, ["embed-code", "--agent", "agent1", "--type", "widget", "--streaming", "--published", "--user-id", "user1", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.type, "widget");
    assert.equal(payload.from, "agent");
    assert.equal(payload.beta, "beta-created");
    assert.match(payload.src, /\/chats\/widget\?/);
    assert.match(payload.src, /shared_id=agent1/);
    assert.match(payload.src, /from=agent/);
    assert.match(payload.src, /release=true/);
    assert.match(payload.src, /mode=master/);
    assert.match(payload.src, /streaming=true/);
    assert.match(payload.src, /userId=user1/);
    assert.match(payload.html, /CREATE_CHAT_WINDOW/);
    assert.equal(server.requests.length, 2);
    assertRequest(server.requests[0], { method: "GET", path: "/api/v1/system/tokens" });
    assertRequest(server.requests[1], { method: "POST", path: "/api/v1/system/tokens" });
  } finally {
    await server.close();
  }
});

test("embed-chat bootstraps an embedded session when --session is omitted", async () => {
  const server = await createMockServer({ embeddedChatBootstrap: true });
  try {
    const result = await runCli(server.url, ["embed-chat", "--chat", "chat1", "--beta", "beta-token", "--question", "Hello", "--stream", "false", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      answer: "embedded ok",
      reference: { chunks: [] },
      session_id: "embed-sess",
    });

    const chatRequests = server.requests.filter((record) => {
      const url = new URL(record.url, "http://127.0.0.1");
      return url.pathname === "/api/v1/chatbots/chat1/completions";
    });
    assert.equal(chatRequests.length, 2);
    assertRequest(chatRequests[0], {
      method: "POST",
      path: "/api/v1/chatbots/chat1/completions",
      auth: "beta-token",
      body: { question: "", stream: true },
    });
    assertRequest(chatRequests[1], {
      method: "POST",
      path: "/api/v1/chatbots/chat1/completions",
      auth: "beta-token",
      body: { question: "Hello", session_id: "embed-sess", stream: false },
    });
  } finally {
    await server.close();
  }
});

test("delete-chunks retries transient zero-delete response", async () => {
  const server = await createMockServer({ deleteChunkFailsOnce: true });
  const previousDelay = process.env.RAGFLOW_DELETE_CHUNK_RETRY_DELAY_MS;
  process.env.RAGFLOW_DELETE_CHUNK_RETRY_DELAY_MS = "1";
  try {
    const result = await runCli(server.url, ["delete-chunks", "--confirm-destructive", "--dataset", "ds1", "--document", "doc1", "--chunk-ids", "chunk1", "--json"]);
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
      return record.method === "GET" && url.pathname === "/api/v1/datasets/ds1/documents/doc1/chunks/chunk1";
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
    const result = await runCli(server.url, ["delete-chunks", "--confirm-destructive", "--dataset", "ds1", "--document", "doc1", "--chunk-ids", "chunk1"]);
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
    const result = await runCli(server.url, ["delete-chunks", "--confirm-destructive", "--dataset", "ds1", "--document", "doc1", "--chunk-ids", "chunk1", "--json"]);
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

test("list-models fails directly on unauthorized model endpoint", async () => {
  const server = await createMockServer({ modelsUnauthorized: true });
  try {
    const result = await runCli(server.url, ["list-models", "--json"]);
    assert.notEqual(result.status, 0);
    assert.equal(result.stderr, "");
    const payload = JSON.parse(result.stdout);
    assert.match(payload.error.message, /Unauthorized/);
    assert.match(payload.error.message, /RAGFLOW_API_KEY/);
    assert.equal(payload.error.raw_message, "Unauthorized. Verify RAGFLOW_API_KEY is valid for /api/v1/models.");
    assert.equal(payload.error.code, 401);
    assert.equal(payload.error.status, 401);
    assert.equal(payload.error.command, "list-models");
    assert.equal(server.requests.length, 1);
    assertRequest(server.requests[0], { method: "GET", path: "/api/v1/models" });
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

test("retrieval rejects invalid v0.27.2 candidate settings before sending HTTP", async () => {
  const server = await createMockServer();
  try {
    for (const [options, message] of [
      [["--knn-top-k", "1.5"], /positive integer/],
      [["--knn-top-k"], /positive integer/],
      [["--page", "0"], /positive integer/],
      [["--knn-top-k", "128", "--top-k", "64"], /Unknown option/],
      [["--knn-top-k", "128", "--knn-num-candidates", "64"], /must be at least/],
      [["--page", "3", "--top-n", "30", "--rerank-candidates-count", "64"], /multiplied/],
      [["--rerank-candidates-count", "20"], /default 30/],
    ]) {
      const result = await runCli(server.url, ["retrieve", "--question", "policy", "--datasets", "ds1", ...options, "--json"]);
      assert.notEqual(result.status, 0);
      assert.match(JSON.parse(result.stdout).error.message, message);
    }
    assert.equal(server.requests.length, 0);
  } finally {
    await server.close();
  }
});

test("retrieval reports the chunk count from the server object envelope", async () => {
  const server = await createMockServer();
  try {
    const result = await runCli(server.url, ["retrieve", "--question", "policy", "--datasets", "ds1"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Found 1 result/);
  } finally {
    await server.close();
  }
});

test("model discovery preserves provider instances and array-valued model types", async () => {
  const models = ["default", "secondary"].map((instance, i) => ({
    model_id: i, name: "same-model", provider_name: "OpenAI", instance_name: instance,
    model_type: ["chat", "vision"], tenant_id: "tenant1", instance_id: i, rank: 10,
  }));
  const server = await createMockServer({ models });
  try {
    const result = await runCli(server.url, ["list-models", "--type", "chat", "--include-details", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.total, 2);
    assert.equal(payload.groups[0].name, "chat,vision");
    assert.deepEqual(payload.groups[0].models.map(m => m.identifier), ["same-model@default@OpenAI", "same-model@secondary@OpenAI"]);
    assert.equal(payload.groups[0].models[0].id, 0);
    assert.equal(payload.groups[0].models[0].status, "configured");
    assert.equal(payload.groups[0].models[0].tenant_id, "tenant1");
    assert.equal(server.requests[0].url, "/api/v1/models?type=chat");
  } finally { await server.close(); }
});

test("missing model endpoint fails without calling a removed route", async () => {
  const server = await createMockServer({ modelsMissing: true });
  try {
    const result = await runCli(server.url, ["list-models", "--json"]);
    assert.notEqual(result.status, 0);
    assert.equal(JSON.parse(result.stdout).error.status, 404);
    assert.equal(server.requests.length, 1);
    assert.equal(server.requests[0].url, "/api/v1/models");
  } finally { await server.close(); }
});

test("document download and preview save binary bytes without overwriting files", async () => {
  const server = await createMockServer();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ragflow-download-"));
  try {
    for (const command of ["download-document", "preview-document"]) {
      const destination = path.join(tempDir, command + ".pdf");
      const args = [command, "--id", "doc1", "--output", destination, "--json"];
      if (command === "download-document") args.push("--dataset", "ds1");
      const result = await runCli(server.url, args);
      assert.equal(result.status, 0, result.stderr);
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.path, destination);
      assert.equal(payload.name, "报告.pdf");
      assert.equal(payload.content, undefined);
      assert.deepEqual(fs.readFileSync(destination), Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff]));
      const repeated = await runCli(server.url, args);
      assert.notEqual(repeated.status, 0);
      assert.deepEqual(fs.readFileSync(destination), Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff]));
    }
  } finally {
    await server.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("removed compatibility flags fail before any HTTP request", async () => {
  const server = await createMockServer();
  try {
    for (const args of [
      ["retrieve", "--question", "q", "--top-k", "10"],
      ["retrieve", "--question", "q", "-k", "10"],
      ["chat", "--chat", "c", "--session", "s", "--question", "q", "--legacy"],
      ["chat-session", "--chat", "c", "--session", "s", "--question", "q", "--legacy", "false"],
      ["embed-chat", "--chat", "c", "--beta", "b", "--session", "s", "--question", "q", "--conversation-id", "old"],
      ["list-provider-models", "--name", "OpenAI", "--api-key", "old"],
      ["chat-session", "--chat", "c", "--session", "s", "--question", "q", "--llm", "old"],
      ["embed-chat", "--chat", "c", "--auth", "old", "--question", "q"],
      ["embed-code", "--chat", "c", "--beta", "b", "--release"],
      ["embed-code", "--chat", "c", "--beta", "b", "--visible-avatar"],
      ["embed-code", "--chat", "c", "--beta", "b", "--embed-type", "widget"],
    ]) {
      const result = await runCli(server.url, [...args, "--json"]);
      assert.notEqual(result.status, 0);
      assert.match(JSON.parse(result.stdout).error.message, /Unknown option/);
    }
    assert.equal(server.requests.length, 0);
  } finally { await server.close(); }
});

test("CLI refuses unconfirmed and false-confirmed deletion without sending requests", async () => {
  const server = await createMockServer();
  try {
    for (const extra of [[], ["--confirm-destructive", "false"], ["--confirm-destructive", "yes"]]) {
      const result = await runCli(server.url, ["delete-datasets", "--ids", "ds1", "--json", ...extra]);
      assert.notEqual(result.status, 0);
      assert.match(JSON.parse(result.stdout).error.message, /confirm/i);
    }
    assert.equal(server.requests.length, 0);
    const result = await runCli(server.url, ["delete-datasets", "--ids", "ds1", "--confirm-destructive", "--json"]);
    assert.equal(result.status, 0, result.stdout);
    assert.equal(server.requests.length, 1);
  } finally { await server.close(); }
});

test("generated widget rejects forged messages and unsafe URLs, accepts its own iframe", async () => {
  const vm = require("node:vm");
  const server = await createMockServer();
  try {
    const result = await runCli(server.url, ["embed-code", "--chat", 'id"<script>', "--type", "widget", "--json"]);
    assert.equal(result.status, 0, result.stdout);
    const payload = JSON.parse(result.stdout);
    const src = payload.html.match(/src="([^"]+)"/)[1].replace(/&amp;/g, "&");
    assert.equal(src, payload.src);
    assert.ok(!payload.html.includes('id"<script>'));
    const launcher = { contentWindow: {} };
    const elements = { "ragflow-embed-launcher": launcher };
    let handler;
    vm.runInNewContext(payload.html.match(/<script>([\s\S]*)<\/script>/)[1], {
      URL, window: { addEventListener: (_, fn) => { handler = fn; }, scrollBy() {} },
      document: {
        getElementById: id => elements[id],
        createElement: () => ({ style: {} }),
        body: { appendChild: element => { elements[element.id] = element; } },
      },
    });
    const message = { origin: server.url, source: launcher.contentWindow, data: { type: "CREATE_CHAT_WINDOW", src: server.url + "/chats/share" } };
    handler({ ...message, origin: "https://evil.example" });
    handler({ ...message, source: {} });
    for (const src of ["javascript:alert(1)", "https://evil.example/chats/share", "/unrelated", server.url.replace("http://", "http://user:pass@") + "/chats/share"]) {
      handler({ ...message, data: { ...message.data, src } });
    }
    assert.equal(elements["chat-win"], undefined);
    handler(message);
    assert.equal(elements["chat-win"].src, message.data.src);
    handler({ ...message, data: { type: "TOGGLE_CHAT", isOpen: true } });
    assert.equal(elements["chat-win"].style.display, "block");
  } finally { await server.close(); }
});

test("invalid embed origins fail before token discovery or creation", async () => {
  const server = await createMockServer({ tokens: [] });
  try {
    for (const origin of ["https://example.com/path", "https://user:pass@example.com", "ftp://example.com", "https://example.com/?x=1"]) {
      const result = await runCli(server.url, ["embed-code", "--chat", "chat1", "--origin", origin, "--json"]);
      assert.notEqual(result.status, 0);
      assert.match(JSON.parse(result.stdout).error.message, /origin/i);
    }
    assert.equal(server.requests.length, 0);
  } finally { await server.close(); }
});
