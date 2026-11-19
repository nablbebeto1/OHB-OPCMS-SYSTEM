#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/ohb-opcms}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
UPLOAD_DIR="${UPLOAD_DIR:-/var/lib/ohb-opcms/uploads}"
PG_DB="${POSTGRES_DB:-ohb_opcms}"
PG_USER="${POSTGRES_USER:-opcms_user}"

mkdir -p "$BACKUP_DIR"

echo "[1/2] Backing up PostgreSQL database $PG_DB..."
pg_dump -U "$PG_USER" -h 127.0.0.1 -Fc "$PG_DB" > "$BACKUP_DIR/db_${TIMESTAMP}.dump"

echo "[2/2] Archiving uploaded Excel/CSV source files..."
if [ -d "$UPLOAD_DIR" ]; then
  tar -czf "$BACKUP_DIR/uploads_${TIMESTAMP}.tar.gz" -C "$UPLOAD_DIR" .
fi

echo "Backup complete: $BACKUP_DIR/db_${TIMESTAMP}.dump"
