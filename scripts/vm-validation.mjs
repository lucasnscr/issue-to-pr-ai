export function validateVmApplication({ guest, profile, workspace, remote, engine, project }) {
  if (profile === 'catalog-java') {
    guest('sh', '-c', 'cd "$1" && ./mvnw -B -ntp verify > "$2/validation.log" 2>&1', 'sh', workspace, remote);
    guest('sh', '-c', 'cd "$1" && { docker compose -p "$3" up --build --wait && node "$4/scripts/smoke.mjs" && node "$4/scripts/category-acceptance.mjs" && node "$4/scripts/price-acceptance.mjs" && node "$4/scripts/ordering-acceptance.mjs"; } > "$2/http.log" 2>&1',
      'sh', workspace, remote, project, engine);
  } else if (profile === 'sentinela-typescript') {
    const database = 'sentinela-db-' + project;
    guest('docker', 'run', '-d', '--name', database, '-p', '127.0.0.1:55432:5432',
      '-e', 'POSTGRES_USER=sentinela', '-e', 'POSTGRES_PASSWORD=sentinela_test_only', '-e', 'POSTGRES_DB=sentinela',
      '--health-cmd', 'pg_isready -U sentinela -d sentinela', '--health-interval', '1s', '--health-retries', '30', 'pgvector/pgvector:pg17');
    guest('sh', '-c', 'for n in $(seq 1 30); do [ "$(docker inspect -f "{{.State.Health.Status}}" "$1")" = healthy ] && exit 0; sleep 1; done; exit 1', 'sh', database);
    guest('sh', '-c', 'cd "$1" && export DATABASE_URL=postgresql://sentinela:sentinela_test_only@127.0.0.1:55432/sentinela AI_MODE=rules AI_PROVIDER=none EMBEDDING_PROVIDER=none NEXT_TELEMETRY_DISABLED=1 && { npm ci --no-audit --no-fund && npm run check && npm test && npm run db:migrate && npm run test:integration && npm run build && npm run test:e2e:provider && npm run test:e2e:operations; } > "$2/validation.log" 2>&1',
      'sh', workspace, remote);
    guest('sh', '-c', 'cd "$1" && node --import tsx "$2/scripts/sentinela-acceptance.mjs"', 'sh', workspace, engine);
  } else throw new Error('Unknown independent validation profile.');
}

export function stopVmApplication({ guest, profile, workspace, project }) {
  if (profile === 'catalog-java') guest('sh', '-c', 'if [ -f "$1/compose.yml" ] || [ -f "$1/compose.yaml" ]; then cd "$1" && docker compose -p "$2" down -v; fi', 'sh', workspace, project);
  if (profile === 'sentinela-typescript') guest('docker', 'rm', '-f', '-v', 'sentinela-db-' + project);
}
