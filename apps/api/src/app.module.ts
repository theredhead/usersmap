import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Configuration } from './configuration';
import { Database } from './database/database.service';
import { AuthService } from './auth/auth.service';
import { AccessGuard } from './auth/access.guard';
import { AuthController } from './auth/auth.controller';
import { MembersService } from './members/members.service';
import { MembersController } from './members/members.controller';
import { LocationsController } from './locations/locations.controller';
import { PostsService } from './timeline/posts.service';
import { PostsController } from './timeline/posts.controller';
import { EventsService } from './timeline/events.service';
import { MediaService } from './media/media.service';
import { MediaController } from './media/media.controller';
import { AppController } from './app.controller';

@Module({
  controllers: [
    AppController,
    AuthController,
    MembersController,
    LocationsController,
    PostsController,
    MediaController,
  ],
  providers: [
    Configuration,
    Database,
    AuthService,
    MembersService,
    PostsService,
    EventsService,
    MediaService,
    { provide: APP_GUARD, useClass: AccessGuard },
  ],
})
export class AppModule {}
