import type { FastifyPluginAsync } from "fastify";
import {
  ChangePasswordBody,
  CreateSchoolAdminAccountBody,
  CreateTeacherAccountBody,
  GetSchoolAdminAccountsQueryParams,
  LoginBody,
  ResetPasswordParams,
  UpdateSchoolAdminAccountBody,
  UpdateSchoolAdminAccountParams,
} from "@workspace/api-zod";
import { pool, withOrg } from "@workspace/db";
import { createRouteRegistrar } from "../lib/fastify-routes";
import {
  findAccountBySupabaseUserId,
  requireAuth,
  requireRoles,
  verifyPassword,
  verifySupabaseToken,
} from "../lib/auth";
import {
  canDeactivateSchoolAdmin,
  canCreateSchoolAdmin,
  canManageUser,
  generateTemporaryPassword,
  isValidNewPassword,
} from "../lib/identity-security";
import {
  adminSignOutAllSessions,
  adminUpdateUserPassword,
  signInWithPassword,
  type SupabaseSession,
} from "../lib/supabase-admin";
import {
  CampusEmailConflictError,
  createCampusAccountWithPassword,
  linkLegacyAccountToSupabase,
} from "../lib/user-provisioning";

const routes: FastifyPluginAsync = async (fastify) => {
const router = createRouteRegistrar(fastify);

function invalid(message: string, code = "INVALID_REQUEST") {
  return { error: { code, message } };
}

router.post("/identity/auth/login", async (req, res, next) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(invalid("Enter a valid organization, email, and password."));
    return;
  }

  try {
    const orgResult = await pool.query<{ id: string; name: string }>(
      "SELECT id, name FROM identity.organizations WHERE slug = $1 LIMIT 1",
      [parsed.data.orgSlug.trim().toLowerCase()],
    );
    const org = orgResult.rows[0];
    if (!org) {
      res.status(401).json(invalid("Invalid organization or credentials.", "INVALID_CREDENTIALS"));
      return;
    }

    const userResult = await withOrg(org.id, async (client) =>
      client.query<{
        id: string;
        org_id: string;
        name: string;
        email: string;
        password_hash: string | null;
        supabase_user_id: string | null;
        status: string;
        must_change_password: boolean;
        temporary_password_expires_at: Date | null;
        roles: Array<"super_admin" | "org_admin" | "campus_admin" | "hod" | "teacher" | "class_teacher" | "student" | "parent">;
      }>(
        `SELECT u.id, u.org_id, u.name, u.email, u.password_hash, u.supabase_user_id, u.status,
                u.must_change_password, u.temporary_password_expires_at,
                COALESCE(array_agg(ur.role) FILTER (WHERE ur.role IS NOT NULL), '{}') AS roles
           FROM identity.users AS u
           LEFT JOIN identity.user_roles AS ur
             ON ur.user_id = u.id AND ur.org_id = u.org_id
          WHERE u.org_id = $1 AND lower(u.email) = lower($2)
          GROUP BY u.id`,
        [org.id, parsed.data.email],
      ),
    );
    const user = userResult.rows[0];
    if (!user || user.status !== "active" || user.roles.length === 0) {
      res.status(401).json(invalid("Invalid organization or credentials.", "INVALID_CREDENTIALS"));
      return;
    }
    if (
      user.must_change_password &&
      (!user.temporary_password_expires_at ||
        user.temporary_password_expires_at.getTime() <= Date.now())
    ) {
      res.status(403).json(invalid("Your temporary password has expired.", "PASSWORD_EXPIRED"));
      return;
    }

    const authUser = {
      id: user.id,
      orgId: user.org_id,
      name: user.name,
      email: user.email,
      roles: user.roles,
      mustChangePassword: user.must_change_password,
    };

    let session: SupabaseSession | null;
    if (user.supabase_user_id) {
      session = await signInWithPassword(user.email, parsed.data.password);
    } else if (user.password_hash && (await verifyPassword(parsed.data.password, user.password_hash))) {
      // Migrate-on-login: legacy scrypt account verified; move it to Supabase Auth.
      await linkLegacyAccountToSupabase({
        orgId: user.org_id,
        userId: user.id,
        email: user.email,
        password: parsed.data.password,
      });
      session = await signInWithPassword(user.email, parsed.data.password);
    } else {
      session = null;
    }

    if (!session) {
      res.status(401).json(invalid("Invalid organization or credentials.", "INVALID_CREDENTIALS"));
      return;
    }
    res.status(200).json({
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresAt: session.expires_at,
      user: authUser,
    });
  } catch (error) {
    if (error instanceof CampusEmailConflictError) {
      res.status(409).json(invalid("This email is already registered to another account. Contact your administrator.", "CONFLICT"));
      return;
    }
    next(error);
  }
});

