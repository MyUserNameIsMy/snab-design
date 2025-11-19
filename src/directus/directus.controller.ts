import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { BotService } from '@/bot/bot.service';
import { UsersService } from '@/users/users.service';

interface DirectusUserPayload {
  event: string;
  payload: {
    is_confirmed?: boolean;
  };
  keys: string[];
  collection: string;
}

@Controller('directus')
export class DirectusController {
  private readonly logger = new Logger(DirectusController.name);

  constructor(
    private readonly botService: BotService,
    private readonly usersService: UsersService,
  ) {}

  @Post('user-updated')
  async handleUserUpdate(@Body() body: DirectusUserPayload) {
    this.logger.log('Received webhook from Directus:');
    this.logger.log(body);

    // Check if this is the event we care about
    if (
      body.event === 'user.items.update' &&
      body.collection === 'user' &&
      body.payload.is_confirmed === true
    ) {
      this.logger.log('User confirmation event detected.');
      // Directus sends the updated keys (IDs) in an array
      const userId = body.keys[0];
      if (!userId) {
        this.logger.error('User ID not found in webhook payload');
        throw new HttpException(
          'User ID not found in webhook payload',
          HttpStatus.BAD_REQUEST,
        );
      }
      this.logger.log(`Processing user ID: ${userId}`);

      const user = await this.usersService.findById(userId);
      if (user && user.telegram_id) {
        this.logger.log(
          `Sending confirmation to telegram_id: ${user.telegram_id}`,
        );
        await this.botService.sendMessage(
          user.telegram_id,
          'Ваша роль подтверждена! Можете начинать работу. Введите /start',
        );
      } else {
        this.logger.warn(
          `User with ID ${userId} not found or has no telegram_id.`,
        );
      }
    }

    return { status: 'ok' };
  }
}
