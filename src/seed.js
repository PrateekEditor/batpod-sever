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
const { categories, products, schedules, rules, coupons, users, DEMO_PASSWORD } = require('./seed-data');

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

  await mongoose.connection.close();
  console.log('\nDone. Start the server with `npm run dev`.');
}

run().catch(async (err) => {
  console.error('\nSeed failed:', err.message);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
