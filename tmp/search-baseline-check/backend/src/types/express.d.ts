import type { Role } from "../generated/prisma/client.js";
export type Actor = {
  id: string;
  name: string;
  email: string;
  role: Role;
  accessRole?: { id: string; name: string; permissions: unknown; scope: string } | null;
  rolePermissions?: string[];
  roleScope?: string;
  departmentIds: string[];
  sessionId: string;
  ipAddress?: string | null;
};
declare global {
  namespace Express {
    interface Request {
      actor: Actor;
    }
  }
}
