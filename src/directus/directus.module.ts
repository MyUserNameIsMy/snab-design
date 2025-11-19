import { Module, forwardRef } from '@nestjs/common';
import { DirectusController } from './directus.controller';
import { BotModule } from '@/bot/bot.module';
import { UsersModule } from '@/users/users.module';
import { DirectusService } from './directus.service';

@Module({
  imports: [forwardRef(() => BotModule), UsersModule],
  controllers: [DirectusController],
  providers: [DirectusService],
  exports: [DirectusService],
})
export class DirectusModule {}
