import type { BenefitId, FoodDef, JunkEffectId } from '../contracts';

const H = (id: string, name: string, benefit: BenefitId, sfx: string, blurb: string, extra: Partial<FoodDef> = {}): FoodDef => ({
  id, name, kind: 'healthy', benefit, sfx, blurb, points: 10, ...extra,
});
const J = (id: string, name: string, junk: JunkEffectId, sfx: string, blurb: string, extra: Partial<FoodDef> = {}): FoodDef => ({
  id, name, kind: 'junk', junk, sfx, blurb, points: 0, ...extra,
});

/** Every food in the game. Ids are shared by models, thumbnails, audio and saves. */
export const FOODS: FoodDef[] = [
  // vision
  H('carrot_sticks', 'Carrot sticks', 'vision', 'bite_crunch', 'Carrots help your eyes see bright and clear.'),
  H('carrot', 'Crunchy carrot', 'vision', 'bite_crunch', 'Carrots help your eyes see bright and clear.'),
  // muscles
  H('broccoli', 'Steamed broccoli', 'muscles', 'bite_crunch', 'Green veggies help build strong muscles.'),
  H('spinach', 'Spinach leaves', 'muscles', 'bite_crunch', 'Leafy greens help build strong muscles.'),
  H('peas', 'Pea pod', 'muscles', 'bite_crunch', 'Peas are little green power-ups for your muscles.'),
  // bones & teeth
  H('milk', 'Glass of milk', 'bones', 'slurp_drink', 'Milk helps grow strong bones and teeth.'),
  H('yoghurt', 'Yoghurt', 'bones', 'bite_soft', 'Yoghurt helps grow strong bones and teeth.'),
  H('cheese', 'Cheese', 'bones', 'bite_soft', 'Cheese helps grow strong bones and teeth.'),
  // shield (vitamin C)
  H('orange', 'Orange', 'shield', 'bite_juicy', 'Oranges help your body fight off germs.'),
  H('kiwifruit', 'Kiwifruit (cut in half)', 'shield', 'bite_juicy', 'Kiwifruit help your body fight off germs.'),
  H('feijoa', 'Feijoa', 'shield', 'bite_juicy', 'Feijoas are a Kiwi favourite full of germ-fighting goodness.'),
  H('strawberry', 'Strawberries', 'shield', 'bite_juicy', 'Berries help your body fight off germs.'),
  // energy
  H('banana', 'Banana', 'energy', 'bite_soft', 'Bananas give you zippy energy.'),
  H('corn', 'Corn on the cob', 'energy', 'bite_crunch', 'Corn gives you lots of get-up-and-go.'),
  H('kumara', 'Baked kūmara', 'energy', 'bite_soft', 'Kūmara gives you steady energy for running.'),
  H('bread', 'Wholegrain bread', 'energy', 'bite_soft', 'Wholegrain bread keeps your energy going.'),
  // refresh
  H('water', 'Glass of water', 'refresh', 'slurp_drink', 'Water is the best drink - it keeps you fresh!'),
  H('watermelon', 'Watermelon slice', 'refresh', 'bite_juicy', 'Juicy watermelon helps keep you refreshed.'),
  // grow strong
  H('egg', 'Boiled egg', 'grow', 'bite_soft', 'Eggs help you grow up big and strong.'),
  H('chicken', 'Roast chicken', 'grow', 'bite_soft', 'Chicken helps you grow up strong.'),
  H('fish', 'Baked fish', 'grow', 'bite_soft', 'Fish helps you grow up strong and clever.'),
  H('nuts', 'Handful of nuts', 'grow', 'bite_crunch', 'Nuts are tiny packs of growing power.'),
  // happy tummy
  H('apple_slices', 'Apple slices', 'tummy', 'bite_crunch', 'Apples keep your tummy happy.'),
  H('fruit_salad', 'Fruit salad', 'tummy', 'bite_juicy', 'A rainbow of fruit makes a happy tummy.'),
  H('veggie_bowl', 'Veggie rice bowl', 'tummy', 'bite_soft', 'A wholesome meal fills you with goodness.'),
  H('veggie_soup', 'Veggie soup', 'tummy', 'slurp_drink', 'Warm veggie soup is a hug for your tummy.'),

  // sometimes foods
  J('fizzy_can', 'Fizzy drink can', 'sugar', 'junk_fizz_hiss', 'Fizzy drinks are a sometimes treat - water is the everyday drink.'),
  J('fizzy_bottle', 'Fizzy drink bottle', 'sugar', 'junk_fizz_hiss', 'Lots of sugar gives a quick rush, then a sleepy slump.'),
  J('doughnut', 'Doughnut', 'sugar', 'bite_soft', 'Doughnuts are a sometimes treat.'),
  J('lollies', 'Lollies', 'teeth', 'sticky_squelch', 'Lollies stick to your teeth - a sometimes treat.'),
  J('chocolate', 'Chocolate bar', 'teeth', 'sticky_squelch', 'Chocolate is a yummy sometimes treat.'),
  J('ice_cream', 'Ice cream', 'freeze', 'bite_soft', 'Ice cream is a sometimes treat - brrr!'),
  J('chips', 'Bag of chips', 'slow', 'bite_crunch', 'Chips make you feel slow and heavy - a sometimes snack.'),
  J('hot_chips', 'Hot chips', 'slow', 'bite_crunch', 'Fried food is a sometimes food.'),
  J('mouldy_bread', 'Mouldy old bread', 'tummy', 'bite_soft', 'Old food can give you a tummy-ache. Uh-oh!'),
  J('smelly_fish', 'Smelly old fish', 'tummy', 'bite_soft', 'Pooh! Old fish can upset your tummy.'),
];

export const FOOD_BY_ID: Record<string, FoodDef> = Object.fromEntries(FOODS.map((f) => [f.id, f]));
export const HEALTHY = FOODS.filter((f) => f.kind === 'healthy');
export const JUNK = FOODS.filter((f) => f.kind === 'junk');

export const BENEFIT_LABEL: Record<BenefitId, string> = {
  vision: 'Sparkly eyes',
  muscles: 'Mighty muscles',
  bones: 'Strong bones & teeth',
  shield: 'Germ shield',
  energy: 'Zippy energy',
  refresh: 'Fresh splash',
  grow: 'Growing strong',
  tummy: 'Happy tummy',
};
export const BENEFIT_POWER: Record<BenefitId, string> = {
  vision: 'See further and brighter',
  muscles: 'Bonk through obstacles',
  bones: 'Super bouncy jumps',
  shield: 'Bounces one bump away',
  energy: 'Zoom boost',
  refresh: 'Washes away junk effects',
  grow: 'Food magnet',
  tummy: 'Soothes tummy, extra glow',
};
export const JUNK_LABEL: Record<JunkEffectId, string> = {
  sugar: 'Sugar rush, then sleepy slump',
  teeth: 'Sticky teeth',
  freeze: 'Brain freeze!',
  slow: 'Slow and heavy',
  tummy: 'Rumbly tummy',
};
