import { withOrg } from "@workspace/db";
import {
  adminCreateUser,
  adminDeleteUser,
  adminGetUserByEmail,
  adminUpdateUserPassword,
  SupabaseUserExistsError,
} from "./supabase-admin.ts";

/**
 * Shared helpers that keep identity.users and Supabase auth.users in sync.
 * Supabase accounts are created outside the tenant transaction; the helper
 * compensates by deleting the Supabase user if the database insert fails so
 * a retried creation does not hit "email already registered".
 */

export interface CreatedCampusAccount {
  id: string;
  supabaseUserId: string;
}

export class CampusEmailConflictError extends Error {
  constructor() {
    super("An account with this email already exists.");
    this.name = "CampusEmailConflictError";
  }
}

/** Create a Supabase user plus the identity.users row for a brand-new account. */
export async function createCampusAccountWithPassword(input: {
  orgId: string;
  email: string;
  name: string;
  temporaryPassword: string;
  mustChangePassword: boolean;
  temporaryPasswordExpiresAt: Date;
}): Promise<CreatedCampusAccount> {
  let supabaseUserId: string;
  try {
    supabaseUserId = (await adminCreateUser({
      email: input.email,
      password: input.temporaryPassword,
      emailConfirm: true,
    })).id;
  } catch (error) {
    if (error instanceof SupabaseUserExistsError) throw new CampusEmailConflictError();
    throw error;
  }

  try {
    return await withOrg(input.orgId, async (client) => {
      const created = await client.query<{ id: string }>(
        `INSERT INTO identity.users
           (org_id, email, name, password_hash, supabase_user_id, status,
            must_change_password, temporary_password_expires_at)
         VALUES ($1, $2, $3, NULL, $4, 'active', $5, $6)
         RETURNING id`,
        [
          input.orgId,
          input.email,
          input.name,
          supabaseUserId,
          input.mustChangePassword,
          input.temporaryPasswordExpiresAt,
        ],
      );
      const id = created.rows[0]?.id;
      if (!id) throw new Error("Campus account was not created.");
      return { id, supabaseUserId };
    });
  } catch (error) {
    await adminDeleteUser(supabaseUserId).catch(() => undefined);
    if ((error as { code?: string }).code === "23505") throw new CampusEmailConflictError();
    throw error;
  }
}

/**
 * Migrate-on-login: link an existing legacy (scrypt) campus account to
 * Supabase Auth. Reuses an unlinked auth.users row with the same email or
 * creates one, pins the password, then clears the legacy hash.
 */
export async function linkLegacyAccountToSupabase(input: {
  orgId: string;
  userId: string;
  email: string;
  password: string;
}): Promise<string> {
  let supabaseUser = await adminGetUserByEmail(input.email);
  if (!supabaseUser) {
    supabaseUser = await adminCreateUser({
      email: input.email,
      password: input.password,
      emailConfirm: true,
    });
  }
  await adminUpdateUserPassword(supabaseUser.id, input.password);

  try {
    await withOrg(input.orgId, (client) =>
      client.query(
        `UPDATE identity.users
            SET supabase_user_id = $1, password_hash = NULL, updated_at = now()
          WHERE id = $2 AND org_id = $3`,
        [supabaseUser!.id, input.userId, input.orgId],
      ),
    );
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      // The Supabase account is already linked to a different campus user.
      throw new CampusEmailConflictError();
    }
    throw error;
  }
  return supabaseUser.id;
}
