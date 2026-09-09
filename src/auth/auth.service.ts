import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import * as bcrypt from 'bcrypt';
import { User } from '../generated/prisma/client';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from '../common/types/authenticated-user';

@Injectable()
export class AuthService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}
  async register(registerDto: RegisterDto) {
    const email = registerDto.email.toLowerCase().trim();
    const hashed = await bcrypt.hash(registerDto.password, 10);

    const existingUser = await this.prismaService.user.findUnique({
      where: { email },
    });

    if (existingUser) throw new ConflictException('User already exists');

    const user = await this.prismaService.user.create({
      data: {
        name: registerDto.name,
        email,
        password: hashed,
      },
    });

    return this.buildAuthResult(user);
  }

  private async buildAuthResult(user: User) {
    const tokens = await this.issueTokens(user);

    return {
      ...tokens,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  private async issueTokens(user: User) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const expiresIn = this.configService.get<string>('JWT_EXPIRES_IN');
    const refreshExpiresIn = this.configService.get<string>(
      'JWT_REFRESH_EXPIRES_IN',
    );

    const asExpiry = (value: string) => value as JwtSignOptions['expiresIn'];

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
        expiresIn: asExpiry(expiresIn!),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: asExpiry(refreshExpiresIn!),
      }),
    ]);

    return { accessToken, refreshToken, tokenType: 'Bearer', expiresIn };
  }

  async login(loginDto: LoginDto) {
    const email = loginDto.email.toLowerCase().trim();
    const user = await this.prismaService.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const passwordMatches = await bcrypt.compare(
      loginDto.password,
      user.password,
    );
    if (!passwordMatches)
      throw new UnauthorizedException('Invalid credentials');

    return this.buildAuthResult(user);
  }

  async refreshToken(refreshToken: string) {
    let payload: JwtPayload;

    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch (err) {
      console.log(err);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prismaService.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) throw new UnauthorizedException('User no longer exists');

    return this.issueTokens(user);
  }
}
