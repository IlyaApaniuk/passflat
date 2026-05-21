# Платежи через Stripe (Payments)

## Текущее состояние

### Что уже есть

1. **Prisma модели** (в `prisma/schema.prisma`):

```prisma
model Payment {
  id                       String   @id @default(uuid()) @db.Uuid
  userId                   String   @map("user_id") @db.Uuid
  stripeCheckoutSessionId  String?  @map("stripe_checkout_session_id")
  stripePaymentIntentId    String?  @map("stripe_payment_intent_id")
  productType              String   @map("product_type")
  referenceId              String?  @map("reference_id") @db.Uuid
  amount                   Int
  currency                 String
  status                   String
  createdAt                DateTime @default(now()) @map("created_at")
  user Profile @relation(fields: [userId], references: [id])
  @@map("payments")
}

model Subscription {
  id                   String    @id @default(uuid()) @db.Uuid
  userId               String    @map("user_id") @db.Uuid
  stripeSubscriptionId String?   @map("stripe_subscription_id")
  planType             String    @map("plan_type")
  status               String
  currentPeriodStart   DateTime? @map("current_period_start")
  currentPeriodEnd     DateTime? @map("current_period_end")
  createdAt            DateTime  @default(now()) @map("created_at")
  user Profile @relation(fields: [userId], references: [id])
  @@map("subscriptions")
}
```

2. **ARCHITECTURE.md** упоминает Stripe в tech stack
3. **DEVELOPMENT_PLAN.md** описывает Фазу 4 — Monetization с задачами 4.1-4.5
4. **package.json** — Stripe **НЕ** установлен как зависимость
5. **i18n** — `listings.create.promote7days: "7 days - 39 PLN"` и аналогичные ключи уже есть
6. **UI** — на шаге "Preview" создания объявления есть блок "Promote Your Listing" с ценами, но без обработчика оплаты

### Чего нет

- Пакет `stripe` не установлен
- Нет `src/lib/stripe.ts`
- Нет webhook endpoint `/api/webhooks/stripe`
- Нет Stripe Connect для P2P платежей
- Нет checkout flow
- Кнопка "Promote" на дашборде не функциональна

## Архитектура решения

### Stripe Connect (Standard)

Passflat — маркетплейс, где деньги текут между пользователями. Для этого нужен **Stripe Connect**:

| Тип | Standard | Express | Custom |
|-----|----------|---------|--------|
| Онбординг | Stripe-hosted (минимум работы) | Stripe-hosted | Полностью кастомный |
| Верификация | Stripe | Stripe | Ваша ответственность |
| Dashboard | Полный Stripe Dashboard | Ограниченный | Нет |
| Подходит для | MVP | Масштаб | Enterprise |

**Рекомендация:** **Standard Connect** для MVP. Авторы объявлений подключают свой Stripe аккаунт → получают выплаты напрямую. Passflat берёт комиссию через `application_fee_amount`.

### Use cases

1. **Продвижение объявлений** (Direct charge) — пользователь платит Passflat напрямую
2. **P2P платежи за субаренду** (Connect) — арендатор платит автору через Passflat, Passflat берёт комиссию
3. **Подписки** (Direct) — PRO-аккаунт для автора с повышенным лимитом объявлений (будущее)

## Установка

```bash
npm install stripe @stripe/stripe-js
```

### Серверный клиент

```ts
// src/lib/stripe.ts
import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia',
  typescript: true,
});

export const PRODUCTS = {
  PROMOTE_7: { priceId: process.env.STRIPE_PRICE_PROMOTE_7!, days: 7 },
  PROMOTE_14: { priceId: process.env.STRIPE_PRICE_PROMOTE_14!, days: 14 },
  PROMOTE_30: { priceId: process.env.STRIPE_PRICE_PROMOTE_30!, days: 30 },
} as const;
```

### Клиентский SDK

