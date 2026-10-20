import { BadRequestException } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function videoDuration(input: string): Promise<number> {
  const output = await new Promise<string>((resolve, reject) => {
    const process = spawn(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        input,
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    );
    let result = '';
    const timer = setTimeout(() => {
      process.kill('SIGKILL');
      reject(new BadRequestException('Video inspection timed out.'));
    }, 10000);
    process.stdout.on('data', (data: Buffer) => {
      result += data.toString('utf8').slice(0, 100);
    });
    process.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    process.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(result);
      else reject(new BadRequestException('This video could not be inspected.'));
    });
  });
  const seconds = Number(output.trim());
  if (!Number.isFinite(seconds) || seconds <= 0)
    throw new BadRequestException('Video duration could not be determined.');
  return seconds;
}

export async function normalizeVideo(
  contents: Buffer,
  maximumSeconds: number,
  maximumBytes: number,
): Promise<Buffer> {
  const directory = await mkdtemp(join(tmpdir(), 'newton-video-'));
  try {
    const input = join(directory, 'input');
    const output = join(directory, 'output.mp4');
    await writeFile(input, contents);
    const duration = await videoDuration(input);
    if (duration > maximumSeconds)
      throw new BadRequestException(`Videos must be ${maximumSeconds} seconds or shorter.`);
    await new Promise<void>((resolve, reject) => {
      const process = spawn(
        'ffmpeg',
        [
          '-nostdin',
          '-v',
          'error',
          '-i',
          input,
          '-map',
          '0:v:0',
          '-map',
          '0:a:0?',
          '-map_metadata',
          '-1',
          '-map_chapters',
          '-1',
          '-vf',
          'scale=w=min(1280\\,iw):h=min(1280\\,ih):force_original_aspect_ratio=decrease:force_divisible_by=2',
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '26',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-movflags',
          '+faststart',
          output,
        ],
        { stdio: 'ignore' },
      );
      const timer = setTimeout(() => {
        process.kill('SIGKILL');
        reject(new BadRequestException('Video processing timed out. Try a smaller clip.'));
      }, 90000);
      process.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      process.on('exit', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new BadRequestException('This video could not be processed.'));
      });
    });
    const normalized = await readFile(output);
    if (normalized.length > maximumBytes)
      throw new BadRequestException(
        'Processed video exceeds the upload limit. Try a smaller clip.',
      );
    return normalized;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
