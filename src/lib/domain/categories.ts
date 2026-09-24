export const categoryGroups = [
  ["drinks", "Drikke"],
  ["meat-fish", "Kjøtt og fisk"],
  ["produce", "Frukt og grønt"],
  ["dairy", "Meieri og alternativer"],
  ["bakery", "Brød og bakst"],
  ["toppings", "Pålegg"],
  ["proteins", "Egg og planteprotein"],
  ["staples", "Matlaging"],
  ["condiments", "Sauser og tilbehør"],
  ["convenience", "Ferdigmat"],
  ["breakfast", "Frokost og barer"],
  ["snacks", "Snacks og søtsaker"],
  ["desserts", "Desserter"],
  ["household", "Husholdning"],
  ["personal-care", "Personlig pleie"],
  ["pets", "Kjæledyr"],
  ["other-purchases", "Andre kjøp"],
  ["fallback", "Uavklart"],
] as const;

type CategoryGroup = (typeof categoryGroups)[number][0];

export type PurchaseType =
  "food" | "household" | "personal-care" | "pets" | "other" | "unknown";

type CategoryDefinition = {
  id: string;
  name: string;
  group: CategoryGroup;
  purchaseType: PurchaseType;
  classifierDescription?: string;
};

const entries = [
  {
    id: "drinks.soft-drinks",
    name: "Brus",
    group: "drinks",
    purchaseType: "food",
    classifierDescription:
      "Soda and energy drinks / brus og energidrikker, including Coca-Cola, Pepsi, Monster, Red Bull, Battery and Burn.",
  },
  {
    id: "drinks.sparkling-water",
    name: "Kullsyrevann",
    group: "drinks",
    purchaseType: "food",
  },
  {
    id: "drinks.juice",
    name: "Juice",
    group: "drinks",
    purchaseType: "food",
  },
  {
    id: "drinks.smoothies",
    name: "Smoothie",
    group: "drinks",
    purchaseType: "food",
  },
  {
    id: "drinks.coffee",
    name: "Kaffe",
    group: "drinks",
    purchaseType: "food",
  },
  {
    id: "drinks.tea",
    name: "Te",
    group: "drinks",
    purchaseType: "food",
  },
  {
    id: "drinks.sports-drinks",
    name: "Sportsdrikk",
    group: "drinks",
    purchaseType: "food",
  },
  {
    id: "drinks.beer-cider",
    name: "Øl og cider",
    group: "drinks",
    purchaseType: "food",
  },
  {
    id: "drinks.wine",
    name: "Vin",
    group: "drinks",
    purchaseType: "food",
  },
  {
    id: "meat-fish.pork",
    name: "Svin",
    group: "meat-fish",
    purchaseType: "food",
  },
  {
    id: "meat-fish.beef",
    name: "Storfe",
    group: "meat-fish",
    purchaseType: "food",
  },
  {
    id: "meat-fish.poultry",
    name: "Kylling og fjærkre",
    group: "meat-fish",
    purchaseType: "food",
  },
  {
    id: "meat-fish.lamb",
    name: "Lam",
    group: "meat-fish",
    purchaseType: "food",
  },
  {
    id: "meat-fish.fish",
    name: "Fisk",
    group: "meat-fish",
    purchaseType: "food",
  },
  {
    id: "meat-fish.seafood",
    name: "Sjømat",
    group: "meat-fish",
    purchaseType: "food",
  },
  {
    id: "meat-fish.canned",
    name: "Hermetisk kjøtt og fisk",
    group: "meat-fish",
    purchaseType: "food",
  },
  {
    id: "meat-fish.sausages",
    name: "Pølser",
    group: "meat-fish",
    purchaseType: "food",
  },
  {
    id: "produce.fruit",
    name: "Frukt",
    group: "produce",
    purchaseType: "food",
  },
  {
    id: "produce.berries",
    name: "Bær",
    group: "produce",
    purchaseType: "food",
  },
  {
    id: "produce.vegetables",
    name: "Grønnsaker",
    group: "produce",
    purchaseType: "food",
    classifierDescription:
      "Vegetables, including snack carrots and plain lettuce such as Crispi salad. A vegetable sold as a snack remains a vegetable. Prepared mixed meal salads have their own category.",
  },
  {
    id: "produce.potatoes",
    name: "Poteter",
    group: "produce",
    purchaseType: "food",
  },
  {
    id: "produce.herbs",
    name: "Urter",
    group: "produce",
    purchaseType: "food",
  },
  {
    id: "dairy.milk",
    name: "Melk",
    group: "dairy",
    purchaseType: "food",
  },
  {
    id: "dairy.plant-milk",
    name: "Plantedrikk",
    group: "dairy",
    purchaseType: "food",
  },
  {
    id: "dairy.cheese",
    name: "Ost",
    group: "dairy",
    purchaseType: "food",
  },
  {
    id: "dairy.yoghurt",
    name: "Yoghurt",
    group: "dairy",
    purchaseType: "food",
  },
  {
    id: "dairy.cream",
    name: "Fløte",
    group: "dairy",
    purchaseType: "food",
  },
  {
    id: "dairy.butter",
    name: "Smør og margarin",
    group: "dairy",
    purchaseType: "food",
  },
  {
    id: "bakery.bread",
    name: "Brød",
    group: "bakery",
    purchaseType: "food",
  },
  {
    id: "bakery.rolls",
    name: "Rundstykker og baguetter",
    group: "bakery",
    purchaseType: "food",
    classifierDescription:
      "Plain bread rolls and unfilled baguettes. Filled baguettes belong to prepared sandwiches.",
  },
  {
    id: "bakery.crispbread",
    name: "Knekkebrød",
    group: "bakery",
    purchaseType: "food",
    classifierDescription:
      "Crispbread and packaged crispbread sandwiches, including Wasa Sandwich. Fresh filled baguettes and soft bread sandwiches belong to convenience.sandwiches.",
  },
  {
    id: "bakery.wraps",
    name: "Tortillalefser",
    group: "bakery",
    purchaseType: "food",
  },
  {
    id: "bakery.pastries",
    name: "Bakverk",
    group: "bakery",
    purchaseType: "food",
  },
  {
    id: "toppings.sliced-meat",
    name: "Kjøttpålegg",
    group: "toppings",
    purchaseType: "food",
  },
  {
    id: "toppings.pate",
    name: "Leverpostei og paté",
    group: "toppings",
    purchaseType: "food",
  },
  {
    id: "toppings.spreadable-cheese",
    name: "Smøreost",
    group: "toppings",
    purchaseType: "food",
  },
  {
    id: "toppings.jam",
    name: "Syltetøy",
    group: "toppings",
    purchaseType: "food",
  },
  {
    id: "toppings.sweet-spreads",
    name: "Sjokolade- og nøttepålegg",
    group: "toppings",
    purchaseType: "food",
  },
  {
    id: "toppings.fish-spreads",
    name: "Fiskepålegg",
    group: "toppings",
    purchaseType: "food",
  },
  {
    id: "proteins.eggs",
    name: "Egg",
    group: "proteins",
    purchaseType: "food",
  },
  {
    id: "proteins.beans-lentils",
    name: "Bønner og linser",
    group: "proteins",
    purchaseType: "food",
  },
  {
    id: "proteins.substitutes",
    name: "Tofu og kjøtterstatninger",
    group: "proteins",
    purchaseType: "food",
  },
  {
    id: "staples.rice",
    name: "Ris",
    group: "staples",
    purchaseType: "food",
  },
  {
    id: "staples.pasta",
    name: "Pasta og nudler",
    group: "staples",
    purchaseType: "food",
  },
  {
    id: "staples.baking",
    name: "Mel og bakevarer",
    group: "staples",
    purchaseType: "food",
  },
  {
    id: "staples.oils",
    name: "Olje",
    group: "staples",
    purchaseType: "food",
  },
  {
    id: "staples.spices",
    name: "Krydder",
    group: "staples",
    purchaseType: "food",
  },
  {
    id: "staples.tomatoes",
    name: "Hermetiske tomater",
    group: "staples",
    purchaseType: "food",
  },
  {
    id: "staples.stock",
    name: "Buljong",
    group: "staples",
    purchaseType: "food",
  },
  {
    id: "staples.coconut-milk",
    name: "Kokosmelk",
    group: "staples",
    purchaseType: "food",
  },
  {
    id: "staples.vinegar",
    name: "Eddik",
    group: "staples",
    purchaseType: "food",
  },
  {
    id: "staples.sweeteners",
    name: "Sukker og søtning",
    group: "staples",
    purchaseType: "food",
  },
  {
    id: "condiments.sauces",
    name: "Sauser og dressinger",
    group: "condiments",
    purchaseType: "food",
  },
  {
    id: "condiments.ketchup-mustard",
    name: "Ketchup og sennep",
    group: "condiments",
    purchaseType: "food",
  },
  {
    id: "condiments.mayonnaise",
    name: "Majones",
    group: "condiments",
    purchaseType: "food",
  },
  {
    id: "condiments.pesto",
    name: "Pesto",
    group: "condiments",
    purchaseType: "food",
  },
  {
    id: "condiments.hummus",
    name: "Hummus",
    group: "condiments",
    purchaseType: "food",
  },
  {
    id: "convenience.frozen-pizza",
    name: "Frossenpizza",
    group: "convenience",
    purchaseType: "food",
    classifierDescription:
      "Frozen pizzas, including BigOne (such as BigOne BBQ Chicken), Grandiosa and Dr. Oetker. Chicken or BBQ in a pizza name describes its topping, not a sandwich or raw meat.",
  },
  {
    id: "convenience.frozen-meals",
    name: "Andre frosne ferdigretter",
    group: "convenience",
    purchaseType: "food",
  },
  {
    id: "convenience.sandwiches",
    name: "Fylte baguetter, sandwicher og wraps",
    group: "convenience",
    purchaseType: "food",
    classifierDescription:
      "Fresh prepared sandwiches, filled baguettes and ready-to-eat wraps, including taco baguettes. Packaged crispbread sandwiches such as Wasa belong to bakery.crispbread.",
  },
  {
    id: "convenience.salads",
    name: "Ferdige salater",
    group: "convenience",
    purchaseType: "food",
    classifierDescription:
      "Prepared mixed meal salads. Plain lettuce, salad leaves and salad vegetables belong to produce.vegetables.",
  },
  {
    id: "convenience.fresh-meals",
    name: "Ferske ferdigretter og varmmat",
    group: "convenience",
    purchaseType: "food",
    classifierDescription:
      "Fresh ready-to-eat meals and hot food from a grocery counter, including freshly prepared pizza. Excludes frozen pizza, packaged chilled meals, filled baguettes and prepared salads, which have their own categories.",
  },
  {
    id: "convenience.chilled-meals",
    name: "Kjølte ferdigretter",
    group: "convenience",
    purchaseType: "food",
  },
  {
    id: "convenience.instant-meals",
    name: "Instantretter",
    group: "convenience",
    purchaseType: "food",
  },
  {
    id: "breakfast.cereal",
    name: "Frokostblanding og granola",
    group: "breakfast",
    purchaseType: "food",
  },
  {
    id: "breakfast.oats",
    name: "Havregryn",
    group: "breakfast",
    purchaseType: "food",
  },
  {
    id: "breakfast.snack-bars",
    name: "Müsli- og snackbarer",
    group: "breakfast",
    purchaseType: "food",
  },
  {
    id: "breakfast.protein-bars",
    name: "Proteinbarer",
    group: "breakfast",
    purchaseType: "food",
  },
  {
    id: "snacks.crisps",
    name: "Potetgull",
    group: "snacks",
    purchaseType: "food",
  },
  {
    id: "snacks.chocolate",
    name: "Sjokolade",
    group: "snacks",
    purchaseType: "food",
  },
  {
    id: "snacks.sweets",
    name: "Godteri",
    group: "snacks",
    purchaseType: "food",
  },
  {
    id: "snacks.biscuits",
    name: "Kjeks",
    group: "snacks",
    purchaseType: "food",
  },
  {
    id: "snacks.ice-cream",
    name: "Iskrem",
    group: "snacks",
    purchaseType: "food",
    classifierDescription:
      "Ice cream, frozen yoghurt and yoghurt ice cream, including Dream Yoghurtis. The word yoghurt does not make frozen yoghurt ice cream an ordinary dairy yoghurt.",
  },
  {
    id: "snacks.nuts-fruit",
    name: "Nøtter og tørket frukt",
    group: "snacks",
    purchaseType: "food",
  },
  {
    id: "desserts.puddings",
    name: "Pudding",
    group: "desserts",
    purchaseType: "food",
  },
  {
    id: "desserts.dessert-yoghurt",
    name: "Dessertyoghurt",
    group: "desserts",
    purchaseType: "food",
  },
  {
    id: "desserts.cakes",
    name: "Kaker",
    group: "desserts",
    purchaseType: "food",
  },
  {
    id: "household.paper",
    name: "Toalettpapir og tørkepapir",
    group: "household",
    purchaseType: "household",
  },
  {
    id: "household.laundry",
    name: "Klesvask",
    group: "household",
    purchaseType: "household",
  },
  {
    id: "household.dishwashing",
    name: "Oppvask",
    group: "household",
    purchaseType: "household",
  },
  {
    id: "household.cleaning",
    name: "Rengjøring",
    group: "household",
    purchaseType: "household",
  },
  {
    id: "household.storage",
    name: "Avfallsposer og matoppbevaring",
    group: "household",
    purchaseType: "household",
  },
  {
    id: "personal-care.oral",
    name: "Munnhygiene",
    group: "personal-care",
    purchaseType: "personal-care",
    classifierDescription:
      "Toothbrushes, toothpaste, dental floss and mouthwash, including Jordan Individual toothbrushes.",
  },
  {
    id: "personal-care.hair-body",
    name: "Sjampo og dusj",
    group: "personal-care",
    purchaseType: "personal-care",
  },
  {
    id: "personal-care.deodorant",
    name: "Deodorant",
    group: "personal-care",
    purchaseType: "personal-care",
  },
  {
    id: "personal-care.shaving",
    name: "Barbering",
    group: "personal-care",
    purchaseType: "personal-care",
  },
  {
    id: "personal-care.menstrual",
    name: "Menstruasjonsprodukter",
    group: "personal-care",
    purchaseType: "personal-care",
  },
  {
    id: "personal-care.supplements",
    name: "Vitaminer og kosttilskudd",
    group: "personal-care",
    purchaseType: "personal-care",
    classifierDescription:
      "Vitamins and dietary supplements, including melatonin. Keep these non-food grocery purchases in the budget.",
  },
  {
    id: "pets.cat-food",
    name: "Kattemat",
    group: "pets",
    purchaseType: "pets",
  },
  {
    id: "pets.treats",
    name: "Godbiter",
    group: "pets",
    purchaseType: "pets",
  },
  {
    id: "pets.cat-litter",
    name: "Kattesand",
    group: "pets",
    purchaseType: "pets",
  },
  {
    id: "pets.supplies",
    name: "Annet dyreutstyr",
    group: "pets",
    purchaseType: "pets",
  },
  {
    id: "other-purchases.plants",
    name: "Blomster og planter",
    group: "other-purchases",
    purchaseType: "other",
  },
  {
    id: "other-purchases.utensils",
    name: "Kjøkkenutstyr",
    group: "other-purchases",
    purchaseType: "other",
  },
  {
    id: "other-purchases.batteries",
    name: "Batterier og lyspærer",
    group: "other-purchases",
    purchaseType: "other",
    classifierDescription:
      "Electrical batteries and light bulbs. Battery brand drinks belong to drinks.soft-drinks.",
  },
  {
    id: "other-purchases.bags",
    name: "Handleposer",
    group: "other-purchases",
    purchaseType: "other",
  },
  {
    id: "fallback.food",
    name: "Annen mat",
    group: "fallback",
    purchaseType: "food",
  },
  {
    id: "fallback.non-food",
    name: "Andre varer",
    group: "fallback",
    purchaseType: "other",
  },
  {
    id: "fallback.unclear",
    name: "Ukjent vare",
    group: "fallback",
    purchaseType: "unknown",
  },
] as const satisfies readonly CategoryDefinition[];

