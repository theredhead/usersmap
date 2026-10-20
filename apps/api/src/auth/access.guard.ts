import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService, AuthenticatedRequest } from './auth.service';
import { Configuration } from '../configuration';

export const Public = () => SetMetadata('public', true);

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(Configuration) private readonly configuration: Configuration,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>('public', [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const session = await this.auth.session(request);
    if (!session) throw new UnauthorizedException('Sign in with Discord to view this group.');
    request.memberSession = session;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      if (
        request.get('origin') !== new URL(this.configuration.values.PUBLIC_URL).origin ||
        request.get('x-csrf-token') !== session.csrfToken
      ) {
        throw new ForbiddenException('The request could not be verified. Refresh and try again.');
      }
    }
    return true;
  }
}
