import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { RequestsService } from '@/requests/requests.service';

@Module({
  imports: [PrismaModule],
  providers: [RequestsService],
  exports: [RequestsService],
})
export class RequestsModule {}