export type CategoryId = (typeof entries)[number]["id"];

export type Category = CategoryDefinition & {
  id: CategoryId;
  groupName: string;
};

export const categories: Category[] = entries.flatMap((entry) =>
  categoryGroups.flatMap(([group, groupName]) =>
    group === entry.group ? [{ ...entry, groupName }] : [],
  ),
);

export const categoryById = new Map<string, Category>(
  categories.map((category) => [category.id, category]),
);

export const categoryRules =
  "Choose one leaf. Soda and energy drinks both belong to drinks.soft-drinks. Frozen pizza is convenience.frozen-pizza; fresh ready-to-eat pizza and hot meals from the grocery counter are convenience.fresh-meals. Filled baguettes, including taco baguettes, are convenience.sandwiches; plain baguettes are bakery.rolls. Packaged Wasa crispbread sandwiches are bakery.crispbread. Prepared meal salads are convenience.salads; plain lettuce and salad leaves remain produce.vegetables. Snack carrots are vegetables, not crisps. Yoghurt ice cream is snacks.ice-cream, not dairy.yoghurt. Vitamins and supplements, including melatonin, are personal-care.supplements. Sliced ham is toppings.sliced-meat, raw pork is meat-fish.pork, and fish spreads are toppings.fish-spreads. Frozen vegetables remain produce.vegetables. Do not infer ingredients, sugar content, package size or purpose from vague names. Use fallback.unclear when uncertain. Deposits and discounts are accounting lines, not products.";
