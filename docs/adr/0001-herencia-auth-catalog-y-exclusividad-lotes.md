# ADR-0001: Decisiones arquitectónicas heredadas de Auth y Catalog

## Estado

Accepted para HU-05 y HU-06. La parte de Wallet queda fuera de este ADR porque pertenece a otro repositorio.

## Contexto

Sprint 2 incorpora la agrupación de objetos en lotes. Auth y el módulo existente de Items
en Catalog son las referencias verificables para identidad, autorización, persistencia y
errores.

## Decisiones identificadas

1. Cada microservicio usa PostgreSQL en su propio esquema y no realiza joins entre
   servicios.
2. El servicio propietario aplica autorización local: verifica el JWT emitido por Auth
   contra JWKS y restringe las escrituras mediante `JwtAuthGuard`, `RolesGuard` y
   `@Roles(Role.STAFF)`.
3. Los casos de uso dependen de su almacenamiento local y las operaciones con invariantes
   de concurrencia se arbitran en la base de datos, no mediante comprobaciones previas en
   memoria.
4. Los errores HTTP se normalizan como Problem Details y Swagger se configura una sola vez
   en `main.ts`.
5. La exclusividad de un objeto entre lotes activos se implementa en una transacción local:
   se crea el lote y se cambian todos los objetos de `AVAILABLE` a `IN_LOT` solo si aún no
   tienen `lotId`. Si cualquiera ya cambió, la transacción completa se revierte.

## Evidencia

- `ecilost-auth-service/README.md`: tokens Bearer, JWKS y separación de roles.
- `ecilost-auth-service/prisma/schema.prisma`: regla explícita de esquema por servicio y
  sin joins cruzados.
- `ecilost-catalog-service/src/items/repositories/prisma-item.repository.ts`: escrituras
  condicionales con Prisma para evitar carreras.
- `ecilost-catalog-service/src/main.ts`: `ValidationPipe`, filtro Problem Details y Swagger
  globales.
- `docs/ECILOST-Diagrama-Clases.md`, secciones 5 y 6: `LotService.assertExclusive()` dentro
  de la transacción de creación y la regla de un motor relacional por servicio.

## Consecuencias

- `Lot` e `Item` se relacionan dentro del esquema `catalog`; no se introduce ninguna
  dependencia hacia Auth ni Auction en la base.
- Un fallo de exclusividad responde 409 y no deja objetos parcialmente asignados.
- Las rutas de lote requieren sesión válida; crear lotes requiere el rol `STAFF`.

## Aplicación al proyecto actual

Se agrega `Lot`, `LotStatus`, su migración PostgreSQL y los endpoints protegidos de creación
y consulta. El cierre o cancelación libera los objetos mediante un método de servicio para
que la futura integración con Auction no tenga que modificar tablas de Catalog directamente.

## Información faltante

- No hay evidencia de la ruta, el contrato de evento ni el responsable que invocará el cierre
  o cancelación de un lote desde Auction; por eso no se expone un endpoint adicional para esa
  operación.
- No hay evidencia de una política de nombres de rama Git Flow más específica que `develop`.
