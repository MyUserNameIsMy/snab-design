import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as hbs from 'hbs';
import { AppModule } from '@/app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.use(json({ limit: '50mb' }));

  app.useStaticAssets(join(__dirname, '..', 'public'));
  app.setBaseViewsDir(join(__dirname, '..', 'src', 'webapp', 'views'));

  // Register helpers BEFORE setting the view engine
  hbs.registerHelper('toLowerCase', function (str) {
    return str.toLowerCase();
  });

  hbs.registerHelper('eq', function (arg1, arg2) {
    return arg1 == arg2;
  });

  app.setViewEngine('hbs');
  hbs.registerPartials(
    join(__dirname, '..', 'src', 'webapp', 'views', 'partials'),
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
