export const roles = ["admin", "gerencia", "vendedor", "cliente"] as const;

export type Role = (typeof roles)[number];

export type SessionPayload = {
  userId: number;
  role: Role;
};

export type CurrentUser = {
  id: number;
  uuid: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  status: "activo" | "inactivo" | "bloqueado";
};
