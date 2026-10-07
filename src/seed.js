/**
 * Seeds the three categories, a starter catalog, two discount schedules, three
 * price rules and two coupons.
 *
 *   npm run seed          — adds anything missing, leaves existing data alone
 *   npm run seed -- --reset  — wipes the collections first
 *
 * Prices are placeholders drawn from the unit-economics work; change them in
 * the admin once you have printed each item and know the real time and weight.
 */
require('dotenv').config();
const { connectDB, mongoose } = require('./db');
const Category = require('./models/Category');
const Product = require('./models/Product');
const DiscountSchedule = require('./models/DiscountSchedule');
const PriceRule = require('./models/PriceRule');
const Coupon = require('./models/Coupon');
const User = require('./models/User');
const Order = require('./models/Order');
const { categories, products, schedules, rules, coupons, users, demoOrders, DEMO_PASSWORD } = require('./seed-data');

async function upsert(Model, docs, key) {
  let created = 0;
  let updated = 0;
  for (const doc of docs) {
    const existing = await Model.findOne({ [key]: doc[key] });
    if (existing) {
      updated += 1;
    } else {
      await Model.create(doc);
      created += 1;
    }
  }
  return { created, updated };
}

async function run() {
  const reset = process.argv.includes('--reset');
  await connectDB();
  console.log('Connected.');

  if (reset) {
    await Promise.all([
      Category.deleteMany({}),
      Product.deleteMany({}),
      DiscountSchedule.deleteMany({}),
      PriceRule.deleteMany({}),
      Coupon.deleteMany({}),
      User.deleteMany({ email: /@batpodlabs\.test$/ }),
      Order.deleteMany({ reference: /^BP-DEMO-/ }),
    ]);
    console.log('Collections cleared (--reset).');
  }

  const c = await upsert(Category, categories, 'slug');
  console.log(`Categories: ${c.created} created, ${c.updated} already there`);

  const s = await upsert(DiscountSchedule, schedules, 'name');
  console.log(`Discount schedules: ${s.created} created, ${s.updated} already there`);

  // Attach the small-items schedule to everything kit-eligible, so the volume
  // tiers are live on the cheap products where they actually matter.
  const smallItems = await DiscountSchedule.findOne({ name: 'Small Items Volume' });
  const withSchedule = products.map((p) =>
    p.kitEligible ? { ...p, discountScheduleId: smallItems ? smallItems._id : null } : p
  );

  const p = await upsert(Product, withSchedule, 'sku');
  console.log(`Products: ${p.created} created, ${p.updated} already there`);

  const r = await upsert(PriceRule, rules, 'name');
  console.log(`Price rules: ${r.created} created, ${r.updated} already there`);

  const co = await upsert(Coupon, coupons, 'code');
  console.log(`Coupons: ${co.created} created, ${co.updated} already there`);

  if (process.argv.includes('--no-users')) {
    console.log('Demo users: skipped (--no-users)');
  } else {
    let made = 0;
    const hash = await User.hashPassword(DEMO_PASSWORD);
    for (const u of users) {
      if (await User.findOne({ email: u.email })) continue;
      const { note, ...fields } = u;
      await User.create({ ...fields, passwordHash: hash });
      made += 1;
    }
    console.log(`Demo users: ${made} created, ${users.length - made} already there`);
    if (made > 0) {
      console.log(`  sign in with any of these and the password: ${DEMO_PASSWORD}`);
      for (const u of users) console.log(`  ${u.email.padEnd(32)} ${u.note}`);
      console.log('  These are test accounts. Delete them before you take real orders.');
    }
  }


  if (process.argv.includes('--no-orders')) {
    console.log('Demo orders: skipped (--no-orders)');
  } else {
    const bySlug = new Map((await Product.find({})).map((doc) => [doc.slug, doc]));
    let madeOrders = 0;

    for (const spec of demoOrders) {
      if (await Order.findOne({ reference: spec.ref })) continue;

      const lines = [];
      for (const l of spec.lines) {
        const product = bySlug.get(l.slug);
        if (!product) continue;
        const unit = product.listPrice;
        lines.push({
          sku: product.sku,
          name: product.name,
          slug: product.slug,
          quantity: l.quantity,
          listPrice: unit,
          netUnitPrice: unit,
          netLineTotal: unit * l.quantity,
          adjustments: [],
        });
      }
      if (lines.length === 0) continue;

      const gross = lines.reduce((s, l) => s + l.netLineTotal, 0);
      // Same free-shipping threshold the live rules use, so the demo totals are
      // not obviously different from a real order.
      const shipping = gross >= 1500 ? 0 : Number(process.env.DEFAULT_SHIPPING_FEE || 79);

      const created = await Order.create({
        reference: spec.ref,
        channel: spec.channel,
        channelDetail: spec.channelDetail,
        status: spec.status,
        customer: spec.customer,
        lines,
        grossSubtotal: gross,
        subtotal: gross,
        shipping,
        total: gross + shipping,
        totalSaved: 0,
        notes: 'Demo order created by the seed script. Safe to delete.',
      });

      // Backdate it. The planner's urgency score reads order age, so orders
      // that were all created a second ago would make the queue meaningless.
      const when = new Date(Date.now() - spec.daysAgo * 24 * 60 * 60 * 1000);
      await Order.updateOne({ _id: created._id }, { $set: { createdAt: when } }, { timestamps: false });
      madeOrders += 1;
    }

    console.log(`Demo orders: ${madeOrders} created, ${demoOrders.length - madeOrders} already there`);
    if (madeOrders > 0) console.log('  All prefixed BP-DEMO- so you can find and delete them later.');
  }

  await mongoose.connection.close();
  console.log('\nDone. Start the server with `npm run dev`.');
}

run().catch(async (err) => {
  console.error('\nSeed failed:', err.message);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
