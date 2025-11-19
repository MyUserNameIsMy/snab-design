import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TelegrafModule } from 'nestjs-telegraf';
import { session } from 'telegraf';
import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import { BotModule } from '@/bot/bot.module';
import { PrismaModule } from '@/prisma/prisma.module';
import { DirectusModule } from '@/directus/directus.module';
import { WebappModule } from '@/webapp/webapp.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TelegrafModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const token = configService.get<string>('TELEGRAM_BOT_TOKEN');
        if (token === undefined) {
          throw new Error('TELEGRAM_BOT_TOKEN is not defined');
        }
        return {
          token,
          middlewares: [session()],
        };
      },
      inject: [ConfigService],
    }),
    PrismaModule,
    BotModule,
    DirectusModule,
    WebappModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
