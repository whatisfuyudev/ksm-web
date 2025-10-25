# Notification Service (minimal)

Summary:
- Internal endpoint: POST /api/internal/notify (requires X-SERVICE-KEY header)
- User endpoints: GET /api/notifications, PATCH /api/notifications/:id/read (require auth token)

Quick start:
1. Copy `.env.example` to `.env` and set `SERVICE_KEY` (strong value) and `MONGODB_URI`.
2. Build with docker-compose: `docker-compose up --build`.
3. Integrate from your posts/comments/like handlers by calling the internal endpoint (see examples).
