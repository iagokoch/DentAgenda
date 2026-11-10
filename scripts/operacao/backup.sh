#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${PGDATABASE:?Defina PGDATABASE e a conexão PostgreSQL por ambiente}"
[[ "$PGDATABASE" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]] || { echo 'PGDATABASE deve ser somente o nome do banco.' >&2; exit 1; }
base="${1:?Informe o diretório exclusivo de backups}"
mkdir -p -- "$base"
diretorio="$(mktemp -d "$base/dentagenda-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")"
temporario="$diretorio/banco.dump.incompleto"
arquivo="$diretorio/banco.dump"
inicio="$SECONDS"

# O arquivo é criado pelo pg_dump, sem redirecionamento binário pelo shell do host.
pg_dump --no-password --format=custom --file="$temporario" --dbname="$PGDATABASE"
pg_restore --list "$temporario" >/dev/null
mv -- "$temporario" "$arquivo"
sha256sum -- "$arquivo" > "$arquivo.sha256"
printf '{"duracaoSegundos":%s,"formato":"pg_dump custom","restauracaoVerificada":false}\n' \
  "$((SECONDS - inicio))" > "$diretorio/manifesto.json"
printf '%s\n' "$arquivo"
