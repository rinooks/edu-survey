import { createClient } from '@libsql/client';

let client = null;

// Turso 클라이언트 싱글톤 (서버리스 인스턴스가 살아있는 동안 재사용)
export function getDb() {
  if (client) return client;
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error('TURSO_DATABASE_URL is not set');
  client = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN || undefined,
  });
  return client;
}
