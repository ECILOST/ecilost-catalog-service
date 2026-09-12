/**
 * Rol que viaja en el claim `role` del access token. No es un dato de este servicio: la
 * fuente de verdad es ecilost-auth-service, que lo publica en su contrato de API. Se
 * declara aqui, y no se reexporta de Prisma como alla, porque catalog no comparte esquema
 * con auth y la regla del proyecto prohibe el join cruzado.
 *
 * La forma imita la que genera Prisma para un enum, para que el uso sea identico.
 */
export const Role = {
  STUDENT: 'STUDENT',
  STAFF: 'STAFF',
} as const;

export type Role = (typeof Role)[keyof typeof Role];
