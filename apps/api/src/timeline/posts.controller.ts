import {
  Body,
  Controller,
  Get,
  Inject,
  MessageEvent,
  Post,
  Query,
  Req,
  Sse,
  UnauthorizedException,
} from '@nestjs/common';
import { concatMap, interval, map, merge, Observable, startWith } from 'rxjs';
import { AuthService, AuthenticatedRequest } from '../auth/auth.service';
import { pageOptions } from '../http/pagination';
import { PostsService } from './posts.service';
import { EventsService } from './events.service';

@Controller('api/posts')
export class PostsController {
  constructor(
    @Inject(PostsService) private readonly posts: PostsService,
    @Inject(EventsService) private readonly events: EventsService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Get()
  list(@Query() query: unknown) {
    const options = pageOptions(query);
    return this.posts.list(options.limit, options.cursor, options.sort);
  }

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.posts.create(request.memberSession!.memberId, body);
  }

  @Sse('events')
  eventsStream(@Req() request: AuthenticatedRequest): Observable<MessageEvent> {
    return merge(this.events.changes, interval(15000).pipe(map(() => 'heartbeat'))).pipe(
      startWith('connected'),
      concatMap(async (type) => {
        if (!(await this.auth.session(request)))
          throw new UnauthorizedException('Session expired.');
        return { data: { type } };
      }),
    );
  }
}
