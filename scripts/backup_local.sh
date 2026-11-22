#!/usr/bin/env bash
# Backup manual verificado (mesmos passos do workflow). Requer pg_dump/psql/pg_restore 17 e Docker.
# Uso: SUPABASE_DB_URL="postgresql://..." BACKUP_PASSPHRASE="..." ./scripts/backup_local.sh
set -euo pipefail
: "${SUPABASE_DB_URL:?defina SUPABASE_DB_URL}"; : "${BACKUP_PASSPHRASE:?defina BACKUP_PASSPHRASE}"
STAMP=$(date -u +%Y%m%dT%H%M%SZ); D=backups/$STAMP; mkdir -p "$D"
pg_dump "$SUPABASE_DB_URL" --schema=public --no-owner --no-privileges -Fc -f "$D/public.dump"
psql "$SUPABASE_DB_URL" -c "\copy (select id, email, raw_user_meta_data from auth.users) to '$D/auth_users.csv' csv header"
psql "$SUPABASE_DB_URL" -At -f supabase/verificar_integridade.sql > "$D/verificacao_origem.txt"
docker run -d --rm --name tpe_restauracao -e POSTGRES_PASSWORD=teste -p 55432:5432 postgres:17 >/dev/null
trap 'docker stop tpe_restauracao >/dev/null' EXIT
until docker exec tpe_restauracao pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
R="postgresql://postgres:teste@localhost:55432/postgres"
psql "$R" -v ON_ERROR_STOP=1 -c "create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as \$\$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid \$\$;"
psql "$R" -c "\copy auth.users from '$D/auth_users.csv' csv header"
pg_restore -d "$R" --no-owner --no-privileges --exit-on-error "$D/public.dump"
psql "$R" -At -f supabase/verificar_integridade.sql > "$D/verificacao_restaurado.txt"
diff "$D/verificacao_origem.txt" "$D/verificacao_restaurado.txt" && ! grep -q '|f$' "$D/verificacao_restaurado.txt"
tar czf "$D.tgz" -C backups "$STAMP" && rm -rf "$D"
gpg --batch --yes --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" -c -o "$D.tgz.gpg" "$D.tgz" && rm "$D.tgz"
echo "Backup verificado: $D.tgz.gpg  sha256=$(sha256sum "$D.tgz.gpg" | cut -d' ' -f1)"
