import { Controller, Get, Inject } from '@nestjs/common';
import { Configuration } from './configuration';
import { Database } from './database/database.service';
import { Public } from './auth/access.guard';

@Controller('api')
export class AppController {
  constructor(
    @Inject(Configuration) private readonly configuration: Configuration,
    @Inject(Database) private readonly database: Database,
  ) {}

  @Public()
  @Get('configuration')
  configurationInfo() {
    return this.configuration.public;
  }

  @Public()
  @Get('health')
  async health() {
    await this.database.query('SELECT 1');
    return { status: 'ok' };
  }
}
