import { Ctx, Start, Update, Hears, Action } from 'nestjs-telegraf';
import { SceneContext } from 'telegraf/scenes';
import { UsersService } from '@/users/users.service';
import { Markup } from 'telegraf';
import { PrismaService } from '@/prisma/prisma.service';
import { BotService } from '@/bot/bot.service';

@Update()
export class BotUpdate {
  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
    private readonly botService: BotService,
  ) {}

  @Start()
  async onStart(@Ctx() ctx: SceneContext) {
    // Removed the scene check. Now /start will always interrupt the scene.
    if (!ctx.from) return;
    const user = await this.usersService.findOrCreate(ctx.from.id);
    const webAppUrl = process.env.WEB_APP_URL;

    // Original onStart logic
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
                web_app: { url: `${webAppUrl}/webapp/open-requests?userId=${user.telegram_id}` }, // Pass telegram_id
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
        console.log('User role not DESIGNER or SUPPLIER, sending pending message.');
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
      await ctx.scene.enter('supplier-scene', { request_id: requestId });
    } else {
      await ctx.answerCbQuery('Эта функция доступна только для подтвержденных поставщиков.');
    }
  }

  @Action(/choose_response_(.+)/)
  async onChooseResponse(@Ctx() ctx: SceneContext & { match: string[] }) {
    await ctx.answerCbQuery(); // Acknowledge the callback query
    if (!ctx.from) return;

    const responseId = ctx.match[1];

    const chosenResponse = await this.prisma.response.findUnique({
      where: { id: responseId },
      include: {
        request: {
          include: {
            user: true, // The designer
            responses: {
              include: {
                user: true, // Other suppliers
              },
            },
          },
        },
        user: true, // The chosen supplier
      },
    });

    if (!chosenResponse || !chosenResponse.request || !chosenResponse.request.user || !chosenResponse.user) {
      console.error('Could not find full response details to choose supplier.');
      return;
    }

    const designer = chosenResponse.request.user;
    const chosenSupplier = chosenResponse.user;
    const request = chosenResponse.request;

    // Ensure only the designer who created the request can choose a supplier
    if (designer.telegram_id !== String(ctx.from.id)) {
      await ctx.reply('Вы не являетесь дизайнером этой заявки и не можете выбрать поставщика.');
      return;
    }

    // Check if a supplier has already been chosen for this request
    if (request.chosen_response_id) {
      await ctx.editMessageText(
        `Поставщик для этой заявки уже выбран: ${request.responses.find(r => r.id === request.chosen_response_id)?.user.telegram_username || 'Неизвестный поставщик'}.`,
      );
      return;
    }

    // Update the request with the chosen response
    await this.prisma.request.update({
      where: { id: request.id },
      data: {
        chosen_response_id: responseId,
        status: 'IN_PROGRESS', // Or a suitable status
      },
    });

    // Notify the designer
    const designerMessage = `Вы выбрали поставщика "${chosenSupplier.telegram_username}" для заявки "${request.details_text}".\n\nСвяжитесь с ним для дальнейшего взаимодействия: @${chosenSupplier.telegram_username}`;
    await this.botService.sendMessage(designer.telegram_id, designerMessage);

    // Notify the chosen supplier
    if (chosenSupplier.telegram_id) {
      const chosenSupplierMessage = `Поздравляем! Дизайнер "${designer.telegram_username}" выбрал вас для заявки "${request.details_text}".\n\nСвяжитесь с ним: @${designer.telegram_username}`;
      await this.botService.sendMessage(chosenSupplier.telegram_id, chosenSupplierMessage);
    }

    // Notify other suppliers
    for (const response of request.responses) {
      if (response.id !== responseId && response.user.telegram_id) {
        const otherSupplierMessage = `Дизайнер "${designer.telegram_username}" выбрал другого поставщика для заявки "${request.details_text}". Спасибо за ваш отклик!`;
        await this.botService.sendMessage(response.user.telegram_id, otherSupplierMessage);
      }
    }

    // Edit the original message to reflect the choice
    if (ctx.callbackQuery?.message) {
      const originalMessageText = (ctx.callbackQuery.message as any).text; // Telegraf types can be tricky here
      const newText = `${originalMessageText}\n\n✅ Выбран поставщик: @${chosenSupplier.telegram_username}`;
      await ctx.editMessageText(newText, {
        reply_markup: undefined, // Remove the inline keyboard
      });
    }
  }
}
