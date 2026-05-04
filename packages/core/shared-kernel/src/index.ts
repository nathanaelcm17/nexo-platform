/**
 * Shared Kernel - Value Objects y tipos base del núcleo.
 *
 * Este paquete contiene las primitivas que comparten todos los bounded
 * contexts del núcleo. No depende de ningún otro paquete.
 */

export * from './value-objects/money.js';
export * from './value-objects/tax-id.js';
export * from './value-objects/phone.js';
export * from './events/domain-event.js';
export * from './errors/domain-error.js';
export * from './types/branded.js';
