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
}
