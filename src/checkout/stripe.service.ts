import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeService implements OnModuleInit {
  private readonly logger = new Logger(StripeService.name);
  readonly client: Stripe;

  constructor(private readonly config: ConfigService) {
    this.client = new Stripe(
      this.config.getOrThrow<string>('STRIPE_SECRET_KEY'),
      {
        typescript: true,
        appInfo: { name: 'nest-shop-api', version: '1.0.0' },
      },
    );
  }

  onModuleInit(): void {
    const key = this.config.getOrThrow<string>('STRIPE_SECRET_KEY');
    if (key.startsWith('sk_live_')) {
      this.logger.warn('Stripe is running against LIVE keys');
    }
  }

  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    return this.client.webhooks.constructEvent(
      rawBody,
      signature,
      this.config.getOrThrow<string>('STRIPE_WEBHOOK_SECRET'),
    );
  }
}
