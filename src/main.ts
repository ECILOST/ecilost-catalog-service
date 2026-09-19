import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { ProblemDetailsFilter } from './common/filters/problem-details.filter.js';

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

  // Global y no por controlador: asi un endpoint nuevo no puede responder otro formato
  // de error por olvido.
  app.useGlobalFilters(new ProblemDetailsFilter());

  setupSwagger(app);

  await app.listen(process.env.PORT ?? 3001);
}

function setupSwagger(app: Parameters<typeof SwaggerModule.createDocument>[0]): void {
  const documentConfig = new DocumentBuilder()
    .setTitle('ECILOST Catalog Service')
    .setDescription(API_DESCRIPTION)
    .setVersion('1.0.0')
    .addTag('Items', 'Registro y administracion de objetos perdidos')
<<<<<<< HEAD
    .addTag('Lots', 'Agrupacion exclusiva de objetos disponibles')
=======
    .addTag('Multimedia', 'Fotografias y video que documentan el estado del objeto')
>>>>>>> 51c15bd4862833302295ea5280375e18e2c77f66
    .addTag('Health', 'Liveness')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'Access token emitido por ecilost-auth-service en POST /auth/token. Se envia ' +
          'como `Authorization: Bearer <token>`. Este servicio lo verifica en local ' +
          'contra la JWKS del emisor.',
      },
      'access-token',
    )
    .build();

  SwaggerModule.setup('docs', app, () =>
    SwaggerModule.createDocument(app, documentConfig),
  );
}

await bootstrap();
