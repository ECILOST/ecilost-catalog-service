# ECILOST Catalog Service

Inventario de objetos perdidos de ECI Lost & Auction. Gestiona objetos, lotes exclusivos y multimedia. Atiende las solicitudes de reserva de Auction por RabbitMQ y conserva el inventario en su esquema de PostgreSQL.

## Inicio local

Requiere Node.js 22 y Docker Compose. Levanta Auth para disponer de su JWKS y del JWT de acceso. Usa RabbitMQ para probar la reserva de objetos y lotes desde Auction.

```bash
cp .env.example .env
docker compose up -d
npm ci
npm run db:deploy
npm run start:dev
```

Completa `.env` antes de instalar. Configura `AUTH_JWKS_URL`, `JWT_ISSUER` y `JWT_AUDIENCE` con los valores de Auth. El Compose local incluye PostgreSQL y Azurite para los archivos. En Azure configura el almacenamiento con las variables `AZURE_STORAGE_*` de la plantilla.

## Swagger y permisos

| Recurso | URL local |
|---|---|
| Swagger UI | [/docs](http://localhost:3001/docs) |
| OpenAPI JSON | [/docs-json](http://localhost:3001/docs-json) |
| Respuesta de arranque | [GET /](http://localhost:3001/) |

Obtén un JWT de Auth y pégalo en **Authorize** con el esquema `access-token`. Las consultas requieren autenticación. Las operaciones de escritura requieren `STAFF`.

| Área | Rutas principales |
|---|---|
| Objetos | `GET /items`, `GET /items/{id}`, `POST /items`, `PATCH /items/{id}`, `DELETE /items/{id}` |
| Lotes | `GET /lots`, `GET /lots/{id}`, `POST /lots` |
| Multimedia | `POST /items/{itemId}/media`, `DELETE /items/{itemId}/media/{mediaId}` |
| Fotografías de lote | `POST /lots/{lotId}/photos`, `DELETE /lots/{lotId}/photos/{photoId}` |
| Lote misterioso | `GET /mystery/rounds/{roundId}` |

Swagger muestra los parámetros y esquemas que corresponden a cada ruta. Los errores se devuelven como `application/problem+json`. Un JWT inválido genera `401`, un permiso insuficiente genera `403` y un conflicto de inventario puede generar `409`.

## Multimedia en Azure Blob Storage

La migración desde MinIO verifica cada objeto contra la metadata de Catalog y conserva el origen.

1. Configura `DATABASE_URL`, `AZURE_STORAGE_*` y, para la migración, `MINIO_S3_ENDPOINT`, `MINIO_S3_ACCESS_KEY`, `MINIO_S3_SECRET_KEY` y `MINIO_S3_BUCKET`.
2. Ejecuta `npm run media:migrate:minio` para revisar la copia propuesta.
3. Ejecuta `npm run media:migrate:minio -- --apply` para copiar. Revisa el resultado antes de retirar MinIO.
4. Ejecuta `npm run media:cleanup-orphans` para listar los blobs sin fila `MediaAsset`. Después de revisar el resultado, usa `npm run media:cleanup-orphans -- --apply` para aplicar la limpieza.

`MEDIA_ORPHAN_GRACE_HOURS` ajusta el período de gracia de 24 horas. La limpieza se limita al prefijo `items/` y conserva los registros de PostgreSQL.

## Pruebas y despliegue

```bash
npm test
npm run typecheck
npm run lint
npm run test:e2e
```

La suite de integración usa dobles para la persistencia, el almacenamiento y el JWKS según el caso. GitHub Actions valida PR hacia `develop` y `main`. El despliegue usa GHCR y Azure Container Apps.

- [ADR de pertenencia exclusiva a lotes](docs/adr/0001-herencia-auth-catalog-y-exclusividad-lotes.md)
- [ADR de lote misterioso](docs/adr/0002-lote-misterioso.md)
- [Configuración de ejemplo](.env.example)
