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

exec /bin/bash -c '. ./Docker/scripts/deploy_database.sh && npm run start:prod'
