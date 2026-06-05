import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { sendNewMessageEmail } from '@/lib/resend';
import { trackServerEvent } from '@/lib/posthog-server';
import { broadcastNewMessage, broadcastUnread, broadcastRead } from '@/lib/supabase/broadcast';
import { localeUrl } from '@/lib/email/url';
import { resolveEmailLocale } from '@/lib/email/types';

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: conversationId } = await params;

  const participant = await prisma.conversationParticipant.findUnique({
    where: {
      conversationId_userId: { conversationId, userId: user.id },
    },
  });

  if (!participant) {
    return NextResponse.json({ error: 'Not a participant' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get('cursor');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      sender: {
        select: { id: true, displayName: true, contactValue: true },
      },
    },
  });

  const hasMore = messages.length > limit;
  if (hasMore) messages.pop();

  await prisma.conversationParticipant.update({
    where: { id: participant.id },
    data: { lastReadAt: new Date() },
  });
  await broadcastRead(user.id);

  const result = messages.map((m) => ({
    id: m.id,
    content: m.content,
    senderId: m.senderId,
    senderName: m.sender.displayName || m.sender.contactValue || 'User',
    createdAt: m.createdAt.toISOString(),
    isOwn: m.senderId === user.id,
  }));

  return NextResponse.json({
    messages: result,
    nextCursor: hasMore ? messages[messages.length - 1].id : null,
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: conversationId } = await params;
  const body = await request.json();
  const { content } = body;

  if (!content?.trim()) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 });
  }

  const participant = await prisma.conversationParticipant.findUnique({
    where: {
      conversationId_userId: { conversationId, userId: user.id },
    },
  });

  if (!participant) {
    return NextResponse.json({ error: 'Not a participant' }, { status: 403 });
  }

  const [message] = await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId,
        senderId: user.id,
        content: content.trim(),
      },
    }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    }),
    prisma.conversationParticipant.update({
      where: { id: participant.id },
      data: { lastReadAt: new Date() },
    }),
  ]);

  // Send email to the other participant
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      listing: { select: { title: true } },
      participants: {
        where: { userId: { not: user.id } },
        include: {
          user: { select: { email: true, locale: true } },
        },
      },
    },
  });

  if (conversation && process.env.RESEND_API_KEY) {
    const otherParticipant = conversation.participants[0];
    const recipientEmail = otherParticipant?.user.email ?? null;

    if (recipientEmail) {
      const senderName = user.user_metadata?.display_name || user.email || 'Someone';
      const locale = resolveEmailLocale(otherParticipant?.user.locale);

      await sendNewMessageEmail({
        to: recipientEmail,
        locale,
        listingTitle: conversation.listing.title,
        senderName,
        messageText: content.trim(),
        conversationUrl: localeUrl(locale, `/messages?c=${conversationId}`),
      });
    }
  }

  const senderProfile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { displayName: true },
  });

  const senderDisplayName =
    senderProfile?.displayName || user.user_metadata?.display_name || user.email || 'User';

  const broadcastPayload = {
    id: message.id,
    content: message.content,
    senderId: message.senderId,
    senderName: senderDisplayName,
    createdAt: message.createdAt.toISOString(),
    conversationId,
  };

  await broadcastNewMessage(conversationId, broadcastPayload);

  if (conversation) {
    const otherParticipant = conversation.participants[0];
    if (otherParticipant) {
      await broadcastUnread(otherParticipant.userId, broadcastPayload);
    }
  }

  trackServerEvent(user.id, 'message_sent', {
    conversation_id: conversationId,
  });

  return NextResponse.json(
    {
      id: message.id,
      content: message.content,
      senderId: message.senderId,
      createdAt: message.createdAt.toISOString(),
    },
    { status: 201 },
  );
}
