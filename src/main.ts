import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

const API_DESCRIPTION = [
  'Catalogo de **ECI Lost & Auction**: los objetos perdidos no reclamados que la',
  'universidad pone a subasta, los lotes que los agrupan y su material multimedia.',
  '',
  'El registro y la administracion del inventario son operaciones de funcionario. La',
  'sesion la emite ecilost-auth-service y este servicio la verifica localmente contra su',
  'JWKS, sin llamarlo en cada peticion.',
].join('\n');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  setupSwagger(app);

  await app.listen(process.env.PORT ?? 3001);
}

function setupSwagger(app: Parameters<typeof SwaggerModule.createDocument>[0]): void {
  const documentConfig = new DocumentBuilder()
    .setTitle('ECILOST Catalog Service')
    .setDescription(API_DESCRIPTION)
    .setVersion('1.0.0')
    .addTag('Items', 'Registro y administracion de objetos perdidos')
    .addTag('Health', 'Liveness')
    .build();

  SwaggerModule.setup('docs', app, () =>
    SwaggerModule.createDocument(app, documentConfig),
  );
}

await bootstrap();
