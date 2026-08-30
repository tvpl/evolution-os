#!/usr/bin/env bash
# dev-db.sh — ciclo de vida do PostgreSQL 16 local do EvolutionOS (AD-005).
#
# Uso: scripts/dev-db.sh start|stop|status|reset|url
#
# Cria um cluster dedicado (fora de qualquer systemd/service), escutando só em
# 127.0.0.1:${EVOOS_PG_PORT:-55432} com auth trust — exclusivamente para
# desenvolvimento e testes. Idempotente: `start` num cluster já ativo apenas
# imprime a DATABASE_URL.
set -euo pipefail

PGBIN=/usr/lib/postgresql/16/bin
DATA_ROOT=${EVOOS_PG_DIR:-/var/lib/postgresql/evolution-os-dev}
DATA="$DATA_ROOT/data"
PORT=${EVOOS_PG_PORT:-55432}
DB=evolution
PGUSER=evo
URL="postgresql://${PGUSER}@127.0.0.1:${PORT}/${DB}"

[ -x "$PGBIN/pg_ctl" ] || { echo "erro: PostgreSQL 16 não encontrado em $PGBIN" >&2; exit 2; }

# Postgres recusa rodar como root; em containers root, delega ao usuário postgres.
if [ "$(id -u)" = "0" ] && id postgres >/dev/null 2>&1; then
  as_pg() { su -s /bin/bash postgres -c "$*"; }
else
  as_pg() { bash -c "$*"; }
fi

running() { as_pg "$PGBIN/pg_ctl -D '$DATA' status" >/dev/null 2>&1; }

ensure_init() {
  if ! as_pg "test -f '$DATA/PG_VERSION'"; then
    as_pg "mkdir -p '$DATA_ROOT'"
    as_pg "$PGBIN/initdb -D '$DATA' -U $PGUSER --auth=trust" >/dev/null
    as_pg "cat >> '$DATA/postgresql.conf'" <<CONF
port = $PORT
listen_addresses = '127.0.0.1'
unix_socket_directories = ''
CONF
  fi
}

wait_ready() {
  for _ in $(seq 1 50); do
    if "$PGBIN/pg_isready" -h 127.0.0.1 -p "$PORT" >/dev/null 2>&1; then return 0; fi
    sleep 0.2
  done
  echo "erro: postgres não respondeu em 127.0.0.1:$PORT" >&2
  as_pg "tail -20 '$DATA_ROOT/pg.log'" >&2 || true
  return 1
}

ensure_db() {
  local exists
  exists=$("$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U "$PGUSER" -d postgres -tAc \
    "select 1 from pg_database where datname = '$DB'")
  if [ "$exists" != "1" ]; then
    "$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U "$PGUSER" -d postgres -qc "create database $DB" >/dev/null
  fi
}

case "${1:-}" in
  start)
    ensure_init
    if ! running; then
      as_pg "$PGBIN/pg_ctl -D '$DATA' -l '$DATA_ROOT/pg.log' start" >/dev/null
    fi
    wait_ready
    ensure_db
    echo "DATABASE_URL=$URL"
    ;;
  stop)
    if running; then
      as_pg "$PGBIN/pg_ctl -D '$DATA' stop -m fast" >/dev/null
      echo "stopped"
    else
      echo "already stopped"
    fi
    ;;
  status)
    if running; then echo "running ($URL)"; else echo "stopped"; exit 1; fi
    ;;
  reset)
    "$0" stop >/dev/null 2>&1 || true
    as_pg "rm -rf '$DATA_ROOT'"
    "$0" start
    ;;
  url)
    echo "$URL"
    ;;
  *)
    echo "uso: $0 start|stop|status|reset|url" >&2
    exit 2
    ;;
esac
