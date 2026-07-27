import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { sendNewMessageEmail } from '@/lib/resend';
import { trackServerEvent } from '@/lib/posthog-server';
import {
  broadcastNewMessage,
  broadcastUnread,
  broadcastNewConversation,
} from '@/lib/supabase/broadcast';
import { localeUrl } from '@/lib/email/url';
import { resolveEmailLocale } from '@/lib/email/types';
import { isAccountDeleted, ACCOUNT_DELETED_RESPONSE } from '@/lib/active-user';

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (await isAccountDeleted(user.id)) {
    return NextResponse.json(ACCOUNT_DELETED_RESPONSE, { status: 403 });
  }

  const body = await request.json();
  const { listingId, message } = body;

  if (!listingId || !message?.trim()) {
    return NextResponse.json({ error: 'listingId and message are required' }, { status: 400 });
  }

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: {
      author: {
        select: { id: true, email: true, contactValue: true, displayName: true, locale: true },
      },
      building: { include: { city: true } },
    },
  });

  if (!listing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  }

  if (listing.authorId === user.id) {
    return NextResponse.json(
      { error: 'Cannot message yourself about your own listing' },
      { status: 400 },
    );
  }

  const existingConversation = await prisma.conversation.findFirst({
    where: {
      listingId,
      participants: {
        every: {
          userId: { in: [user.id, listing.authorId] },
        },
      },
    },
    include: {
      participants: true,
    },
  });

  let conversationId: string;
  let createdMessage: { id: string; content: string; senderId: string; createdAt: Date };
  let isNewConversation = false;

  if (existingConversation) {
    conversationId = existingConversation.id;

    createdMessage = await prisma.message.create({
      data: {
        conversationId,
        senderId: user.id,
        content: message.trim(),
      },
    });

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
  } else {
    const conversation = await prisma.conversation.create({
      data: {
        listingId,
        participants: {
          create: [{ userId: user.id }, { userId: listing.authorId }],
        },
        messages: {
          create: {
            senderId: user.id,
            content: message.trim(),
          },
        },
      },
      include: { messages: { take: 1 } },
    });
    conversationId = conversation.id;
    createdMessage = conversation.messages[0];
    isNewConversation = true;
  }

  const senderProfile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { displayName: true },
  });

  const senderDisplayName =
    senderProfile?.displayName || user.user_metadata?.display_name || user.email || 'User';

  const authorEmail = listing.author?.email ?? null;
  if (authorEmail && process.env.RESEND_API_KEY) {
    const locale = resolveEmailLocale(listing.author?.locale);
    await sendNewMessageEmail({
      to: authorEmail,
      locale,
      listingTitle: listing.title,
      senderName: senderDisplayName,
      messageText: message.trim(),
      conversationUrl: localeUrl(locale, `/messages?c=${conversationId}`),
    });
  }

  const broadcastPayload = {
    id: createdMessage.id,
    senderId: createdMessage.senderId,
    createdAt: createdMessage.createdAt.toISOString(),
    conversationId,
  };

  await broadcastNewMessage(conversationId, broadcastPayload);
  await broadcastUnread(listing.authorId, broadcastPayload);

  if (isNewConversation) {
    await broadcastNewConversation(listing.authorId);
    await broadcastNewConversation(user.id);
  }

  trackServerEvent(user.id, 'conversation_started', {
    listing_id: listingId,
    listing_type: listing.type,
    conversation_id: conversationId,
  });

  return NextResponse.json({ conversationId }, { status: 201 });
}

export async function GET() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const conversations = await prisma.conversation.findMany({
    where: {
      participants: { some: { userId: user.id } },
    },
    orderBy: { updatedAt: 'desc' },
    include: {
      listing: {
        select: {
          id: true,
          title: true,
          type: true,
          photos: true,
        },
      },
      participants: {
        include: {
          user: {
            select: { id: true, displayName: true, contactValue: true },
          },
        },
      },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  const result = conversations.map((conv) => {
    const currentParticipant = conv.participants.find((p) => p.userId === user.id);
    const otherParticipant = conv.participants.find((p) => p.userId !== user.id);
    const lastMessage = conv.messages[0] ?? null;

    return {
      id: conv.id,
      listingId: conv.listing.id,
      listingTitle: conv.listing.title,
      listingType: conv.listing.type,
      listingPhoto: conv.listing.photos[0] ?? null,
      otherUser: {
        id: otherParticipant?.user.id ?? '',
        name: otherParticipant?.user.displayName || otherParticipant?.user.contactValue || 'User',
      },
      lastMessage: lastMessage
        ? {
            content: lastMessage.content,
            senderId: lastMessage.senderId,
            createdAt: lastMessage.createdAt.toISOString(),
          }
        : null,
      lastReadAt: currentParticipant?.lastReadAt?.toISOString() ?? null,
      updatedAt: conv.updatedAt.toISOString(),
    };
  });

  // Fill in unread counts where needed
  const conversationsNeedingCount = result.filter((r) => r.lastReadAt === null);
  if (conversationsNeedingCount.length > 0) {
    const counts = await prisma.message.groupBy({
      by: ['conversationId'],
      where: {
        conversationId: {
          in: conversationsNeedingCount.map((c) => c.id),
        },
        senderId: { not: user.id },
      },
      _count: true,
    });
    const countMap = new Map(counts.map((c) => [c.conversationId, c._count]));
    for (const conv of result) {
      if (conv.lastReadAt === null) {
        conv.lastReadAt = null;
        (conv as Record<string, unknown>).unreadCount = countMap.get(conv.id) ?? 0;
      }
    }
  }

  // For conversations with lastReadAt, count messages after that timestamp
  const conversationsWithReadAt = result.filter((r) => r.lastReadAt !== null);
  if (conversationsWithReadAt.length > 0) {
    for (const conv of conversationsWithReadAt) {
      const count = await prisma.message.count({
        where: {
          conversationId: conv.id,
          senderId: { not: user.id },
          createdAt: { gt: new Date(conv.lastReadAt!) },
        },
      });
      (conv as Record<string, unknown>).unreadCount = count;
    }
  }

  return NextResponse.json(result);
}
