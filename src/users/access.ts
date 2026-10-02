import type { UserStore } from '../storage/types.js';
import type { SubscriptionService } from '../subscriptions/service.js';
import type { User } from '../types.js';

export interface UserProfile {
  id: string;
  username: string | null;
  firstName: string | null;
}

/**
 * Quién puede usar el bot. El administrador (TELEGRAM_ADMIN_ID) tiene acceso
 * siempre; el resto tiene que solicitarlo y esperar a que el administrador lo acepte.
 */
export class AccessService {
  constructor(
    private readonly users: UserStore,
    private readonly subscriptions: SubscriptionService,
    readonly adminId: string,
  ) {}

  isAdmin(userId: string): boolean {
    return userId === this.adminId;
  }

  getUser(userId: string): Promise<User | undefined> {
    return this.users.get(userId);
  }

  listUsers(): Promise<User[]> {
    return this.users.list();
  }

  async isApproved(userId: string): Promise<boolean> {
    if (this.isAdmin(userId)) return true;
    return (await this.users.get(userId))?.status === 'approved';
  }

  /**
   * Registra la solicitud de acceso. Si el usuario ya existía no cambia nada
   * (un rechazado no puede volver a pedirlo; solo el administrador puede cambiarlo).
   * `created` indica si es una solicitud nueva, que hay que avisar al administrador.
   */
  async requestAccess(profile: UserProfile): Promise<{ user: User; created: boolean }> {
    const existing = await this.users.get(profile.id);
    if (existing) return { user: existing, created: false };

    const status = this.isAdmin(profile.id) ? 'approved' : 'pending';
    return { user: await this.users.create({ ...profile, status }), created: true };
  }

  approve(userId: string): Promise<User | undefined> {
    return this.users.setStatus(userId, 'approved');
  }

  /** Rechaza la solicitud o revoca el acceso. Sus búsquedas se pausan para que deje de recibir avisos. */
  async reject(userId: string): Promise<User | undefined> {
    if (this.isAdmin(userId)) throw new Error('No se puede revocar el acceso al administrador');
    const user = await this.users.setStatus(userId, 'rejected');
    if (user) await this.subscriptions.pauseAllByUser(userId);
    return user;
  }
}
