import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, Product, Role } from '../generated/prisma/client';
import { QueryProductsDto } from './dto/query-products.dto';
import { Paginated } from '../common/interceptors/transform.interceptor';

@Injectable()
export class ProductsService {
  constructor(private readonly prismaService: PrismaService) {}
  async create(
    createProductDto: CreateProductDto,
    createdById: string,
  ): Promise<Product> {
    return this.prismaService.product.create({
      data: {
        name: createProductDto.name,
        slug: await this.uniqueSlug(createProductDto.name),
        description: createProductDto.description,
        priceCents: createProductDto.priceCents,
        currency: createProductDto.currency ?? 'usd',
        stock: createProductDto.stock ?? 0,
        image: createProductDto.image,
        isActive: createProductDto.isActive ?? true,
        createdById,
      },
    });
  }

  async findAll(
    query: QueryProductsDto,
    role?: Role,
  ): Promise<Paginated<Product[]>> {
    const {
      page = 1,
      limit = 10,
      search,
      minPrice,
      maxPrice,
      sortBy = 'createdAt',
      order = 'desc',
    } = query;

    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice)
      throw new BadRequestException(
        'Min price cannot be greater than max price',
      );

    const includeInactive = query.includeInactive && role == Role.Admin;

    const where: Prisma.ProductWhereInput = {
      ...(includeInactive ? {} : { isActive: true }),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(minPrice !== undefined || maxPrice !== undefined
        ? {
            priceCents: {
              ...(minPrice !== undefined ? { gte: Number(minPrice) } : {}),
              ...(maxPrice !== undefined ? { lte: Number(maxPrice) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await this.prismaService.$transaction([
      this.prismaService.product.findMany({
        where,
        orderBy: { [sortBy]: order },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prismaService.product.count({ where }),
    ]);

    return {
      data: items,
      meta: {
        total,
        page,
        limit,
        pageCount: Math.ceil(total / limit) || 1,
        hasNextPage: page * limit < total,
      },
    };
  }

  async findBySlug(slug: string, role?: Role): Promise<Product> {
    const product = await this.prismaService.product.findUnique({
      where: { slug },
    });

    if (!product || (!product.isActive && role !== Role.Admin)) {
      throw new NotFoundException(`Product ${slug} not found`);
    }

    return product;
  }

  async findById(id: string, role?: Role): Promise<Product> {
    const product = await this.prismaService.product.findUnique({
      where: { id },
    });

    if (!product || (!product.isActive && role !== Role.Admin)) {
      throw new NotFoundException(`Product not found`);
    }

    return product;
  }

  async update(id: string, updateProductDto: UpdateProductDto) {
    const product = await this.prismaService.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return this.prismaService.product.update({
      where: { id },
      data: {
        ...updateProductDto,
        ...(updateProductDto.name && updateProductDto.name !== product.name
          ? { slug: await this.uniqueSlug(updateProductDto.name, id) }
          : {}),
      },
    });
  }

  async remove(id: string): Promise<{ id: string; deleted: boolean }> {
    const product = await this.prismaService.product.findUnique({
      where: { id },
      include: { _count: { select: { orderItems: true } } },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (product._count.orderItems > 0) {
      await this.prismaService.product.update({
        where: { id },
        data: { isActive: false },
      });

      return { id, deleted: false };
    }

    await this.prismaService.product.delete({
      where: { id },
    });

    return { id, deleted: true };
  }

  private slugify(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  }

  private async uniqueSlug(name: string, ignoreId?: string): Promise<string> {
    const base = this.slugify(name) || 'product';
    let candidate = base;
    let suffix = 1;

    for (;;) {
      const clash = await this.prismaService.product.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });

      if (!clash || clash.id === ignoreId) return candidate;

      suffix += 1;
      candidate = `${base}-${suffix}`;
    }
  }
}
