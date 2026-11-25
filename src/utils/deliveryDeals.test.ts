import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  calendarDealsForDate,
  cleanDealPin,
  pinToDeal,
  pruneDealPins,
  rankDealsForChannel,
} from './deliveryDeals';
import { createDealsService, parseAwinPromotions } from '../server/dealsFeed';

process.env.NODE_ENV = 'test';

test('UK day-of-week deal calendar picks the right firm for Tuesday, Wednesday, and weekends', () => {
  // 2026-11-24 is a Tuesday
  const tue = rankDealsForChannel(calendarDealsForDate(new Date('2026-11-24T18:00:00Z')), 'takeaway');
  assert.equal(tue.topPick?.providerId, 'justeat');
  assert.match(tue.topPick?.headline || '', /Cheeky Tuesday/i);

  // 2026-11-25 is a Wednesday
  const wedTakeaway = rankDealsForChannel(calendarDealsForDate(new Date('2026-11-25T17:00:00Z')), 'takeaway');
  assert.equal(wedTakeaway.topPick?.providerId, 'deliveroo');
  assert.match(wedTakeaway.topPick?.headline || '', /Midweek/i);

  const wedGrocery = rankDealsForChannel(calendarDealsForDate(new Date('2026-11-25T12:00:00Z')), 'grocery');
  assert.equal(wedGrocery.topPick?.providerId, 'justeat');
  assert.match(wedGrocery.topPick?.headline || '', /Grocery Wednesdays/i);

  // 2026-11-28 is a Saturday
  const sat = rankDealsForChannel(calendarDealsForDate(new Date('2026-11-28T19:00:00Z')), 'takeaway');
  assert.equal(sat.topPick?.providerId, 'ubereats');
});

test('Household pinned codes outrank calendar offers and expired pins are pruned automatically', () => {
  const now = new Date('2026-11-24T18:00:00Z'); // Tuesday (Just Eat Cheeky Tuesday)
  const validPin = cleanDealPin(
    {
      id: 'p1',
      providerId: 'ubereats',
      channel: 'takeaway',
      headline: '40% off £20+ on Dad’s phone',
      code: ' eats40 ',
      postedBy: 'Dad',
      createdAt: now.toISOString(),
      expiresAt: '2026-11-24T23:59:59Z',
    },
    now
  )!;
  assert.equal(validPin.code, 'EATS40');

  const expiredPin = cleanDealPin(
    {
      id: 'p2',
      providerId: 'deliveroo',
      channel: 'takeaway',
      headline: 'Old expired code',
      postedBy: 'Mum',
      createdAt: '2026-11-20T18:00:00Z',
      expiresAt: '2026-11-20T23:59:59Z',
    },
    now
  )!;

  const activePins = pruneDealPins([validPin, expiredPin], now.getTime());
  assert.equal(activePins.length, 1);

  const ranked = rankDealsForChannel(
    [...activePins.map(pinToDeal), ...calendarDealsForDate(now)],
    'takeaway',
    now.getTime()
  );
  assert.equal(ranked.topPick?.providerId, 'ubereats');
  assert.equal(ranked.topPick?.source, 'household');
  assert.equal(ranked.topPick?.code, 'EATS40');
});

