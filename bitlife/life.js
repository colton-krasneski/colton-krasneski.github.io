/* ============================================================================
   life.js — the simulation half of BitLife Online.

   No rendering, no DOM. It owns the character sheet and every action you can
   take at a venue, so the 3D layer only has to ask "what can I do here?" and
   "I picked this one, what happened?".
============================================================================ */

const FIRST_M = ['Colton', 'Miles', 'Jasper', 'Rowan', 'Dante', 'Kai', 'Felix', 'Otis', 'Silas', 'Wes'];
const FIRST_F = ['Nova', 'Iris', 'Wren', 'Sasha', 'Elena', 'Maya', 'Juno', 'Cleo', 'Vera', 'Robin'];
const LAST = ['Krasneski', 'Vance', 'Okoro', 'Mercer', 'Duval', 'Halloway', 'Reyes', 'Ashford', 'Bianchi', 'Sorensen'];
const NPC_NAMES = ['Ava', 'Leo', 'Mika', 'Theo', 'Zoe', 'Rex', 'Nina', 'Cass', 'Jude', 'Pia', 'Otto', 'Sage',
  'Bruno', 'Elle', 'Rafa', 'Indy', 'Nico', 'Talia', 'Emmet', 'Suri'];
const PET_KINDS = [
  { kind: 'Dog', emoji: '🐕', cost: 500, names: ['Rex', 'Biscuit', 'Moose', 'Pixel', 'Waffles'] },
  { kind: 'Cat', emoji: '🐈', cost: 350, names: ['Noodle', 'Zorro', 'Mochi', 'Cinder', 'Bean'] },
  { kind: 'Rabbit', emoji: '🐇', cost: 180, names: ['Thump', 'Clover', 'Sprout'] },
  { kind: 'Parrot', emoji: '🦜', cost: 900, names: ['Captain', 'Echo', 'Mango'] },
  { kind: 'Snake', emoji: '🐍', cost: 700, names: ['Noodle Jr', 'Fang', 'Slinky'] },
];

export const JOBS = [
  { title: 'Paper Route',        emoji: '📰', pay: 4200,   minAge: 14, smarts: 0,  edu: 'none' },
  { title: 'Fast Food Crew',     emoji: '🍔', pay: 15000,  minAge: 15, smarts: 0,  edu: 'none' },
  { title: 'Shelf Stacker',      emoji: '🛒', pay: 24000,  minAge: 18, smarts: 10, edu: 'none' },
  { title: 'Delivery Driver',    emoji: '🚚', pay: 33000,  minAge: 18, smarts: 20, edu: 'none' },
  { title: 'Office Admin',       emoji: '🗂️', pay: 41000,  minAge: 18, smarts: 40, edu: 'high' },
  { title: 'Sales Rep',          emoji: '📈', pay: 52000,  minAge: 18, smarts: 45, edu: 'high' },
  { title: 'Teacher',            emoji: '🍎', pay: 58000,  minAge: 22, smarts: 55, edu: 'degree' },
  { title: 'Software Engineer',  emoji: '💻', pay: 98000,  minAge: 22, smarts: 70, edu: 'degree' },
  { title: 'Lawyer',             emoji: '⚖️', pay: 125000, minAge: 22, smarts: 78, edu: 'degree' },
  { title: 'Surgeon',            emoji: '🩺', pay: 165000, minAge: 24, smarts: 88, edu: 'degree' },
];

export const CARS = [
  { name: 'Rusty Hatchback', emoji: '🚗', cost: 1800,   happy: 4 },
  { name: 'Family Sedan',    emoji: '🚙', cost: 14000,  happy: 8 },
  { name: 'Sport Coupe',     emoji: '🏎️', cost: 48000,  happy: 15 },
  { name: 'Luxury SUV',      emoji: '🚘', cost: 92000,  happy: 20 },
];

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const pick = a => a[Math.floor(Math.random() * a.length)];
const chance = p => Math.random() < p;
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
export const money = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');

/* ----------------------------- new character ----------------------------- */
export function newLife(preferredName) {
  const gender = chance(0.5) ? 'm' : 'f';
  const first = preferredName || pick(gender === 'm' ? FIRST_M : FIRST_F);
  const s = {
    v: 1,
    name: first, surname: pick(LAST), gender,
    age: 5, born: 2026 - 5,
    health: randInt(72, 96), happiness: randInt(60, 88),
    smarts: randInt(35, 75), looks: randInt(30, 85),
    money: 0, debt: 0, savings: 0,
    xp: 0, level: 1,
    job: null, yearsInJob: 0,
    edu: 'none', uniYears: 0, enrolled: false, grades: randInt(50, 80),
    pets: [], relations: [], children: 0,
    car: null, house: null, ring: false,
    heat: 0, crimes: 0, arrests: 0,
    inJail: false, sentence: 0, served: 0,
    dead: false, cause: null,
    yearLog: [], history: [],
  };
  s.parents = {
    mum: pick(FIRST_F) + ' ' + s.surname,
    dad: pick(FIRST_M) + ' ' + s.surname,
    rich: chance(0.18),
  };
  s.history.push(`👶 ${s.name} ${s.surname} was born in ${s.born}.`);
  if (s.parents.rich) s.history.push('💰 Your family is loaded. Nice start.');
  return s;
}

export const fullName = s => `${s.name} ${s.surname}`;
export const xpForLevel = lvl => 60 * lvl * lvl;
function grantXP(s, amount) {
  s.xp += amount;
  let levelled = false;
  while (s.xp >= xpForLevel(s.level)) { s.level++; levelled = true; }
  return levelled;
}

/* The last stretch of any stat is the hardest. Gains above 70 taper to
   nothing at 100, so nobody pins smarts at max by the age of nine. Losses
   are never softened — falling apart is easy. */
function gain(current, amount) {
  if (amount <= 0) return amount;
  if (current <= 70) return amount;
  return amount * Math.max(0, (100 - current) / 30);
}

function apply(s, d = {}) {
  if (d.health) s.health = clamp(s.health + gain(s.health, d.health));
  if (d.happiness) s.happiness = clamp(s.happiness + gain(s.happiness, d.happiness));
  if (d.smarts) s.smarts = clamp(s.smarts + gain(s.smarts, d.smarts));
  if (d.looks) s.looks = clamp(s.looks + gain(s.looks, d.looks));
  if (d.money) s.money += d.money;
  if (d.heat) s.heat = Math.max(0, s.heat + d.heat);
}

