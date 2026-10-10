import {
  BadRequestException,
  Controller,
  Headers,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { User } from '../generated/prisma/client';
import { SkipTransform } from '../common/decorators/skip-transform.decorator';
import { Public } from '../common/decorators/public.decorator';
import Stripe from 'stripe';
import { StripeService } from './stripe.service';

@Controller('checkout')
export class CheckoutController {
  private readonly logger = new Logger(CheckoutController.name);
  constructor(
    private readonly checkoutService: CheckoutService,
    private readonly stripeService: StripeService,
  ) {}

  @Post('session')
  createSession(@CurrentUser() user: User) {
    return this.checkoutService.createSession(user);
  }

  @Public()
  @SkipTransform()
  @Post('webhook')
  async handleWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ): Promise<{
    received: boolean;
  }> {
    if (!signature)
      throw new BadRequestException('Missing stripe signature header');

    if (!request.rawBody)
      throw new BadRequestException('Missing raw request body');

    let event: Stripe.Event;

    try {
      event = this.stripeService.constructEvent(request.rawBody, signature);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.warn(`Rejected stripe webhook: ${message}`);
      throw new BadRequestException('Webhook signature verification failed');
    }

    try {
      await this.checkoutService.handleEvent(event);
    } catch (err) {
      this.logger.error(
        `Failed to process stripe event ${event.id} ${event.type}`,
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }

    return {
      received: true,
    };
  }
}
