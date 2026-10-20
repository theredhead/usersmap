import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, static as serveStatic } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppModule } from './app.module';
import { Configuration } from './configuration';

async function bootstrap(): Promise<void> {
  const application = await NestFactory.create(AppModule, { bodyParser: false });
  const configuration = application.get(Configuration);
  application.enableShutdownHooks();
  application.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:', 'blob:', 'https:'],
          'media-src': ["'self'", 'blob:'],
          'connect-src': ["'self'"],
          'frame-src': ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  application.use(cookieParser());
  application.use(json({ limit: '100kb' }));
  application.use(
    '/api',
    (
      _request: unknown,
      response: { setHeader(name: string, value: string): void },
      next: () => void,
    ) => {
      response.setHeader('Cache-Control', 'no-store');
      next();
    },
  );
  const frontend = resolve('dist/web/browser');
  if (existsSync(frontend)) {
    application.use(serveStatic(frontend, { index: false }));
    application
      .getHttpAdapter()
      .getInstance()
      .get(
        /^\/(?!api(?:\/|$)|.*\.[^/]+$).*/,
        (_request: unknown, response: { sendFile(path: string): void }) => {
          response.sendFile(resolve(frontend, 'index.html'));
        },
      );
  }
  await application.listen(configuration.values.PORT, '0.0.0.0');
}

void bootstrap().catch((error: unknown) => {
  new Logger('Bootstrap').error(
    error instanceof Error ? error.message : 'Application startup failed.',
  );
  process.exitCode = 1;
});
