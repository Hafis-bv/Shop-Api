import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../generated/prisma/enums';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { Public } from '../common/decorators/public.decorator';
import { QueryProductsDto } from './dto/query-products.dto';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post('create')
  @Roles(Role.Admin)
  create(
    @Body() createProductDto: CreateProductDto,
    @CurrentUser('id') id: string,
  ) {
    return this.productsService.create(createProductDto, id);
  }

  @Public()
  @Get()
  findAll(@Query() query: QueryProductsDto, @CurrentUser('role') role?: Role) {
    return this.productsService.findAll(query, role);
  }

  @Public()
  @Get('slug/:slug')
  findBySlug(
    @Param('slug') slug: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.productsService.findBySlug(slug, user?.role);
  }

  @Public()
  @Get(':id')
  findById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.productsService.findById(id, user?.role);
  }

  @Patch(':id')
  @Roles(Role.Admin)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateProductDto: UpdateProductDto,
  ) {
    return this.productsService.update(id, updateProductDto);
  }

  @Delete(':id')
  @Roles(Role.Admin)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.remove(id);
  }
}
