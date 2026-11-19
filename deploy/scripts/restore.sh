#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <db_backup.dump> [uploads_backup.tar.gz]"
  exit 1
fi

DB_DUMP="$1"
UPLOADS_ARCHIVE="${2:-}"
PG_DB="${POSTGRES_DB:-ohb_opcms}"
PG_USER="${POSTGRES_USER:-opcms_user}"
UPLOAD_DIR="${UPLOAD_DIR:-/var/lib/ohb-opcms/uploads}"

echo "[1/2] Restoring PostgreSQL database $PG_DB from $DB_DUMP..."
pg_restore -U "$PG_USER" -h 127.0.0.1 -d "$PG_DB" --clean --if-exists "$DB_DUMP"

if [ -n "$UPLOADS_ARCHIVE" ] && [ -f "$UPLOADS_ARCHIVE" ]; then
  echo "[2/2] Restoring uploaded source files..."
  mkdir -p "$UPLOAD_DIR"
  tar -xzf "$UPLOADS_ARCHIVE" -C "$UPLOAD_DIR"
fi

echo "Restore completed successfully."
