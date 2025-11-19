import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { response } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

interface CreateResponseDto {
  details_text: string;
  supplier_id: string; // UUID of the user
  request_id: string; // UUID of the request
}

@Injectable()
export class ResponsesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateResponseDto): Promise<response> {
    return this.prisma.response.create({
      data: {
        id: uuidv4(),
        details_text: data.details_text,
        supplier_id: data.supplier_id,
        request_id: data.request_id,
        status: 'SENT',
      },
    });
  }
}
