import type { User } from '@prisma/client';
import { prisma } from '../lib/clients.js';
import type { GoogleProfile } from './google-oauth.service.js';

// Shape returned to the frontend; never includes internal fields.
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export function toPublicUser(user: User): PublicUser {
  return { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl };
}

export async function findUserById(id: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } });
}

// Match on googleId first (stable even if the Gmail address changes), then on email
// (links an account that was first created via dev-login). Profile fields are refreshed each login.
export async function upsertGoogleUser(profile: GoogleProfile): Promise<User> {
  const data = {
    googleId: profile.googleId,
    email: profile.email,
    name: profile.name,
    avatarUrl: profile.avatarUrl,
  };
  const existing = await prisma.user.findFirst({
    where: { OR: [{ googleId: profile.googleId }, { email: profile.email }] },
  });
  return existing
    ? prisma.user.update({ where: { id: existing.id }, data })
    : prisma.user.create({ data });
}

// Dev-login users have no googleId; an existing user is returned unchanged.
export async function upsertDevUser(email: string, name?: string): Promise<User> {
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: name ?? email.split('@')[0] ?? email },
  });
}
