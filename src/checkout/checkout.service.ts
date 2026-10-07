import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus, User } from '../generated/prisma/client';
import { CartService } from '../cart/cart.service';
import { StripeService } from './stripe.service';
import Stripe from 'stripe';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);
  constructor(
    private readonly prismaService: PrismaService,
    private readonly cartService: CartService,
    private readonly stripeService: StripeService,
    private readonly configService: ConfigService,
  ) {}

  async createSession(user: User) {
    const cart = await this.cartService.loadCart(user.id);

    if (cart.items.length === 0)
      throw new BadRequestException('Your cart is empty');

    const currencies = new Set(cart.items.map((item) => item.product.currency));

    if (currencies.size > 1)
      throw new BadRequestException('All items must be the same currency');

    for (const i of cart.items) {
      if (!i.product.isActive)
        throw new BadRequestException('Product is not available');

      if (i.product.stock < i.quantity)
        throw new BadRequestException(
          `Only ${i.product.stock} unit(s) of "${i.product.name}" are in stock`,
        );
    }

    const totalCents = cart.items.reduce(
      (acc, curr) => acc + curr.quantity * curr.product.priceCents,
      0,
    );

    const currency = cart.items[0].product.currency;

    const order = await this.prismaService.order.create({
      data: {
        userId: user.id,
        status: OrderStatus.Pending,
        totalCents,
        currency,
        items: {
          create: cart.items.map((item) => ({
            productId: item.productId,
            name: item.product.name,
            unitPriceCents: item.product.priceCents,
            quantity: item.quantity,
          })),
        },
      },
    });

    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] =
      cart.items.map((item) => ({
        quantity: item.quantity,
        price_data: {
          currency,
          unit_amount: item.product.priceCents,
          product_data: {
            name: item.product.name,
            ...(item.product.description
              ? { description: item.product.description.slice(0, 500) }
              : {}),
            ...(item.product.image ? { images: [item.product.image] } : {}),
          },
        },
      }));

    try {
      const session = await this.stripeService.client.checkout.sessions.create(
        {
          mode: 'payment',
          line_items,
          client_reference_id: order.id,
          customer_email: user.email,
          metadata: {
            userId: user.id,
            orderId: order.id,
          },

          success_url: this.configService.get<string>('STRIPE_SUCCESS_URL'),
          cancel_url: this.configService.get<string>('STRIPE_CANCEL_URL'),
          expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
        },
        {
          idempotencyKey: `order_${order.id}`,
        },
      );

      if (!session.url) throw new Error("Stripe didn't return a checkout url");

      await this.prismaService.order.update({
        where: { id: order.id },
        data: { stripeSessionId: session.id },
      });

      return {
        orderId: order.id,
        sessionId: session.id,
        checkoutUrl: session.url,
        totalCents,
        currency,
      };
    } catch (err) {
      console.log(err);
      await this.prismaService.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.Failed },
      });
      this.logger.error(
        `Failed to create stripe session for order:${order.id}`,
        err instanceof Error ? err.stack : String(err),
      );
      throw new BadRequestException('Could not start the checkout session');
    }
  }
}
