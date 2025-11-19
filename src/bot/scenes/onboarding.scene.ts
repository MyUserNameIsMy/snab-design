import {
  Wizard,
  WizardStep,
  Action,
  Ctx,
  On,
  Message,
} from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { UsersService } from '@/users/users.service';
import { WizardContext } from 'telegraf/scenes';

// Define the shape of the wizard's state
interface OnboardingWizardState {
  role?: 'DESIGNER' | 'SUPPLIER';
}

// Extend the WizardContext to include our custom state
interface OnboardingWizardContext extends WizardContext {
  wizard: WizardContext['wizard'] & {
    state: OnboardingWizardState;
  };
}

@Wizard('onboarding-scene')
export class OnboardingScene {
  constructor(private readonly usersService: UsersService) {}

  @WizardStep(1)
  async onSceneEnter(@Ctx() ctx: OnboardingWizardContext) {
    await ctx.reply(
      'Добро пожаловать! Вы...',
      Markup.inlineKeyboard([
        Markup.button.callback('Я Дизайнер', 'designer'),
        Markup.button.callback('Я Поставщик', 'supplier'),
      ]),
    );
    ctx.wizard.next();
  }

  @WizardStep(2)
  @Action(['designer', 'supplier'])
  async onRoleSelected(@Ctx() ctx: OnboardingWizardContext & { match: string[] }) {
    if (!ctx.from) return;
    const role = ctx.match[0].toUpperCase() as 'DESIGNER' | 'SUPPLIER';
    ctx.wizard.state.role = role;

    await ctx.editMessageText(`Вы выбрали: ${role === 'DESIGNER' ? 'Дизайнер' : 'Поставщик'}.`);
    await ctx.reply('Теперь, пожалуйста, введите вашу контактную информацию (например, телефон или email):');
    ctx.wizard.next();
  }

  @WizardStep(3)
  @On('text')
  async onContactInfo(
    @Ctx() ctx: OnboardingWizardContext,
    @Message('text') contactInfo: string,
  ) {
    if (!ctx.from) {
        await ctx.scene.leave();
        return;
    }
    const { role } = ctx.wizard.state;
    if (!role) {
        await ctx.reply('Произошла ошибка. Роль не была выбрана. Попробуйте снова.');
        await ctx.scene.reenter();
        return;
    }

    await this.usersService.updateUser(ctx.from.id, {
        role: role,
        contact_info: contactInfo,
    });

    await ctx.reply(
      `Спасибо! Ваша роль '${
        role === 'DESIGNER' ? 'Дизайнер' : 'Поставщик'
      }' и контактные данные отправлены на подтверждение.`,
    );
    await ctx.scene.leave();
  }
}
