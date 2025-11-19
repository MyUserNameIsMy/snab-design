import {
  Wizard,
  WizardStep,
  On,
  Ctx,
  Message,
  Action,
  Hears,
  InjectBot,
} from 'nestjs-telegraf';
import { WizardContext } from 'telegraf/scenes';
import { ResponsesService } from '@/responses/responses.service';
import { UsersService } from '@/users/users.service';
import { BotService } from '@/bot/bot.service';
import { Markup, Telegraf } from 'telegraf';
import { DirectusService } from '@/directus/directus.service';
import { PrismaService } from '@/prisma/prisma.service';
import axios from 'axios';
import { InputMediaPhoto } from 'telegraf/types';

interface SupplierWizardState {
  text?: string;
  images: any[];
  request_id?: string;
}

interface SupplierWizardContext extends WizardContext {
  wizard: WizardContext['wizard'] & {
    state: SupplierWizardState;
  };
}

@Wizard('supplier-scene')
export class SupplierScene {
  constructor(
    private readonly responsesService: ResponsesService,
    private readonly usersService: UsersService,
    private readonly botService: BotService,
    private readonly directusService: DirectusService,
    private readonly prisma: PrismaService,
    @InjectBot() private readonly bot: Telegraf,
  ) {}

  @WizardStep(1)
  async onSceneEnter(@Ctx() ctx: SupplierWizardContext) {
    ctx.wizard.state.images = [];
    // request_id is passed in the scene state when entering
    await ctx.reply('Введите текст вашего отклика:');
    ctx.wizard.next();
  }

  @WizardStep(2)
  @On('text')
  async onText(
    @Ctx() ctx: SupplierWizardContext,
    @Message('text') text: string,
  ) {
    ctx.wizard.state.text = text;
    await ctx.reply(
      'Отлично! Теперь прикрепите изображения или нажмите "Готово".',
      Markup.keyboard([['Готово']]).resize().oneTime(),
    );
    ctx.wizard.next();
  }

  @WizardStep(3)
  @On('photo')
  async onPhoto(@Ctx() ctx: SupplierWizardContext, @Message('photo') photo: any) {
    const fileId = photo[photo.length - 1].file_id;
    ctx.wizard.state.images.push(fileId);
    await ctx.reply('Изображение добавлено. Прикрепите еще или нажмите "Готово".');
  }

  @WizardStep(3)
  @Hears('Готово')
  async onDone(@Ctx() ctx: SupplierWizardContext) {
    const { text, images } = ctx.wizard.state;

    if (!text) {
        await ctx.reply('Произошла ошибка. Текст отклика не найден. Попробуйте снова.');
        await ctx.scene.reenter();
        return;
    }

    await ctx.reply('Так будет выглядеть ваш отклик для дизайнера. Посмотрите, все ли верно.', {
        reply_markup: { remove_keyboard: true },
    });

    // Send text and images for preview
    if (images.length > 0) {
        const mediaGroup: InputMediaPhoto[] = images.map((fileId, index) => ({
            type: 'photo',
            media: fileId,
            caption: index === 0 ? text : undefined,
        }));
        if (text && text.length > 1024) {
            await ctx.reply(text);
            await ctx.replyWithMediaGroup(mediaGroup.map(m => ({...m, caption: undefined})));
        } else {
            await ctx.replyWithMediaGroup(mediaGroup);
        }
    } else {
        await ctx.reply(text);
    }

    // Ask for confirmation
    const message = `Отправить отклик?`;
    await ctx.reply(message, Markup.inlineKeyboard([
      Markup.button.callback('✅ Да, отправить', 'send_response'),
      Markup.button.callback('❌ Отменить', 'cancel_response'),
    ]));
    ctx.wizard.next();
  }

  @WizardStep(3)
  @On('message')
  async onInvalidMessage(@Ctx() ctx: SupplierWizardContext) {
    await ctx.reply('Пожалуйста, прикрепите изображение или нажмите "Готово". Другие типы сообщений здесь не поддерживаются.');
  }

  @WizardStep(4)
  @Action('send_response')
  async onSend(@Ctx() ctx: SupplierWizardContext) {
    if (!ctx.from) {
      await ctx.scene.leave();
      return;
    }
    const { text, images, request_id } = ctx.wizard.state;

    if (!text || !request_id) {
        await ctx.reply('Произошла ошибка. Текст отклика или ID заявки не найдены.');
        await ctx.scene.leave();
        return;
    }

    await ctx.editMessageText('Создаем ваш отклик...');

    const user = await this.usersService.findOrCreate(ctx.from.id);
    const newResponse = await this.responsesService.create({
      details_text: text,
      supplier_id: user.id,
      request_id: request_id,
    });

    // Handle image uploads
    for (const fileId of images) {
      const fileLink = await this.bot.telegram.getFileLink(fileId);
      const response = await axios.get(fileLink.href, { responseType: 'arraybuffer' });
      const fileBuffer = Buffer.from(response.data, 'binary');
      
      const directusFileId = await this.directusService.uploadFile(
        fileBuffer,
        `${fileId}.jpg`,
        'image/jpeg',
      );

      // Link the uploaded file to the response
      await this.prisma.response_files.create({
        data: {
          response_id: newResponse.id,
          directus_files_id: directusFileId,
        },
      });
    }

    await this.botService.notifyDesigner(newResponse);

    await ctx.reply('Ваш отклик отправлен дизайнеру.');
    await ctx.scene.leave();
  }

  @WizardStep(4)
  @Action('cancel_response')
  async onCancel(@Ctx() ctx: WizardContext) {
    await ctx.editMessageText('Создание отклика отменено.');
    await ctx.scene.leave();
  }
}