test('Awin Promotions parser maps UK delivery firms, distinguishes first-order vs everyone, and marks affiliate links', () => {
  const now = Date.parse('2026-11-25T12:00:00Z');
  const deals = parseAwinPromotions(
    {
      data: [
        {
          promotionId: 101,
          status: 'active',
          advertiser: { name: 'Ocado UK' },
          title: '25% off your first shop over £60',
          terms: 'New customers only. Minimum spend £60.',
          voucher: { code: 'VOU12345' },
          urlTracking: 'https://www.awin1.com/cread.php?id=101',
          endDate: '2026-12-31T23:59:59Z',
        },
        {
          promotionId: 102,
          status: 'active',
          advertiser: { name: 'Just Eat UK' },
          title: '£5 off orders over £25',
          terms: 'Available on all eligible takeaway orders.',
          voucher: { code: 'SAVE5' },
          urlTracking: 'https://www.awin1.com/cread.php?id=102',
          endDate: '2026-12-10T23:59:59Z',
        },
        {
          promotionId: 103,
          status: 'active',
          advertiser: { name: 'Unrelated Shoe Shop' },
          title: '10% off boots',
        },
        {
          promotionId: 104,
          status: 'active',
          advertiser: { name: 'Sainsbury’s Groceries' },
          title: 'Expired offer',
          endDate: '2026-11-01T00:00:00Z',
        },
      ],
    },
    now
  );

  assert.equal(deals.length, 2);
  const ocado = deals.find((d) => d.providerId === 'ocado')!;
  assert.equal(ocado.channel, 'grocery');
  assert.equal(ocado.eligibility, 'first-order');
  assert.equal(ocado.code, 'VOU12345');
  assert.equal(ocado.minSpend, '£60+');
  assert.equal(ocado.isAffiliate, true);

  const je = deals.find((d) => d.providerId === 'justeat')!;
  assert.equal(je.channel, 'takeaway');
  assert.equal(je.eligibility, 'everyone');
  assert.equal(je.code, 'SAVE5');
  assert.ok(je.score > ocado.score, 'everyone vouchers outrank first-order vouchers');
});

test('Server: /api/deals/today caches live feed and /api/deals/pins syncs & isolates household codes', async () => {
  const { app, useDealsService } = await import('../../server');
  let fetchCalls = 0;
  const mockService = createDealsService({
    awinToken: 'test-token',
    awinPublisherId: '999',
    fetchImpl: (async () => {
      fetchCalls += 1;
      return new Response(
        JSON.stringify({
          data: [
            {
              promotionId: 555,
              status: 'active',
              advertiser: { name: 'Just Eat UK' },
              title: '£4 off £20+ tonight',
              voucher: { code: 'TONIGHT4' },
              urlTracking: 'https://www.awin1.com/cread.php?id=555',
              endDate: '2099-12-31T23:59:59Z',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as unknown as typeof fetch,
  });
  useDealsService(mockService);

  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

  try {
    // 1. /api/deals/today returns merged live + calendar deals and caches upstream fetch
    const d1 = await (await fetch(`${base}/api/deals/today`)).json();
    const d2 = await (await fetch(`${base}/api/deals/today`)).json();
    assert.equal(d1.liveConfigured, true);
    assert.equal(d1.liveCount, 1);
    assert.ok(d1.deals.some((d: any) => d.code === 'TONIGHT4'));
    assert.equal(d2.liveCount, 1);
    assert.equal(fetchCalls, 1, 'upstream feed should be cached');

    // 2. Household pins require household auth, save, isolate across households, and delete cleanly
    assert.equal((await fetch(`${base}/api/deals/pins`)).status, 401);

    const h1 = await (await fetch(`${base}/api/households`, { method: 'POST' })).json();
    const h2 = await (await fetch(`${base}/api/households`, { method: 'POST' })).json();
    const headers1 = { 'Content-Type': 'application/json', 'x-household-id': h1.householdId, 'x-household-key': h1.key };
    const headers2 = { 'Content-Type': 'application/json', 'x-household-id': h2.householdId, 'x-household-key': h2.key };

    const created = await (
      await fetch(`${base}/api/deals/pins`, {
        method: 'POST',
        headers: headers1,
        body: JSON.stringify({
          providerId: 'ubereats',
          channel: 'takeaway',
          headline: '40% off on my phone',
          code: 'UBER40',
          postedBy: 'Alex',
        }),
      })
    ).json();
    assert.equal(created.pin.code, 'UBER40');
    assert.equal(created.pins.length, 1);

    // Other household sees zero pins
    const h2Pins = await (await fetch(`${base}/api/deals/pins`, { headers: headers2 })).json();
    assert.equal(h2Pins.pins.length, 0);

    // Delete pin
    const afterDel = await (
      await fetch(`${base}/api/deals/pins/${created.pin.id}`, { method: 'DELETE', headers: headers1 })
    ).json();
    assert.equal(afterDel.pins.length, 0);
  } finally {
    useDealsService(createDealsService());
    await new Promise<void>((r) => server.close(() => r()));
  }
});
