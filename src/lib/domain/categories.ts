export const categoryGroups = [
  [
    "drinks",
    "Drikke",
    "energy-drinks:Energidrikk|soft-drinks:Brus|sparkling-water:Kullsyrevann|juice:Juice|smoothies:Smoothie|coffee:Kaffe|tea:Te|sports-drinks:Sportsdrikk|beer-cider:Øl og cider|wine:Vin",
  ],
  [
    "meat-fish",
    "Kjøtt og fisk",
    "pork:Svin|beef:Storfe|poultry:Kylling og fjærkre|lamb:Lam|fish:Fisk|seafood:Sjømat|canned:Hermetisk kjøtt og fisk|sausages:Pølser",
  ],
  [
    "produce",
    "Frukt og grønt",
    "fruit:Frukt|berries:Bær|vegetables:Grønnsaker|potatoes:Poteter|herbs:Urter",
  ],
  [
    "dairy",
    "Meieri og alternativer",
    "milk:Melk|plant-milk:Plantedrikk|cheese:Ost|yoghurt:Yoghurt|cream:Fløte|butter:Smør og margarin",
  ],
  [
    "bakery",
    "Brød og bakst",
    "bread:Brød|rolls:Rundstykker og baguetter|crispbread:Knekkebrød|wraps:Tortillalefser|pastries:Bakverk",
  ],
  [
    "toppings",
    "Pålegg",
    "sliced-meat:Kjøttpålegg|pate:Leverpostei og paté|spreadable-cheese:Smøreost|jam:Syltetøy|sweet-spreads:Sjokolade- og nøttepålegg|fish-spreads:Fiskepålegg",
  ],
  [
    "proteins",
    "Egg og planteprotein",
    "eggs:Egg|beans-lentils:Bønner og linser|substitutes:Tofu og kjøtterstatninger",
  ],
  [
    "staples",
    "Matlaging",
    "rice:Ris|pasta:Pasta og nudler|baking:Mel og bakevarer|oils:Olje|spices:Krydder|tomatoes:Hermetiske tomater|stock:Buljong|coconut-milk:Kokosmelk|vinegar:Eddik|sweeteners:Sukker og søtning",
  ],
  [
    "condiments",
    "Sauser og tilbehør",
    "sauces:Sauser og dressinger|ketchup-mustard:Ketchup og sennep|mayonnaise:Majones|pesto:Pesto|hummus:Hummus",
  ],
  [
    "convenience",
    "Ferdigmat",
    "frozen-pizza:Frossenpizza|frozen-meals:Andre frosne ferdigretter|sandwiches:Ferdige sandwicher og wraps|salads:Ferdige salater|chilled-meals:Kjølte ferdigretter|instant-meals:Instantretter",
  ],
  [
    "breakfast",
    "Frokost og barer",
    "cereal:Frokostblanding og granola|oats:Havregryn|snack-bars:Müsli- og snackbarer|protein-bars:Proteinbarer",
  ],
  [
    "snacks",
    "Snacks og søtsaker",
    "crisps:Potetgull|chocolate:Sjokolade|sweets:Godteri|biscuits:Kjeks|ice-cream:Iskrem|nuts-fruit:Nøtter og tørket frukt",
  ],
  [
    "desserts",
    "Desserter",
    "puddings:Pudding|dessert-yoghurt:Dessertyoghurt|cakes:Kaker",
  ],
  [
    "household",
    "Husholdning",
    "paper:Toalettpapir og tørkepapir|laundry:Klesvask|dishwashing:Oppvask|cleaning:Rengjøring|storage:Avfallsposer og matoppbevaring",
  ],
  [
    "personal-care",
    "Personlig pleie",
    "oral:Munnhygiene|hair-body:Sjampo og dusj|deodorant:Deodorant|shaving:Barbering|menstrual:Menstruasjonsprodukter",
  ],
  [
    "pets",
    "Kjæledyr",
    "cat-food:Kattemat|treats:Godbiter|cat-litter:Kattesand|supplies:Annet dyreutstyr",
  ],
  [
    "other-purchases",
    "Andre kjøp",
    "plants:Blomster og planter|utensils:Kjøkkenutstyr|batteries:Batterier og lyspærer|bags:Handleposer",
  ],
  [
    "fallback",
    "Uavklart",
    "food:Annen mat|non-food:Andre varer|unclear:Ukjent vare",
  ],
] as const;
export const categories = categoryGroups.flatMap(
  ([group, groupName, entries]) =>
    entries.split("|").map((entry) => {
      const [leaf, name] = entry.split(":");
      return { id: `${group}.${leaf}`, name, group, groupName };
    }),
);
export const categoryById = new Map(
  categories.map((category) => [category.id, category]),
);
export const categoryRules =
  "Choose one leaf. Frozen pizza is convenience.frozen-pizza. Sliced ham is toppings.sliced-meat, raw pork is meat-fish.pork, and fish spreads are toppings.fish-spreads. Frozen vegetables remain produce.vegetables. Do not infer ingredients, sugar content, package size or purpose from vague names. Use fallback.unclear when uncertain. Deposits and discounts are accounting lines, not products.";
