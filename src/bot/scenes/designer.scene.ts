import {
  Wizard,
  WizardStep,
  On,
  Ctx,
  Message,
  Action,
  Hears,
  InjectBot,
  Start as StartCommand, // Alias Start to avoid conflict with @Start() decorator
} from 'nestjs-telegraf';
import { WizardContext } from 'telegraf/scenes';
import { RequestsService } from '@/requests/requests.service';
import { UsersService } from '@/users/users.service';
import { BotService } from '@/bot/bot.service';
import { Markup, Telegraf } from 'telegraf';
import { DirectusService } from '@/directus/directus.service';
import { PrismaService } from '@/prisma/prisma.service';
import axios from 'axios';
import { InputMediaPhoto } from 'telegraf/types';

// Define the shape of the wizard's state
interface DesignerWizardState {
  text?: string;
  images: any[];
}

// Extend the WizardContext to include our custom state
interface DesignerWizardContext extends WizardContext {
  wizard: WizardContext['wizard'] & {
    state: DesignerWizardState;
  };
}

@Wizard('designer-scene')
export class DesignerScene {
  constructor(
    private readonly requestsService: RequestsService,
    private readonly usersService: UsersService,
    private readonly botService: BotService,
    private readonly directusService: DirectusService,
    private readonly prisma: PrismaService,
    @InjectBot() private readonly bot: Telegraf,
  ) {}

  // Handler for /start command within the scene
  @StartCommand()
  async onStartCommand(@Ctx() ctx: DesignerWizardContext) {
    await ctx.reply('Вы покинули создание заявки.');
    return ctx.scene.leave();
  }

  @WizardStep(1)
  async onSceneEnter(@Ctx() ctx: DesignerWizardContext) {
    ctx.wizard.state.images = [];
    await ctx.reply('Введите текст вашей заявки:');
    ctx.wizard.next();
  }

  @WizardStep(2)
  async onText(
    @Ctx() ctx: DesignerWizardContext,
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
  async onPhoto(@Ctx() ctx: DesignerWizardContext, @Message('photo') photo: any) {
    const fileId = photo[photo.length - 1].file_id;
    ctx.wizard.state.images.push(fileId);
    await ctx.reply('Изображение добавлено. Прикрепите еще или нажмите "Готово".');
  }

  @WizardStep(3)
  @Hears('Готово')
  async onDone(@Ctx() ctx: DesignerWizardContext) {
    const { text, images } = ctx.wizard.state;

    if (!text) {
        await ctx.reply('Произошла ошибка. Текст заявки не найден. Попробуйте снова.');
        await ctx.scene.reenter();
        return;
    }

    await ctx.reply('Так будет выглядеть ваша заявка для поставщиков. Посмотрите, все ли верно.', {
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
    const message = `Отправить заявку?`;
    await ctx.reply(message, Markup.inlineKeyboard([
      Markup.button.callback('✅ Да, отправить', 'send_request'),
      Markup.button.callback('❌ Отменить', 'cancel_request'),
    ]));
    ctx.wizard.next();
  }

  @WizardStep(3)
  @On('message')
  async onInvalidMessage(@Ctx() ctx: DesignerWizardContext) {
    await ctx.reply('Пожалуйста, прикрепите изображение или нажмите "Готово". Другие типы сообщений здесь не поддерживаются.');
  }

  @WizardStep(4)
  @Action('send_request')
  async onSend(@Ctx() ctx: DesignerWizardContext) {
    if (!ctx.from) {
      await ctx.scene.leave();
      return;
    }
    const { text, images } = ctx.wizard.state;
    const user = await this.usersService.findOrCreate(ctx.from.id);
    
    if (!text) {
        await ctx.reply('Произошла ошибка. Текст заявки не найден.');
        await ctx.scene.leave();
        return;
    }

    await ctx.editMessageText('Создаем вашу заявку...');

    const newRequest = await this.requestsService.create({
      details_text: text,
      designer_id: user.id,
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

      // Link the uploaded file to the request
      await this.prisma.request_files.create({
        data: {
          request_id: newRequest.id,
          directus_files_id: directusFileId,
        },
      });
    }

    await this.botService.broadcastRequest(newRequest);

    await ctx.reply('Ваша заявка создана и отправлена поставщикам.');
    await ctx.scene.leave();
  }

  @WizardStep(4)
  @Action('cancel_request')
  async onCancel(@Ctx() ctx: WizardContext) {
    await ctx.editMessageText('Создание заявки отменено.');
    await ctx.scene.leave();
  }
}
