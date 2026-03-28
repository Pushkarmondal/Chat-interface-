# Architecture walkthrough script

**Target length:** ~2 minutes 30 seconds — not rushed, not a lecture.

**Diagrams (for your deck):**

| This script says | File in repo | What it shows |
|------------------|--------------|----------------|
| **Diagram A** (system) | `highleveldesign.png` | Client → LB → servers → Postgres, Redis, S3 |
| **Diagram B** (internals) | `chatinternals.png` | Gateway → services → DB / Redis / local rooms |

> *Note: `Readme.md` currently swaps the “Diagram A/B” captions vs filenames; when presenting, follow this script’s mapping or rename slides to match.*

---

## 1. Opening — **~10 sec**

> “This is a **horizontally scalable, real-time chat backend**: **WebSockets** for transport, **Redis Pub/Sub** so every node sees the same events, and **PostgreSQL** as the source of truth for messages and membership.”

*(Pause. One breath.)*

---

## 2. System overview — **~40 sec**  
*[Point at **Diagram A** — `highleveldesign.png`]*

> “At a high level: the **client** hits a **load balancer** and lands on one of several **stateless WebSocket servers** — any node can serve any connection; we don’t rely on sticky sessions for correctness.”

> “**Messages are written to Postgres** first — that’s durability and ordering for history.”

> “**Redis** is the **cross-node fan-out** layer: one publish per chat channel, every server subscribes, then each node pushes only to its own connected clients.”

> “**Media** doesn’t go over the socket: the client gets a **pre-signed URL**, uploads **straight to S3**, and the chat message only carries the **final URL** — so we don’t melt the WS tier on large files.”

---

## 3. Message flow — **~60 sec**  
*[Point at **Diagram B** — `chatinternals.png`]*

> “On **one server**, a message comes in over **WebSockets** as JSON.”

> “The **gateway** is intentionally thin: it **authenticates** — JWT on connect — **parses** the frame, and hands off to a **command layer**.”

> “**CommandService** routes to **MessageService**. There we **enforce roles** — Admin, Write, Read — **validate** the payload, then **persist** to Postgres.”

> “**After** a successful commit, we **publish** to Redis on `chat:<chatId>`.”

> “**Every** node, including this one, has a **subscriber**: it receives that payload, looks up **local** sockets that have **joined** that chat in the **SessionRegistry**, and **broadcasts** the outbound event.”

> “The sender also gets a **delivery ACK** on their own connection so the client knows the server accepted the message.”

---

## 4. Tradeoffs + failures — **~30 sec**  
*[Optional: gesture back to Diagram A for “many nodes,” Diagram B for “one node fallback”]*

> “We chose **Redis Pub/Sub** for **low latency** and **simple ops**. The tradeoff is it’s **at-most-once** over the bus — we don’t pretend it’s a durable log.”

> “If **publish fails after** we’ve already committed to Postgres, we **degrade gracefully**: **fan out only on this node** to rooms that joined here, log the incident, and rely on **Redis recovery** plus eventual **HTTP catch-up** for a full production story.”

> “**Stateless app nodes** plus **Redis fan-out** means **horizontal scale** is mostly: add more servers behind the load balancer and the same pattern holds.”

---

## 5. Close — **~10 sec**

> “So the design **prioritizes low latency and horizontal scale**, keeps **Postgres** as the **system of record**, and stays **operationally simple** — Redis and S3 do the heavy lifting for fan-out and files.”

> “Happy to go deeper on **idempotency**, **roles**, or **typing/presence** if useful.”

---

## Presenter cheatsheet (one screen)

| When | Sec | Do |
|------|-----|-----|
| Open | 10 | WS + Redis + Postgres one-liner |
| **Diagram A** | 40 | LB, stateless, PG, Redis, S3 pre-sign |
| **Diagram B** | 60 | Gateway → command → persist → Redis → subscribe → registry → clients |
| Tradeoffs | 30 | at-most-once, local fallback, scale |
| Close | 10 | Latency + scale + simple ops |

**Total ~150 s (~2:30).**

---

## What this signals (for you)

When delivered calmly and on time, it reads as: *clear system thinking, honest about tradeoffs, good to work with on a team.*
