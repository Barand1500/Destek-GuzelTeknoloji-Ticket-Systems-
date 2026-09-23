import type { Role } from "../generated/prisma/client.js";
export type Actor = {
  id: string;
  name: string;
  email: string;
  role: Role;
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