/* ------------------------------ action table ------------------------------
   Each action:
     id, label, emoji
     need(s)  -> null if allowed, else a string explaining why not
     run(s)   -> { text, d?, xp?, crime?, reward?, event? }
   `crime` is a heat value; the 3D layer turns that into police on your tail.
-------------------------------------------------------------------------- */
const minAge = (n, what) => s => (s.age < n ? `You must be ${n} to ${what}.` : null);

export const ACTIONS = {
  /* ------------------------------- HOME ---------------------------------- */
  home: [
    { id: 'sleep', label: 'Sleep it off', emoji: '😴',
      run: s => ({ text: 'You slept like a rock.', d: { health: +7, happiness: +4 }, xp: 6 }) },
    { id: 'eat', label: 'Raid the fridge', emoji: '🍕',
      run: s => ({ text: 'Cold pizza. Breakfast of champions.', d: { health: +3, happiness: +5 }, xp: 4 }) },
    { id: 'tv', label: 'Watch TV', emoji: '📺',
      run: s => ({ text: 'You binged six episodes of something forgettable.', d: { happiness: +8, smarts: -1 }, xp: 4 }) },
    { id: 'homework', label: 'Do homework', emoji: '📓',
      need: s => (s.age > 18 && !s.enrolled ? 'You are done with homework forever.' : null),
      run: s => { s.grades = clamp(s.grades + randInt(3, 8)); return { text: 'You actually did the homework. Grades up.', d: { smarts: +4, happiness: -3 }, xp: 10 }; } },
    { id: 'allowance', label: 'Ask for money', emoji: '🤲',
      need: s => (s.age >= 19 ? 'Your parents cut you off years ago.' : null),
      run: s => {
        if (chance(0.25)) return { text: '"Money doesn\'t grow on trees." Denied.', d: { happiness: -4 }, xp: 2 };
        const amt = randInt(10, 60) * (s.parents.rich ? 4 : 1);
        return { text: `Your parents slipped you ${money(amt)}.`, d: { money: amt, happiness: +3 }, xp: 4 };
      } },
    { id: 'playpet', label: 'Play with your pet', emoji: '🐾',
      need: s => (s.pets.length ? null : 'You don\'t have a pet yet.'),
      run: s => ({ text: `You and ${s.pets[0].name} the ${s.pets[0].kind.toLowerCase()} had a great time.`, d: { happiness: +9, health: +2 }, xp: 6 }) },
    { id: 'moveout', label: 'Move into your own place', emoji: '🔑',
      need: s => (s.age < 18 ? 'You must be 18 to move out.' : s.house ? 'You already have your own place.' : s.money < 5000 ? 'You need $5,000 for a deposit.' : null),
      run: s => { s.house = 'Small Apartment'; return { text: 'You signed a lease on a small apartment. Freedom!', d: { money: -5000, happiness: +14 }, xp: 40 }; } },
  ],

  /* ------------------------------ SCHOOL --------------------------------- */
  school: [
    { id: 'class', label: 'Go to class', emoji: '📚',
      need: s => (s.age > 17 ? 'You have aged out of school.' : null),
      run: s => { s.grades = clamp(s.grades + randInt(1, 5)); return { text: 'You paid attention. Mostly.', d: { smarts: +5, happiness: -2 }, xp: 12 }; } },
    { id: 'study', label: 'Study hard', emoji: '🤓',
      need: s => (s.age > 17 ? 'You have aged out of school.' : null),
      run: s => { s.grades = clamp(s.grades + randInt(5, 12)); return { text: 'You studied until your eyes hurt.', d: { smarts: +9, happiness: -6, health: -2 }, xp: 18 }; } },
    { id: 'skip', label: 'Skip class', emoji: '🚬',
      need: s => (s.age > 17 ? 'You have aged out of school.' : null),
      run: s => {
        s.grades = clamp(s.grades - randInt(4, 10));
        if (chance(0.3)) return { text: 'You got caught skipping. Detention.', d: { happiness: -6, smarts: -2 }, xp: 5 };
        return { text: 'You skipped and nobody noticed. Glorious.', d: { happiness: +12, smarts: -3 }, xp: 8 };
      } },
    { id: 'club', label: 'Join a club', emoji: '🎭',
      need: s => (s.age > 17 ? 'You have aged out of school.' : null),
      run: s => ({ text: `You joined the ${pick(['drama', 'chess', 'robotics', 'debate', 'art'])} club.`, d: { happiness: +7, smarts: +3, looks: +1 }, xp: 14 }) },
    { id: 'bully', label: 'Stand up to the bully', emoji: '😤',
      need: s => (s.age > 17 ? 'You have aged out of school.' : null),
      run: s => {
        const win = Math.random() < 0.35 + s.health / 300 + s.level * 0.02;
        return win
          ? { text: 'You stood your ground and the bully backed off. Legend.', d: { happiness: +15, looks: +3, health: -3 }, xp: 25 }
          : { text: 'It did not go well. You got flattened.', d: { happiness: -10, health: -12, looks: -2 }, xp: 10 };
      } },
  ],

  /* ---------------------------- UNIVERSITY ------------------------------- */
  university: [
    { id: 'enrol', label: 'Enrol (tuition $18,000)', emoji: '🎓',
      need: s => (s.age < 18 ? 'You must be 18 to enrol.' : s.enrolled ? 'You are already enrolled.' : s.edu === 'degree' ? 'You already have a degree.' : s.money < 18000 ? 'Tuition is $18,000 — try a bank loan.' : null),
      run: s => { s.enrolled = true; s.uniYears = 0; return { text: 'You enrolled at State University. Four years to go.', d: { money: -18000, happiness: +8 }, xp: 45 }; } },
    { id: 'lecture', label: 'Attend lectures', emoji: '📖',
      need: s => (s.enrolled ? null : 'You are not enrolled.'),
      run: s => ({ text: 'Another three-hour lecture survived.', d: { smarts: +8, happiness: -3 }, xp: 18 }) },
    { id: 'party', label: 'Campus party', emoji: '🎉',
      need: s => (s.enrolled ? null : 'You are not enrolled.'),
      run: s => ({ text: 'You do not remember most of it. Worth it.', d: { happiness: +16, health: -5, smarts: -2 }, xp: 10 }) },
    { id: 'graduate', label: 'Graduate', emoji: '🏅',
      need: s => (!s.enrolled ? 'You are not enrolled.' : s.uniYears < 4 ? `You need 4 years of study — you have ${s.uniYears}.` : null),
      run: s => { s.enrolled = false; s.edu = 'degree'; return { text: 'You graduated! Cap in the air, debt in the pocket.', d: { happiness: +25, smarts: +10 }, xp: 150 }; } },
  ],

  /* ----------------------------- PET STORE ------------------------------- */
  petstore: [
    { id: 'adopt', label: 'Adopt a pet', emoji: '🐶',
      need: s => (s.pets.length >= 3 ? 'Three pets is plenty.' : null),
      run: s => {
        const k = pick(PET_KINDS);
        const cost = s.age < 18 ? 0 : k.cost;
        if (s.money < cost) return { text: `A ${k.kind.toLowerCase()} costs ${money(k.cost)} and you can't afford it.`, d: {} };
        const name = pick(k.names);
        s.pets.push({ kind: k.kind, emoji: k.emoji, name, age: 0 });
        return {
          text: s.age < 18
            ? `Your parents caved and bought you ${name} the ${k.kind.toLowerCase()}! ${k.emoji}`
            : `You adopted ${name} the ${k.kind.toLowerCase()}. ${k.emoji}`,
          d: { money: -cost, happiness: +20 }, xp: 35,
        };
      } },
    { id: 'treats', label: 'Buy treats', emoji: '🦴',
      need: s => (s.pets.length ? (s.money < 40 ? 'You need $40.' : null) : 'You have no pets.'),
      run: s => ({ text: `${s.pets[0].name} is thrilled.`, d: { money: -40, happiness: +6 }, xp: 5 }) },
    { id: 'steal', label: 'Pocket a puppy', emoji: '🥷', danger: true,
      run: s => {
        const k = PET_KINDS[0];
        s.pets.push({ kind: k.kind, emoji: k.emoji, name: pick(k.names), age: 0, stolen: true });
        s.crimes++;
        return { text: 'You walked out with a puppy under your jacket. The clerk is screaming.', d: { happiness: +12, heat: +35 }, crime: 35, xp: 30 };
      } },
  ],

  /* -------------------------------- GYM ---------------------------------- */
  gym: [
    { id: 'workout', label: 'Work out', emoji: '🏋️', need: minAge(12, 'use the gym'),
      run: s => ({ text: 'You lifted heavy things and put them down again.', d: { health: +8, looks: +4, happiness: +2 }, xp: 14 }) },
    { id: 'trainer', label: 'Personal trainer ($250)', emoji: '🧑‍🏫',
      need: s => (s.age < 12 ? 'You must be 12 to use the gym.' : s.money < 250 ? 'You need $250.' : null),
      run: s => ({ text: 'Your trainer destroyed you. In a good way.', d: { money: -250, health: +14, looks: +8 }, xp: 26 }) },
    { id: 'juice', label: 'Buy "supplements"', emoji: '💉', danger: true,
      need: s => (s.age < 16 ? 'You must be 16.' : s.money < 400 ? 'You need $400.' : null),
      run: s => (chance(0.65)
        ? { text: 'You bulked up fast. Suspiciously fast.', d: { money: -400, looks: +14, health: +4 }, xp: 20 }
        : { text: 'Bad batch. You spent the week in the bathroom.', d: { money: -400, health: -22, looks: -4 }, xp: 10 }) },
  ],

  /* ------------------------------ HOSPITAL -------------------------------- */
  hospital: [
    { id: 'checkup', label: 'Check-up ($120)', emoji: '🩺',
      need: s => (s.money < 120 ? 'You need $120.' : null),
      run: s => ({ text: 'The doctor says you will live. For now.', d: { money: -120, health: +12 }, xp: 10 }) },
    { id: 'treat', label: 'Full treatment ($2,500)', emoji: '💊',
      need: s => (s.money < 2500 ? 'You need $2,500.' : s.health > 70 ? 'You are too healthy to need this.' : null),
      run: s => ({ text: 'A week of treatment and you feel human again.', d: { money: -2500, health: +38 }, xp: 30 }) },
    { id: 'therapy', label: 'Therapy ($300)', emoji: '🛋️',
      need: s => (s.money < 300 ? 'You need $300.' : null),
      run: s => ({ text: 'You talked about your childhood for an hour. It helped.', d: { money: -300, happiness: +18 }, xp: 15 }) },
    { id: 'plastic', label: 'Cosmetic surgery ($9,000)', emoji: '💅',
      need: s => (s.age < 18 ? 'You must be 18.' : s.money < 9000 ? 'You need $9,000.' : null),
      run: s => (chance(0.78)
        ? { text: 'The surgeon did beautiful work.', d: { money: -9000, looks: +22, happiness: +8 }, xp: 25 }
        : { text: 'Something went wrong. You look… different.', d: { money: -9000, looks: -14, happiness: -14, health: -8 }, xp: 15 }) },
  ],

  /* -------------------------------- BANK ---------------------------------- */
  bank: [
    { id: 'loan', label: 'Take a $20,000 loan', emoji: '🏦',
      need: s => (s.age < 18 ? 'You must be 18 to borrow.' : s.debt > 0 ? `You already owe ${money(s.debt)}.` : null),
      run: s => { s.debt = 24000; return { text: 'Approved. $20,000 now, $24,000 to pay back. Ouch.', d: { money: 20000 }, xp: 20 }; } },
    { id: 'repay', label: 'Repay your loan', emoji: '💵',
      need: s => (s.debt <= 0 ? 'You owe nothing. Enjoy it.' : s.money < Math.min(s.debt, s.money) + 1 ? 'You have nothing to pay with.' : null),
      run: s => { const pay = Math.min(s.money, s.debt); s.debt -= pay; return { text: `You paid off ${money(pay)}. Remaining debt: ${money(s.debt)}.`, d: { money: -pay, happiness: +6 }, xp: 18 }; } },
    { id: 'rob', label: 'Rob the bank', emoji: '🔫', danger: true,
      need: s => (s.age < 16 ? 'You are too small to hold up a bank.' : null),
      run: s => {
        s.crimes++;
        const luck = 0.3 + s.smarts / 260 + s.level * 0.02;
        if (Math.random() < luck) {
          const haul = randInt(15000, 90000);
          return { text: `You walked out with ${money(haul)} in a duffel bag. Sirens already.`, d: { money: haul, happiness: +14, heat: +90 }, crime: 90, xp: 120 };
        }
        return { text: 'The dye pack exploded and the guard tackled you.', d: { health: -10, heat: +90 }, crime: 90, xp: 40 };
      } },
  ],

  /* ------------------------------ JOB CENTRE ------------------------------ */
  office: [
    { id: 'apply', label: 'Look for work', emoji: '🔎', jobList: true,
      need: s => (s.age < 14 ? 'You must be 14 to work.' : null),
      run: () => ({ text: '' }) },   // handled specially by the UI
    { id: 'overtime', label: 'Work overtime', emoji: '⏰',
      need: s => (s.job ? null : 'You do not have a job.'),
      run: s => { const bonus = Math.round(s.job.pay * 0.06); return { text: `You ground out extra hours for ${money(bonus)}.`, d: { money: bonus, happiness: -8, health: -3 }, xp: 16 }; } },
    { id: 'raise', label: 'Ask for a raise', emoji: '📈',
      need: s => (!s.job ? 'You do not have a job.' : s.yearsInJob < 1 ? 'You just started. Give it a year.' : null),
      run: s => {
        if (Math.random() < 0.35 + s.smarts / 300 + s.yearsInJob * 0.05) {
          const bump = Math.round(s.job.pay * 0.12);
          s.job.pay += bump;
          return { text: `Raise approved — you now earn ${money(s.job.pay)} a year.`, d: { happiness: +12 }, xp: 40 };
        }
        return { text: 'Your boss laughed. Out loud.', d: { happiness: -8 }, xp: 8 };
      } },
    { id: 'quit', label: 'Quit your job', emoji: '🚪',
      need: s => (s.job ? null : 'You do not have a job.'),
      run: s => { const t = s.job.title; s.job = null; s.yearsInJob = 0; return { text: `You quit being a ${t}. Liberating and terrifying.`, d: { happiness: +8 }, xp: 10 }; } },
  ],

  /* ------------------------------ THE STORE ------------------------------- */
  store: [
    { id: 'snack', label: 'Buy snacks ($15)', emoji: '🍫',
      need: s => (s.money < 15 ? 'You need $15.' : null),
      run: s => ({ text: 'Sugar acquired.', d: { money: -15, happiness: +6, health: -1 }, xp: 3 }) },
    { id: 'lotto', label: 'Lottery ticket ($5)', emoji: '🎟️',
      need: s => (s.money < 5 ? 'You need $5.' : null),
      run: s => {
        const r = Math.random();
        if (r < 0.002) return { text: '🎉 JACKPOT. You won $1,000,000.', d: { money: 1000000, happiness: +45 }, xp: 300 };
        if (r < 0.05) { const w = randInt(100, 900); return { text: `You won ${money(w)}!`, d: { money: w - 5, happiness: +12 }, xp: 20 }; }
        return { text: 'Not a winner. Shocking.', d: { money: -5, happiness: -2 }, xp: 2 };
      } },
    { id: 'shoplift', label: 'Shoplift', emoji: '🥷', danger: true,
      run: s => {
        s.crimes++;
        if (Math.random() < 0.55 + s.smarts / 400) {
          const v = randInt(20, 200);
          return { text: `You walked out with ${money(v)} of stuff. Nobody blinked.`, d: { money: v, happiness: +8, heat: +18 }, crime: 18, xp: 25 };
        }
        return { text: 'The security tag screamed. The clerk is on the phone.', d: { happiness: -6, heat: +30 }, crime: 30, xp: 12 };
      } },
  ],

  /* ------------------------------- CASINO --------------------------------- */
  casino: [
    { id: 'slots', label: 'Slots ($100)', emoji: '🎰',
      need: s => (s.age < 21 ? 'You must be 21 to gamble.' : s.money < 100 ? 'You need $100.' : null),
      run: s => {
        const r = Math.random();
        if (r < 0.03) return { text: '🔔🔔🔔 Triple bells — $5,000!', d: { money: 4900, happiness: +30 }, xp: 40 };
        if (r < 0.22) return { text: 'Small win. $250.', d: { money: 150, happiness: +10 }, xp: 12 };
        return { text: 'The machine ate your $100 and played a happy sound about it.', d: { money: -100, happiness: -5 }, xp: 5 };
      } },
    { id: 'blackjack', label: 'Blackjack ($1,000)', emoji: '🃏',
      need: s => (s.age < 21 ? 'You must be 21 to gamble.' : s.money < 1000 ? 'You need $1,000.' : null),
      run: s => {
        const edge = 0.42 + s.smarts / 500;
        return Math.random() < edge
          ? { text: 'Dealer busts. You double up to $2,000.', d: { money: 1000, happiness: +16 }, xp: 25 }
          : { text: 'Dealer pulls a 21. Of course they do.', d: { money: -1000, happiness: -12 }, xp: 8 };
      } },
    { id: 'count', label: 'Count cards', emoji: '🧠', danger: true,
      need: s => (s.age < 21 ? 'You must be 21.' : s.smarts < 65 ? 'You are not smart enough to pull this off.' : s.money < 500 ? 'You need $500 to sit down.' : null),
      run: s => {
        s.crimes++;
        if (Math.random() < 0.3 + s.smarts / 250) {
          const w = randInt(4000, 20000);
          return { text: `You bled the table for ${money(w)} before anyone noticed.`, d: { money: w, happiness: +20, heat: +25 }, crime: 25, xp: 80 };
        }
        return { text: 'Two large men in suits are walking towards you.', d: { money: -500, health: -8, heat: +40 }, crime: 40, xp: 20 };
      } },
  ],

  /* --------------------------------- BAR ---------------------------------- */
  bar: [
    { id: 'drink', label: 'Have a drink', emoji: '🍺',
      need: minAge(21, 'drink here'),
      run: s => ({ text: 'One turned into four. The barman knows your name now.', d: { happiness: +14, health: -6, smarts: -1 }, xp: 8 }) },
    { id: 'karaoke', label: 'Sing karaoke', emoji: '🎤',
      need: minAge(21, 'get in'),
      run: s => (chance(0.5 + s.looks / 400)
        ? { text: 'You brought the house down. Someone bought you a drink.', d: { happiness: +20, looks: +2 }, xp: 22 }
        : { text: 'You forgot the words halfway through. Brutal silence.', d: { happiness: -8 }, xp: 6 }) },
    { id: 'fight', label: 'Start a bar fight', emoji: '🥊', danger: true,
      need: minAge(21, 'get in'),
      run: s => {
        s.crimes++;
        return Math.random() < 0.4 + s.health / 300
          ? { text: 'You won. The bar cheered. The barman did not.', d: { happiness: +12, health: -10, heat: +25 }, crime: 25, xp: 35 }
          : { text: 'You got knocked out cold and woke up on the pavement.', d: { happiness: -12, health: -25, heat: +25 }, crime: 25, xp: 12 };
      } },
  ],

  /* -------------------------------- CHAPEL -------------------------------- */
  chapel: [
    { id: 'pray', label: 'Say a prayer', emoji: '🙏',
      run: s => ({ text: 'A quiet moment. You feel steadier.', d: { happiness: +8, health: +2 }, xp: 6 }) },
    { id: 'propose', label: 'Propose', emoji: '💍',
      need: s => {
        if (s.age < 18) return 'You must be 18 to marry.';
        const p = s.relations.find(r => r.type === 'partner');
        if (!p) return 'You need a partner first — chat someone up around town.';
        if (!s.ring) return 'You need a ring from the jeweller.';
        return null;
      },
      run: s => {
        const p = s.relations.find(r => r.type === 'partner');
        if (Math.random() < 0.45 + p.level / 250 + s.looks / 400) {
          p.type = 'spouse'; s.ring = false;
          return { text: `${p.name} said YES. You are married! 💒`, d: { happiness: +35 }, xp: 200 };
        }
        p.level = Math.max(0, p.level - 30);
        return { text: `${p.name} said no. In front of everyone.`, d: { happiness: -25 }, xp: 20 };
      } },
    { id: 'child', label: 'Start a family', emoji: '👶',
      need: s => {
        if (!s.relations.some(r => r.type === 'spouse')) return 'You need to be married.';
        if (s.age < 18) return 'You must be 18.';
        if (s.children >= 4) return 'Four children is enough for anyone.';
        return null;
      },
      run: s => { s.children++; return { text: `You had a baby! Child number ${s.children}. 👶`, d: { happiness: +28, money: -3000, health: -4 }, xp: 120 }; } },
  ],

  /* ----------------------------- DEALERSHIP ------------------------------- */
  dealership: [
    { id: 'buy', label: 'Buy a car', emoji: '🚗', carList: true,
      need: minAge(16, 'buy a car'),
      run: () => ({ text: '' }) },   // handled specially by the UI
    { id: 'testdrive', label: 'Take a test drive', emoji: '🔑',
      need: minAge(16, 'drive'),
      run: s => ({ text: 'You floored it around the block and gave it back. Fun.', d: { happiness: +9 }, xp: 8 }) },
    { id: 'steal', label: 'Steal a car', emoji: '🚨', danger: true,
      run: s => {
        s.crimes++;
        if (Math.random() < 0.35 + s.smarts / 300) {
          s.car = { name: 'Definitely Legal Coupe', emoji: '🏎️' };
          return { text: 'You hotwired it in forty seconds and drove off.', d: { happiness: +18, heat: +70 }, crime: 70, xp: 90 };
        }
        return { text: 'The alarm went off instantly. Everyone is looking at you.', d: { heat: +55 }, crime: 55, xp: 25 };
      } },
  ],

  /* ------------------------------ JEWELLER -------------------------------- */
  jeweler: [
    { id: 'ring', label: 'Buy an engagement ring ($4,500)', emoji: '💍',
      need: s => (s.ring ? 'You already have a ring in your pocket.' : s.money < 4500 ? 'You need $4,500.' : null),
      run: s => { s.ring = true; return { text: 'One ring, boxed and ready. Now find the moment.', d: { money: -4500 }, xp: 30 }; } },
    { id: 'browse', label: 'Browse the cabinets', emoji: '👀',
      run: s => ({ text: 'You pressed your face to the glass for a while.', d: { happiness: +3 }, xp: 2 }) },
    { id: 'rob', label: 'Smash and grab', emoji: '💎', danger: true,
      run: s => {
        s.crimes++;
        if (Math.random() < 0.32 + s.smarts / 300 + s.level * 0.015) {
          const haul = randInt(30000, 150000);
          return { text: `Glass everywhere. You got ${money(haul)} of stones.`, d: { money: haul, happiness: +16, heat: +100 }, crime: 100, xp: 150 };
        }
        return { text: 'The shutters dropped before you reached the door.', d: { health: -12, heat: +100 }, crime: 100, xp: 45 };
      } },
  ],

  /* ------------------------------- POLICE --------------------------------- */
  police: [
    { id: 'turnin', label: 'Turn yourself in', emoji: '🙇',
      need: s => (s.heat <= 0 ? 'You are not wanted for anything. Yet.' : null),
      run: s => ({ text: 'You walked in with your hands up. The judge will note that.', arrest: true, lenient: true, xp: 30 }) },
    { id: 'report', label: 'Report a crime', emoji: '📢',
      run: s => ({ text: 'You gave a statement about something you half-saw.', d: { happiness: +4, heat: -8 }, xp: 10 }) },
    { id: 'bribe', label: 'Bribe an officer ($5,000)', emoji: '💸', danger: true,
      need: s => (s.money < 5000 ? 'You need $5,000.' : s.heat <= 0 ? 'Nothing to make go away.' : null),
      run: s => (chance(0.55)
        ? { text: 'The file quietly disappeared.', d: { money: -5000, heat: -100 }, xp: 40 }
        : { text: 'Wrong officer. That is another charge.', d: { money: -5000, heat: +50 }, crime: 50, xp: 15 }) },
  ],

  /* ----------------------------- COURTHOUSE -------------------------------- */
  courthouse: [
    { id: 'namechange', label: 'Change your name ($400)', emoji: '📝',
      need: s => (s.money < 400 ? 'You need $400.' : null),
      run: s => { s.name = pick(s.gender === 'm' ? FIRST_M : FIRST_F); return { text: `You are now legally ${fullName(s)}.`, d: { money: -400, happiness: +6 }, xp: 15 }; } },
    { id: 'sue', label: 'Sue somebody', emoji: '⚖️',
      need: s => (s.age < 18 ? 'You must be 18 to file suit.' : s.money < 1000 ? 'Lawyers cost $1,000 up front.' : null),
      run: s => (Math.random() < 0.3 + s.smarts / 300
        ? { text: `You won the suit and ${money(randInt(5000, 40000))} in damages.`, d: { money: randInt(5000, 40000) - 1000, happiness: +14 }, xp: 50 }
        : { text: 'Case dismissed. You are out the legal fees.', d: { money: -1000, happiness: -10 }, xp: 12 }) },
    { id: 'expunge', label: 'Apply to clear your record ($8,000)', emoji: '🧽',
      need: s => (s.arrests === 0 ? 'Your record is clean.' : s.money < 8000 ? 'You need $8,000.' : null),
      run: s => (chance(0.5)
        ? { text: 'Record expunged. A fresh start on paper.', d: { money: -8000, happiness: +18, heat: -50 }, xp: 60 }
        : { text: 'Application denied. The money is gone.', d: { money: -8000, happiness: -10 }, xp: 10 }) },
  ],

  /* -------------------------------- JAIL ----------------------------------- */
  jail: [
    { id: 'serve', label: 'Keep your head down', emoji: '🧱',
      run: s => ({ text: 'Another year of lights-out at nine. You behaved.', d: { happiness: -6, health: -2 }, goodBehaviour: true, xp: 20 }) },
    { id: 'yard', label: 'Lift in the yard', emoji: '🏋️',
      run: s => ({ text: 'Prison gym is free and always busy.', d: { health: +7, looks: +3, happiness: +2 }, xp: 14 }) },
    { id: 'library', label: 'Prison library', emoji: '📗',
      run: s => ({ text: 'You read everything they had twice.', d: { smarts: +7, happiness: +3 }, xp: 18 }) },
    { id: 'escape', label: 'Attempt to escape', emoji: '🪜', danger: true,
      run: s => {
        const p = 0.16 + s.smarts / 420 + s.health / 500 + s.level * 0.012;
        if (Math.random() < p) {
          s.inJail = false; s.sentence = 0; s.served = 0;
          return { text: 'You went over the wall and vanished into the night. You are FREE.', d: { happiness: +30, heat: +60 }, escaped: true, crime: 60, xp: 200 };
        }
        s.sentence += 2;
        return { text: 'Caught in the fence line. Two years added to your sentence.', d: { health: -14, happiness: -16 }, xp: 25 };
      } },
  ],

  /* -------------------------------- PARK ----------------------------------- */
  park: [
    { id: 'jog', label: 'Go for a run', emoji: '🏃',
      run: s => ({ text: 'Three laps of the pond. Lungs on fire.', d: { health: +9, looks: +2, happiness: +4 }, xp: 12 }) },
    { id: 'ducks', label: 'Feed the ducks', emoji: '🦆',
      run: s => ({ text: 'The ducks were aggressive but you enjoyed it.', d: { happiness: +8 }, xp: 5 }) },
    { id: 'walkpet', label: 'Walk your pet', emoji: '🐕',
      need: s => (s.pets.length ? null : 'You have no pet to walk.'),
      run: s => ({ text: `${s.pets[0].name} met every dog in the park.`, d: { happiness: +12, health: +4 }, xp: 12 }) },
    { id: 'pickpocket', label: 'Pickpocket someone', emoji: '🫳', danger: true,
      run: s => {
        s.crimes++;
        if (Math.random() < 0.5 + s.smarts / 350) {
          const v = randInt(15, 400);
          return { text: `Wallet lifted — ${money(v)} inside.`, d: { money: v, heat: +20 }, crime: 20, xp: 30 };
        }
        return { text: 'They grabbed your wrist and started shouting.', d: { health: -5, heat: +35 }, crime: 35, xp: 12 };
      } },
  ],

  /* -------------------------------- PLAZA ---------------------------------- */
  plaza: [
    { id: 'busk', label: 'Busk for coins', emoji: '🎸',
      run: s => { const v = Math.round((5 + s.looks / 4 + s.level * 3) * (0.5 + Math.random())); return { text: `You played for an hour and made ${money(v)}.`, d: { money: v, happiness: +6 }, xp: 12 }; } },
    { id: 'wish', label: 'Throw a coin in the fountain', emoji: '🪙',
      run: s => ({ text: 'You made a wish. Who knows.', d: { happiness: +5, money: -1 }, xp: 4 }) },
    { id: 'protest', label: 'Join the protest', emoji: '📣',
      run: s => (chance(0.75)
        ? { text: 'You marched, you chanted, you felt something.', d: { happiness: +12, health: -2 }, xp: 18 }
        : { text: 'It got kettled. You spent four hours behind a barrier.', d: { happiness: -8, heat: +12 }, crime: 12, xp: 10 }) },
  ],
};

