import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { Subject } from 'rxjs';
import { Database } from '../database/database.service';

@Injectable()
export class EventsService implements OnModuleInit, OnModuleDestroy {
  readonly changes = new Subject<string>();
  private client?: PoolClient;
  private reconnect?: ReturnType<typeof setTimeout>;
  private closing = false;
  private readonly logger = new Logger(EventsService.name);

  constructor(@Inject(Database) private readonly database: Database) {}

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  private async connect(): Promise<void> {
    this.client = await this.database.pool.connect();
    this.client.on('notification', (event) => {
      if (event.payload === 'posts-changed' || event.payload === 'members-changed') {
        this.changes.next(event.payload);
      }
    });
    this.client.on('error', () => {
      this.logger.error('Live update connection failed; reconnecting.');
      this.client?.release(true);
      this.client = undefined;
      if (!this.closing) {
        this.reconnect = setTimeout(() => {
          void this.connect().catch(() => {
            this.logger.error('Live update reconnect failed; process must be restarted.');
            this.changes.error(new Error('Live updates unavailable.'));
          });
        }, 2000);
      }
    });
    await this.client.query('LISTEN newton_events');
    this.changes.next('posts-changed');
  }

  async onModuleDestroy(): Promise<void> {
    this.closing = true;
    clearTimeout(this.reconnect);
    this.changes.complete();
    if (this.client) {
      await this.client.query('UNLISTEN newton_events');
      this.client.release();
    }
  }
}
