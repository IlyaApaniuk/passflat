import { PrismaClient } from "@prisma/client";
import { generateBuildingSlug } from "../src/lib/slugify";
import { normalizeAddress, cleanStreet } from "../src/lib/address";

const prisma = new PrismaClient();

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDecimal(min: number, max: number, decimals = 2) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDate(start: Date, end: Date) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

const SEED_USER_ID = "00000000-0000-0000-0000-000000000001";
const SEED_USER_2_ID = "00000000-0000-0000-0000-000000000002";

async function main() {
  // --- Country: Poland ---
  const poland = await prisma.country.upsert({
    where: { id: "pl" },
    update: {},
    create: {
      id: "pl",
      nameKey: "country.pl",
      currency: "PLN",
      defaultLocale: "pl",
      supportedLocales: ["pl", "en", "ru", "uk"],
      isActive: true,
      launchedAt: new Date(),
    },
  });

  // --- City: Warsaw ---
  const warsaw = await prisma.city.upsert({
    where: { slug: "warsaw" },
    update: {},
    create: {
      countryId: poland.id,
      slug: "warsaw",
      nameKey: "city.warsaw",
      lat: 52.2297,
      lng: 21.0122,
      timezone: "Europe/Warsaw",
      isActive: true,
      bounds: {
        north: 52.42,
        south: 52.05,
        east: 21.35,
        west: 20.75,
      },
    },
  });

  // --- Districts of Warsaw ---
  const districtData = [
    { slug: "srodmiescie", nameKey: "Śródmieście" },
    { slug: "mokotow", nameKey: "Mokotów" },
    { slug: "praga-polnoc", nameKey: "Praga-Północ" },
    { slug: "praga-poludnie", nameKey: "Praga-Południe" },
    { slug: "wilanow", nameKey: "Wilanów" },
    { slug: "ochota", nameKey: "Ochota" },
    { slug: "wola", nameKey: "Wola" },
    { slug: "bielany", nameKey: "Bielany" },
    { slug: "zoliborz", nameKey: "Żoliborz" },
    { slug: "ursynow", nameKey: "Ursynów" },
    { slug: "targowek", nameKey: "Targówek" },
    { slug: "bemowo", nameKey: "Bemowo" },
    { slug: "bialoleka", nameKey: "Białołęka" },
    { slug: "wawer", nameKey: "Wawer" },
    { slug: "wesola", nameKey: "Wesoła" },
    { slug: "wlochy", nameKey: "Włochy" },
    { slug: "ursus", nameKey: "Ursus" },
    { slug: "rembertow", nameKey: "Rembertów" },
  ];

  const districts: Array<{ id: string; slug: string }> = [];
  for (const d of districtData) {
    const district = await prisma.district.upsert({
      where: { cityId_slug: { cityId: warsaw.id, slug: d.slug } },
      update: {},
      create: {
        cityId: warsaw.id,
        slug: d.slug,
        nameKey: d.nameKey,
      },
    });
    districts.push(district);
  }

  // --- Cost term labels for Poland ---
  const costTerms = [
    { fieldName: "rent", labelKey: "cost.rent.pl", tooltipKey: "cost.rent.tooltip.pl" },
    { fieldName: "admin_fee", labelKey: "cost.admin_fee.pl", tooltipKey: "cost.admin_fee.tooltip.pl" },
    { fieldName: "electricity_avg", labelKey: "cost.electricity.pl", tooltipKey: null },
    { fieldName: "gas", labelKey: "cost.gas.pl", tooltipKey: null },
    { fieldName: "heating", labelKey: "cost.heating.pl", tooltipKey: "cost.heating.tooltip.pl" },
    { fieldName: "water", labelKey: "cost.water.pl", tooltipKey: null },
    { fieldName: "internet", labelKey: "cost.internet.pl", tooltipKey: null },
  ];

  for (const term of costTerms) {
    await prisma.costTermLabel.upsert({
      where: {
        countryId_fieldName: { countryId: poland.id, fieldName: term.fieldName },
      },
      update: {},
      create: {
        countryId: poland.id,
        fieldName: term.fieldName,
        labelKey: term.labelKey,
        tooltipKey: term.tooltipKey,
      },
    });
  }

  // --- Seed profiles ---
  const profile1 = await prisma.profile.upsert({
    where: { id: SEED_USER_ID },
    update: {},
    create: {
      id: SEED_USER_ID,
      displayName: "Anna Kowalska",
      locale: "pl",
      cityId: warsaw.id,
      contactMethod: "email",
      contactValue: "anna@example.com",
      hasContributedCost: true,
      isVerified: true,
    },
  });

  const profile2 = await prisma.profile.upsert({
    where: { id: SEED_USER_2_ID },
    update: {},
    create: {
      id: SEED_USER_2_ID,
      displayName: "Marek Nowak",
      locale: "en",
      cityId: warsaw.id,
      contactMethod: "telegram",
      contactValue: "@marek_nowak",
      hasContributedCost: true,
      isVerified: false,
    },
  });

  // --- Seed buildings (30 real-ish Warsaw addresses) ---
  const buildingSeeds = [
    { street: "Marszałkowska", num: "1", lat: 52.2310, lng: 21.0110, district: "srodmiescie", type: "kamienica", year: 1935 },
    { street: "Marszałkowska", num: "58", lat: 52.2255, lng: 21.0125, district: "srodmiescie", type: "blok", year: 1970 },
    { street: "Nowy Świat", num: "22", lat: 52.2320, lng: 21.0180, district: "srodmiescie", type: "kamienica", year: 1890 },
    { street: "Złota", num: "44", lat: 52.2295, lng: 21.0045, district: "srodmiescie", type: "apartamentowiec", year: 2015 },
    { street: "Puławska", num: "12", lat: 52.2095, lng: 21.0235, district: "mokotow", type: "blok", year: 1978 },
    { street: "Puławska", num: "145", lat: 52.1850, lng: 21.0260, district: "mokotow", type: "blok", year: 1985 },
    { street: "Wołoska", num: "8", lat: 52.1920, lng: 21.0030, district: "mokotow", type: "apartamentowiec", year: 2018 },
    { street: "Konstruktorska", num: "11", lat: 52.1880, lng: 20.9980, district: "mokotow", type: "apartamentowiec", year: 2020 },
    { street: "Targowa", num: "15", lat: 52.2520, lng: 21.0410, district: "praga-polnoc", type: "kamienica", year: 1910 },
    { street: "Ząbkowska", num: "33", lat: 52.2480, lng: 21.0450, district: "praga-polnoc", type: "kamienica", year: 1905 },
    { street: "Grochowska", num: "207", lat: 52.2370, lng: 21.0710, district: "praga-poludnie", type: "blok", year: 1968 },
    { street: "Saska", num: "4", lat: 52.2310, lng: 21.0580, district: "praga-poludnie", type: "blok", year: 1972 },
    { street: "Klimczaka", num: "7", lat: 52.1650, lng: 21.0750, district: "wilanow", type: "apartamentowiec", year: 2019 },
    { street: "Grójecka", num: "43", lat: 52.2190, lng: 20.9850, district: "ochota", type: "blok", year: 1965 },
    { street: "Opaczewska", num: "16", lat: 52.2110, lng: 20.9770, district: "ochota", type: "blok", year: 1975 },
    { street: "Kasprzaka", num: "31", lat: 52.2360, lng: 20.9710, district: "wola", type: "apartamentowiec", year: 2021 },
    { street: "Wolska", num: "88", lat: 52.2320, lng: 20.9620, district: "wola", type: "blok", year: 1960 },
    { street: "Obozowa", num: "20", lat: 52.2410, lng: 20.9640, district: "wola", type: "kamienica", year: 1938 },
    { street: "Żeromskiego", num: "5", lat: 52.2680, lng: 20.9720, district: "bielany", type: "blok", year: 1982 },
    { street: "Kochanowskiego", num: "18", lat: 52.2710, lng: 20.9840, district: "zoliborz", type: "kamienica", year: 1930 },
    { street: "Mickiewicza", num: "27", lat: 52.2630, lng: 20.9920, district: "zoliborz", type: "blok", year: 1955 },
    { street: "Dereniowa", num: "6", lat: 52.1480, lng: 21.0310, district: "ursynow", type: "blok", year: 1988 },
    { street: "Imielin", num: "10", lat: 52.1520, lng: 21.0200, district: "ursynow", type: "blok", year: 1992 },
    { street: "Kondratowicza", num: "14", lat: 52.2780, lng: 21.0300, district: "targowek", type: "blok", year: 1980 },
    { street: "Powstańców Śląskich", num: "95", lat: 52.2430, lng: 20.9180, district: "bemowo", type: "blok", year: 1990 },
    { street: "Ostródzka", num: "44", lat: 52.2910, lng: 20.9320, district: "bemowo", type: "apartamentowiec", year: 2017 },
    { street: "Odkryta", num: "3", lat: 52.3120, lng: 21.0050, district: "bialoleka", type: "apartamentowiec", year: 2022 },
    { street: "Patriotów", num: "119", lat: 52.2010, lng: 21.1250, district: "wawer", type: "dom", year: 2005 },
    { street: "Grodziska", num: "21", lat: 52.2050, lng: 20.9210, district: "wlochy", type: "blok", year: 1976 },
    { street: "Traktorzystów", num: "8", lat: 52.1940, lng: 20.9050, district: "ursus", type: "blok", year: 1995 },
  ];

  const districtMap = new Map(districts.map((d) => [d.slug, d.id]));
  const buildings: Array<{ id: string; districtSlug: string }> = [];

  for (const b of buildingSeeds) {
    const street = cleanStreet(b.street);
    const addressFull = `${street} ${b.num}`;
    const addressNormalized = normalizeAddress(street, b.num);
    const slug = generateBuildingSlug(street, b.num);

    const building = await prisma.building.upsert({
      where: {
        cityId_addressNormalized: {
          cityId: warsaw.id,
          addressNormalized,
        },
      },
      update: {},
      create: {
        cityId: warsaw.id,
        slug,
        districtId: districtMap.get(b.district)!,
        street,
        buildingNumber: b.num,
        addressFull,
        addressNormalized,
        lat: b.lat,
        lng: b.lng,
        buildingType: b.type,
        yearBuilt: b.year,
        totalApartmentsApprox: b.type === "dom" ? 1 : randomBetween(12, 120),
      },
    });
    buildings.push({ id: building.id, districtSlug: b.district });
  }

  // --- Seed listings (all types) ---
  const replacementTitles = [
    "Przytulne 2-pokojowe w centrum",
    "Przestronne studio z balkonem",
    "Nowoczesne 3 pokoje z widokiem",
    "Kawalerka blisko metra",
    "2 pokoje po remoncie",
    "Słoneczne mieszkanie z tarasem",
    "Klimatyczna kamienica, 2 pokoje",
    "Loft w starej fabryce",
    "Mieszkanie idealne dla pary",
    "3 pokoje, cisza i zieleń",
    "Rozkładowe 2 pokoje, niski czynsz",
    "Nowe budownictwo, wysoki standard",
    "Umeblowane studio w wieżowcu",
    "Duże 4 pokoje dla rodziny",
    "Mieszkanie z ogrodem na dachu",
    "Jasne 2 pokoje, świetna lokalizacja",
    "Pokój z kuchnią, osobna łazienka",
    "Kompaktowe M2 przy tramwaju",
    "Apartament z garażem podziemnym",
    "Funkcjonalne 50m², 2 pokoje",
  ];

  const roommateTitles = [
    "Szukam współlokatora – osobny pokój na Mokotowie",
    "Wolny pokój w 3-osobowym mieszkaniu, Wola",
    "Pokój w mieszkaniu blisko metra, tylko dziewczyny",
    "Szukamy 3. osoby do mieszkania na Ochocie",
    "Duży pokój w centrum, dwójka IT-owców szuka sąsiada",
    "Wolne miejsce w 2-pokojowym, Ursynów",
    "Pokój 14m² w nowym apartamentowcu, Wilanów",
    "Szukam cichego współlokatora – Żoliborz",
    "Pokój z balkonem, mieszkanie po remoncie",
    "Miejsce w pokoju dwuosobowym – niska cena",
  ];

  const subletTitles = [
    "Mieszkanie na miesiąc – wyjeżdżam na wakacje",
    "Sublet lipiec-sierpień, centrum Warszawy",
    "Kawalerka na 3 tygodnie, pełne wyposażenie",
    "Mieszkanie do wynajęcia na 6 tygodni, Mokotów",
    "Tymczasowe 2 pokoje – wrzesień",
    "Studio na Pradze na 2 miesiące",
    "Apartament w centrum – sublet na sierpień",
    "Mieszkanie na czas wyjazdu, Wola, 5 tygodni",
    "Pełni umeblowane M2 na krótki okres",
    "Sublet: luksusowy apartament, 4 tygodnie",
  ];

  const replacementDescriptions = [
    "Szukam kogoś kto przejmie moją umowę najmu. Mieszkanie w świetnym stanie, po remoncie. Wszystkie sprzęty AGD w cenie.",
    "Przenoszę się za granicę i szukam osoby do przejęcia kontraktu. Landlord jest bardzo w porządku, nie podnosi czynszu.",
    "Mieszkanie świetnie skomunikowane — 5 min do metra, dużo sklepów w okolicy. Idealne dla singla lub pary.",
    "Kończę kontrakt wcześniej ze względu na przeprowadzkę do innego miasta. Kaucja do odbioru od wynajmującego.",
    "Super sąsiedztwo, cicha klatka, windy, monitoring. Polecam ten budynek — mieszkam tu 2 lata i jestem zadowolony.",
  ];

  const roommateDescriptions = [
    "Jesteśmy dwójką 25-27-latków pracujących w IT. Szukamy kogoś spokojnego i czystościowego do wspólnego mieszkania.",
    "Mieszkam tu od roku, szukam drugiej osoby. Mieszkanie po remoncie, kuchnia wspólna, łazienka osobna.",
    "Szukamy współlokatorki do naszego 3-pokojowego mieszkania. Jesteśmy dwie dziewczyny, 23 i 25 lat, studiujemy.",
    "Pokój jest w pełni umeblowany, internet w cenie. Preferuję osobę niepalącą, pracującą lub studiującą.",
    "Spokojna okolica, blisko tramwaju. Mieszkam tu od 2 lat. Szukam kogoś na dłużej (min. 6 miesięcy).",
  ];

  const subletDescriptions = [
    "Wyjeżdżam na wakacje i szukam kogoś kto zamieszka w moim mieszkaniu na ten czas. Wszystko jest – pościel, ręczniki, naczynia.",
    "Wyjazd służbowy na 6 tygodni. Mieszkanie w pełni wyposażone, internet, Netflix, pralka. Idealne dla jednej osoby lub pary.",
    "Oferuję moje studio na czas mojego pobytu za granicą. Proszę o niepalenie i dbanie o rośliny.",
    "Tymczasowa sublet na czas remontu mojego głównego mieszkania. Cisza, porządek, zwierzęta mile widziane.",
    "Mieszkanie dostępne na krótki okres. Świetna lokalizacja, metro 3 min pieszo. Cena obejmuje wszystkie opłaty.",
  ];

  const leaseTypes = ["indefinite", "fixed_term", "fixed_term", "indefinite", "fixed_term"];
  const authorIds = [profile1.id, profile2.id];
  const genders = ["any", "male", "female"] as const;
  const roomTypes = ["private", "shared"] as const;

  const existingListings = await prisma.listing.count();
  if (existingListings === 0) {
    // --- Replacement listings (20) ---
    for (let i = 0; i < 20; i++) {
      const building = buildings[i % buildings.length];
      const rooms = randomBetween(1, 4);
      const area = rooms === 1 ? randomBetween(22, 38) : rooms === 2 ? randomBetween(35, 58) : rooms === 3 ? randomBetween(55, 80) : randomBetween(70, 110);
      const rent = randomBetween(2200, 5500);
      const adminFee = randomBetween(300, 900);
      const utilities = randomBetween(200, 600);
      const total = rent + adminFee + utilities;

      await prisma.listing.create({
        data: {
          buildingId: building.id,
          authorId: randomElement(authorIds),
          type: "replacement",
          title: replacementTitles[i],
          description: randomElement(replacementDescriptions),
          locale: "pl",
          currency: "PLN",
          rent,
          adminFee,
          utilitiesAvg: utilities,
          totalMonthly: total,
          leaseType: randomElement(leaseTypes),
          leaseEndDate: randomDate(new Date("2026-08-01"), new Date("2027-06-30")),
          availableFrom: randomDate(new Date("2026-06-01"), new Date("2026-09-01")),
          depositAmount: rent * randomBetween(1, 2),
          rooms,
          areaM2: area,
          floor: randomBetween(0, 12),
          amenities: [
            ...(Math.random() > 0.2 ? ["furnished"] : []),
            ...(Math.random() > 0.3 ? ["fridge"] : []),
            ...(Math.random() > 0.4 ? ["stove"] : []),
            ...(Math.random() > 0.5 ? ["washingMachine"] : []),
            ...(Math.random() > 0.5 ? ["balcony"] : []),
            ...(Math.random() > 0.6 ? ["elevator"] : []),
            ...(Math.random() > 0.6 ? ["wifi"] : []),
            ...(Math.random() > 0.7 ? ["dishwasher"] : []),
            ...(Math.random() > 0.7 ? ["tv"] : []),
            ...(Math.random() > 0.8 ? ["ac"] : []),
            ...(Math.random() > 0.8 ? ["intercom"] : []),
          ],
          thingsToKnow: [
            ...(Math.random() > 0.5 ? ["noSmoking"] : []),
            ...(Math.random() > 0.6 ? ["petsAllowed"] : []),
            ...(Math.random() > 0.6 ? ["quietApartment"] : []),
            ...(Math.random() > 0.7 ? ["fastInternet"] : []),
            ...(Math.random() > 0.8 ? ["warmInWinter"] : []),
            ...(Math.random() > 0.8 ? ["recentRenovation"] : []),
          ],
          registrationPossible: Math.random() > 0.4 ? true : Math.random() > 0.5 ? false : null,
          photos: [],
          status: "active",
          isPromoted: Math.random() > 0.7,
          isVerified: Math.random() > 0.5,
          viewsCount: randomBetween(5, 320),
          responsesCount: randomBetween(0, 12),
          expiresAt: randomDate(new Date("2026-07-01"), new Date("2026-10-01")),
          createdAt: randomDate(new Date("2026-04-01"), new Date("2026-05-18")),
        },
      });
    }
    console.log("  - Replacement listings: 20");

    // --- Roommate listings (10) ---
    for (let i = 0; i < 10; i++) {
      const building = buildings[(i + 10) % buildings.length];
      const totalRooms = randomBetween(2, 4);
      const currentRoommates = randomBetween(1, totalRooms - 1);
      const totalApartmentRent = randomBetween(3000, 6000);
      const pricePerPerson = Math.round(totalApartmentRent / (currentRoommates + 1));
      const area = totalRooms === 2 ? randomBetween(40, 55) : totalRooms === 3 ? randomBetween(55, 80) : randomBetween(75, 110);

      await prisma.listing.create({
        data: {
          buildingId: building.id,
          authorId: randomElement(authorIds),
          type: "roommate",
          title: roommateTitles[i],
          description: randomElement(roommateDescriptions),
          locale: "pl",
          currency: "PLN",
          pricePerPerson,
          totalApartmentRent,
          totalMonthly: pricePerPerson,
          currentRoommates,
          totalRooms,
          roomType: randomElement([...roomTypes]),
          preferredGender: randomElement([...genders]),
          preferredAgeMin: Math.random() > 0.5 ? randomBetween(20, 25) : null,
          preferredAgeMax: Math.random() > 0.5 ? randomBetween(30, 40) : null,
          roommateDescription: randomElement(roommateDescriptions),
          availableFrom: randomDate(new Date("2026-06-01"), new Date("2026-09-01")),
          depositAmount: pricePerPerson,
          rooms: totalRooms,
          areaM2: area,
          floor: randomBetween(0, 10),
          amenities: [
            "furnished",
            ...(Math.random() > 0.3 ? ["fridge"] : []),
            ...(Math.random() > 0.5 ? ["washingMachine"] : []),
            ...(Math.random() > 0.6 ? ["elevator"] : []),
            ...(Math.random() > 0.6 ? ["wifi"] : []),
            ...(Math.random() > 0.7 ? ["tv"] : []),
          ],
          thingsToKnow: [
            ...(Math.random() > 0.4 ? ["petsAllowed"] : []),
            ...(Math.random() > 0.5 ? ["noSmoking"] : []),
            ...(Math.random() > 0.5 ? ["quietApartment"] : []),
            ...(Math.random() > 0.6 ? ["fastInternet"] : []),
          ],
          registrationPossible: Math.random() > 0.5 ? true : null,
          photos: [],
          status: "active",
          isPromoted: Math.random() > 0.8,
          isVerified: Math.random() > 0.5,
          viewsCount: randomBetween(3, 200),
          responsesCount: randomBetween(0, 8),
          expiresAt: randomDate(new Date("2026-06-15"), new Date("2026-08-15")),
          createdAt: randomDate(new Date("2026-04-15"), new Date("2026-05-18")),
        },
      });
    }
    console.log("  - Roommate listings: 10");

    // --- Sublet listings (10) ---
    for (let i = 0; i < 10; i++) {
      const building = buildings[(i + 20) % buildings.length];
      const rooms = randomBetween(1, 3);
      const area = rooms === 1 ? randomBetween(25, 40) : rooms === 2 ? randomBetween(38, 60) : randomBetween(55, 80);
      const durationDays = randomBetween(14, 60);
      const priceTotal = randomBetween(2000, 8000);
      const availableFrom = randomDate(new Date("2026-06-15"), new Date("2026-08-01"));
      const availableTo = new Date(availableFrom.getTime() + durationDays * 24 * 60 * 60 * 1000);

      await prisma.listing.create({
        data: {
          buildingId: building.id,
          authorId: randomElement(authorIds),
          type: "sublet",
          title: subletTitles[i],
          description: randomElement(subletDescriptions),
          locale: "pl",
          currency: "PLN",
          priceTotal,
          totalMonthly: Math.round(priceTotal / durationDays * 30),
          utilitiesIncluded: Math.random() > 0.3,
          internetIncluded: Math.random() > 0.2,
          subletRules: Math.random() > 0.4 ? randomElement([
            "Nie palić w mieszkaniu, dbać o rośliny.",
            "Zakaz zwierząt, cisza nocna od 22:00.",
            "Proszę o nieprzywoanie dużych imprez.",
            "Bez ograniczeń, proszę tylko o czystość.",
            "Nie palić, nie zostawiać okien otwartych na noc.",
          ]) : null,
          availableFrom,
          availableTo,
          depositAmount: randomBetween(500, 2000),
          rooms,
          areaM2: area,
          floor: randomBetween(0, 10),
          amenities: [
            "furnished",
            ...(Math.random() > 0.3 ? ["fridge"] : []),
            ...(Math.random() > 0.5 ? ["ac"] : []),
            ...(Math.random() > 0.5 ? ["wifi"] : []),
            ...(Math.random() > 0.6 ? ["washingMachine"] : []),
            ...(Math.random() > 0.7 ? ["tv"] : []),
          ],
          thingsToKnow: [
            ...(Math.random() > 0.5 ? ["noParties"] : []),
            ...(Math.random() > 0.5 ? ["fastInternet"] : []),
            ...(Math.random() > 0.6 ? ["noSmoking"] : []),
          ],
          registrationPossible: Math.random() > 0.6 ? true : null,
          photos: [],
          status: "active",
          isPromoted: Math.random() > 0.8,
          isVerified: Math.random() > 0.4,
          viewsCount: randomBetween(2, 150),
          responsesCount: randomBetween(0, 5),
          expiresAt: availableTo,
          createdAt: randomDate(new Date("2026-04-20"), new Date("2026-05-18")),
        },
      });
    }
    console.log("  - Sublet listings: 10");
  } else {
    console.log(`  - Listings: skipped (${existingListings} exist)`);
  }

  // --- Seed cost reports (25) ---
  const internetProviders = ["UPC", "Orange", "Play", "Vectra", "Netia", "T-Mobile"];

  const existingReports = await prisma.costReport.count();
  if (existingReports === 0) {
    for (let i = 0; i < 25; i++) {
      const building = buildings[i % buildings.length];
      const rooms = randomBetween(1, 4);
      const area = rooms === 1 ? randomBetween(22, 38) : rooms === 2 ? randomBetween(35, 58) : rooms === 3 ? randomBetween(55, 80) : randomBetween(70, 110);
      const rent = randomBetween(2000, 5000);
      const adminFee = randomBetween(300, 950);
      const electricityIncluded = Math.random() > 0.85;
      const electricity = electricityIncluded ? null : randomBetween(80, 250);
      const gas = Math.random() > 0.5 ? randomBetween(50, 150) : null;
      const heatingIncluded = Math.random() > 0.6;
      const heating = heatingIncluded ? null : randomBetween(100, 400);
      const heatingWinter = !heatingIncluded && Math.random() > 0.5 ? (heating ?? 200) + randomBetween(50, 200) : null;
      const heatingSummer = !heatingIncluded && heatingWinter ? randomBetween(0, 50) : null;
      const waterIncluded = Math.random() > 0.5;
      const water = waterIncluded ? null : randomBetween(40, 120);
      const internet = randomBetween(50, 100);
      const otherCosts = Math.random() > 0.7 ? randomBetween(20, 80) : null;
      const rentalType = randomElement(["apartment", "apartment", "apartment", "room"]);
      const totalAvg = rent + adminFee + (electricity ?? 0) + (gas ?? 0) + (heating ?? 0) + (water ?? 0) + internet + (otherCosts ?? 0);

      await prisma.costReport.create({
        data: {
          buildingId: building.id,
          authorId: randomElement(authorIds),
          currency: "PLN",
          rent,
          adminFee,
          electricityAvg: electricity,
          electricityWinter: electricity ? electricity + randomBetween(20, 80) : null,
          electricitySummer: electricity ? electricity - randomBetween(10, 40) : null,
          electricityIncluded,
          gas,
          heating,
          heatingWinter,
          heatingSummer,
          heatingIncluded,
          water,
          waterIncluded,
          internet,
          internetProvider: randomElement(internetProviders),
          rentalType,
          otherCosts,
          otherCostsNote: otherCosts ? "Wywóz śmieci / ochrona" : null,
          totalMonthlyAvg: totalAvg,
          rooms,
          areaM2: area,
          floor: randomBetween(0, 10),
          leaseType: randomElement(leaseTypes),
          depositMonths: randomElement([1, 1, 1, 2, 2]),
          depositAmount: rent * randomBetween(1, 2),
          depositReturned: Math.random() > 0.3 ? true : Math.random() > 0.5 ? false : null,
          depositReturnDays: randomBetween(7, 60),
          livedFrom: randomDate(new Date("2023-01-01"), new Date("2025-06-01")),
          livedUntil: Math.random() > 0.4 ? randomDate(new Date("2025-07-01"), new Date("2026-05-01")) : null,
          isCurrentTenant: Math.random() > 0.5,
          verificationStatus: randomElement(["unverified", "unverified", "verified", "verified"]),
          isVisible: true,
          createdAt: randomDate(new Date("2026-03-01"), new Date("2026-05-18")),
        },
      });
    }
    console.log("  - Cost reports: 25");
  } else {
    console.log(`  - Cost reports: skipped (${existingReports} exist)`);
  }

  // --- Data migration: rename moved keys in existing listings ---
  // petFriendly (amenities) -> petsAllowed (things_to_know)
  const petMigrated = await prisma.$executeRaw`
    UPDATE listings
    SET amenities = array_remove(amenities, 'petFriendly'),
        things_to_know = array_append(things_to_know, 'petsAllowed')
    WHERE 'petFriendly' = ANY(amenities)
      AND NOT ('petsAllowed' = ANY(things_to_know))
  `;
  if (petMigrated > 0) console.log(`  - Migrated petFriendly -> petsAllowed: ${petMigrated} listings`);

  // hasDeskSetup (things_to_know) -> deskSetup (amenities)
  const deskMigrated = await prisma.$executeRaw`
    UPDATE listings
    SET things_to_know = array_remove(things_to_know, 'hasDeskSetup'),
        amenities = array_append(amenities, 'deskSetup')
    WHERE 'hasDeskSetup' = ANY(things_to_know)
      AND NOT ('deskSetup' = ANY(amenities))
  `;
  if (deskMigrated > 0) console.log(`  - Migrated hasDeskSetup -> deskSetup: ${deskMigrated} listings`);

  // Rename old section key references (sectionRemoteWork is now sectionInternet — only affects i18n, not DB)
  // Clean up any stale petFriendly left in amenities
  await prisma.$executeRaw`
    UPDATE listings
    SET amenities = array_remove(amenities, 'petFriendly')
    WHERE 'petFriendly' = ANY(amenities)
  `;

  console.log("Seed completed:");
  console.log(`  - Country: ${poland.id}`);
  console.log(`  - City: ${warsaw.slug} (${warsaw.id})`);
  console.log(`  - Districts: ${districtData.length}`);
  console.log(`  - Cost term labels: ${costTerms.length}`);
  console.log(`  - Buildings: ${buildings.length}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