/** Which actions are visible at this venue right now (with reasons attached). */
export function actionsFor(state, venueId) {
  const list = ACTIONS[venueId] || [];
  return list.map(a => ({ ...a, blocked: a.need ? a.need(state) : null }));
}

/** Run an action. Returns { text, levelUp, crime, ... } for the UI to narrate. */
export function runAction(state, venueId, actionId) {
  const a = (ACTIONS[venueId] || []).find(x => x.id === actionId);
  if (!a) return { text: 'Nothing happened.' };
  const blocked = a.need ? a.need(state) : null;
  if (blocked) return { text: blocked, blocked: true };
  const res = a.run(state) || {};
  apply(state, res.d);
  const levelUp = grantXP(state, res.xp || 0);
  if (res.goodBehaviour) state.served += 0.5;
  if (res.text) state.yearLog.push(res.text);
  return { ...res, levelUp };
}

/* ------------------------------ jobs & cars ------------------------------- */
export function availableJobs(state) {
  const eduRank = { none: 0, high: 1, degree: 2 };
  return JOBS.map(j => {
    let blocked = null;
    if (state.age < j.minAge) blocked = `Requires age ${j.minAge}.`;
    else if (state.smarts < j.smarts) blocked = `Requires ${j.smarts} smarts (you have ${Math.round(state.smarts)}).`;
    else if (eduRank[state.edu] < eduRank[j.edu]) blocked = j.edu === 'degree' ? 'Requires a university degree.' : 'Requires a high-school diploma.';
    return { ...j, blocked };
  });
}

