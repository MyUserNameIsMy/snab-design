import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { ResponsesService } from '@/responses/responses.service';

@Module({
  imports: [PrismaModule],
  providers: [ResponsesService],
  exports: [ResponsesService],
})
export class ResponsesModule {}
