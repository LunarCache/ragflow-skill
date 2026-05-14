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

function requestJson(record) {
  if (!record.body.length) return undefined;
  const contentType = record.headers["content-type"] || "";
  if (!/application\/json/.test(contentType)) return undefined;
  return JSON.parse(record.body.toString("utf-8"));
}

function extractFiles(record) {
  const body = record.body.toString("utf-8");
  return [...body.matchAll(/filename="([^"]+)"/g)].map((match) => match[1]);
}

function createStatefulMockServer() {
  const requests = [];
  const state = {
    datasets: new Map(),
    chats: new Map(),
    agents: new Map(),
    models: {
      OpenAI: {
        llm: [
          { id: "model-a", name: "Model A", type: "chat", status: 1, used_token: 7 },
          { id: "model-b", name: "Model B", type: "embedding", status: 1 },
        ],
      },
    },
    system: { version: "v0.25.2", logLevels: { ragflow: "INFO" } },
  };
  const counters = {
    dataset: 0,
    doc: 0,
    chat: 0,
    chatSession: 0,
    agent: 0,
    agentSession: 0,
  };

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

      const { pathname, searchParams } = new URL(req.url, "http://127.0.0.1");
      const json = requestJson(record) || {};

      const datasetIdMatch = pathname.match(/^\/api\/v1\/datasets\/([^/]+)$/);
      const datasetDocMatch = pathname.match(/^\/api\/v1\/datasets\/([^/]+)\/documents(?:\/([^/]+))?$/);
      const datasetMetaMatch = pathname.match(/^\/api\/v1\/datasets\/([^/]+)\/metadata\/summary$/);
      const datasetChunkMatch = pathname.match(/^\/api\/v1\/datasets\/([^/]+)\/chunks$/);
      const docChunkMatch = pathname.match(/^\/api\/v1\/datasets\/([^/]+)\/documents\/([^/]+)\/chunks(?:\/([^/]+))?$/);
      const chatMatch = pathname.match(/^\/api\/v1\/chats\/([^/]+)$/);
      const chatSessionsMatch = pathname.match(/^\/api\/v1\/chats\/([^/]+)\/sessions$/);
      const chatSessionMatch = pathname.match(/^\/api\/v1\/chat\/completions$/);
      const chatCompletionMatch = pathname.match(/^\/api\/v1\/chat\/completions$/);
      const agentMatch = pathname.match(/^\/api\/v1\/agents\/([^/]+)$/);
      const agentSessionsMatch = pathname.match(/^\/api\/v1\/agents\/([^/]+)\/sessions$/);
      const agentCompletionMatch = pathname.match(/^\/api\/v1\/agents\/([^/]+)\/completions$/);
      const agentCompletionNewMatch = pathname.match(/^\/api\/v1\/agents\/chat\/completion$/);

      if (pathname === "/v1/llm/my_llms") {
        jsonResponse(res, state.models);
        return;
      }

      if (pathname === "/api/v1/system/version" && req.method === "GET") {
        jsonResponse(res, state.system.version);
        return;
      }

      if (pathname === "/api/v1/system/config/log" && req.method === "GET") {
        jsonResponse(res, state.system.logLevels);
        return;
      }

      if (pathname === "/api/v1/system/config/log" && req.method === "PUT") {
        state.system.logLevels[json.pkg_name] = json.level;
        jsonResponse(res, { pkg_name: json.pkg_name, level: json.level });
        return;
      }

      if (pathname === "/api/v1/datasets" && req.method === "POST") {
        const id = `ds${++counters.dataset}`;
        state.datasets.set(id, {
          id,
          name: json.name,
          chunk_method: json.chunk_method || "naive",
          embedding_model: json.embedding_model || "emb",
          permission: json.permission || "team",
          description: json.description || "",
          docs: new Map(),
        });
        jsonResponse(res, state.datasets.get(id));
        return;
      }

      if (pathname === "/api/v1/datasets" && req.method === "GET") {
        const datasets = [...state.datasets.values()].filter((dataset) => {
          const id = searchParams.get("id");
          const name = searchParams.get("name");
          if (id && dataset.id !== id) return false;
          if (name && dataset.name !== name) return false;
          return true;
        });
        jsonResponse(res, datasets);
        return;
      }

      if (datasetIdMatch && req.method === "PUT") {
        const dataset = state.datasets.get(datasetIdMatch[1]);
        if (!dataset) {
          jsonResponse(res, { id: datasetIdMatch[1] });
          return;
        }
        Object.assign(dataset, json);
        jsonResponse(res, dataset);
        return;
      }

      if (datasetDocMatch && !datasetDocMatch[2] && req.method === "POST") {
        const dataset = state.datasets.get(datasetDocMatch[1]);
        const files = extractFiles(record);
        const docs = files.map((file) => {
          const id = `doc${++counters.doc}`;
          const doc = {
            id,
            name: file,
            run: "UNSTART",
            chunk_count: 0,
            meta_fields: {},
            chunks: [],
            parse_checks_remaining: 0,
          };
          dataset.docs.set(id, doc);
          return { id, name: file, run: doc.run, chunk_count: doc.chunk_count };
        });
        jsonResponse(res, { total: docs.length, docs });
        return;
      }

      if (datasetDocMatch && !datasetDocMatch[2] && req.method === "GET") {
        const dataset = state.datasets.get(datasetDocMatch[1]);
        const docs = [...dataset.docs.values()].filter((doc) => {
          const id = searchParams.get("id");
          const name = searchParams.get("name");
          if (id && doc.id !== id) return false;
          if (name && doc.name !== name) return false;
          return true;
        }).map((doc) => {
          if (doc.run === "RUNNING" && doc.parse_checks_remaining > 0) {
            doc.parse_checks_remaining -= 1;
          } else if (doc.run === "RUNNING") {
            doc.run = "DONE";
            doc.chunk_count = doc.chunks.length || 1;
            if (!doc.chunks.length) {
              doc.chunks.push({ id: `${doc.id}-chunk-1`, content: `Parsed ${doc.name}` });
            }
          }
          return {
            id: doc.id,
            name: doc.name,
            run: doc.run,
            chunk_count: doc.chunk_count,
            meta_fields: doc.meta_fields,
          };
        });
        jsonResponse(res, { total: docs.length, docs });
        return;
      }

      if (datasetDocMatch && datasetDocMatch[2] && req.method === "PATCH") {
        const dataset = state.datasets.get(datasetDocMatch[1]);
        const doc = dataset.docs.get(datasetDocMatch[2]);
        if (json.name) doc.name = json.name;
        if (json.chunk_method) doc.chunk_method = json.chunk_method;
        if (json.enabled !== undefined) doc.enabled = json.enabled;
        if (json.parser_config) doc.parser_config = json.parser_config;
        if (json.meta_fields) doc.meta_fields = json.meta_fields;
        jsonResponse(res, {
          id: doc.id,
          name: doc.name,
          chunk_method: doc.chunk_method,
          enabled: doc.enabled,
          parser_config: doc.parser_config,
          meta_fields: doc.meta_fields,
        });
        return;
      }

      if (datasetMetaMatch && req.method === "GET") {
        const dataset = state.datasets.get(datasetMetaMatch[1]);
        const docIds = searchParams.get("doc_ids") ? searchParams.get("doc_ids").split(",") : null;
        const docs = [...dataset.docs.values()].filter((doc) => !docIds || docIds.includes(doc.id));
        const summary = {};
        for (const doc of docs) {
          for (const [key, value] of Object.entries(doc.meta_fields || {})) {
            summary[key] ||= {};
            summary[key][String(value)] = (summary[key][String(value)] || 0) + 1;
          }
        }
        jsonResponse(res, { summary });
        return;
      }

      if (datasetChunkMatch && req.method === "POST") {
        const dataset = state.datasets.get(datasetChunkMatch[1]);
        for (const docId of json.document_ids || []) {
          const doc = dataset.docs.get(docId);
          if (doc) {
            doc.run = "RUNNING";
            doc.parse_checks_remaining = 1;
          }
        }
        jsonResponse(res, true);
        return;
      }

      if (datasetChunkMatch && req.method === "DELETE") {
        const dataset = state.datasets.get(datasetChunkMatch[1]);
        for (const docId of json.document_ids || []) {
          const doc = dataset.docs.get(docId);
          if (doc) doc.run = "FAIL";
        }
        jsonResponse(res, true);
        return;
      }

      if (docChunkMatch && !docChunkMatch[3] && req.method === "GET") {
        const dataset = state.datasets.get(docChunkMatch[1]);
        const doc = dataset.docs.get(docChunkMatch[2]);
        jsonResponse(res, { total: doc.chunks.length, chunks: doc.chunks });
        return;
      }

      if (pathname === "/api/v1/retrieval" && req.method === "POST") {
        const datasetIds = json.dataset_ids || [];
        const results = [];
        for (const datasetId of datasetIds) {
          const dataset = state.datasets.get(datasetId);
          if (!dataset) continue;
          for (const doc of dataset.docs.values()) {
            if (doc.run === "DONE") {
              results.push({
                id: `${doc.id}-chunk-1`,
                content: `Retrieved from ${doc.name}`,
                document_id: doc.id,
              });
            }
          }
        }
        jsonResponse(res, results);
        return;
      }

      if (pathname === "/api/v1/chats" && req.method === "POST") {
        const id = `chat${++counters.chat}`;
        const chat = {
          id,
          name: json.name,
          dataset_ids: json.dataset_ids || json.kb_ids || [],
          prompt_config: json.prompt_config || {},
          llm_id: json.llm_id || "model-a",
          llm_setting: json.llm_setting || {},
          similarity_threshold: json.similarity_threshold ?? 0.1,
          top_n: json.top_n ?? 6,
          top_k: json.top_k ?? 1024,
          vector_similarity_weight: json.vector_similarity_weight ?? 0.3,
          rerank_id: json.rerank_id || "",
          description: json.description || "",
        };
        state.chats.set(id, { ...chat, sessions: new Map() });
        jsonResponse(res, chat);
        return;
      }

      if (pathname === "/api/v1/chats" && req.method === "GET") {
        jsonResponse(res, [...state.chats.values()].map(({ sessions, ...chat }) => chat));
        return;
      }

      if (chatMatch && req.method === "GET") {
        const chat = state.chats.get(chatMatch[1]);
        const { sessions, ...plainChat } = chat;
        jsonResponse(res, plainChat);
        return;
      }

      if (chatMatch && req.method === "PATCH") {
        const chat = state.chats.get(chatMatch[1]);
        if (json.name) chat.name = json.name;
        if (json.dataset_ids) chat.dataset_ids = json.dataset_ids;
        if (json.prompt_config) {
          chat.prompt_config = { ...chat.prompt_config, ...json.prompt_config };
        }
        if (json.llm_id) chat.llm_id = json.llm_id;
        if (json.llm_setting) {
          chat.llm_setting = { ...chat.llm_setting, ...json.llm_setting };
        }
        jsonResponse(res, (() => {
          const { sessions, ...plainChat } = chat;
          return plainChat;
        })());
        return;
      }

      if (chatSessionsMatch && req.method === "POST") {
        const chat = state.chats.get(chatSessionsMatch[1]);
        const id = `sess${++counters.chatSession}`;
        const session = {
          id,
          chat_id: chat.id,
          name: json.name || `Session ${counters.chatSession}`,
          messages: [],
        };
        chat.sessions.set(id, session);
        jsonResponse(res, { ...session, chat_id: chat.id });
        return;
      }

      if (chatSessionsMatch && req.method === "GET") {
        const chat = state.chats.get(chatSessionsMatch[1]);
        jsonResponse(res, [...chat.sessions.values()]);
        return;
      }

      if ((chatSessionMatch || chatCompletionMatch) && req.method === "POST") {
        const chat = state.chats.get(json.chat_id);
        const session = chat.sessions.get(json.session_id);
        session.messages = json.messages || (json.question ? [...session.messages, { role: "user", content: json.question }] : []);
        const lastUserMessage = [...session.messages].reverse().find((message) => message.role === "user");
        const answer = lastUserMessage ? lastUserMessage.content : json.question || "session response";
        sseResponse(res, {
          answer,
          reference: { chunks: [{ id: "doc1-chunk-1", content: "Retrieved from document" }] },
        });
        return;
      }

      if (chatCompletionMatch && req.method === "POST") {
        const question = json.question || "";
        sseResponse(res, {
          answer: question || "chat response",
          reference: { chunks: [{ id: "doc1-chunk-1", content: "Retrieved from document" }] },
        });
        return;
      }

      if (pathname === "/api/v1/agents" && req.method === "POST") {
        const id = `agent${++counters.agent}`;
        state.agents.set(id, {
          id,
          title: json.title,
          description: json.description || "",
          dsl: json.dsl,
          sessions: new Map(),
        });
        jsonResponse(res, true);
        return;
      }

      if (pathname === "/api/v1/agents" && req.method === "GET") {
        const agents = [...state.agents.values()].filter((agent) => {
          const id = searchParams.get("id");
          const title = searchParams.get("title");
          if (id && agent.id !== id) return false;
          if (title && agent.title !== title) return false;
          return true;
        }).map(({ sessions, ...agent }) => agent);
        jsonResponse(res, agents);
        return;
      }

      if (agentMatch && req.method === "PUT") {
        const agent = state.agents.get(agentMatch[1]);
        if (json.title) agent.title = json.title;
        if (json.description) agent.description = json.description;
        if (json.dsl) agent.dsl = json.dsl;
        jsonResponse(res, true);
        return;
      }

      if (agentSessionsMatch && req.method === "POST") {
        const agent = state.agents.get(agentSessionsMatch[1]);
        const id = `asess${++counters.agentSession}`;
        const session = { id, name: json.name || `Agent Session ${counters.agentSession}` };
        agent.sessions.set(id, session);
        jsonResponse(res, session);
        return;
      }

      if (agentSessionsMatch && req.method === "GET") {
        const agent = state.agents.get(agentSessionsMatch[1]);
        jsonResponse(res, [...agent.sessions.values()]);
        return;
      }

      if ((agentCompletionMatch || agentCompletionNewMatch) && req.method === "POST") {
        assert.equal(json.agent_id || agentCompletionMatch?.[1], "agent1");
        const question = json.question || "";
        sseResponse(res, {
          answer: question || "agent response",
          reference: { chunks: [{ id: "doc1-chunk-1", content: "Retrieved from document" }] },
        });
        return;
      }

      if (pathname === "/api/v1/agents" && req.method === "DELETE") {
        jsonResponse(res, true);
        return;
      }

      jsonResponse(res, { id: "ok" });
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
    child.on("error", (err) => resolve({ status: -1, stdout, stderr: err.message }));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
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
    assert.deepEqual(requestJson(record), expected.body);
  }
}

