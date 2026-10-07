import { PartialType } from '@nestjs/mapped-types';
import { AddToCartDto } from './add-to-cart.dto';

export class UpdateCartDto extends PartialType(AddToCartDto) {}
