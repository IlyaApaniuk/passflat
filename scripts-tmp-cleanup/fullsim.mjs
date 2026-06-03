import { PrismaClient } from '@prisma/client';
import { validateCostReport } from '../src/lib/cost-validation.ts';
import { generateBuildingSlug, transliterate } from '../src/lib/slugify.ts';
import { normalizeAddress, cleanStreet } from '../src/lib/address.ts';
import {
  sanitizePeriodicCharges,
  periodicChargesMonthlyTotal,
} from '../src/lib/periodic-charges.ts';
import { isCostImportAdmin } from '../src/lib/import-constants.ts';

const prisma = new PrismaClient(); // uses DATABASE_URL from env (prod via .env.local)

// Real prod auth user that has a profile row
const user = { id: '0da90bf0-549b-45bc-b2f5-0affd5332a86', email: 'ilya21968@gmail.com' };

const body = {
  street: 'Wolska', buildingNumber: '96', district: 'Wola',
  placeId: 'ChIJB5Dk5mjLHkcR33WCkGN9UUk', lat: 52.230304499999995, lng: 20.9519894,
  citySlug: 'warsaw', placeCity: 'Warszawa', isCurrentTenant: true,
  rent: '4700', adminFee: '800', deposit: '6000', otherCosts: '600',
  rooms: '3', areaM2: '64', floor: '6', rentalType: 'apartment', periodicCharges: [],
};

