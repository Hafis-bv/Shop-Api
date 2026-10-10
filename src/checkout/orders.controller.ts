import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { OrderStatus, Role } from '../generated/prisma/enums';

@Controller('orders')
export class OrdersController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Get()
  findMyOrders(@CurrentUser('id') userId: string) {
    return this.checkoutService.findUserOrders(userId);
  }

  @Get('all')
  findAllOrders(@Query('status') status?: OrderStatus) {
    return this.checkoutService.findAllOrders(
      status && Object.values(OrderStatus).includes(status)
        ? status
        : undefined,
    );
  }

  @Get(':id')
  findOne(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.checkoutService.findUserOrder(userId, id);
  }
}
