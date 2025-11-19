import { Global, Module } from '@nestjs/common'; // Import Global
import { PrismaModule } from '@/prisma/prisma.module';
import { RequestsModule } from '@/requests/requests.module';
import { ResponsesModule } from '@/responses/responses.module';
import { UsersModule } from '@/users/users.module';
import { BotService } from '@/bot/bot.service';
import { BotUpdate } from '@/bot/bot.update';
import { DesignerScene } from '@/bot/scenes/designer.scene';
import { OnboardingScene } from '@/bot/scenes/onboarding.scene';
import { SupplierScene } from '@/bot/scenes/supplier.scene';
import { DirectusModule } from '@/directus/directus.module';

@Global() // Make the module global
@Module({
  imports: [
    PrismaModule,
    UsersModule,
    RequestsModule,
    ResponsesModule,
    DirectusModule,
  ],
  providers: [
    BotService,
    BotUpdate,
    OnboardingScene,
    DesignerScene,
    SupplierScene,
  ],
  exports: [BotService],
})
export class BotModule {}
