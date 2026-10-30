#!/bin/sh
# Sourced only by the API development command, after loading the local .env.
# Production startup does not source this file.
if [ "${NODE_ENV:-development}" != "development" ]; then
  echo "Refusing to configure the Replit development database outside development." >&2
  return 1
fi

if [ -n "${REPL_ID:-}" ]; then
  : "${PGHOST:?Replit development database host is unavailable}"
  : "${PGPORT:?Replit development database port is unavailable}"
  : "${PGDATABASE:?Replit development database name is unavailable}"

  export DATABASE_URL="postgresql://campus_app:campus_app@${PGHOST}:${PGPORT}/${PGDATABASE}"
  export MIGRATOR_DATABASE_URL="postgresql://campus_migrator:migrator_dev_only@${PGHOST}:${PGPORT}/${PGDATABASE}"
fi
