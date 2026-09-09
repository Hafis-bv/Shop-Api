import { IsEnum } from 'class-validator';
import { Role } from '../../generated/prisma/enums';

export class SetRoleDto {
  @IsEnum(Role)
  role!: Role;
}