```ts
// src/lib/stripe-client.ts
import { loadStripe } from '@stripe/stripe-js';

export const getStripe = () => loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
```

### ENV переменные

```env
# .env.local
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PROMOTE_7=price_...
STRIPE_PRICE_PROMOTE_14=price_...
STRIPE_PRICE_PROMOTE_30=price_...
STRIPE_CONNECT_CLIENT_ID=ca_...
```

## Фаза 1: Продвижение объявлений (Direct Charges)

### Модели данных — обновления

Существующая модель `Payment` достаточна. `productType` = `'promoted_listing'`, `referenceId` = `listingId`.

### API: `POST /api/checkout/promote` — создать Checkout Session

```ts
// src/app/api/checkout/promote/route.ts
import { stripe, PRODUCTS } from '@/lib/stripe';

export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { listingId, plan } = await request.json(); // plan: '7' | '14' | '30'

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
  });
  if (!listing || listing.authorId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const product = PRODUCTS[`PROMOTE_${plan}` as keyof typeof PRODUCTS];
  if (!product) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card', 'blik', 'p24'],
    line_items: [{ price: product.priceId, quantity: 1 }],
    metadata: {
      listingId,
      userId: user.id,
      productType: 'promoted_listing',
      promoteDays: String(product.days),
    },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/pl/dashboard?promoted=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pl/dashboard?promoted=cancel`,
  });

  // Сохранить pending payment
  await prisma.payment.create({
    data: {
      userId: user.id,
      stripeCheckoutSessionId: session.id,
      productType: 'promoted_listing',
      referenceId: listingId,
      amount: session.amount_total ?? 0,
      currency: 'PLN',
      status: 'pending',
    },
  });

  return NextResponse.json({ url: session.url });
}
```

### Webhook: `POST /api/webhooks/stripe`

```ts
// src/app/api/webhooks/stripe/route.ts
import { stripe } from '@/lib/stripe';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const headersList = await headers();
  const signature = headersList.get('stripe-signature')!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutComplete(session);
      break;
    }
    case 'checkout.session.expired': {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutExpired(session);
      break;
    }
    // Фаза 2: Connect events
    case 'account.updated':
    case 'transfer.created':
    case 'charge.refunded':
      break;
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const { listingId, userId, productType, promoteDays } = session.metadata!;

  // Идемпотентность: проверить, не обработан ли уже
  const existing = await prisma.payment.findFirst({
    where: { stripeCheckoutSessionId: session.id, status: 'completed' },
  });
  if (existing) return;

  await prisma.$transaction([
    // Обновить payment
    prisma.payment.updateMany({
      where: { stripeCheckoutSessionId: session.id },
      data: {
        status: 'completed',
        stripePaymentIntentId: session.payment_intent as string,
      },
    }),

    // Активировать продвижение
    ...(productType === 'promoted_listing' && listingId
      ? [
          prisma.listing.update({
            where: { id: listingId },
            data: {
              isPromoted: true,
              promotedUntil: new Date(
                Date.now() + Number(promoteDays) * 24 * 60 * 60 * 1000
              ),
            },
          }),
        ]
      : []),
  ]);
}

async function handleCheckoutExpired(session: Stripe.Checkout.Session) {
  await prisma.payment.updateMany({
    where: { stripeCheckoutSessionId: session.id },
    data: { status: 'expired' },
  });
}
```

### Настройка Next.js для webhook

Webhook endpoint не должен парсить body как JSON — нужен raw body:

```ts
// src/app/api/webhooks/stripe/route.ts
// Next.js App Router автоматически даёт raw body через request.text()
// Важно: НЕ использовать request.json()
```

### UI: кнопка Promote на дашборде

```tsx
// В src/app/[locale]/dashboard/client.tsx — обновить DropdownMenuItem "Promote":
<DropdownMenuItem onClick={() => handlePromote(listing.id)}>
  <Sparkles className="mr-2 h-4 w-4" />
  {t("dashboard.promote")}
