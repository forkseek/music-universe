import { describe, expect, it } from 'vitest';
import { postgresOptions } from '@/db/connection';
describe('PostgreSQL deployment connection', () => {
  it('requires a real database instead of silently creating an ephemeral SQLite file', () => {
    for (const value of [undefined, ':memory:', './data/music.db', 'https://db.example.com/a', 'postgres://localhost/']) expect(() => postgresOptions(value)).toThrow();
  });
  it('enforces verified TLS remotely and bounds connections and wait times', () => {
    const options = postgresOptions('postgresql://fixture:NOT_A_REAL_PASSWORD@ep-example.neon.tech/neondb?sslmode=require&channel_binding=require');
    expect(options.ssl).toEqual({ rejectUnauthorized: true });
    expect(options.max).toBe(3); expect(options.connectionTimeoutMillis).toBe(15000);
    expect(new URL(options.connectionString!).searchParams.has('sslmode')).toBe(false);
    expect(new URL(options.connectionString!).searchParams.get('channel_binding')).toBe('require');
  });
  it('rejects unencrypted remote connections without including credentials in the error', () => {
    expect(() => postgresOptions('postgres://fixture:DO_NOT_EXPOSE@db.example.com/a?sslmode=disable')).toThrow('TLS');
    try { postgresOptions('postgres://fixture:DO_NOT_EXPOSE@db.example.com/a?sslmode=disable'); } catch (error) { expect(String(error)).not.toContain('DO_NOT_EXPOSE'); }
  });
  it('permits a loopback PostgreSQL server for isolated local tests', () => {
    expect(postgresOptions('postgres://localhost/test').ssl).toBe(false);
  });
  it('requires Neon direct connections so session migration locks remain valid', () => {
    expect(() => postgresOptions('postgres://fixture:FAKE@ep-example-pooler.neon.tech/neondb')).toThrow('Direct connection');
  });
});