router.post("/identity/auth/logout", async (req, res, next) => {
  try {
    // Revoke the caller's Supabase session server-side when a bearer token is
    // present; the browser client also calls supabase.auth.signOut() locally.
    const authorization = req.headers.authorization;
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
    const claims = token ? await verifySupabaseToken(token) : null;
    if (claims) {
      const account = await findAccountBySupabaseUserId(claims.sub);
      if (account) await adminSignOutAllSessions(claims.sub);
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.post("/identity/auth/change-password", requireAuth, async (req, res, next) => {
  const user = req.campusUser;
  if (!user) return void res.status(401).json(invalid("Sign in to continue.", "UNAUTHENTICATED"));

  const parsed = ChangePasswordBody.safeParse(req.body);
  if (!parsed.success || !isValidNewPassword(parsed.data.newPassword)) {
    return void res.status(400).json(invalid("Your new password must contain 12–256 characters."));
  }
  if (parsed.data.currentPassword === parsed.data.newPassword) {
    return void res.status(400).json(invalid("Choose a password different from your current password."));
  }

  try {
    const current = await withOrg(user.orgId, (client) =>
      client.query<{ password_hash: string | null; supabase_user_id: string | null; email: string }>(
        `SELECT password_hash, supabase_user_id, email
           FROM identity.users
          WHERE id = $1 AND org_id = $2 AND status = 'active'`,
        [user.id, user.orgId],
      ),
    );
    const row = current.rows[0];
    if (!row) {
      return void res.status(401).json(invalid("Sign in to continue.", "UNAUTHENTICATED"));
    }
    // The Supabase password is authoritative; fall back to the legacy hash
    // for accounts that have not yet logged in since the migration.
    const currentPasswordValid = row.supabase_user_id
      ? (await signInWithPassword(row.email, parsed.data.currentPassword)) !== null
      : row.password_hash
        ? await verifyPassword(parsed.data.currentPassword, row.password_hash)
        : false;
    if (!currentPasswordValid) {
      return void res.status(401).json(invalid("Your current password is incorrect.", "INVALID_CREDENTIALS"));
    }

    if (row.supabase_user_id) {
      await adminUpdateUserPassword(row.supabase_user_id, parsed.data.newPassword);
    } else {
      await linkLegacyAccountToSupabase({
        orgId: user.orgId,
        userId: user.id,
        email: row.email,
        password: parsed.data.newPassword,
      });
    }
    const updated = await withOrg(user.orgId, (client) =>
      client.query(
        `UPDATE identity.users
            SET must_change_password = false, password_hash = NULL,
                temporary_password_expires_at = NULL, updated_at = now()
          WHERE id = $1 AND org_id = $2
          RETURNING id`,
        [user.id, user.orgId],
      ),
    );
    if (!updated.rowCount) {
      return void res.status(409).json(invalid("Your password changed in another request. Sign in again.", "PASSWORD_CHANGED"));
    }

    const updatedUser = { ...user, mustChangePassword: false };
    res.json({ user: updatedUser });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/identity/teachers",
  requireAuth,
  requireRoles("super_admin", "org_admin", "campus_admin"),
  async (req, res, next) => {
    const actor = req.campusUser;
    if (!actor) return void res.status(401).json(invalid("Sign in to continue.", "UNAUTHENTICATED"));

    const parsed = CreateTeacherAccountBody.safeParse(req.body);
    if (!parsed.success) {
      return void res.status(400).json(invalid("Enter a valid teacher name and email address."));
    }
    const name = parsed.data.name.trim();
    const email = parsed.data.email.trim().toLowerCase();
    if (!name || !email) {
      return void res.status(400).json(invalid("Teacher name and email cannot be blank."));
    }

    try {
      const temporaryPassword = generateTemporaryPassword();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const teacher = await createCampusAccountWithPassword({
        orgId: actor.orgId,
        email,
        name,
        temporaryPassword,
        mustChangePassword: true,
        temporaryPasswordExpiresAt: expiresAt,
      });
      await withOrg(actor.orgId, (client) =>
        client.query(
          `INSERT INTO identity.user_roles (org_id, user_id, role)
           VALUES ($1, $2, 'teacher')`,
          [actor.orgId, teacher.id],
        ),
      );

      res.status(201).json({
        id: teacher.id,
        name,
        email,
        role: "teacher",
        temporaryPassword,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (error: any) {
      if (error instanceof CampusEmailConflictError || error?.code === "23505") {
        return void res.status(409).json(invalid("An account with this email already exists in your school.", "CONFLICT"));
      }
      next(error);
    }
  },
);

router.post(
  "/identity/admins",
  requireAuth,
  requireRoles("super_admin", "org_admin"),
  async (req, res, next) => {
    const actor = req.campusUser;
    if (!actor) return void res.status(401).json(invalid("Sign in to continue.", "UNAUTHENTICATED"));
    if (!canCreateSchoolAdmin(actor.roles)) {
      return void res.status(403).json(invalid("Only a school or platform administrator can create a school administrator.", "FORBIDDEN"));
    }

    const parsed = CreateSchoolAdminAccountBody.safeParse(req.body);
    if (!parsed.success) {
      return void res.status(400).json(invalid("Enter a valid administrator name and email address."));
    }
    const name = parsed.data.name.trim();
    const email = parsed.data.email.trim().toLowerCase();
    if (!name || !email) {
      return void res.status(400).json(invalid("Administrator name and email cannot be blank."));
    }

    try {
      const temporaryPassword = generateTemporaryPassword();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const administrator = await createCampusAccountWithPassword({
        orgId: actor.orgId,
        email,
        name,
        temporaryPassword,
        mustChangePassword: true,
        temporaryPasswordExpiresAt: expiresAt,
      });
      await withOrg(actor.orgId, (client) =>
        client.query(
          `INSERT INTO identity.user_roles (org_id, user_id, role)
           VALUES ($1, $2, 'org_admin')`,
          [actor.orgId, administrator.id],
        ),
      );

      req.log.info(
        { actorUserId: actor.id, organizationId: actor.orgId, createdUserId: administrator.id, createdRole: "org_admin" },
        "School administrator account created",
      );
      res.status(201).json({
        id: administrator.id,
        name,
        email,
        role: "org_admin",
        temporaryPassword,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (error: any) {
      if (error instanceof CampusEmailConflictError || error?.code === "23505") {
        return void res.status(409).json(invalid("An account with this email already exists in your school.", "CONFLICT"));
      }
      next(error);
    }
  },
);

router.get(
  "/identity/admins",
  requireAuth,
  requireRoles("super_admin", "org_admin"),
  async (req, res, next) => {
    const actor = req.campusUser;
    if (!actor) return void res.status(401).json(invalid("Sign in to continue.", "UNAUTHENTICATED"));
    if (!canCreateSchoolAdmin(actor.roles)) {
      return void res.status(403).json(invalid("Only a school or platform administrator can view school administrator accounts.", "FORBIDDEN"));
    }
    const rawQuery = req.query as Record<string, unknown>;
    const rawIncludeDisabled = rawQuery.includeDisabled;
    if (
      rawIncludeDisabled !== undefined &&
      rawIncludeDisabled !== true &&
      rawIncludeDisabled !== false &&
      rawIncludeDisabled !== "true" &&
      rawIncludeDisabled !== "false"
    ) {
      return void res.status(400).json(invalid("includeDisabled must be true or false."));
    }
    const parsed = GetSchoolAdminAccountsQueryParams.safeParse({
      ...rawQuery,
      includeDisabled: rawIncludeDisabled === true || rawIncludeDisabled === "true",
    });
    if (!parsed.success) return void res.status(400).json(invalid("Provide valid account list filters."));

    try {
      const { includeDisabled, limit, offset } = parsed.data;
      const page = await withOrg(actor.orgId, async (client) => {
        const [countResult, accountResult] = await Promise.all([
          client.query<{ total: number }>(
            `SELECT count(*)::int AS total
               FROM identity.users u
               JOIN identity.user_roles role
                 ON role.org_id = u.org_id AND role.user_id = u.id AND role.role = 'org_admin'
              WHERE u.org_id = $1 AND ($2::boolean OR u.status = 'active')`,
            [actor.orgId, includeDisabled],
          ),
          client.query(
            `SELECT u.id, u.name, u.email, u.status, u.created_at AS "createdAt"
               FROM identity.users u
               JOIN identity.user_roles role
                 ON role.org_id = u.org_id AND role.user_id = u.id AND role.role = 'org_admin'
              WHERE u.org_id = $1 AND ($2::boolean OR u.status = 'active')
              ORDER BY lower(u.name), lower(u.email), u.id
              LIMIT $3 OFFSET $4`,
            [actor.orgId, includeDisabled, limit, offset],
          ),
        ]);
        return {
          items: accountResult.rows,
          total: countResult.rows[0]?.total ?? 0,
          limit,
          offset,
        };
      });
      res.json(page);
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/identity/admins/:userId",
  requireAuth,
  requireRoles("super_admin", "org_admin"),
  async (req, res, next) => {
    const actor = req.campusUser;
    if (!actor) return void res.status(401).json(invalid("Sign in to continue.", "UNAUTHENTICATED"));
    if (!canCreateSchoolAdmin(actor.roles)) {
      return void res.status(403).json(invalid("Only a school or platform administrator can manage school administrator accounts.", "FORBIDDEN"));
    }

    const params = UpdateSchoolAdminAccountParams.safeParse(req.params);
    const body = UpdateSchoolAdminAccountBody.safeParse(req.body);
    if (!params.success || !body.success) {
      return void res.status(400).json(invalid("Provide a valid administrator ID and account status."));
    }
    if (params.data.userId === actor.id && body.data.status === "disabled") {
      return void res.status(409).json(invalid("You cannot deactivate your own administrator account.", "SELF_DEACTIVATION"));
    }

    try {
      const result = await withOrg(actor.orgId, async (client) => {
        // Lock this school's admin rows in a stable order so concurrent deactivations
        // cannot both pass the final-active-admin check.
        const lockedAdmins = await client.query<{ id: string }>(
          `SELECT u.id
             FROM identity.users u
             JOIN identity.user_roles role
               ON role.org_id = u.org_id AND role.user_id = u.id AND role.role = 'org_admin'
            WHERE u.org_id = $1
            ORDER BY u.id
            FOR UPDATE OF u`,
          [actor.orgId],
        );
        if (!lockedAdmins.rows.some((account) => account.id === params.data.userId)) {
          return { kind: "not_found" as const };
        }

        const currentResult = await client.query<{
          id: string; name: string; email: string; status: "active" | "disabled"; createdAt: Date;
        }>(
          `SELECT u.id, u.name, u.email, u.status, u.created_at AS "createdAt"
             FROM identity.users u
             JOIN identity.user_roles role
               ON role.org_id = u.org_id AND role.user_id = u.id AND role.role = 'org_admin'
            WHERE u.org_id = $1 AND u.id = $2`,
          [actor.orgId, params.data.userId],
        );
        const current = currentResult.rows[0];
        if (!current) return { kind: "not_found" as const };
        if (current.status === body.data.status) return { kind: "updated" as const, account: current, signOutSupabaseUserId: null };

        if (body.data.status === "disabled") {
          const activeCount = await client.query<{ total: number }>(
            `SELECT count(*)::int AS total
               FROM identity.users u
               JOIN identity.user_roles role
                 ON role.org_id = u.org_id AND role.user_id = u.id AND role.role = 'org_admin'
              WHERE u.org_id = $1 AND u.status = 'active'`,
            [actor.orgId],
          );
          if (!canDeactivateSchoolAdmin(actor.id, params.data.userId, activeCount.rows[0]?.total ?? 0)) {
            return { kind: "last_active_admin" as const };
          }
        }

        const updated = await client.query<{
          id: string; name: string; email: string; status: "active" | "disabled"; createdAt: Date;
          supabase_user_id: string | null;
        }>(
          `UPDATE identity.users
              SET status = $3, updated_at = now()
            WHERE org_id = $1 AND id = $2
            RETURNING id, name, email, status, created_at AS "createdAt", supabase_user_id`,
          [actor.orgId, params.data.userId, body.data.status],
        );
        const account = updated.rows[0];
        if (!account) return { kind: "not_found" as const };

        if (body.data.status === "disabled" && account.supabase_user_id) {
          // Sign out Supabase sessions after the transaction commits below.
          return { kind: "updated" as const, account, signOutSupabaseUserId: account.supabase_user_id };
        }
        return { kind: "updated" as const, account };
      });

      if (result.kind === "not_found") {
        return void res.status(404).json(invalid("School administrator not found.", "NOT_FOUND"));
      }
      if (result.kind === "last_active_admin") {
        return void res.status(409).json(invalid("The school must keep at least one active administrator.", "LAST_ACTIVE_ADMIN"));
      }
      if (result.signOutSupabaseUserId) {
        await adminSignOutAllSessions(result.signOutSupabaseUserId).catch((error) =>
          req.log.warn({ error }, "Could not revoke Supabase sessions for disabled administrator"),
        );
      }
      req.log.info(
        { actorUserId: actor.id, organizationId: actor.orgId, targetUserId: result.account.id, status: result.account.status },
        "School administrator account status updated",
      );
      res.json(result.account);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/identity/users/:userId/reset-password",
  requireAuth,
  requireRoles("super_admin", "org_admin", "campus_admin"),
  async (req, res, next) => {
    const actor = req.campusUser;
    if (!actor) return void res.status(401).json(invalid("Sign in to continue.", "UNAUTHENTICATED"));
    const params = ResetPasswordParams.safeParse(req.params);
    if (!params.success) return void res.status(400).json(invalid("A valid user ID is required."));

    try {
      const targetResult = await withOrg(actor.orgId, (client) =>
        client.query<{ id: string; status: string; roles: import("../lib/auth").CampusRole[] }>(
          `SELECT u.id, u.status,
                  COALESCE(array_agg(ur.role) FILTER (WHERE ur.role IS NOT NULL), '{}') AS roles
             FROM identity.users u
             LEFT JOIN identity.user_roles ur
               ON ur.user_id = u.id AND ur.org_id = u.org_id
            WHERE u.id = $1 AND u.org_id = $2
            GROUP BY u.id`,
          [params.data.userId, actor.orgId],
        ),
      );
      const target = targetResult.rows[0];
      if (!target) return void res.status(404).json(invalid("User not found.", "NOT_FOUND"));
      if (target.status !== "active") return void res.status(409).json(invalid("Disabled accounts cannot be reset.", "USER_DISABLED"));
      if (!canManageUser(actor.roles, target.roles)) {
        return void res.status(403).json(invalid("You cannot reset a user with an equal or higher administrative role.", "FORBIDDEN"));
      }

      const temporaryPassword = generateTemporaryPassword();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const targetAccount = await withOrg(actor.orgId, (client) =>
        client.query<{ supabase_user_id: string | null; email: string }>(
          `SELECT supabase_user_id, email
             FROM identity.users
            WHERE id = $1 AND org_id = $2`,
          [target.id, actor.orgId],
        ),
      );
      const targetRow = targetAccount.rows[0];
      if (!targetRow) return void res.status(404).json(invalid("User not found.", "NOT_FOUND"));

      if (targetRow.supabase_user_id) {
        await adminUpdateUserPassword(targetRow.supabase_user_id, temporaryPassword);
        await adminSignOutAllSessions(targetRow.supabase_user_id).catch(() => undefined);
      } else {
        await linkLegacyAccountToSupabase({
          orgId: actor.orgId,
          userId: target.id,
          email: targetRow.email,
          password: temporaryPassword,
        });
      }
      await withOrg(actor.orgId, (client) =>
        client.query(
          `UPDATE identity.users
              SET must_change_password = true,
                  temporary_password_expires_at = $1, updated_at = now()
            WHERE id = $2 AND org_id = $3`,
          [expiresAt, target.id, actor.orgId],
        ),
      );
      res.json({ temporaryPassword, expiresAt: expiresAt.toISOString() });
    } catch (error) {
      next(error);
    }
  },
);

router.get("/identity/me", requireAuth, (req, res, _next) => {
  const user = req.campusUser;
  if (!user) {
    res.status(401).json(invalid("Sign in to continue.", "UNAUTHENTICATED"));
    return;
  }
  res.json({
    id: user.id,
    orgId: user.orgId,
    name: user.name,
    email: user.email,
    roles: user.roles,
    mustChangePassword: user.mustChangePassword,
  });
});
};

export default routes;
