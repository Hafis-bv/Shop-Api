import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
} from '@nestjs/common';
import { CartService } from './cart.service';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { UpdateCartDto } from './dto/update-cart.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Post('add')
  addItem(@CurrentUser('id') id: string, @Body() addToCartDto: AddToCartDto) {
    return this.cartService.addItem(id, addToCartDto);
  }

  @Get()
  getCart(@CurrentUser('id') id: string) {
    return this.cartService.getCart(id);
  }

  @Patch('update')
  updateItem(
    @CurrentUser('id') id: string,
    @Body() updateCartDto: UpdateCartDto,
  ) {
    return this.cartService.updateItem(id, updateCartDto);
  }

  @Delete('delete/:productId')
  removeItem(
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentUser('id') id: string,
  ) {
    return this.cartService.removeItem(id, productId);
  }

  @Delete('clear')
  clearCart(@CurrentUser('id') id: string) {
    return this.cartService.clearCart(id);
  }
}
