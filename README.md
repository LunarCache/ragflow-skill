# RAGFlow Skill

A Codex/OpenCode skill for operating [RAGFlow](https://github.com/infiniflow/ragflow) v0.25.5 through a bundled Node.js CLI and API client.

## Features

- **Full RAGFlow v0.25.5 API coverage** - datasets, documents (tags, RAPTOR), parsing, chunks, retrieval, chat assistants, agents (structured output), embedded site access, model discovery, and connectors
- **Zero dependencies** - pure Node.js, no npm install required
- **JSON-first output** - `--json` flag for machine-readable output suitable for pipelines
- **Robust error handling** - automatic retries for transient failures, structured error envelopes
- **Comprehensive documentation** - command reference, API examples, troubleshooting guide

## Update Notes

- Added embedded site support for RAGFlow shared chatbot and agent routes, including token management, iframe/widget code generation, metadata inspection, and embedded chat calls.
- `upload-documents --files` now accepts `display-name=path` so uploaded documents keep the original user-facing filename instead of a temporary task path.
- `delete-system-token` now reads the token from stdin or a file instead of a command-line argument.
- Clarified model identifier usage for create operations: use `<model>@<provider>` such as `qwen-turbo@Tongyi-Qianwen`, not numeric model row IDs.
- Normalized bare `RAGFLOW_URL` hosts like `localhost:9380` to `http://localhost:9380` in the client and embed URL generation flow.

## Quick Start

### 1. Configure Environment

```bash
# Copy the example config into the skill package
cp skill-for-ragflow/.env.example skill-for-ragflow/.env

# Edit with your RAGFlow credentials
RAGFLOW_URL=http://localhost:9380
RAGFLOW_API_KEY=ragflow-xxxxx
```

### 2. Run the CLI

```bash
# Show help
node skill-for-ragflow/scripts/ragflow.js --help

# List datasets
node skill-for-ragflow/scripts/ragflow.js list-datasets --json

# Create a dataset
node skill-for-ragflow/scripts/ragflow.js create-dataset --name "My Knowledge Base" --chunk-method naive

# Upload and parse documents
node skill-for-ragflow/scripts/ragflow.js upload-documents --dataset <id> --files ./doc.pdf
node skill-for-ragflow/scripts/ragflow.js upload-documents --dataset <id> --files report.pdf=./tmp/task-output
node skill-for-ragflow/scripts/ragflow.js start-parsing --dataset <id> --doc-ids <doc_id>
node skill-for-ragflow/scripts/ragflow.js wait-parsing --dataset <id> --doc-ids <doc_id>

# Retrieve from dataset
node skill-for-ragflow/scripts/ragflow.js retrieve --question "What is RAG?" --datasets <id>

# Generate website embed code for a chat assistant
node skill-for-ragflow/scripts/ragflow.js embed-code --chat <chat_id> --type fullscreen

# Call the embedded chatbot route. Without --session the CLI creates the
# embedded session first, then sends the real question with session_id.
node skill-for-ragflow/scripts/ragflow.js embed-chat --chat <chat_id> --question "Hello"
```

### 3. Use as a Codex/OpenCode Skill

The installable skill package is the inner `skill-for-ragflow/` folder. The skill is automatically triggered when you mention RAGFlow, knowledge bases, document parsing, or RAG workflows:

```
"Create a RAGFlow dataset called 'Tech Docs' and upload these PDFs..."
"Query my RAGFlow knowledge base for information about..."
"List available LLM models on my RAGFlow deployment..."
```

## Project Structure

```
ragflow-skill/
|-- README.md
|-- test/
|   |-- ragflow-agent-guide.test.js
|   |-- ragflow-api.test.js
|   |-- ragflow-cli.test.js
|   |-- ragflow-docs.test.js
|   |-- ragflow-e2e.test.js
|   |-- live-agent-create.test.js
|   `-- live-delete-chunks.test.js
`-- skill-for-ragflow/
    |-- SKILL.md                    # Skill definition (triggers + instructions)
    |-- agents/
    |   `-- openai.yaml             # OpenAI-compatible agent interface
    |-- lib/
    |   `-- api.js                  # RagflowClient class
    |-- scripts/
    |   |-- ragflow.js              # Main CLI
    |   `-- repro-delete-chunks.js  # Chunk deletion diagnostic tool
    `-- references/
        |-- AGENT_GUIDE.md          # Practical custom agent guide with minimal DSL examples
        |-- API.md                  # Programmatic API documentation
        |-- COMMANDS.md             # CLI command reference
        |-- REFERENCE.md            # Output format style guide
        |-- TROUBLESHOOTING.md      # Common issues and solutions
        `-- examples/
            `-- agents/             # Minimal custom agent DSL examples
```

## CLI Commands

| Category | Commands |
|----------|----------|
| **Dataset** | `create-dataset`, `list-datasets`, `get-dataset`, `update-dataset`, `delete-datasets` |
| **Document** | `upload-documents`, `list-documents`, `get-document`, `update-document`, `delete-documents`, `metadata-summary` |
| **Parsing** | `start-parsing`, `stop-parsing`, `wait-parsing` |
| **Chunk** | `list-chunks`, `add-chunk`, `update-chunk`, `delete-chunks` |
| **Retrieval** | `retrieve` |
| **Chat** | `create-chat`, `list-chats`, `get-chat`, `update-chat`, `patch-chat`, `delete-chats` |
| **Session** | `create-session`, `list-sessions`, `delete-sessions`, `chat`, `chat-session` |
| **Agent** | `create-agent`, `list-agents`, `get-agent`, `update-agent`, `delete-agents` |
| **Agent Session** | `create-agent-session`, `list-agent-sessions`, `delete-agent-sessions`, `agent-chat` |
| **Embed** | `list-system-tokens`, `create-system-token`, `delete-system-token`, `embed-code`, `embed-info`, `embed-chat`, `embed-agent-chat` |
| **Models** | `list-models` |
| **System** | `system-version`, `get-log-levels`, `set-log-level` |

## Testing

```bash
# Fast local test suite
node --test test/ragflow-agent-guide.test.js test/ragflow-api.test.js test/ragflow-cli.test.js test/ragflow-docs.test.js test/ragflow-e2e.test.js

# Run all tests
node --test test/*.test.js

# Run live integration tests against a real RAGFlow deployment
RAGFLOW_LIVE_TEST=1 node --test test/live-agent-create.test.js test/live-delete-chunks.test.js
```

Most tests use an in-memory mock HTTP server, so no RAGFlow instance is required.
`live-agent-create.test.js` and `live-delete-chunks.test.js` are opt-in integration tests against a real RAGFlow deployment.
The live tests create real datasets, documents, and agents. Set `RAGFLOW_LIVE_KEEP_ARTIFACTS=1` if you want to preserve the created resources for manual inspection.

## Programmatic API

```javascript
const { createClient } = require("./skill-for-ragflow/lib/api.js");

const client = createClient();  // Reads RAGFLOW_URL and RAGFLOW_API_KEY from env

// Dataset operations
const dataset = await client.createDataset({ name: "Docs", chunk_method: "naive" });
const datasets = await client.listDatasets({ page: 1, page_size: 10 });

// Document operations
await client.uploadDocuments(dataset.id, ["./report.pdf"]);
const docId = "<doc_id>";
await client.startParsing(dataset.id, [docId]);
const chunks = await client.listChunks(dataset.id, docId);

// Retrieval
const results = await client.retrieve({
  question: "What is deep learning?",
  dataset_ids: [dataset.id],
  similarity_threshold: 0.3,
  page_size: 5
});

// Chat assistant
const chat = await client.createChatAssistant({
  name: "Q&A",
  dataset_ids: [dataset.id],
  llm_id: "qwen-turbo@Tongyi-Qianwen"
});
const session = await client.createSession(chat.id);
const answer = await client.chatSession(chat.id, session.id, { question: "Hello" });

// Embedded website access
const embedToken = await client.ensureEmbedToken();
const info = await client.getEmbeddedChatInfo(chat.id, embedToken.beta);
const embeddedSessionId = await client.ensureEmbeddedChatSession(chat.id, embedToken.beta);
const embeddedAnswer = await client.embeddedChat(chat.id, embedToken.beta, {
  question: "Hello",
  session_id: embeddedSessionId,
  stream: false
});

// Agent session, normalized even when the server returns workflow_finished JSON
const agentId = "<agent_id>";
const agentSession = await client.createAgentSession(agentId);
const agentAnswer = await client.agentChat(agentId, agentSession.id, "Summarize this", {
  stream: false
});
```

## Documentation

- **[skill-for-ragflow/references/COMMANDS.md](skill-for-ragflow/references/COMMANDS.md)** - Full CLI reference with examples
- **[skill-for-ragflow/references/AGENT_GUIDE.md](skill-for-ragflow/references/AGENT_GUIDE.md)** - Practical custom agent guide with minimal examples
- **[skill-for-ragflow/references/API.md](skill-for-ragflow/references/API.md)** - Programmatic API documentation
- **[skill-for-ragflow/references/TROUBLESHOOTING.md](skill-for-ragflow/references/TROUBLESHOOTING.md)** - Common issues and solutions
- **[skill-for-ragflow/references/REFERENCE.md](skill-for-ragflow/references/REFERENCE.md)** - Output format style guide

## Requirements

- **Node.js** 18+ (uses built-in `node:test` and `fetch`)
- **RAGFlow** v0.25.5 server

## License

MIT-0 for ClawHub distribution.
