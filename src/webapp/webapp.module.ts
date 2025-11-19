import { Module } from '@nestjs/common';
import { WebappController } from './webapp.controller';
import { WebappService } from './webapp.service';
import { PrismaModule } from '@/prisma/prisma.module';
import { BotModule } from '@/bot/bot.module'; // Import BotModule

@Module({
  imports: [PrismaModule, BotModule], // Add BotModule here
  controllers: [WebappController],
  providers: [WebappService],
})
export class WebappModule {}
