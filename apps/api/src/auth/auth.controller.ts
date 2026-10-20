import { Controller, Get, Inject, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { Public } from './access.guard';
import { MembersService } from '../members/members.service';
import type { SessionInfo } from '../../../../shared/contracts';

@Controller('api/auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(MembersService) private readonly members: MembersService,
  ) {}

  @Public()
  @Get('session')
  async session(@Req() request: Request): Promise<SessionInfo> {
    const session = await this.auth.session(request);
    return {
      member: session ? await this.members.mine(session.memberId) : null,
      csrfToken: session?.csrfToken ?? null,
    };
  }

  @Public()
  @Get('discord')
  start(@Res() response: Response): Promise<void> {
    return this.auth.start(response);
  }

  @Public()
  @Get('discord/callback')
  finish(@Req() request: Request, @Res() response: Response): Promise<void> {
    return this.auth.finish(request, response);
  }

  @Post('logout')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(request, response);
  }
}
