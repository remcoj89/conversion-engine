import { AsyncLocalStorage } from "node:async_hooks";

export type DatabaseScope =
  | "anonymous"
  | "identity"
  | "identity_only"
  | "customer"
  | "reviewer"
  | "platform_admin"
  | "maintenance";

export type DatabaseRequestContext = {
  scope: DatabaseScope;
  subject?: string;
  tenantId?: string;
  invitationTokenHash?: string;
};

const storage = new AsyncLocalStorage<DatabaseRequestContext>();

export function createDatabaseRequestContext(): DatabaseRequestContext {
  return { scope: "anonymous" };
}

export function enterDatabaseRequestContext(context: DatabaseRequestContext): void {
  storage.enterWith(context);
}

export function ensureDatabaseRequestContext(holder: {
  dbRequestContext?: DatabaseRequestContext;
}): DatabaseRequestContext {
  if (holder.dbRequestContext) return holder.dbRequestContext;
  const context = createDatabaseRequestContext();
  holder.dbRequestContext = context;
  enterDatabaseRequestContext(context);
  return context;
}

export function runWithDatabaseContext<T>(context: DatabaseRequestContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(context, fn);
}

export function getDatabaseRequestContext(): DatabaseRequestContext | undefined {
  return storage.getStore();
}

export function setDatabaseIdentity(context: DatabaseRequestContext, subject: string, scope: DatabaseScope): void {
  context.scope = scope;
  context.subject = subject;
  context.tenantId = undefined;
  context.invitationTokenHash = undefined;
}

export function setDatabaseTenant(context: DatabaseRequestContext, scope: "customer" | "reviewer", tenantId: string): void {
  context.scope = scope;
  context.tenantId = tenantId;
  context.invitationTokenHash = undefined;
}

export function setDatabasePlatformAdmin(context: DatabaseRequestContext, subject: string): void {
  context.scope = "platform_admin";
  context.subject = subject;
  context.tenantId = undefined;
  context.invitationTokenHash = undefined;
}

export function setDatabaseInvitationTokenHash(context: DatabaseRequestContext, tokenHash: string): void {
  context.invitationTokenHash = tokenHash;
}