try {
  await prisma.$transaction(async (prisma) => {
    const {
      street, buildingNumber, district, placeId, lat, lng, citySlug, placeCity,
      rent, adminFee, deposit, electricity, electricityIncluded, electricityWinter,
      electricitySummer, gas, heating, heatingIncluded, heatingWinter, heatingSummer,
      water, waterIncluded, internet, internetProvider, otherCosts, otherCostsNote,
      rooms, areaM2, floor, rentalType, leaseType, depositMonths, isCurrentTenant,
      livedFrom, livedUntil, periodicCharges: periodicChargesInput,
      importedEmail: importedEmailInput,
    } = body;

    const isAdmin = isCostImportAdmin(user.email);
    const fillOnBehalfRequested = importedEmailInput !== undefined;
    const fillOnBehalf = fillOnBehalfRequested && isAdmin;
    console.log('isAdmin', isAdmin, 'fillOnBehalf', fillOnBehalf);
    const periodicCharges = sanitizePeriodicCharges(periodicChargesInput);

    const validation = validateCostReport({ rent, adminFee, deposit, areaM2, rooms, electricity, gas, heating, water, internet, otherCosts });
    console.log('validation.valid', validation.valid, 'shouldFlag', validation.shouldFlag);
    const wasFlagged = validation.shouldFlag;

    const city = await prisma.city.findUnique({ where: { slug: citySlug || 'warsaw' }, include: { districts: true } });
    const cityBounds = city.bounds ?? null;
    const latNum = lat != null && lat !== '' ? Number(lat) : null;
    const lngNum = lng != null && lng !== '' ? Number(lng) : null;
    let geoResult = 'passthrough';
    if (cityBounds && latNum != null && lngNum != null && Number.isFinite(latNum) && Number.isFinite(lngNum)) {
      const insideCity = latNum <= cityBounds.north && latNum >= cityBounds.south && lngNum <= cityBounds.east && lngNum >= cityBounds.west;
      geoResult = insideCity ? 'inside' : 'OUTSIDE-400';
    }
    console.log('geoResult', geoResult);

    const cleanedStreet = cleanStreet(street);
    const addressNormalized = normalizeAddress(cleanedStreet, buildingNumber);
    const addressFull = `${cleanedStreet} ${buildingNumber}`;
    const matchedDistrict = district ? city.districts.find((d) => d.slug === district.toLowerCase() || d.nameKey === district) : null;

    let building = placeId ? await prisma.building.findFirst({ where: { placeId } }) : null;
    if (!building) {
      building = await prisma.building.findUnique({ where: { cityId_addressNormalized: { cityId: city.id, addressNormalized } } });
      if (building && placeId && !building.placeId) {
        building = await prisma.building.update({ where: { id: building.id }, data: { placeId } });
      }
    }
    if (!building) {
      let slug = generateBuildingSlug(street, buildingNumber);
      const existing = await prisma.building.findUnique({ where: { cityId_slug: { cityId: city.id, slug } }, select: { id: true } });
      if (existing) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
      building = await prisma.building.create({ data: { cityId: city.id, slug, districtId: matchedDistrict?.id ?? null, street: cleanedStreet, buildingNumber, addressFull, addressNormalized, lat: lat ?? null, lng: lng ?? null, placeId: placeId ?? null } });
    }
    console.log('building.id', building.id);

    if (!fillOnBehalf) {
      const existingReport = await prisma.costReport.findFirst({ where: { authorId: user.id, buildingId: building.id }, select: { id: true } });
      if (existingReport) { console.log('ALREADY_EXISTS-409', existingReport.id); }
    }

    const electricityAvg = electricityIncluded ? null : electricity ? parseFloat(electricity) : electricityWinter && electricitySummer ? (parseFloat(electricityWinter) + parseFloat(electricitySummer)) / 2 : null;
    const heatingAvg = heatingIncluded ? null : heating ? parseFloat(heating) : heatingWinter && heatingSummer ? (parseFloat(heatingWinter) + parseFloat(heatingSummer)) / 2 : null;
    const totalMonthlyAvg = (parseFloat(rent) || 0) + (parseFloat(adminFee) || 0) + (electricityAvg || 0) + (parseFloat(gas) || 0) + (heatingAvg || 0) + (waterIncluded ? 0 : parseFloat(water) || 0) + (parseFloat(internet) || 0) + (parseFloat(otherCosts) || 0) + periodicChargesMonthlyTotal(periodicCharges);
    console.log('totalMonthlyAvg', totalMonthlyAvg);

    const costReport = await prisma.costReport.create({
      data: {
        buildingId: building.id, authorId: fillOnBehalf ? '00000000-0000-4000-8000-000000000001' : user.id,
        source: fillOnBehalf ? 'import' : 'user', importedEmail: null, claimedAt: null, currency: 'PLN',
        rent: rent ? parseFloat(rent) : null, adminFee: adminFee ? parseFloat(adminFee) : null,
        depositAmount: deposit ? parseFloat(deposit) : null, electricityAvg: electricityAvg ?? null,
        electricityWinter: electricityWinter ? parseFloat(electricityWinter) : null, electricitySummer: electricitySummer ? parseFloat(electricitySummer) : null,
        electricityIncluded: electricityIncluded ?? null, gas: gas ? parseFloat(gas) : null, heating: heatingAvg ?? null,
        heatingWinter: heatingWinter ? parseFloat(heatingWinter) : null, heatingSummer: heatingSummer ? parseFloat(heatingSummer) : null,
        heatingIncluded: heatingIncluded ?? null, water: water ? parseFloat(water) : null, waterIncluded: waterIncluded ?? null,
        internet: internet ? parseFloat(internet) : null, internetProvider: internetProvider || null,
        otherCosts: otherCosts ? parseFloat(otherCosts) : null, otherCostsNote: otherCostsNote || null,
        totalMonthlyAvg: totalMonthlyAvg || null, rooms: rooms ? parseInt(rooms, 10) : null, areaM2: areaM2 ? parseFloat(areaM2) : null,
        floor: floor ? parseInt(floor, 10) : null, rentalType: rentalType || null, leaseType: leaseType || null,
        depositMonths: depositMonths ? parseFloat(depositMonths) : null, isCurrentTenant: isCurrentTenant ?? null,
        livedFrom: livedFrom ? new Date(livedFrom) : null, livedUntil: livedUntil ? new Date(livedUntil) : null,
        isVisible: !wasFlagged, verificationStatus: wasFlagged ? 'flagged' : 'unverified',
        periodicCharges: periodicCharges.length ? { create: periodicCharges } : undefined,
      },
      include: { building: true, periodicCharges: true },
    });
    console.log('costReport.id', costReport.id);

    if (!wasFlagged && !fillOnBehalf) {
      await prisma.profile.update({ where: { id: user.id }, data: { hasContributedCost: true } });
      console.log('profile.update OK');
    }
    console.log('=== FULL HANDLER PATH OK (201 would be returned) ===');
    throw new Error('__ROLLBACK__');
  });
} catch (e) {
  if (e instanceof Error && e.message === '__ROLLBACK__') console.log('Rolled back, no persisted changes.');
  else { console.log('THROW name:', e?.name, 'code:', e?.code); console.log('THROW msg:', String(e?.message).split('\n').slice(0,4).join(' | ')); }
} finally { await prisma.$disconnect(); }