export function takeJob(state, title) {
  const j = JOBS.find(x => x.title === title);
  if (!j) return { text: 'That job is gone.' };
  state.job = { title: j.title, emoji: j.emoji, pay: j.pay };
  state.yearsInJob = 0;
  grantXP(state, 60);
  const text = `You were hired as a ${j.title} on ${money(j.pay)} a year. ${j.emoji}`;
  state.yearLog.push(text);
  return { text, d: { happiness: +12 } };
}

export function buyCar(state, name) {
  const c = CARS.find(x => x.name === name);
  if (!c) return { text: 'Not available.' };
  if (state.money < c.cost) return { text: `You need ${money(c.cost)}.`, blocked: true };
  state.money -= c.cost;
  state.car = { name: c.name, emoji: c.emoji };
  apply(state, { happiness: c.happy });
  grantXP(state, 50);
  const text = `You drove home in a ${c.name}. ${c.emoji}`;
  state.yearLog.push(text);
  return { text };
}

/* ------------------------------ relationships ----------------------------- */
export function randomNpcName() { return pick(NPC_NAMES); }

export function socialise(state, npcName, kind) {
  let rel = state.relations.find(r => r.name === npcName);
  if (kind === 'chat') {
    if (!rel) {
      rel = { name: npcName, type: 'friend', level: randInt(15, 40) };
      state.relations.push(rel);
      grantXP(state, 15);
      return { text: `You got chatting with ${npcName}. New friend.`, d: { happiness: +7 } };
    }
    rel.level = clamp(rel.level + randInt(5, 15));
    apply(state, { happiness: +5 });
    grantXP(state, 8);
    return { text: `You caught up with ${npcName}. (Relationship ${Math.round(rel.level)}%)` };
  }

  if (kind === 'flirt') {
    if (state.age < 14) return { text: 'You are far too young for that.', blocked: true };
    if (state.relations.some(r => r.type === 'spouse')) return { text: 'You are married. Behave.', blocked: true };
    const odds = 0.25 + state.looks / 260 + (rel ? rel.level / 300 : 0);
    if (Math.random() < odds) {
      if (!rel) { rel = { name: npcName, level: 45 }; state.relations.push(rel); }
      state.relations.forEach(r => { if (r.type === 'partner') r.type = 'friend'; });
      rel.type = 'partner';
      rel.level = clamp(rel.level + 25);
      apply(state, { happiness: +18 });
      grantXP(state, 45);
      return { text: `${npcName} is into you. You are dating! ❤️` };
    }
    apply(state, { happiness: -6 });
    grantXP(state, 5);
    return { text: `${npcName} laughed and walked away. Rough.` };
  }

  if (kind === 'rob') {
    state.crimes++;
    if (Math.random() < 0.45 + state.smarts / 400) {
      const v = randInt(20, 600);
      apply(state, { money: v, heat: +30 });
      grantXP(state, 35);
      return { text: `You mugged ${npcName} for ${money(v)}.`, crime: 30 };
    }
    apply(state, { health: -8, heat: +45 });
    grantXP(state, 12);
    return { text: `${npcName} fought back and screamed for the police.`, crime: 45 };
  }
  return { text: '' };
}