</DropdownMenuItem>
```

Модалка выбора плана:

```tsx
// src/components/listings/promote-modal.tsx
function PromoteModal({ listingId, open, onOpenChange }) {
  const plans = [
    { key: '7', label: '7 дней', price: '39 PLN' },
    { key: '14', label: '14 дней', price: '59 PLN' },
    { key: '30', label: '30 дней', price: '89 PLN' },
  ];

  const handleCheckout = async (plan: string) => {
    const res = await fetch('/api/checkout/promote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listingId, plan }),
    });
    const { url } = await res.json();
    window.location.href = url; // Redirect to Stripe Checkout
  };

  // ... RadioGroup с планами, кнопка "Оплатить"
}
```

### Stripe Products/Prices (создание)

Создать в Stripe Dashboard или через API:

```ts
// scripts/create-stripe-products.ts
const product = await stripe.products.create({
  name: 'Promoted Listing',
  description: 'Boost your listing visibility',
});

const prices = [
  { unit_amount: 3900, nickname: '7 days', metadata: { days: '7' } },
  { unit_amount: 5900, nickname: '14 days', metadata: { days: '14' } },
  { unit_amount: 8900, nickname: '30 days', metadata: { days: '30' } },
];

for (const p of prices) {
  await stripe.prices.create({
    product: product.id,
    currency: 'pln',
    unit_amount: p.unit_amount,
    nickname: p.nickname,
    metadata: p.metadata,
  });
}
```

## Фаза 2: P2P платежи для субаренды (Stripe Connect)

### Дополнения к модели данных

```prisma
// Добавить в Profile
model Profile {
  // ... существующие поля
  stripeAccountId    String?  @map("stripe_account_id")
  stripeOnboarded    Boolean  @default(false) @map("stripe_onboarded")
}

// Новая модель для escrow-платежей
model EscrowPayment {
  id                  String   @id @default(uuid()) @db.Uuid
  listingId           String   @map("listing_id") @db.Uuid
  payerId             String   @map("payer_id") @db.Uuid
  recipientId         String   @map("recipient_id") @db.Uuid
  stripePaymentIntent String?  @map("stripe_payment_intent")
  stripeTransferId    String?  @map("stripe_transfer_id")
  amount              Int
  platformFee         Int      @map("platform_fee")
  currency            String
  status              String   @default("pending") // pending → held → released → refunded
  heldAt              DateTime? @map("held_at")
  releasedAt          DateTime? @map("released_at")
  createdAt           DateTime @default(now()) @map("created_at")

  listing   Listing @relation(fields: [listingId], references: [id])
  payer     Profile @relation("EscrowPayer", fields: [payerId], references: [id])
  recipient Profile @relation("EscrowRecipient", fields: [recipientId], references: [id])

  @@map("escrow_payments")
}
```

### Connect Onboarding Flow

```
Пользователь → "Подключить Stripe" → POST /api/stripe/connect/onboard
  → stripe.accounts.create({ type: 'standard' })
  → stripe.accountLinks.create({ ... })
  → redirect to Stripe onboarding
  → return to /api/stripe/connect/callback
  → Проверить account.charges_enabled
  → Сохранить stripeAccountId + stripeOnboarded в Profile
```

### API: `POST /api/stripe/connect/onboard`

```ts
// src/app/api/stripe/connect/onboard/route.ts
export async function POST() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await prisma.profile.findUnique({ where: { id: user.id } });

  let accountId = profile?.stripeAccountId;

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: 'standard',
      email: user.email,
      metadata: { userId: user.id },
    });
    accountId = account.id;

    await prisma.profile.update({
      where: { id: user.id },
      data: { stripeAccountId: accountId },
    });
  }

  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${process.env.NEXT_PUBLIC_APP_URL}/pl/dashboard?stripe=refresh`,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/pl/dashboard?stripe=success`,
    type: 'account_onboarding',
  });

  return NextResponse.json({ url: accountLink.url });
}
```

### Escrow Flow для субаренды

```
1. Арендатор → "Pay deposit" в чате → POST /api/payments/escrow
   → stripe.paymentIntents.create({
       amount: depositAmount,
       currency: 'pln',
       transfer_data: { destination: authorStripeAccountId },
       // НЕ auto-transfer — manual capture
       capture_method: 'manual',
       application_fee_amount: platformFee,
     })
   → EscrowPayment.status = 'pending'

