import { Body, Controller, Delete, Get, Inject, Param, Put, Query, Req } from '@nestjs/common';
import { MembersService } from './members.service';
import type { AuthenticatedRequest } from '../auth/auth.service';
import { parseId } from '../http/validation';
import { pageOptions } from '../http/pagination';

@Controller('api')
export class MembersController {
  constructor(@Inject(MembersService) private readonly members: MembersService) {}

  @Get('members')
  list(@Query() query: unknown) {
    const options = pageOptions(query);
    return this.members.list(
      options.limit,
      options.cursor ? parseId(options.cursor) : undefined,
      options.sort,
    );
  }

  @Get('members/:id')
  one(@Param('id') id: string) {
    return this.members.one(parseId(id));
  }

  @Put('me')
  update(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.members.update(request.memberSession!.memberId, body);
  }

  @Delete('me')
  delete(@Req() request: AuthenticatedRequest) {
    return this.members.delete(request.memberSession!.memberId);
  }
}
