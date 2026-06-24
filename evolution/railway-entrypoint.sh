#!/usr/bin/env sh
set -eu

# Railway injects PORT. Evolution reads SERVER_PORT, so make the mapping
# explicit even if the Railway variable reference was not configured.
if [ -n "${PORT:-}" ] && [ -z "${SERVER_PORT:-}" ]; then
  export SERVER_PORT="$PORT"
fi

# The Evolution runtime uses DATABASE_CONNECTION_URI, while the Prisma
# migration script executed by the official image expects DATABASE_URL.
# Keep both populated from either one so Railway Postgres works reliably.
if [ -n "${DATABASE_CONNECTION_URI:-}" ] && [ -z "${DATABASE_URL:-}" ]; then
  export DATABASE_URL="$DATABASE_CONNECTION_URI"
fi

if [ -n "${DATABASE_URL:-}" ] && [ -z "${DATABASE_CONNECTION_URI:-}" ]; then
  export DATABASE_CONNECTION_URI="$DATABASE_URL"
fi

# Run the DB migration/generate step, then hand the process directly to node
# via `exec` so node becomes PID 1 and receives SIGTERM directly on the next
# deploy. Going through `npm run start:prod` makes npm forward SIGTERM but exit
# non-zero ("signal SIGTERM"), which Railway reports as a crash.
exec /bin/bash -c '. ./Docker/scripts/deploy_database.sh && exec node dist/main'
