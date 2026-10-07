import { Type } from 'class-transformer';
import { IsInt, IsUUID, Max, Min } from 'class-validator';

export class AddToCartDto {
  @IsUUID('4', { message: 'Product id must be a valid product id' })
  productId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Quantity must be at least one' })
  @Max(100, { message: 'Quantity must not exceed 100 per item' })
  quantity!: number;
}
