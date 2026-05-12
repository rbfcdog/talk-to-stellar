#!/usr/bin/env bash

wait_for_evolution() {
  local base_url="$1"
  local attempts="${2:-45}"
  local delay="${3:-2}"

  echo "Waiting for Evolution API at $base_url ..."
  for attempt in $(seq 1 "$attempts"); do
    if curl -fsS --max-time 5 "$base_url/" >/dev/null 2>&1; then
      echo "Evolution API is ready."
      return 0
    fi
    if [ "$attempt" -eq "$attempts" ]; then
      echo "Evolution API did not become ready at $base_url after $attempts attempts." >&2
      echo "Check logs with: docker compose logs --tail=120 evolution-api" >&2
      return 1
    fi
    sleep "$delay"
  done
}

request_with_retry() {
  local attempts="$1"
  local delay="$2"
  shift 2

  local output=""
  for attempt in $(seq 1 "$attempts"); do
    if output="$("$@" 2>&1)"; then
      printf '%s' "$output"
      return 0
    fi
    if [ "$attempt" -eq "$attempts" ]; then
      printf '%s\n' "$output" >&2
      return 1
    fi
    echo "Request failed, retrying in ${delay}s... ($attempt/$attempts)" >&2
    sleep "$delay"
  done
}
