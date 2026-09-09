import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  @Length(3, 150)
  @Transform(({ value }) => (typeof value == 'string' ? value.trim() : value))
  name!: string;

  @IsOptional()
  @IsString()
  @Length(10, 6000)
  description?: string;

  @Type(() => Number)
  @IsInt()
  priceCents!: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock?: number;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  image?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
