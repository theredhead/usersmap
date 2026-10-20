import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../auth/auth.service';
import { parseId, parseInput } from '../http/validation';
import { MediaService } from './media.service';
import { Configuration } from '../configuration';

@Controller('api/media')
export class MediaController {
  constructor(
    @Inject(MediaService) private readonly media: MediaService,
    @Inject(Configuration) private readonly configuration: Configuration,
  ) {}

  @Post(':purpose')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100_000_000, files: 1 } }))
  async upload(
    @Req() request: AuthenticatedRequest,
    @Param('purpose') purpose: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Choose a file to upload.');
    const max = this.configuration.values.MAXIMUM_UPLOAD_BYTES;
    if (file.size > max)
      throw new BadRequestException(`File exceeds the ${max} byte upload limit.`);
    return this.media.upload(
      request.memberSession!.memberId,
      parseInput(z.enum(['avatar', 'post']), purpose),
      file,
    );
  }

  @Get(':id')
  async get(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    const media = await this.media.one(parseId(id), request.memberSession!.memberId);
    const length = media.contents.length;
    response.set({
      'Content-Type': media.content_type,
      'Cache-Control': 'private, no-store',
      'Accept-Ranges': 'bytes',
    });
    const range = request.get('range');
    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      if (!match) return response.status(416).set('Content-Range', `bytes */${length}`).end();
      const start = Number(match[1]);
      const end = match[2] ? Math.min(Number(match[2]), length - 1) : length - 1;
      if (start > end || start >= length)
        return response.status(416).set('Content-Range', `bytes */${length}`).end();
      return response
        .status(206)
        .set({
          'Content-Range': `bytes ${start}-${end}/${length}`,
          'Content-Length': String(end - start + 1),
        })
        .end(media.contents.subarray(start, end + 1));
    }
    return response.set('Content-Length', String(length)).end(media.contents);
  }

  @Delete(':id')
  delete(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.media.delete(parseId(id), request.memberSession!.memberId);
  }
}