/* --------------------------------- arrest --------------------------------- */
/** Called when the police catch you. Returns the charge sheet for the court UI. */
export function buildCharges(state, lenient) {
  const heat = state.heat;
  const tier = heat >= 90 ? 'Armed Robbery' : heat >= 60 ? 'Grand Theft' : heat >= 30 ? 'Theft & Assault' : 'Petty Theft';
  const base = heat >= 90 ? randInt(8, 16) : heat >= 60 ? randInt(4, 9) : heat >= 30 ? randInt(2, 5) : randInt(1, 3);
  return { charge: tier, base: Math.max(1, lenient ? Math.ceil(base / 2) : base) };
}

export function sentenceTo(state, years) {
  state.inJail = true;
  state.sentence = Math.max(1, Math.round(years));
  state.served = 0;
  state.heat = 0;
  state.arrests++;
  if (state.job) { state.yearLog.push(`You lost your job as a ${state.job.title}.`); state.job = null; state.yearsInJob = 0; }
  const text = `⛓️ Sentenced to ${state.sentence} year${state.sentence > 1 ? 's' : ''} in State Prison.`;
  state.yearLog.push(text);
  return text;
}

/* ------------------------------- year ticks ------------------------------- */
const RANDOM_EVENTS = [
  { min: 6,  w: 1, run: s => ({ text: `You found ${money(randInt(5, 40))} on the pavement.`, d: { money: randInt(5, 40), happiness: +4 } }) },
  { min: 5,  w: 1, run: s => ({ text: 'You caught a nasty flu.', d: { health: -randInt(5, 14), happiness: -4 } }) },
  { min: 10, w: 1, run: s => ({ text: 'A stranger complimented you out of nowhere.', d: { happiness: +8, looks: +1 } }) },
  { min: 16, w: 1, run: s => ({ text: 'Your phone died in a puddle.', d: { money: -randInt(200, 700), happiness: -8 } }) },
  { min: 18, w: 1, run: s => ({ text: 'A distant relative left you something in their will.', d: { money: randInt(500, 9000), happiness: +10 } }) },
  { min: 12, w: 1, run: s => ({ text: 'You went viral for about six hours.', d: { happiness: +14, looks: +2 } }) },
  { min: 25, w: 1, run: s => ({ text: 'Your back gave out lifting a box.', d: { health: -10, happiness: -6 } }) },
  { min: 5,  w: 1, run: s => ({ text: 'You had an unreasonably good night\'s sleep.', d: { health: +6, happiness: +6 } }) },
];

