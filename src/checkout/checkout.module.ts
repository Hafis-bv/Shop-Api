import { Module } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { CheckoutController } from './checkout.controller';
import { CartService } from '../cart/cart.service';
import { CartModule } from '../cart/cart.module';
import { StripeService } from './stripe.service';

@Module({
  controllers: [CheckoutController],
  providers: [CheckoutService, StripeService],
  imports: [CartModule],
})
export class CheckoutModule {}
