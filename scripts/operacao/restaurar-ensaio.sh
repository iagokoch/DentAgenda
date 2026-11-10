#!/usr/bin/env bash
set -euo pipefail
umask 077

arquivo="${1:?Informe o arquivo .dump}"
destino="${2:?Informe um banco novo terminado em _restore_test}"
[[ "$destino" =~ ^[a-zA-Z_][a-zA-Z0-9_]*_restore_test$ && ${#destino} -le 63 ]] || {
  echo 'Destino de restauração fora do escopo isolado.' >&2; exit 1;
}
[[ -f "$arquivo" && -f "$arquivo.sha256" ]] || { echo 'Dump ou checksum ausente.' >&2; exit 1; }
read -r esperado nome_registrado < "$arquivo.sha256"
[[ "$esperado" =~ ^[a-f0-9]{64}$ ]] || { echo 'Checksum inválido.' >&2; exit 1; }
atual="$(sha256sum -- "$arquivo")"
[[ "${atual%% *}" == "$esperado" ]] || { echo 'Checksum não confere.' >&2; exit 1; }
pg_restore --list "$arquivo" >/dev/null
inicio="$SECONDS"

# createdb recusa destino existente. Não há DROP, --clean nem sobrescrita de banco.
createdb --no-password --maintenance-db=postgres -- "$destino"
pg_restore --no-password --exit-on-error --single-transaction --no-owner --no-privileges \
  --dbname="$destino" "$arquivo"
psql --no-password --no-psqlrc --set=ON_ERROR_STOP=1 --dbname="$destino" --tuples-only --no-align \
  --command="SELECT json_build_object('pacientes', (SELECT count(*) FROM \"Cliente\"), 'consultas', (SELECT count(*) FROM \"Consulta\"), 'historico', (SELECT count(*) FROM \"HistoricoObservacao\"));"
printf 'Ensaio restaurado em %s; duração: %s segundos. Falta validar os fluxos da aplicação.\n' \
  "$destino" "$((SECONDS - inicio))"