2. Арендатор подтверждает оплату (Stripe Elements / Checkout)
   → Webhook: payment_intent.amount_capturable_updated
   → stripe.paymentIntents.capture(...)
   → EscrowPayment.status = 'held'

3. Автор подтверждает заселение → POST /api/payments/escrow/[id]/release
   → stripe.transfers.create({ destination: authorStripeAccountId })
   → EscrowPayment.status = 'released'

4. Диспут → POST /api/payments/escrow/[id]/refund
   → stripe.refunds.create(...)
   → EscrowPayment.status = 'refunded'
```

### Webhook обновления для Connect

Добавить в существующий webhook handler:

```ts
case 'account.updated': {
  const account = event.data.object as Stripe.Account;
  if (account.charges_enabled) {
    await prisma.profile.updateMany({
      where: { stripeAccountId: account.id },
      data: { stripeOnboarded: true },
    });
  }
  break;
}

case 'payment_intent.succeeded': {
  // Обработка escrow платежей
  break;
}

case 'charge.refunded': {
  // Обработка возвратов
  break;
}
```

## Безопасность

### Webhook Signature Verification

Уже реализовано в webhook handler через `stripe.webhooks.constructEvent()`.

### Идемпотентность

Каждый webhook handler проверяет, не была ли транзакция уже обработана:

```ts
const existing = await prisma.payment.findFirst({
  where: { stripeCheckoutSessionId: session.id, status: 'completed' },
});
if (existing) return; // idempotent
```

### Stripe API ключи

- `STRIPE_SECRET_KEY` — только на сервере, никогда не в клиентском коде
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — безопасен для клиента
- `STRIPE_WEBHOOK_SECRET` — только для webhook endpoint

### BLIK и P24

Для Польши критично поддержать локальные методы оплаты:

```ts
payment_method_types: ['card', 'blik', 'p24'],
```

## Dashboard: история платежей

### UI компонент

Новый таб на дашборде для авторов, подключивших Stripe Connect:

```tsx
// src/components/dashboard/payment-history.tsx
<TabsTrigger value="payments" className="gap-2">
  <CreditCard className="h-4 w-4" />
  {t("dashboard.payments")}
</TabsTrigger>

<TabsContent value="payments">
  {/* Таблица: дата, тип, сумма, статус, объявление */}
  {/* Для авторов: секция "Мои доходы" (earnings) */}
