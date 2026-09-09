import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { Role } from '../generated/prisma/enums';
import { Roles } from '../common/decorators/roles.decorator';
import { SetRoleDto } from './dto/set-role.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}
  @Get('me')
  me(@CurrentUser('id') userId: string) {
    return this.usersService.findMe(userId);
  }

  @Get()
  @Roles(Role.Admin)
  findAll() {
    return this.usersService.findAll();
  }

  @Patch(':id/role')
  @Roles(Role.Admin)
  setRole(
    @CurrentUser('id') actorId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRoleDto,
  ) {
    return this.usersService.setRole(actorId, id, dto.role);
  }
}
