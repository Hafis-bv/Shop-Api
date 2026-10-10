import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus, Prisma, User } from '../generated/prisma/client';
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

  async handleEvent(event: Stripe.Event) {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object;
        if (session.payment_status == 'paid') {
          await this.fullFilOrder(session);
        }
        break;
      }

      case 'checkout.session.expired':
      case 'checkout.session.async_payment_failed': {
        await this.failOrder(event.data.object, event.type);
        break;
      }

      default:
        this.logger.debug(`Ignoring unhandled stripe event ${event.type}`);
    }
  }

  private async fullFilOrder(session: Stripe.Checkout.Session) {
    const orderId = session.metadata?.orderId ?? session.client_reference_id;

    if (!orderId) {
      return this.logger.error(
        `Stripe session ${session.id} carried no order id`,
      );
    }

    await this.prismaService.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });

      if (!order)
        return this.logger.error(`Webhook reference unknown order ${orderId}`);

      if (order.status == OrderStatus.Paid)
        return this.logger.log(
          `Order ${orderId} already fulfilled - ignoring replay`,
        );

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.Paid,
          stripePaymentIntentId:
            typeof session.payment_intent == 'string'
              ? session.payment_intent
              : (session.payment_intent?.id ?? null),
        },
      });

      for (const item of order.items) {
        const updated = await tx.product.updateMany({
          where: { id: item.productId, stock: { gte: item.quantity } },
          data: {
            stock: { decrement: item.quantity },
          },
        });

        if (updated.count == 0)
          this.logger.warn(
            `Order ${order.id}: product ${item.productId} oversold - stock not decremented`,
          );
      }

      const cart = await tx.cart.findUnique({
        where: { userId: order.userId },
      });
      if (cart) {
        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      }

      this.logger.log(`Order ${order.id} paid and fulfilled`);
    });
  }

  private async failOrder(session: Stripe.Checkout.Session, reason: string) {
    const orderId = session.metadata?.orderId ?? session.client_reference_id;

    if (!orderId) return;

    await this.prismaService.order.updateMany({
      where: { id: orderId, status: OrderStatus.Pending },
      data: {
        status:
          reason == 'checkout.session.expired'
            ? OrderStatus.Cancelled
            : OrderStatus.Failed,
      },
    });
  }

  async findUserOrders(userId: string) {
    return this.prismaService.order.findMany({
      where: { userId },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAllOrders(status?: OrderStatus) {
    const where: Prisma.OrderWhereInput = status ? { status } : {};

    return this.prismaService.order.findMany({
      where,
      include: {
        items: true,
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async findUserOrder(userId: string, orderId: string) {
    const order = await this.prismaService.order.findFirst({
      where: { id: orderId, userId },
      include: { items: true },
    });

    if (!order) throw new NotFoundException(`Order ${orderId} not found`);

    return order;
  }
}
