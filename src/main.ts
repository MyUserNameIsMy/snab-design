import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { json } from 'express';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as hbs from 'hbs';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.use(json({ limit: '50mb' }));

  app.useStaticAssets(join(__dirname, '..', 'public'));
  app.setBaseViewsDir(join(__dirname, '..', 'src', 'webapp', 'views'));
  
  // Register helpers BEFORE setting the view engine
  hbs.registerHelper('toLowerCase', function (str) {
    return str.toLowerCase();
  });

  // Corrected eq helper to be a block helper
  hbs.registerHelper('eq', function (arg1, arg2, options) {
    if (arg1 == arg2) {
      return options.fn(this);
    } else {
      return options.inverse(this);
    }
  });

  app.setViewEngine('hbs');
  hbs.registerPartials(join(__dirname, '..', 'src', 'webapp', 'views', 'partials'));

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
