import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { UpdateCartDto } from './dto/update-cart.dto';
import { Cart, CartItem, Product } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type CartItemWithProduct = CartItem & { product: Product };
export type CartWithItems = Cart & { items: CartItemWithProduct[] };
export interface CartView {
  id: string;
  currency: string;
  items: Array<{
    id: string;
    productId: string;
    name: string;
    slug: string;
    image: string | null;
    unitPriceCents: number;
    quantity: number;
    lineTotalCents: number;
    inStock: boolean;
  }>;
  itemCount: number;
  subtotalCents: number;
}

@Injectable()
export class CartService {
  constructor(private readonly prismaService: PrismaService) {}
  async addItem(id: string, addToCartDto: AddToCartDto) {
    const cart = await this.loadCart(id);
    const product = await this.prismaService.product.findUnique({
      where: { id: addToCartDto.productId },
    });

    if (!product || !product.isActive) {
      throw new NotFoundException(`Product ${id} is not available`);
    }

    const existing = cart.items.find((item) => item.productId === product.id);

    const nextQuantity = (existing?.quantity ?? 0) + addToCartDto.quantity;

    this.assertStock(product, nextQuantity);

    await this.prismaService.cartItem.upsert({
      where: {
        cartId_productId: { cartId: cart.id, productId: product.id },
      },
      create: {
        cartId: cart.id,
        productId: product.id,
        quantity: addToCartDto.quantity,
      },
      update: {
        quantity: nextQuantity,
      },
    });

    return this.toView(await this.loadCart(id));
  }

  async getCart(id: string) {
    return this.toView(await this.loadCart(id));
  }

  async updateItem(id: string, updateCartDto: UpdateCartDto) {
    const cart = await this.loadCart(id);

    if (!cart) throw new NotFoundException('Cart not found');

    const existing = cart.items.find(
      (item) => item.productId == updateCartDto.productId,
    );

    if (!existing) throw new NotFoundException('Product not found in cart');

    await this.prismaService.cartItem.update({
      where: {
        cartId_productId: {
          cartId: cart.id,
          productId: updateCartDto.productId!,
        },
      },
      data: {
        quantity: updateCartDto.quantity,
      },
    });

    return this.prismaService.cartItem.findUnique({
      where: {
        cartId_productId: {
          cartId: cart.id,
          productId: updateCartDto.productId!,
        },
      },
    });
  }

  async removeItem(id: string, productId: string) {
    const cart = await this.loadCart(id);

    if (!cart) throw new NotFoundException('Cart not found');

    const existing = cart.items.find((item) => item.productId == productId);

    if (!existing) throw new NotFoundException('Product not found in cart');

    await this.prismaService.cartItem.delete({
      where: { cartId_productId: { cartId: cart.id, productId } },
    });

    return this.toView(await this.loadCart(id));
  }

  async clearCart(id: string) {
    const cart = await this.loadCart(id);

    if (!cart) throw new NotFoundException('Cart not found');

    await this.prismaService.cartItem.deleteMany({
      where: { cartId: cart.id },
    });

    return this.toView(await this.loadCart(id));
  }

  async loadCart(userId: string): Promise<CartWithItems> {
    const existing = await this.prismaService.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: { product: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (existing) return existing;

    return this.prismaService.cart.create({
      data: { userId },
      include: {
        items: {
          include: { product: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  private assertStock(product: Product, requested: number): void {
    if (product.stock < requested)
      throw new BadRequestException(
        `Only ${product.stock} unit(s) of "${product.name}" are in stock`,
      );
  }

  toView(cart: CartWithItems): CartView {
    const items = cart.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      name: item.product.name,
      slug: item.product.slug,
      image: item.product.image,
      unitPriceCents: item.product.priceCents,
      quantity: item.quantity,
      lineTotalCents: item.product.priceCents * item.quantity,
      inStock: item.product.stock >= item.quantity && item.product.isActive,
    }));

    return {
      id: cart.id,
      currency: cart.items[0]?.product.currency ?? 'usd',
      items,
      itemCount: items.reduce((acc, curr) => acc + curr.quantity, 0),
      subtotalCents: items.reduce((acc, curr) => acc + curr.lineTotalCents, 0),
    };
  }
}
