# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## About This Project

`@drumee/server-core` is the foundational middleware library for Drumee backend services. It handles HTTP request/response lifecycle, session management, authentication/authorization (ACL), and media file operations. Other Drumee services depend on this library.

## Commands

```bash
# Install dependencies
npm install

# Run all tests (modules, ACL, database — runs sequentially)
npm test

# Run individual test suites
npm run test:modules   # requires /etc/drumee/drumee.sh sourced first
npm run test:acl
npm run test:db

# Publish a new version
npm run release        # git push + npm publish + version bump
```

Tests require a configured Drumee environment (`/etc/drumee/drumee.sh`) with live MariaDB and Redis connections.

## Architecture

The library processes incoming HTTP requests through a pipeline of composable classes, each extending `Logger` from `@drumee/server-essentials`:

```
HTTP Request
    │
    ▼
Input (lib/input.js)          — parses URL, headers, cookies, multipart uploads; routes to service
    │
    ▼
Session (lib/session.js)      — initializes/validates session, loads user context
    │
    ▼
Acl (lib/acl.js)              — checks permissions; emits GRANTED or DENIED
    │
    ▼
Entity (lib/entity.js)        — service execution, async notifications via Redis/websockets
    │
    ▼
Output (lib/output.js)        — serializes and sends HTTP response
```

Supporting modules:
- **`Data`** (`lib/data.js`) — parses JSON request bodies
- **`User`** (`lib/user.js`) — user profile and locale resolution
- **`Mfs`** (`lib/mfs.js`) — meta-filesystem abstraction (virtual directory tree over MariaDB)
- **`FileIo`** (`lib/file-io.js`) — physical file operations (read/write/delete/move)
- **`Exception`** (`lib/exception.js`) — unified error responses (server/user/email errors)
- **`RuntimeEnv`** (`lib/runtimeEnv.js`) — UI app config, chunkhash manifest loading, locale assets
- **`Page`** (`lib/page.js`) — server-side template rendering with runtime context
- **`Generator`** (`lib/utils/generator.js`) — media conversion, thumbnail generation (spawns child processes)
- **`Document`** (`lib/utils/document.js`) — document indexing and preview creation

All classes are exported from `lib/index.js`.

## Key Patterns

**Event-driven flow:** Classes communicate via inherited EventEmitter methods (`.trigger()`, `.on()`, `.once()`). Key events: `INPUT_READY`, `GRANTED`, `DENIED`, `ERROR`, `SENT`. Constants and event names come from `@drumee/server-essentials`.

**Service naming:** Services are identified as `module.method` strings (e.g., `yp.get_env`, `media.copy`). ACL resolves permissions against these identifiers.

**Double-underscore internals:** Internal/private class names use `__className` convention (e.g., `__acl`, `__data`). The exported names drop the prefix.

**Long-running tasks:** Document indexing, email delivery, and media conversion are offloaded to child processes via `shelljs` or Node's `spawn`, not awaited inline.

**Dependencies:** `@drumee/server-essentials` provides the `Logger` base class, `Mariadb`, `RedisStore`, `Cache`, shared constants (`Attr`, `Events`), and lodash utilities. Changes to essentials directly affect this library.