</TabsContent>
```

### API: `GET /api/payments`

```ts
export async function GET() {
  const user = await getUser();
  const payments = await prisma.payment.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    include: {
      // referenceId → lookup listing title
    },
  });
  return NextResponse.json({ payments });
}
```

## Возвраты (Refunds)

### Promoted Listing Refunds

Ручные — через admin panel или по запросу:

```ts
// src/app/api/admin/refund/route.ts
export async function POST(request: NextRequest) {
  // Проверка admin
  const { paymentId, reason } = await request.json();

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment?.stripePaymentIntentId) {
    return NextResponse.json({ error: 'No payment intent' }, { status: 400 });
  }

  await stripe.refunds.create({
    payment_intent: payment.stripePaymentIntentId,
    reason: 'requested_by_customer',
  });

  await prisma.payment.update({
    where: { id: paymentId },
    data: { status: 'refunded' },
  });

  // Если promoted listing — снять промо
  if (payment.productType === 'promoted_listing' && payment.referenceId) {
    await prisma.listing.update({
      where: { id: payment.referenceId },
      data: { isPromoted: false, promotedUntil: null },
    });
  }

  return NextResponse.json({ ok: true });
}
```

## i18n

```json
{
  "payments": {
    "promote": "Promote Listing",
    "promoteDesc": "Get more views by promoting your listing to the top of search results",
    "plan7": "7 days — 39 PLN",
    "plan14": "14 days — 59 PLN",
    "plan30": "30 days — 89 PLN",
    "pay": "Pay",
    "processing": "Processing...",
    "success": "Payment successful!",
    "cancelled": "Payment cancelled",
    "history": "Payment History",
    "earnings": "My Earnings",
    "noPayments": "No payments yet",
    "connectStripe": "Connect Stripe Account",
    "connectStripeDesc": "Connect your Stripe account to receive payments for sublets",
    "stripeConnected": "Stripe connected",
    "pending": "Pending",
    "completed": "Completed",
    "refunded": "Refunded",
    "depositPayment": "Deposit Payment",
    "rentPayment": "Rent Payment",
    "promotionPayment": "Promotion"
  }
}
```

## Миграция

### Шаг 1: Установка пакетов

```bash
npm install stripe @stripe/stripe-js
```

### Шаг 2: Stripe Products

Создать Products и Prices в Stripe Dashboard (или через скрипт).

### Шаг 3: ENV

Добавить все Stripe переменные в `.env.local` и Vercel Environment Variables.

### Шаг 4: Prisma миграция (Фаза 2)

```bash
npx prisma migrate dev --name add-stripe-connect-fields
```

Добавляет:
- `stripe_account_id` и `stripe_onboarded` в `profiles`
- Таблицу `escrow_payments`

### Шаг 5: Webhook в Stripe Dashboard

1. Добавить endpoint: `https://passflat.eu/api/webhooks/stripe`
2. Events: `checkout.session.completed`, `checkout.session.expired`, `account.updated`, `payment_intent.succeeded`, `charge.refunded`
3. Скопировать Webhook Secret в `.env.local`

## Этапы реализации

### Фаза 1 — Promoted Listings (3-4 дня)
- [ ] Установить `stripe` и `@stripe/stripe-js`
- [ ] Создать `src/lib/stripe.ts` и `src/lib/stripe-client.ts`
- [ ] Создать Products/Prices в Stripe (39/59/89 PLN)
- [ ] API: `POST /api/checkout/promote`
- [ ] Webhook: `POST /api/webhooks/stripe`
- [ ] Обработка `checkout.session.completed` → активация промо
- [ ] PromoteModal UI
- [ ] Интеграция с дашбордом (кнопка Promote)
- [ ] Success/Cancel pages
- [ ] BLIK и P24 поддержка
- [ ] Тестирование с Stripe CLI (`stripe listen --forward-to localhost:3000/api/webhooks/stripe`)

### Фаза 2 — Stripe Connect для авторов (3-4 дня)
- [ ] Prisma миграция: `stripeAccountId`, `stripeOnboarded` в Profile
- [ ] API: `POST /api/stripe/connect/onboard`
- [ ] Webhook: `account.updated`
- [ ] UI: "Connect Stripe Account" на дашборде
- [ ] Индикатор статуса подключения

### Фаза 3 — P2P платежи за субаренду (4-5 дней)
- [ ] Prisma модель `EscrowPayment`
- [ ] API: создание escrow, подтверждение, release, refund
- [ ] Интеграция с чатом (кнопка "Request payment")
- [ ] Stripe Elements для формы оплаты в чате
- [ ] Dashboard: история платежей + заработок
- [ ] Email-уведомления о платежах

### Фаза 4 — Подписки (будущее)
- [ ] Stripe Subscriptions для PRO-аккаунтов
- [ ] Customer Portal для управления подпиской
- [ ] Billing page
