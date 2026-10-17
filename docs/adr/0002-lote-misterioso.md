# ADR-0002: Lote misterioso

## Estado

Accepted. Parte de las subastas dinámicas de auction (ADR-0003 de ecilost-auction-service).

## Contexto

Cuando la ruleta de auction decide que una ronda es un **lote misterioso**, los estudiantes
solo deben ver pistas (por ejemplo "objeto electrónico, encontrado en bloque G") y el objeto se
revela al ganador. El catálogo es abierto a cualquier sesión (`GET /items`, `GET /items/:id`,
`GET /lots`), así que ocultarlo solo en el frontend no bastaría: el objeto se podría pedir
directamente a la API.

## Decisiones

1. **Catalog es quien oculta.** `items.mystery` y `lots.mystery` se encienden al consumir
   `auction.round.mode-selected.v1` con `mode = MYSTERY` (cola `ecilost.catalog.round-modes`),
   solo para lo que siga reservado por esa ronda (`roundId`). Cualquier otro modo los apaga:
   cubre que el dueño desactive la ruleta.
2. **Oculto = inexistente para el estudiante.** `GET /items` lo excluye en la propia consulta
   (la paginación no sale corta) y `GET /items/:id` responde 404, igual que los lotes. El
   funcionario lo sigue viendo todo.
3. **Revelación al ganador.** La liquidación existente (`auction.round.closed.v1`) anota
   `items.awardedTo`; el objeto oculto se le muestra solo a esa persona. Si la ronda queda
   desierta, el objeto vuelve al catálogo sin el misterio.
4. **Pistas.** `items.clues` (hasta 5, de 60 caracteres) las escribe el funcionario al registrar
   o editar. `GET /mystery/rounds/:roundId` entrega por entrada oculta la categoría, la
   condición y las pistas, nunca el nombre, la descripción, las fotos ni el identificador. La
   ficha del estudiante no incluye las pistas.

## Consecuencias

- Migración aditiva `20261016000000_mystery_lots`: columnas con valor por defecto; nada
  existente queda oculto.
- Limitación: un objeto se ve en el catálogo desde que la sala se programa. El misterio
  empieza cuando la ruleta lo elige, no antes.
