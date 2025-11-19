import { Injectable } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Markup, Telegraf } from 'telegraf';
import { UsersService } from '@/users/users.service';
import { request, response } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { DirectusService } from '@/directus/directus.service';
import { InputMediaPhoto } from 'telegraf/types';
import axios from 'axios';

@Injectable()
export class BotService {
  constructor(
    @InjectBot() private readonly bot: Telegraf,
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
    private readonly directusService: DirectusService,
  ) {}

  async sendMessage(telegramId: string, text: string, extra?: any) {
    try {
      await this.bot.telegram.sendMessage(Number(telegramId), text, extra);
    } catch (error) {
      console.error(`Failed to send message to user ${telegramId}:`, error);
    }
  }

  async broadcastRequest(newRequest: request) {
    const suppliers = await this.usersService.findAllSuppliers();
    const messageText = `Новая заявка:\n\n${newRequest.details_text}`;

    const keyboard = Markup.inlineKeyboard([
      Markup.button.callback(
        'Откликнуться',
        `respond_request_${newRequest.id}`,
      ),
    ]);

    for (const supplier of suppliers) {
      if (supplier.telegram_id) {
        await this.sendMessage(supplier.telegram_id, messageText, keyboard);
      }
    }
  }

  async notifyDesigner(newResponse: response) {
    const fullResponse = await this.prisma.response.findUnique({
      where: { id: newResponse.id },
      include: {
        request: {
          include: {
            user: true, // The designer
          },
        },
        user: true, // The supplier
        response_files: true,
      },
    });

    if (!fullResponse || !fullResponse.request || !fullResponse.request.user || !fullResponse.user) {
      console.error('Could not find full response details to notify designer.');
      return;
    }

    const designer = fullResponse.request.user;
    const supplier = fullResponse.user;
    const text = `Новый отклик на вашу заявку!\n\nОтклик: ${fullResponse.details_text}\n\nЗаметки поставщика: ${supplier.internal_notes || 'Нет'}`;

    const keyboard = Markup.inlineKeyboard([
      Markup.button.callback(
        'Выбрать этого поставщика',
        `choose_response_${fullResponse.id}`,
      ),
    ]);

    if (designer.telegram_id) {
        const fileIds = fullResponse.response_files
            .map(f => f.directus_files_id)
            .filter((id): id is string => !!id);

        if (fileIds.length > 0) {
            const mediaPromises = fileIds.map(async (fileId) => {
                const fileBuffer = await this.directusService.fetchFileBuffer(fileId);
                return { source: fileBuffer };
            });
            
            const mediaSources = await Promise.all(mediaPromises);

            const mediaGroup: InputMediaPhoto[] = mediaSources.map((source, index) => ({
                type: 'photo',
                media: source,
                caption: index === 0 ? text : undefined,
            }));

            if (text.length > 1024) {
                await this.bot.telegram.sendMessage(Number(designer.telegram_id), text);
                await this.bot.telegram.sendMediaGroup(Number(designer.telegram_id), mediaGroup.map(m => ({...m, caption: undefined})));
            } else {
                await this.bot.telegram.sendMediaGroup(Number(designer.telegram_id), mediaGroup);
            }
            await this.sendMessage(designer.telegram_id, 'Что вы хотите сделать?', keyboard);
        } else {
            await this.sendMessage(designer.telegram_id, text, keyboard);
        }
    }
  }
}
