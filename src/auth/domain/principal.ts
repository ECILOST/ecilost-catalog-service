import type { Role } from './role.enum.js';

/**
 * Identidad ya autenticada, derivada del access token que emite ecilost-auth-service.
 * Es lo que viaja por el sistema: nunca el correo ni el nombre, para minimizar el PII que
 * cruza los microservicios.
 *
 * Solo expone la capacidad que este servicio decide. `canScheduleRooms` y `canBid` existen
 * en el Principal de auth-service pero aqui se omiten a proposito: catalog no manda sobre
 * salas ni pujas, y tener el metodo invitaria a usarlo como si fuera autoridad en este lado.
 */
export class Principal {
  constructor(
    readonly userId: string,
    readonly role: Role,
  ) {}

  hasRole(role: Role): boolean {
    return this.role === role;
  }

  /** Registrar objetos y agrupar lotes. Solo el funcionario administra el catalogo. */
  canManageCatalog(): boolean {
    return this.role === 'STAFF';
  }
}
