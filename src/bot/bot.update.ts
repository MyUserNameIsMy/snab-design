import { Ctx, Start, Update, Hears, Action } from 'nestjs-telegraf';
import { SceneContext } from 'telegraf/scenes';
import { UsersService } from '@/users/users.service';
import { Markup } from 'telegraf';
import { PrismaService } from '@/prisma/prisma.service';
import { BotService } from '@/bot/bot.service';
import { DirectusService } from '@/directus/directus.service';
import { InputMediaPhoto } from 'telegraf/types';

@Update()
export class BotUpdate {
  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
    private readonly botService: BotService,
    private readonly directusService: DirectusService, // Inject DirectusService
  ) {}

  @Start()
  async onStart(@Ctx() ctx: SceneContext) {
    if (!ctx.from) return;
    const user = await this.usersService.findOrCreate(ctx.from.id);
    const webAppUrl = process.env.WEB_APP_URL;

    if (!user.is_confirmed) {
      console.log('User not confirmed, entering onboarding-scene.');
      await ctx.scene.enter('onboarding-scene');
    } else {
      if (user.role === 'DESIGNER') {
        console.log('User is DESIGNER, sending designer keyboard.');
        await ctx.reply(
          'Добро пожаловать, Дизайнер!',
          Markup.keyboard([
            ['Создать новую заявку'],
            [
              {
                text: 'Мои заявки',
                web_app: {
                  url: `${webAppUrl}/webapp/requests?userId=${user.id}&role=designer`,
                },
              },
            ],
          ]).resize(),
        );
      } else if (user.role === 'SUPPLIER') {
        console.log('User is SUPPLIER, sending supplier keyboard.');
        await ctx.reply(
          'Добро пожаловать, Поставщик!',
          Markup.keyboard([
            [
              {
                text: 'Открытые заявки',
                web_app: {
                  url: `${webAppUrl}/webapp/open-requests?userId=${user.telegram_id}`,
                },
              },
            ],
            [
              {
                text: 'Мои ответы',
                web_app: {
                  url: `${webAppUrl}/webapp/responses?userId=${user.id}&role=supplier`,
                },
              },
            ],
          ]).resize(),
        );
      } else {
        console.log(
          'User role not DESIGNER or SUPPLIER, sending pending message.',
        );
        await ctx.reply('Ваша роль на рассмотрении.');
      }
    }
  }

  @Hears('Создать новую заявку')
  async onCreateRequest(@Ctx() ctx: SceneContext) {
    if (!ctx.from) return;
    const user = await this.usersService.findOrCreate(ctx.from.id);
    if (user.is_confirmed && user.role === 'DESIGNER') {
      await ctx.scene.enter('designer-scene');
    } else {
      await ctx.reply(
        'Эта функция доступна только для подтвержденных дизайнеров.',
      );
    }
  }

  @Action(/respond_request_(.+)/)
  async onRespondRequest(@Ctx() ctx: SceneContext & { match: string[] }) {
    if (!ctx.from) return;
    const user = await this.usersService.findOrCreate(ctx.from.id);
    if (user.is_confirmed && user.role === 'SUPPLIER') {
      const requestId = ctx.match[1];
      const request = await this.prisma.request.findUnique({
        where: { id: requestId },
        include: { request_files: true },
      });

      if (!request) {
        await ctx.answerCbQuery('Заявка не найдена.');
        return;
      }

      await ctx.answerCbQuery(); // Acknowledge the button press

      const fileIds = request.request_files
        .map((f) => f.directus_files_id)
        .filter((id): id is string => !!id);

      // if (fileIds.length > 0) {
      //   const mediaPromises = fileIds.map(async (fileId) => {
      //     const fileBuffer = await this.directusService.fetchFileBuffer(fileId);
      //     return { source: fileBuffer };
      //   });
      //   const mediaSources = await Promise.all(mediaPromises);
      //   const mediaGroup: InputMediaPhoto[] = mediaSources.map((source) => ({
      //     type: 'photo',
      //     media: source,
      //   }));
      //   await ctx.replyWithMediaGroup(mediaGroup);
      // }

      await ctx.scene.enter('supplier-scene', { request_id: requestId });
    } else {
      await ctx.answerCbQuery(
        'Эта функция доступна только для подтвержденных поставщиков.',
      );
    }
  }

  @Action(/choose_response_(.+)/)
  async onChooseResponse(@Ctx() ctx: SceneContext & { match: string[] }) {
    await ctx.answerCbQuery();
    if (!ctx.from) return;

    const responseId = ctx.match[1];

    try {
      await this.prisma.$transaction(async (prisma) => {
        const chosenResponse = await prisma.response.findUnique({
          where: { id: responseId },
          include: {
            user: true, // The supplier
            request: {
              include: {
                user: true, // The designer
              },
            },
          },
        });

        if (
          !chosenResponse ||
          !chosenResponse.user ||
          !chosenResponse.request ||
          !chosenResponse.request.user
        ) {
          throw new Error('Could not find the full context for the response.');
        }

        const designer = chosenResponse.request.user;
        const chosenSupplier = chosenResponse.user;
        const request = chosenResponse.request;

        if (designer.telegram_id !== String(ctx.from?.id)) {
          await ctx.reply(
            'Вы не являетесь дизайнером этой заявки и не можете выбрать поставщика.',
          );
          return;
        }

        if (request.status !== 'OPEN') {
          await ctx.editMessageText(
            'Поставщик для этой заявки уже был выбран или заявка закрыта.',
          );
          return;
        }

        await prisma.response.update({
          where: { id: responseId },
          data: { status: 'CHOSEN' },
        });

        // Notify the designer with the supplier's contact info
        const designerMessage = `Вы выбрали поставщика для заявки "${request.details_text}".\n\nКонтактная информация поставщика: ${chosenSupplier.contact_info || 'не указана'}`;
        if (designer.telegram_id) {
          await this.botService.sendMessage(
            designer.telegram_id,
            designerMessage,
          );
        }

        // Notify the chosen supplier with the designer's contact info
        const chosenSupplierMessage = `Поздравляем! Вас выбрали для заявки "${request.details_text}".\n\nКонтактная информация дизайнера: ${designer.contact_info || 'не указана'}`;
        if (chosenSupplier.telegram_id) {
          await this.botService.sendMessage(
            chosenSupplier.telegram_id,
            chosenSupplierMessage,
          );
        }

        if (ctx.callbackQuery?.message) {
          const originalMessageText = (ctx.callbackQuery.message as any).text;
          const newText = `${originalMessageText}\n\n✅ Выбран поставщик. Контактная информация: ${chosenSupplier.contact_info || 'не указана'}`;
          await ctx.editMessageText(newText, {
            reply_markup: undefined,
          });
        }
      });
    } catch (error) {
      console.error('Failed to process choosing a supplier:', error);
      await ctx.reply(
        'Произошла ошибка при выборе поставщика. Пожалуйста, попробуйте снова.',
      );
    }
  }
}
