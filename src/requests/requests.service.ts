import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { request } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

interface CreateRequestDto {
  details_text: string;
  designer_id: string; // This is the UUID of the user
  // We will handle image uploads separately
}

@Injectable()
export class RequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateRequestDto): Promise<request> {
    return this.prisma.request.create({
      data: {
        id: uuidv4(),
        details_text: data.details_text,
        designer_id: data.designer_id,
        status: 'OPEN',
      },
    });
  }
}