test("stateful e2e workflow covers upload, parsing, retrieval, chat, and agent", async () => {
  const server = await createStatefulMockServer();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ragflow-e2e-"));
  const fileA = path.join(tempDir, "policy-a.txt");
  const fileB = path.join(tempDir, "policy-b.txt");
  const parserConfig = path.join(tempDir, "parser.json");
  const metaFields = path.join(tempDir, "meta.json");
  const messages = path.join(tempDir, "messages.json");
  const dsl = path.join(tempDir, "agent.json");
  const canonicalDsl = readAgentExample("01-conversational-message.json");

  fs.writeFileSync(fileA, "alpha");
  fs.writeFileSync(fileB, "beta");
  fs.writeFileSync(parserConfig, JSON.stringify({ pages: [[1, 2]] }));
  fs.writeFileSync(metaFields, JSON.stringify({ author: "Alice", status: "published" }));
  fs.writeFileSync(messages, JSON.stringify([
    { role: "system", content: "Follow the dataset." },
    { role: "user", content: "Summarize the policy." },
  ]));
  fs.writeFileSync(dsl, JSON.stringify(canonicalDsl));

  try {
    let result = await runCli(server.url, ["create-dataset", "--name", "Docs", "--chunk-method", "naive", "--embedding-model", "emb", "--permission", "team", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const dataset = JSON.parse(result.stdout);
    const datasetId = dataset.id;
    assertRequest(server.requests.at(-1), { method: "POST", path: "/api/v1/datasets", body: { name: "Docs", chunk_method: "naive", embedding_model: "emb", permission: "team" } });

    result = await runCli(server.url, ["upload-documents", "--dataset", datasetId, "--files", fileA, fileB, "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const upload = JSON.parse(result.stdout);
    const docIds = upload.docs.map((doc) => doc.id);
    assert.equal(docIds.length, 2);
    assertRequest(server.requests.at(-1), { method: "POST", path: `/api/v1/datasets/${datasetId}/documents` });

    result = await runCli(server.url, ["update-document", "--dataset", datasetId, "--id", docIds[0], "--parser-config", `@${parserConfig}`, "--meta-fields", `@${metaFields}`, "--json"]);
    assert.equal(result.status, 0, result.stderr);
    assertRequest(server.requests.at(-1), {
      method: "PATCH",
      path: `/api/v1/datasets/${datasetId}/documents/${docIds[0]}`,
      body: { parser_config: { pages: [[1, 2]] }, meta_fields: { author: "Alice", status: "published" } },
    });

    result = await runCli(server.url, ["start-parsing", "--dataset", datasetId, "--doc-ids", ...docIds, "--json"]);
    assert.equal(result.status, 0, result.stderr);
    assertRequest(server.requests.at(-1), {
      method: "POST",
      path: `/api/v1/datasets/${datasetId}/chunks`,
      body: { document_ids: docIds },
    });

    result = await runCli(server.url, ["list-documents", "--dataset", datasetId, "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const listing = JSON.parse(result.stdout);
    assert.equal(listing.docs[0].run, "RUNNING");
    assertRequest(server.requests.at(-1), { method: "GET", path: `/api/v1/datasets/${datasetId}/documents` });

    result = await runCli(server.url, ["wait-parsing", "--dataset", datasetId, "--doc-ids", ...docIds, "--timeout", "5", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const waited = JSON.parse(result.stdout);
    assert.ok(waited.every((doc) => doc.run === "DONE"));

    result = await runCli(server.url, ["metadata-summary", "--dataset", datasetId, "--doc-ids", docIds[0], "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.summary.author.Alice, 1);
    assert.equal(summary.summary.status.published, 1);

    result = await runCli(server.url, ["retrieve", "-q", "What is in the policy?", "-d", datasetId, "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const retrieved = JSON.parse(result.stdout);
    assert.ok(Array.isArray(retrieved));
    assert.match(retrieved[0].content, /Retrieved from/);

    result = await runCli(server.url, ["create-chat", "--name", "Bot", "--datasets", datasetId, "--llm-id", "model-a", "--prompt", "Use docs", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const chat = JSON.parse(result.stdout);
    const chatId = chat.id;
    assertRequest(server.requests.at(-1), {
      method: "POST",
      path: "/api/v1/chats",
      body: { name: "Bot", dataset_ids: [datasetId], llm_id: "model-a", prompt_config: { system: "Use docs" } },
    });

    result = await runCli(server.url, ["patch-chat", "--id", chatId, "--name", "Bot 2", "--prompt", "Use updated docs", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const patched = JSON.parse(result.stdout);
    assert.equal(patched.name, "Bot 2");
    assert.equal(patched.prompt_config.system, "Use updated docs");

    result = await runCli(server.url, ["create-session", "--chat", chatId, "--name", "Session", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const session = JSON.parse(result.stdout);
    const sessionId = session.id;
    assertRequest(server.requests.at(-1), {
      method: "POST",
      path: `/api/v1/chats/${chatId}/sessions`,
      body: { name: "Session" },
    });

    result = await runCli(server.url, ["chat-session", "--chat", chatId, "--session", sessionId, "--messages", `@${messages}`, "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const sessionReply = JSON.parse(result.stdout);
    assert.equal(sessionReply.answer, "Summarize the policy.");
    assertRequest(server.requests.at(-1), {
      method: "POST",
      path: "/api/v1/chat/completions",
      body: { chat_id: chatId, question: "Summarize the policy.", session_id: sessionId },
    });

    result = await runCli(server.url, ["create-agent", "--title", "Agent", "--dsl", `@${dsl}`, "--json"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout), true);
    assertRequest(server.requests.at(-1), {
      method: "POST",
      path: "/api/v1/agents",
      body: {
        title: "Agent",
        dsl: canonicalDsl,
      },
    });

    result = await runCli(server.url, ["list-agents", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const agents = JSON.parse(result.stdout);
    assert.equal(agents[0].id, "agent1");

    result = await runCli(server.url, ["create-agent-session", "--agent", "agent1", "--name", "Agent Session", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const agentSession = JSON.parse(result.stdout);
    assert.equal(agentSession.id, "asess1");

    result = await runCli(server.url, ["agent-chat", "--agent", "agent1", "--session", "asess1", "-q", "Analyze the data", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const agentReply = JSON.parse(result.stdout);
    assert.equal(agentReply.answer, "Analyze the data");
    assertRequest(server.requests.at(-1), {
      method: "POST",
      path: "/api/v1/agents/chat/completions",
      body: {
        agent_id: "agent1",
        question: "Analyze the data",
        session_id: "asess1",
      },
    });
  } finally {
    await server.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
