import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { user } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<user | null> {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async findOrCreate(telegramId: number): Promise<user> {
    const telegramIdString = String(telegramId);
    let user = await this.prisma.user.findUnique({
      where: { telegram_id: telegramIdString },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          id: uuidv4(),
          telegram_id: telegramIdString,
          role: 'PENDING',
          is_confirmed: false,
        },
      });
    }

    return user;
  }

  async updateUser(telegramId: number, data: Partial<user>): Promise<user> {
    const telegramIdString = String(telegramId);
    return this.prisma.user.update({
      where: { telegram_id: telegramIdString },
      data,
    });
  }

  async updateRole(telegramId: number, role: 'DESIGNER' | 'SUPPLIER'): Promise<user> {
    const telegramIdString = String(telegramId);
    return this.prisma.user.update({
      where: { telegram_id: telegramIdString },
      data: { role },
    });
  }

  async findAllSuppliers(): Promise<user[]> {
    return this.prisma.user.findMany({
      where: {
        role: 'SUPPLIER',
        is_confirmed: true,
      },
    });
  }
}
