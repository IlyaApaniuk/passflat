import { prisma } from '@/lib/prisma';

import { getCity } from './lookup';
import { normalizeLocale, type BotLocale } from './texts';

/**
 * Chat and subscription persistence.
 *
 * Chats are identified by Telegram's numeric chat id alone — no account, no
 * email. That is the point of the channel: a lookup costs one tap, and the
 * subscription that follows is the only push surface we own.
 */

export interface TouchChatInput {
  chatId: number;
  locale?: BotLocale;
  startPayload?: string | null;
}

export interface TouchedChat {
  id: string;
  locale: string;
  isNew: boolean;
}

export async function touchChat({
  chatId,
  locale,
  startPayload,
}: TouchChatInput): Promise<TouchedChat> {
  const existing = await prisma.telegramChat.findUnique({
    where: { chatId: BigInt(chatId) },
    select: { id: true, locale: true, startPayload: true },
  });

  if (existing) {
    await prisma.telegramChat.update({
      where: { id: existing.id },
      data: {
        lastSeenAt: new Date(),
        blockedAt: null,
        // First-touch attribution: a later /start must not overwrite the source
        // that originally brought this person in.
        ...(startPayload && !existing.startPayload ? { startPayload } : {}),
      },
    });
    return { id: existing.id, locale: existing.locale, isNew: false };
  }

  const created = await prisma.telegramChat.create({
    data: {
      chatId: BigInt(chatId),
      locale: locale ?? normalizeLocale(undefined),
      startPayload: startPayload ?? null,
    },
    select: { id: true, locale: true },
  });
  return { id: created.id, locale: created.locale, isNew: true };
}

export async function setChatLocale(chatId: number, locale: BotLocale): Promise<void> {
  await prisma.telegramChat.updateMany({
    where: { chatId: BigInt(chatId) },
    data: { locale },
  });
}

export interface SubscriptionTarget {
  buildingId?: string;
  districtSlug?: string;
  citySlug?: string;
}

export interface SubscriptionResult {
  created: boolean;
  name: string;
  targetKey: string;
}

function targetKeyOf(target: SubscriptionTarget): string | null {
  if (target.buildingId) return `b:${target.buildingId}`;
  if (target.districtSlug) return `d:${target.districtSlug}`;
  return null;
}

export async function addSubscription(
  chatId: number,
  target: SubscriptionTarget,
): Promise<SubscriptionResult> {
  const chat = await touchChat({ chatId });
  const targetKey = targetKeyOf(target);
  if (!targetKey) return { created: false, name: '', targetKey: '' };

  let name = target.districtSlug ?? '';
  let buildingId: string | null = null;

  if (target.buildingId) {
    const building = await prisma.building.findUnique({
      where: { id: target.buildingId },
      select: { id: true, addressFull: true },
    });
    if (!building) return { created: false, name: '', targetKey };
    buildingId = building.id;
    name = building.addressFull;
  } else if (target.districtSlug) {
    const city = await getCity(target.citySlug);
    name = city?.districts.find((d) => d.slug === target.districtSlug)?.nameKey ?? name;
  }

  const existing = await prisma.telegramSubscription.findUnique({
    where: { chatId_targetKey: { chatId: chat.id, targetKey } },
    select: { id: true },
  });
  if (existing) return { created: false, name, targetKey };

  await prisma.telegramSubscription.create({
    data: {
      chatId: chat.id,
      targetKey,
      buildingId,
      districtSlug: target.districtSlug ?? '',
      citySlug: target.citySlug ?? 'warsaw',
    },
  });

  return { created: true, name, targetKey };
}

export interface SubscriptionListItem {
  targetKey: string;
  name: string;
}

export async function listSubscriptions(chatId: number): Promise<SubscriptionListItem[]> {
  const chat = await prisma.telegramChat.findUnique({
    where: { chatId: BigInt(chatId) },
    select: { id: true },
  });
  if (!chat) return [];

  const subs = await prisma.telegramSubscription.findMany({
    where: { chatId: chat.id },
    select: {
      targetKey: true,
      districtSlug: true,
      citySlug: true,
      building: { select: { addressFull: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const city = subs.some((sub) => !sub.building) ? await getCity() : null;

  return subs.map((sub) => ({
    targetKey: sub.targetKey,
    name:
      sub.building?.addressFull ??
      city?.districts.find((d) => d.slug === sub.districtSlug)?.nameKey ??
      sub.districtSlug,
  }));
}

export async function removeSubscription(chatId: number, targetKey: string): Promise<void> {
  const chat = await prisma.telegramChat.findUnique({
    where: { chatId: BigInt(chatId) },
    select: { id: true },
  });
  if (!chat) return;
  await prisma.telegramSubscription.deleteMany({ where: { chatId: chat.id, targetKey } });
}