/**
 * Advance one year. Returns { lines[], dead, levelUp, freed }.
 * The 3D layer calls this when the year timer runs out or you hit Age Up.
 */
export function ageUp(state) {
  const lines = [];
  state.age++;

  // schooling milestones
  if (state.age === 18 && state.edu === 'none') {
    if (state.grades >= 50) { state.edu = 'high'; lines.push('🎓 You graduated high school.'); }
    else lines.push('📉 You failed to graduate high school.');
  }
  if (state.enrolled) {
    state.uniYears++;
    if (state.uniYears >= 4) lines.push('🎓 You have completed four years — you can graduate at the university.');
  }

  // work
  if (state.job) {
    state.yearsInJob++;
    const take = Math.round(state.job.pay * 0.72);
    state.money += take;
    lines.push(`💼 You earned ${money(take)} after tax as a ${state.job.title}.`);
    if (chance(0.18)) {
      const bump = Math.round(state.job.pay * 0.08);
      state.job.pay += bump;
      lines.push(`📈 Annual review: pay rise to ${money(state.job.pay)}.`);
    }
  } else if (state.age >= 18 && state.age < 65 && !state.inJail) {
    apply(state, { happiness: -4 });
    lines.push('🪙 No income this year.');
  }

  // debt interest
  if (state.debt > 0) {
    state.debt = Math.round(state.debt * 1.08);
    lines.push(`🏦 Interest pushed your debt to ${money(state.debt)}.`);
  }

  // living costs
  if (state.age >= 18 && !state.inJail) {
    const cost = state.house ? randInt(9000, 15000) : randInt(2000, 5000);
    state.money -= cost;
    lines.push(`🧾 Living costs: ${money(cost)}.`);
    if (state.money < 0) {
      // Being broke should bite, but never so hard that you cannot climb out:
      // busking, a job and petty crime are all still on the table.
      apply(state, { happiness: -6, health: -2 });
      lines.push('😖 You are in the red. A stressful year.');
    }
  }

  // pets
  for (const p of state.pets) {
    p.age++;
    if (p.age > randInt(12, 18)) {
      lines.push(`💔 ${p.name} the ${p.kind.toLowerCase()} passed away.`);
      apply(state, { happiness: -18 });
      p.gone = true;
    } else if (chance(0.3)) {
      apply(state, { happiness: +5 });
    }
  }
  state.pets = state.pets.filter(p => !p.gone);

  // relationships drift, spouse bonus
  for (const r of state.relations) {
    r.level = clamp(r.level + (r.type === 'spouse' ? randInt(-3, 6) : randInt(-8, 4)));
    if (r.type === 'spouse' && r.level < 15 && chance(0.4)) {
      r.type = 'ex';
      state.money = Math.round(state.money / 2);
      lines.push(`💔 ${r.name} divorced you. They took half.`);
      apply(state, { happiness: -30 });
    }
  }
  state.relations = state.relations.filter(r => r.type !== 'ex' || chance(0.5));
  if (state.relations.some(r => r.type === 'spouse')) apply(state, { happiness: +5 });
  if (state.children > 0) apply(state, { happiness: +2 * state.children, money: -1200 * state.children });

  // jail
  let freed = false;
  if (state.inJail) {
    state.served++;
    if (state.served >= state.sentence) {
      state.inJail = false; freed = true;
      lines.push('🔓 You served your time and walked out a free person.');
      apply(state, { happiness: +20 });
    } else {
      lines.push(`⛓️ Year ${Math.floor(state.served)} of ${state.sentence} inside.`);
      apply(state, { happiness: -8, health: -3 });
    }
  }

  // heat cools slowly
  state.heat = Math.max(0, state.heat - 12);

  // ageing
  if (state.age > 30) apply(state, { health: -Math.floor((state.age - 30) / 8) - 1, looks: chance(0.5) ? -1 : 0 });
  if (state.age <= 18) apply(state, { smarts: +1 });

  // a random life event
  const pool = RANDOM_EVENTS.filter(e => state.age >= e.min);
  if (pool.length && chance(0.6)) {
    const ev = pick(pool).run(state);
    apply(state, ev.d);
    lines.push('✨ ' + ev.text);
  }

  const levelUp = grantXP(state, 25);

  // death
  const oldAgeRisk = state.age < 60 ? 0 : Math.pow(state.age - 58, 2) / 3200;
  if (state.health <= 0) { state.dead = true; state.cause = 'Poor health'; }
  else if (Math.random() < oldAgeRisk) { state.dead = true; state.cause = 'Old age'; }
  else if (state.health < 15 && chance(0.25)) { state.dead = true; state.cause = 'Illness'; }

  if (state.dead) lines.push(`⚰️ ${fullName(state)} died at ${state.age}. Cause: ${state.cause}.`);

  state.history.push(`— Age ${state.age} —`, ...state.yearLog, ...lines);
  if (state.history.length > 400) state.history = state.history.slice(-400);
  state.yearLog = [];

  return { lines, dead: state.dead, levelUp, freed };
}

/* --------------------------------- saving --------------------------------- */
const KEY = user => `colton_bitlife_${user || 'guest'}`;

export function save(state, user) {
  try { localStorage.setItem(KEY(user), JSON.stringify(state)); } catch (e) { /* quota — ignore */ }
}
export function load(user) {
  try {
    const raw = localStorage.getItem(KEY(user));
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && s.v === 1 && !s.dead ? s : null;
  } catch (e) { return null; }
}
export function clearSave(user) {
  try { localStorage.removeItem(KEY(user)); } catch (e) { /* ignore */ }
}

/** Final scoring for the death screen. */
export function lifeSummary(s) {
  const score = Math.round(
    s.age * 6 + s.level * 25 + Math.max(0, s.money) / 2000 +
    (s.health + s.happiness + s.smarts + s.looks) / 2 +
    s.children * 40 + (s.relations.some(r => r.type === 'spouse') ? 60 : 0) +
    (s.edu === 'degree' ? 80 : s.edu === 'high' ? 30 : 0) - s.arrests * 20
  );
  const rank = score > 900 ? 'Legendary' : score > 650 ? 'Remarkable' : score > 420 ? 'Solid'
    : score > 250 ? 'Forgettable' : 'A cautionary tale';
  return { score, rank };
}
