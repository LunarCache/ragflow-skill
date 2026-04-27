# RAGFlow Skill

A Claude/OpenClaw skill for operating [RAGFlow](https://github.com/infiniflow/ragflow) v0.25.x through a bundled Node.js CLI and API client.

## Features

- **Full RAGFlow v0.25.x API coverage** - datasets, documents, parsing, chunks, retrieval, chat assistants, agents, model discovery
- **Zero dependencies** - pure Node.js, no npm install required
- **JSON-first output** - `--json` flag for machine-readable output suitable for pipelines
- **Robust error handling** - automatic retries for transient failures, structured error envelopes
- **Comprehensive documentation** - command reference, API examples, troubleshooting guide

## Quick Start

### 1. Configure Environment

```bash
# Copy the example config into the skill package
cp ragflow-skill/.env.example ragflow-skill/.env

# Edit with your RAGFlow credentials
RAGFLOW_URL=http://localhost:9380
RAGFLOW_API_KEY=ragflow-xxxxx
```

### 2. Run the CLI

```bash
# Show help
node ragflow-skill/scripts/ragflow.js --help

# List datasets
node ragflow-skill/scripts/ragflow.js list-datasets --json

# Create a dataset
node ragflow-skill/scripts/ragflow.js create-dataset --name "My Knowledge Base" --chunk-method naive

# Upload and parse documents
node ragflow-skill/scripts/ragflow.js upload-documents --dataset <id> --files ./doc.pdf
node ragflow-skill/scripts/ragflow.js start-parsing --dataset <id> --doc-ids <doc_id>
node ragflow-skill/scripts/ragflow.js wait-parsing --dataset <id> --doc-ids <doc_id>

# Retrieve from dataset
node ragflow-skill/scripts/ragflow.js retrieve --question "What is RAG?" --datasets <id>
```

### 3. Use as a Claude/OpenCode Skill

The installable skill package is the inner `ragflow-skill/` folder. The skill is automatically triggered when you mention RAGFlow, knowledge bases, document parsing, or RAG workflows:

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
|   |-- ragflow-cli.test.js
|   |-- ragflow-e2e.test.js
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
        |-- API.md                  # Programmatic API documentation
        |-- COMMANDS.md             # CLI command reference
        |-- REFERENCE.md            # Output format style guide
        `-- TROUBLESHOOTING.md      # Common issues and solutions
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
| **Models** | `list-models` |
| **System** | `system-version`, `get-log-levels`, `set-log-level` |

## Testing

```bash
# Run all tests (uses Node.js built-in test runner)
node --test test/*.test.js

# Run specific test file
node --test test/ragflow-cli.test.js
```

Tests use an in-memory mock HTTP server - no RAGFlow instance required.

## Programmatic API

```javascript
const { createClient } = require("./ragflow-skill/lib/api.js");

const client = createClient();  // Reads RAGFLOW_URL and RAGFLOW_API_KEY from env

// Dataset operations
const dataset = await client.createDataset({ name: "Docs", chunk_method: "naive" });
const datasets = await client.listDatasets({ page: 1, page_size: 10 });

// Document operations
await client.uploadDocuments(dataset.id, ["./report.pdf"]);
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
  llm_id: "model-id"
});
const session = await client.createSession(chat.id);
const answer = await client.chatSession(chat.id, session.id, { question: "Hello" });
```

## Documentation

- **[ragflow-skill/references/COMMANDS.md](ragflow-skill/references/COMMANDS.md)** - Full CLI reference with examples
- **[ragflow-skill/references/API.md](ragflow-skill/references/API.md)** - Programmatic API documentation
- **[ragflow-skill/references/TROUBLESHOOTING.md](ragflow-skill/references/TROUBLESHOOTING.md)** - Common issues and solutions
- **[ragflow-skill/references/REFERENCE.md](ragflow-skill/references/REFERENCE.md)** - Output format style guide

## Requirements

- **Node.js** 18+ (uses built-in `node:test`, `fetch`, and ES modules)
- **RAGFlow** v0.25.x server

## License

MIT-0 for ClawHub distribution.
