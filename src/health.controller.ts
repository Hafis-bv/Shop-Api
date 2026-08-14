import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { Public } from './common/decorators/public.decorator';
import { PrismaService } from './prisma/prisma.service';
import { SkipTransform } from './common/decorators/skip-transform.decorator';

@Controller({
  path: 'health',
  version: VERSION_NEUTRAL,
})
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}
  @Public()
  @Get()
  @SkipTransform()
  async check() {
    let database = 'up';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'down';
    }

    return { status: database === 'up' ? 'ok' : 'degraded', database };
  }
}
