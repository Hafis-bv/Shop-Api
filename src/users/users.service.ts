import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../generated/prisma/enums';

const PUBLIC_FIELDS = {
  id: true,
  email: true,
  name: true,
  role: true,
  createdAt: true,
};

@Injectable()
export class UsersService {
  constructor(private readonly prismaService: PrismaService) {}
  async findMe(userId: string) {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: PUBLIC_FIELDS,
    });

    if (!user) throw new NotFoundException('User not found');

    return user;
  }

  async findAll() {
    return this.prismaService.user.findMany({
      select: PUBLIC_FIELDS,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async setRole(actorId: string, targetId: string, role: Role) {
    if (actorId == targetId)
      throw new BadRequestException('You can not change your own role');
    const target = await this.prismaService.user.findUnique({
      where: { id: targetId },
      select: { id: true },
    });

    if (!target) throw new NotFoundException(`User ${targetId} not found`);

    return this.prismaService.user.update({
      where: { id: targetId },
      data: { role },
      select: PUBLIC_FIELDS,
    });
  }
}
