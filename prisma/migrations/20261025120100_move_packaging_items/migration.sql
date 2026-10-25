-- Nylon bags, cartons, stretch film, tape and pallets are packaging, not raw materials.
UPDATE "Product" SET "kind" = 'PACKAGING'
WHERE "kind" = 'MATERIAL'
  AND (COALESCE("name", '') || ' ' || COALESCE("name2", '')) ~* '(NAYLON|STRECH|STREG|BANTI|KOLISI|PAL+ET|نايلون|ستريج|تيب|كارتون|كراتين|باليت)';
