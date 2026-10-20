import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool, PoolClient, QueryResultRow } from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Configuration } from '../configuration';

@Injectable()
export class Database implements OnModuleInit, OnModuleDestroy {
  readonly pool: Pool;

  constructor(@Inject(Configuration) configuration: Configuration) {
    this.pool = new Pool({ connectionString: configuration.values.DATABASE_URL, max: 10 });
  }

  async onModuleInit(): Promise<void> {
    await this.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(782194)');
      await client.query('CREATE TABLE IF NOT EXISTS migrations (name text PRIMARY KEY)');
      const directory = resolve('apps/api/src/database/migrations');
      for (const name of readdirSync(directory)
        .filter((name) => name.endsWith('.sql'))
        .sort()) {
        const applied = await client.query('SELECT name FROM migrations WHERE name = $1', [name]);
        if (applied.rowCount) continue;
        await client.query(readFileSync(resolve(directory, name), 'utf8'));
        await client.query('INSERT INTO migrations(name) VALUES ($1)', [name]);
      }
    });
  }

  async query<T extends QueryResultRow>(sql: string, parameters: unknown[] = []): Promise<T[]> {
    return (await this.pool.query<T>(sql, parameters)).rows;
  }

  async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
