# AI Chat Application

Full-stack AI chat — React 18 · Node.js · MongoDB · Ollama (Llama 3 / LLaVA) · Docker

---

## Table of Contents

1. [System Design](#system-design)
2. [Workflow](#workflow)
3. [Prerequisites](#prerequisites)
4. [Quick Start (Docker)](#quick-start-docker)
5. [Local Development](#local-development)
6. [Environment Variables](#environment-variables)
7. [API Reference](#api-reference)
8. [Database Schema](#database-schema)
9. [Features](#features)

---

## System Design

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client (Browser)                          │
│                     React 18 · Port 3000                        │
└───────────────────────────┬─────────────────────────────────────┘
                            │ REST / SSE
┌───────────────────────────▼─────────────────────────────────────┐
│                    Node.js + Express                             │
│                       Port 5000                                  │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │  REST API   │  │ SSE Streaming│  │   File Processing      │  │
│  │  /api/*     │  │ /api/messages│  │  pdf-parse · mammoth   │  │
│  │             │  │ /stream      │  │  xlsx · tesseract.js   │  │
│  └─────────────┘  └──────────────┘  └────────────────────────┘  │
└──────────┬────────────────────────────────────┬─────────────────┘
           │                                    │
┌──────────▼──────────┐              ┌──────────▼──────────────────┐
│      MongoDB         │              │         Ollama               │
│      Port 27017      │              │         Port 11434           │
│                      │              │  ┌────────┐  ┌───────────┐  │
│  conversations       │              │  │ llama3 │  │   llava   │  │
│  messages            │              │  │  chat  │  │  vision   │  │
└──────────────────────┘              │  └────────┘  └───────────┘  │
                                      └─────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│                          Redis                                   │
│                         Port 6379                               │
│              Conversation context cache (2h TTL)                │
└─────────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React 18, react-markdown, lucide-react, axios | Chat UI, markdown render, file upload |
| Backend | Node.js 20, Express 4 | REST API, SSE streaming |
| Database | MongoDB 7 + Mongoose | Persistent chat history |
| Cache | Redis 7 | Conversation context (last 40 messages) |
| AI — Text | Ollama + Llama 3 | Chat, code, analysis |
| AI — Vision | Ollama + LLaVA | Image understanding |
| AI — Image Gen | Pollinations.ai | Free image generation (no key needed) |
| File Processing | pdf-parse, mammoth, xlsx, tesseract.js | Extract text from PDF/DOCX/XLSX/images |
| Export | docx npm package | Generate real .docx files |
| Deploy | Docker + Docker Compose | One-command startup |

### Project Structure

```
ai-chat/
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── messageController.js    # Chat logic, flow detection
│   │   │   ├── conversationController.js
│   │   │   ├── uploadController.js
│   │   │   └── exportController.js     # .docx / .txt export
│   │   ├── services/
│   │   │   ├── fileExtractor.js        # PDF/DOCX/XLSX/CSV/OCR → text
│   │   │   ├── visionService.js        # LLaVA image description
│   │   │   ├── imageGenerator.js       # Pollinations.ai / Stable Diffusion
│   │   │   └── cacheService.js         # Redis conversation cache
│   │   ├── models/
│   │   │   ├── Conversation.js
│   │   │   └── Message.js
│   │   ├── routes/
│   │   │   ├── conversations.js
│   │   │   ├── messages.js
│   │   │   ├── upload.js
│   │   │   └── export.js
│   │   └── index.js                    # Express app entry
│   ├── uploads/                        # Uploaded files (volume mounted)
│   ├── .env                            # ← environment config (see below)
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── MessageList.js          # Chat bubbles, copy/edit/export
│   │   │   ├── ChatInput.js            # Textarea, file upload, send
│   │   │   ├── ChatArea.js             # Main chat panel
│   │   │   └── Sidebar.js              # Conversation list
│   │   ├── hooks/
│   │   │   └── useChat.js              # All state management
│   │   ├── services/
│   │   │   └── api.js                  # Axios + SSE stream helper
│   │   └── App.js
│   ├── .env                            # ← environment config (see below)
│   ├── Dockerfile
│   └── package.json
├── tests/
│   ├── unit/
│   │   ├── fileExtractor.test.js
│   │   ├── imageGenerator.test.js
│   │   └── messageList.test.js
│   └── integration/
│       └── messageAPI.test.js
├── docker-compose.yml
└── README.md
```

---

## Workflow

### 1. Sending a normal message

```
User types → ChatInput
    → POST /api/messages/stream (SSE)
        → detectFlow(content, attachments)
            → flow: 'normal'
        → buildHistory(conversationId)          # Redis → MongoDB fallback
        → callOllama(messages, stream: true)    # Llama 3
        → stream delta events → frontend
        → save aiMessage to MongoDB
        → push to Redis cache
    → SSE 'done' event → update UI
```

### 2. Uploading a file (PDF/DOCX/image)

```
User uploads file → POST /api/upload
    → multer saves to /uploads/{uuid}.ext
    → returns { url: '/uploads/...', mimetype, originalName }

User sends message with attachment → POST /api/messages/stream
    → detectFlow() → flow: 'normal' (file) or 'vision' (image)
    → buildAttachmentContext(attachments)
        ├── PDF      → pdf-parse → text
        ├── DOCX     → mammoth → markdown
        ├── XLSX/XLS → xlsx (SheetJS) → markdown table
        ├── CSV      → parse → markdown table
        ├── TXT/JSON/MD → fs.readFile → text
        └── image/   → LLaVA (Ollama) → description text
                       fallback: Tesseract.js OCR
    → inject extracted text into Llama 3 prompt
    → stream response
```

### 3. Image generation

```
User types "tạo ảnh con mèo" or "generate an image of..."
    → detectFlow() → check: has image attachment? NO
    → extractImagePromptFromMessage() → matches pattern
    → flow: 'imagegen'
    → generateImage(prompt)
        ├── check Stable Diffusion at localhost:7860 (if running)
        └── fallback: Pollinations.ai URL (no key needed)
    → return markdown: ![Generated image](url)
```

### 4. Export message as file

```
User clicks ↓ button on AI message
    → dropdown: .txt | .md | .docx
    → .txt / .md → client-side Blob download (no server call)
    → .docx → POST /api/export/docx { content, filename }
                → backend: docx npm package → Buffer → send binary
                → browser downloads real .docx file
```

### 5. Conversation context (Redis cache)

```
Every message saved → pushMessage(conversationId, { role, content })
    → Redis RPUSH chat:conv:{id}  (TTL: 2 hours)

Next message → buildHistory()
    → getCachedMessages(conversationId, 40)  ← Redis first (fast)
    → if miss → Message.find() from MongoDB  ← fallback
    → warm Redis cache from DB result
```

---

## Prerequisites

Before running this project, install the following:

### 1. Docker Desktop
Download: https://www.docker.com/products/docker-desktop

Verify: `docker --version` and `docker compose version`

### 2. Ollama (AI models — runs on your machine)

**macOS / Linux:**
```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

**Windows:** Download installer from https://ollama.ai/download

**Pull required models:**
```bash
# Text model (required) — ~4.7GB
ollama pull llama3

# Vision model (optional, for image analysis) — ~4.5GB
ollama pull llava

# Start Ollama server
ollama serve
```

Verify: `curl http://localhost:11434/api/tags` — should show your models.

> **Note:** Ollama must be running before starting the app.
> On macOS/Linux it auto-starts after install. On Windows, launch from Start menu.

### 3. Node.js 18+ (for local dev only, not needed for Docker)
Download: https://nodejs.org

---

## Quick Start

Choose one of two ways to run this project:

- **Option A — Run from Source** → for developers who want to inspect or modify code.
- **Option B — Run from Docker Hub** → for recruiters or anyone who wants to run the app instantly.

---

# Option A — Run from Source

This mode is recommended for development and code review.

## Step 1 — Clone repository

```bash
git clone <your-github-repo-url>
cd ai-chat
```

## Step 2 — Install dependencies

### Backend

```bash
cd backend
npm install
```

### Frontend

```bash
cd ../frontend
npm install
```

### Tests (optional)

```bash
cd ../tests
npm install
```

---

## Step 3 — Start required services

### Start Ollama

Make sure Ollama is running:

```bash
ollama serve
```

### Start MongoDB + Redis

If you already have MongoDB and Redis installed locally, skip this step.

Otherwise run:

```bash
docker compose up mongodb redis -d
```

---

## Step 4 — Configure environment variables

Create:

### backend/.env

```env
PORT=5000
NODE_ENV=development

MONGODB_URI=mongodb://localhost:27017/ai_chat_db
REDIS_URL=redis://localhost:6379

OLLAMA_URL=http://localhost:11434
LLAMA_MODEL=llama3
OLLAMA_VISION_MODEL=llava

UPLOAD_DIR=uploads
MAX_FILE_SIZE=20971520

FRONTEND_URL=http://localhost:3000

SD_API_URL=http://localhost:7860
```

### frontend/.env

```env
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_NAME=AI Chat
```

---

## Step 5 — Start application

### Backend

```bash
cd backend
npm run dev
```

### Frontend

```bash
cd frontend
npm start
```

---

## Access application

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:5000 |
| Health Check | http://localhost:5000/health |

---

# Option B — Run from Docker Hub

This mode is recommended for recruiters or quick demos.

No Node.js, MongoDB, or Redis installation required.

---

## Step 1 — Clone repository

```bash
git clone <your-github-repo-url>
cd ai-chat
```

---

## Step 2 — Start Ollama

Make sure Ollama is running:

```bash
ollama serve
```

---

## Step 3 — Configure environment variables

### backend/.env

```env
OLLAMA_URL=http://host.docker.internal:11434
LLAMA_MODEL=llama3
```

### frontend/.env

```env
REACT_APP_API_URL=http://localhost:5000/api
```

---

## Step 4 — Pull prebuilt images

```bash
docker compose pull
```

Or manually:

```bash
docker pull yourdockerhubusername/ai-chat-backend:latest
docker pull yourdockerhubusername/ai-chat-frontend:latest
```

---

## Step 5 — Start containers

```bash
docker compose up
```

First run may take 1–2 minutes.

---

## Access application

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:5000 |
| Health Check | http://localhost:5000/health |

---

## Stop containers

```bash
docker compose down
```

Remove all persisted data:

```bash
docker compose down -v
```

---


## Local Development

### Backend

```bash
cd backend
npm install
npm run dev     # nodemon — auto-restart on file changes
```

Server starts at http://localhost:5000

### Frontend

```bash
cd frontend
npm install
npm start       # Create React App dev server with HMR
```

App opens at http://localhost:3000

### Running tests

```bash
cd tests        # or root if package.json is at root
npm install
npm test                    # run all tests once
npm run test:watch          # watch mode
npm run test:coverage       # coverage report
npm run test:ui             # browser UI (vitest --ui)
npm run test:unit           # unit tests only
npm run test:integration    # integration tests only
```

---

## Environment Variables

> **If you lost or never had the `.env` files** — create them manually using the templates below. Every variable has a default listed; only the ones marked **required** must be set for the app to work.

### `backend/.env`

Create the file at `backend/.env` with this content:

```bash
# ── Server ────────────────────────────────────────────────────────
PORT=5000
NODE_ENV=development

# ── MongoDB ───────────────────────────────────────────────────────
# Docker: use service name "mongodb"
# Local:  use "localhost"
MONGODB_URI=mongodb://mongodb:27017/ai_chat_db

# ── Redis (conversation context cache) ───────────────────────────
# Docker: use service name "redis"
# Local:  use "localhost"
REDIS_URL=redis://redis:6379

# ── Ollama (AI) ───────────────────────────────────────────────────
# Docker: host.docker.internal reaches your machine's localhost
# Local dev: use http://localhost:11434
OLLAMA_URL=http://host.docker.internal:11434

# Text model for chat (must be pulled: ollama pull llama3)
LLAMA_MODEL=llama3

# Vision model for image analysis (optional: ollama pull llava)
# If not installed, falls back to Tesseract.js OCR
OLLAMA_VISION_MODEL=llava

# ── File Upload ───────────────────────────────────────────────────
# Max file size in bytes (default: 20MB)
MAX_FILE_SIZE=20971520

# Upload directory (relative to backend root)
UPLOAD_DIR=uploads

# ── CORS ─────────────────────────────────────────────────────────
# Must match your frontend URL exactly
FRONTEND_URL=http://localhost:3000

# ── Rate Limiting ─────────────────────────────────────────────────
# Window in milliseconds (default: 15 minutes)
RATE_LIMIT_WINDOW_MS=900000
# Max requests per window per IP
RATE_LIMIT_MAX=100

# ── Image Generation (optional) ───────────────────────────────────
# Local Stable Diffusion API URL (AUTOMATIC1111 or ComfyUI)
# Leave default if not using — app will fallback to Pollinations.ai (free)
SD_API_URL=http://localhost:7860
```

### `frontend/.env`

Create the file at `frontend/.env` with this content:

```bash
# Backend API base URL
# Docker:    http://localhost:5000/api  (same as default)
# Local dev: http://localhost:5000/api  (same)
# Production: change to your deployed backend URL
REACT_APP_API_URL=http://localhost:5000/api

# App display name (optional)
REACT_APP_NAME=AI Chat
```

### Common configuration scenarios

**Running with Docker Compose (default):**
```bash
# backend/.env
MONGODB_URI=mongodb://mongodb:27017/ai_chat_db
REDIS_URL=redis://redis:6379
OLLAMA_URL=http://host.docker.internal:11434
FRONTEND_URL=http://localhost:3000

# frontend/.env
REACT_APP_API_URL=http://localhost:5000/api
```

**Running locally without Docker:**
```bash
# backend/.env
MONGODB_URI=mongodb://localhost:27017/ai_chat_db
REDIS_URL=redis://localhost:6379
OLLAMA_URL=http://localhost:11434
FRONTEND_URL=http://localhost:3000

# frontend/.env
REACT_APP_API_URL=http://localhost:5000/api
```

**On Linux (Docker cannot use host.docker.internal):**
```bash
# backend/.env — use your machine's IP or docker bridge IP
OLLAMA_URL=http://172.17.0.1:11434
# or run: ip route | grep default → use that gateway IP
```

---

## API Reference

### Conversations

| Method | URL | Body | Description |
|---|---|---|---|
| GET | `/api/conversations` | — | List all (paginated, `?page=1&limit=20`) |
| GET | `/api/conversations/:id` | — | Get one conversation with all messages |
| POST | `/api/conversations` | `{ title, userId }` | Create new |
| PATCH | `/api/conversations/:id` | `{ title }` | Rename |
| DELETE | `/api/conversations/:id` | — | Delete conversation + all its messages |

### Messages

| Method | URL | Body | Description |
|---|---|---|---|
| GET | `/api/messages/:conversationId` | — | Get messages (paginated) |
| POST | `/api/messages` | `{ conversationId, content, attachments }` | Send (standard response) |
| POST | `/api/messages/stream` | `{ conversationId, content, attachments }` | Send (SSE streaming) |
| POST | `/api/messages/generate-image` | `{ prompt, provider, width, height }` | Generate image directly |
| DELETE | `/api/messages/:id` | — | Delete one message |

### Upload

| Method | URL | Body | Description |
|---|---|---|---|
| POST | `/api/upload` | `multipart/form-data` files field `files` | Upload up to 5 files (max 20MB each) |

Supported types: `image/*`, `.pdf`, `.docx`, `.doc`, `.xlsx`, `.xls`, `.csv`, `.txt`, `.md`, `.json`, `.xml`

### Export

| Method | URL | Body | Description |
|---|---|---|---|
| POST | `/api/export/docx` | `{ content, filename }` | Download as real Word document |
| POST | `/api/export/txt` | `{ content, filename }` | Download as plain text |

### Health

| Method | URL | Description |
|---|---|---|
| GET | `/health` | Returns server status, MongoDB connection, uploads directory |

### SSE Stream events

When using `POST /api/messages/stream`, the response is a Server-Sent Events stream:

| Event | Payload | Description |
|---|---|---|
| `message_created` | `{ userMessage, conversationId }` | User message saved to DB |
| `status` | `{ text }` | Processing status (e.g. "Processing attachments...") |
| `delta` | `{ text }` | Streamed text chunk from Llama 3 |
| `done` | `{ aiMessage, conversationId }` | AI message complete and saved |
| `error` | `{ message }` | Something went wrong |

---

## Database Schema

### Conversation

```js
{
  _id:           ObjectId,
  title:         String,          // auto-set from first message
  userId:        String,          // default: 'anonymous'
  messageCount:  Number,
  lastMessageAt: Date,
  isArchived:    Boolean,
  createdAt:     Date,
  updatedAt:     Date
}
```

Indexes: `{ userId, createdAt }`, `{ lastMessageAt }`

### Message

```js
{
  _id:            ObjectId,
  conversationId: ObjectId,       // ref: Conversation
  role:           'user' | 'assistant' | 'system',
  content:        String,
  attachments: [{
    originalName: String,
    filename:     String,         // UUID-based saved filename
    mimetype:     String,
    size:         Number,
    url:          String          // e.g. /uploads/abc123.pdf
  }],
  tokens: {
    input:  Number,
    output: Number
  },
  model:    String,               // e.g. 'llama3'
  isError:  Boolean,
  metadata: Map,                  // e.g. imageUrl for generated images
  createdAt: Date,
  updatedAt: Date
}
```

Index: `{ conversationId, createdAt }`

---

## Features

### Chat
- Real-time token streaming via SSE
- Full conversation history (last 40 messages sent as context)
- Redis cache for fast context retrieval, MongoDB as persistent fallback
- Markdown rendering with syntax highlighting for code blocks

### File Understanding
Uploaded files are converted to text and injected into the Llama 3 prompt:

| Format | Library | Output |
|---|---|---|
| PDF | pdf-parse | Extracted text |
| DOCX / DOC | mammoth | Markdown |
| XLSX / XLS | SheetJS | Markdown table |
| CSV | built-in parser | Markdown table |
| TXT, MD, JSON, XML | fs.readFile | Raw text |
| Images (with text) | Tesseract.js OCR | Extracted text |

### Image Vision
When an image is uploaded, the system tries:
1. **LLaVA** (Ollama) — full image understanding, describes content
2. **Tesseract.js** — OCR fallback if LLaVA not installed

### Image Generation
Triggered by keywords: `generate image`, `create image`, `draw`, `tạo ảnh`, `vẽ`

| Provider | Setup | Quality |
|---|---|---|
| Pollinations.ai | None — works out of the box | Good |
| Stable Diffusion | Install AUTOMATIC1111 or ComfyUI locally | High |

Auto-detects SD if running at `localhost:7860`, otherwise uses Pollinations.

### Message Actions (hover to reveal)
- **Copy** — copies message content to clipboard
- **Edit** (user messages) — inline edit and resend
- **Export** (AI messages) — download as `.txt`, `.md`, or `.docx`
- **Code blocks** — individual download button per code block with correct file extension

### Conversation Management
- Create, rename, delete conversations
- Collapsible sidebar with conversation history
- Auto-titles conversation from first message

---