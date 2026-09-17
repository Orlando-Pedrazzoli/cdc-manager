// 📄 src/lib/stock-locations.ts
// =============================================================================
// CDC Manager — Stock por LOCAL: leituras para os ecrãs (server-only)
// -----------------------------------------------------------------------------
//   getLocationsOverview  → cartões de locais por clínica (saldos, alertas,
//                           estado da contagem)
//   getLocationDetail     → um local: produtos com saldo/níveis, contagem
//                           aberta, últimos movimentos
//   getRoomStaffing       → quem trabalhou num gabinete num período
//                           (Appointment.roomId) — a pergunta da Isabel
//   getExpiringPurchases  → alerta FEFO (validades ≤ N dias)
// Saldos vêm SEMPRE do Product.stockCache (materialização do ledger).
// =============================================================================

import mongoose from 'mongoose';
import Product from '@/models/Product';
import Warehouse from '@/models/Warehouse';
import StockLevel from '@/models/StockLevel';
import StockCount from '@/models/StockCount';
import StockMovement from '@/models/StockMovement';
import Appointment from '@/models/Appointment';
import Doctor from '@/models/Doctor';
import User from '@/models/User';
import {
  STOCK_COUNT_INTERVAL_DAYS,
  STOCK_EXPIRY_ALERT_DAYS,
  STOCK_INBOUND_TYPES,
  type WarehouseKind,
  type StockMovementType,
  type ProductUnit,
} from '@/lib/domain';

const DAY_MS = 86_400_000;

export type CountStatus = 'never' | 'ok' | 'due-soon' | 'overdue';

export function countStatusFor(
  lastCountAt: Date | null,
  now = new Date(),
): {
  status: CountStatus;
  daysSince: number | null;
  daysUntilDue: number | null;
} {
  if (!lastCountAt)
    return { status: 'never', daysSince: null, daysUntilDue: null };
  const daysSince = Math.floor(
    (now.getTime() - lastCountAt.getTime()) / DAY_MS,
  );
  const daysUntilDue = STOCK_COUNT_INTERVAL_DAYS - daysSince;
  if (daysUntilDue < 0) return { status: 'overdue', daysSince, daysUntilDue };
  if (daysUntilDue <= 3) return { status: 'due-soon', daysSince, daysUntilDue };
  return { status: 'ok', daysSince, daysUntilDue };
}

export interface LocationCard {
  id: string;
  clinicId: string;
  name: string;
  kind: WarehouseKind;
  description: string | null;
  responsibleName: string | null;
  responsibleUserId: string | null;
  sortOrder: number;
  active: boolean;
  isCentral: boolean;
  productCount: number;
  belowMinCount: number;
  valueCents: number;
  lastCountAt: string | null;
  countStatus: CountStatus;
  daysUntilDue: number | null;
  openCountId: string | null;
}

export async function getLocationsOverview(): Promise<LocationCard[]> {
  const [warehouses, products, levels, openCounts] = await Promise.all([
    Warehouse.find({}).sort({ clinicId: 1, sortOrder: 1, name: 1 }).lean(),
    Product.find({ 'stockCache.0': { $exists: true } })
      .select('stockCache costCents')
      .lean(),
    StockLevel.find({ min: { $gt: 0 } })
      .select('productId warehouseId min')
      .lean(),
    StockCount.find({ status: 'open' }).select('_id warehouseId').lean(),
  ]);

  const userIds = warehouses
    .map(w => w.responsibleUserId)
    .filter((x): x is mongoose.Types.ObjectId => !!x);
  const users = userIds.length
    ? await User.find({ _id: { $in: userIds } })
        .select('name')
        .lean()
    : [];
  const userName = new Map(users.map(u => [String(u._id), u.name]));

  // Saldo por (warehouse → product)
  const balance = new Map<string, Map<string, number>>();
  const value = new Map<string, number>();
  for (const p of products) {
    for (const c of p.stockCache) {
      const wid = String(c.warehouseId);
      if (!balance.has(wid)) balance.set(wid, new Map());
      balance.get(wid)!.set(String(p._id), c.quantity);
      if (c.quantity > 0) {
        value.set(
          wid,
          (value.get(wid) ?? 0) + Math.round(c.quantity * (p.costCents ?? 0)),
        );
      }
    }
  }
  const belowMin = new Map<string, number>();
  for (const l of levels) {
    const wid = String(l.warehouseId);
    const q = balance.get(wid)?.get(String(l.productId)) ?? 0;
    if (q < l.min) belowMin.set(wid, (belowMin.get(wid) ?? 0) + 1);
  }
  const openByWh = new Map(
    openCounts.map(c => [String(c.warehouseId), String(c._id)]),
  );

  return warehouses.map(w => {
    const wid = String(w._id);
    const isCentral = w.kind === 'central' || w.isDefault;
    const cs = countStatusFor(w.lastCountAt ?? null);
    const bal = balance.get(wid);
    return {
      id: wid,
      clinicId: String(w.clinicId),
      name: w.name,
      kind: isCentral ? 'central' : (w.kind as WarehouseKind),
      description: w.description ?? null,
      responsibleName: w.responsibleUserId
        ? (userName.get(String(w.responsibleUserId)) ?? null)
        : null,
      responsibleUserId: w.responsibleUserId
        ? String(w.responsibleUserId)
        : null,
      sortOrder: w.sortOrder ?? 0,
      active: !!w.active,
      isCentral,
      productCount: bal ? [...bal.values()].filter(q => q > 0).length : 0,
      belowMinCount: belowMin.get(wid) ?? 0,
      valueCents: value.get(wid) ?? 0,
      lastCountAt: w.lastCountAt ? w.lastCountAt.toISOString() : null,
      countStatus: cs.status,
      daysUntilDue: cs.daysUntilDue,
      openCountId: openByWh.get(wid) ?? null,
    };
  });
}

export interface LocationProductRow {
  id: string;
  name: string;
  family: string | null;
  unit: ProductUnit;
  costCents: number;
  balance: number;
  centralBalance: number;
  min: number;
  max: number;
  belowMin: boolean;
  /** Sugestão de requisição = max − saldo (quando max definido) */
  suggested: number;
}

export interface LocationMovementRow {
  id: string;
  at: string;
  type: StockMovementType;
  inbound: boolean;
  productName: string;
  quantity: number;
  unit: string;
  byName: string | null;
  note: string | null;
}

export async function getLocationDetail(warehouseId: string) {
  if (!mongoose.isValidObjectId(warehouseId)) return null;
  const wh = await Warehouse.findById(warehouseId).lean();
  if (!wh) return null;
  const isCentral = wh.kind === 'central' || wh.isDefault;
  const central = isCentral
    ? wh
    : await Warehouse.findOne({
        clinicId: wh.clinicId,
        isDefault: true,
      }).lean();

  const [levels, products, openCount, lastClosed, movements] =
    await Promise.all([
      StockLevel.find({ warehouseId: wh._id }).lean(),
      // Todos os produtos ativos: o admin precisa de ver o catálogo inteiro
      // para requisitar e para definir níveis do gabinete
      Product.find({ active: true }).sort({ family: 1, name: 1 }).lean(),
      StockCount.findOne({ warehouseId: wh._id, status: 'open' })
        .select('_id createdAt')
        .lean(),
      StockCount.findOne({ warehouseId: wh._id, status: 'closed' })
        .sort({ closedAt: -1 })
        .select('_id closedAt consumedValueCents lines')
        .lean(),
      StockMovement.find({ warehouseId: wh._id })
        .sort({ createdAt: -1 })
        .limit(60)
        .lean(),
    ]);

  const levelByProduct = new Map(levels.map(l => [String(l.productId), l]));
  const rows: LocationProductRow[] = products.map(p => {
    const bal =
      p.stockCache.find(c => String(c.warehouseId) === String(wh._id))
        ?.quantity ?? 0;
    const cbal = central
      ? (p.stockCache.find(c => String(c.warehouseId) === String(central._id))
          ?.quantity ?? 0)
      : 0;
    const lvl = levelByProduct.get(String(p._id));
    const min = lvl?.min ?? 0;
    const max = lvl?.max ?? 0;
    return {
      id: String(p._id),
      name: p.name,
      family: p.family ?? null,
      unit: p.unit as ProductUnit,
      costCents: p.costCents ?? 0,
      balance: bal,
      centralBalance: cbal,
      min,
      max,
      belowMin: min > 0 && bal < min,
      suggested:
        max > 0 && bal < max ? Math.round((max - bal) * 1000) / 1000 : 0,
    };
  });

  const userIds = [
    ...new Set(
      movements
        .filter(m => m.createdByUserId)
        .map(m => String(m.createdByUserId)),
    ),
  ];
  const users = userIds.length
    ? await User.find({ _id: { $in: userIds } })
        .select('name')
        .lean()
    : [];
  const userName = new Map(users.map(u => [String(u._id), u.name]));
  const productById = new Map(products.map(p => [String(p._id), p]));
  const missing = movements
    .map(m => String(m.productId))
    .filter(id => !productById.has(id));
  if (missing.length) {
    const extra = await Product.find({ _id: { $in: missing } })
      .select('name unit')
      .lean();
    for (const e of extra)
      productById.set(String(e._id), e as (typeof products)[number]);
  }
  const movementRows: LocationMovementRow[] = movements.map(m => {
    const p = productById.get(String(m.productId));
    return {
      id: String(m._id),
      at: m.createdAt.toISOString(),
      type: m.type as StockMovementType,
      inbound: STOCK_INBOUND_TYPES.includes(m.type as StockMovementType),
      productName: p?.name ?? '—',
      quantity: m.quantity,
      unit: p?.unit ?? '',
      byName: m.createdByUserId
        ? (userName.get(String(m.createdByUserId)) ?? null)
        : null,
      note: m.note ?? null,
    };
  });

  return {
    location: {
      id: String(wh._id),
      clinicId: String(wh.clinicId),
      name: wh.name,
      kind: (isCentral ? 'central' : wh.kind) as WarehouseKind,
      description: wh.description ?? null,
      responsibleUserId: wh.responsibleUserId
        ? String(wh.responsibleUserId)
        : null,
      sortOrder: wh.sortOrder ?? 0,
      active: !!wh.active,
      isCentral,
      lastCountAt: wh.lastCountAt ? wh.lastCountAt.toISOString() : null,
      countStatus: countStatusFor(wh.lastCountAt ?? null),
    },
    centralName: central?.name ?? null,
    rows,
    openCount: openCount
      ? {
          id: String(openCount._id),
          openedAt: openCount.createdAt.toISOString(),
        }
      : null,
    lastClosedCount: lastClosed
      ? {
          id: String(lastClosed._id),
          closedAt: lastClosed.closedAt
            ? lastClosed.closedAt.toISOString()
            : null,
          consumedValueCents: lastClosed.consumedValueCents ?? 0,
          lineCount: lastClosed.lines.length,
        }
      : null,
    movements: movementRows,
  };
}

// -----------------------------------------------------------------------------
// Quem trabalhou no gabinete entre `from` e `to` (por defeito desde a última
// contagem, ou os últimos STOCK_COUNT_INTERVAL_DAYS dias)
// -----------------------------------------------------------------------------
export interface RoomStaffingRow {
  doctorId: string | null;
  doctorName: string;
  appointments: number;
  completed: number;
  firstAt: string;
  lastAt: string;
}

export async function getRoomStaffing(
  roomId: string,
  from: Date,
  to: Date = new Date(),
): Promise<RoomStaffingRow[]> {
  const agg = await Appointment.aggregate<{
    _id: mongoose.Types.ObjectId | null;
    appointments: number;
    completed: number;
    firstAt: Date;
    lastAt: Date;
  }>([
    {
      $match: {
        roomId: new mongoose.Types.ObjectId(roomId),
        startAt: { $gte: from, $lte: to },
        status: { $in: ['checked-in', 'in-progress', 'completed'] },
      },
    },
    {
      $group: {
        _id: '$doctorId',
        appointments: { $sum: 1 },
        completed: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
        },
        firstAt: { $min: '$startAt' },
        lastAt: { $max: '$startAt' },
      },
    },
    { $sort: { appointments: -1 } },
  ]);
  const ids = agg
    .map(a => a._id)
    .filter((x): x is mongoose.Types.ObjectId => !!x);
  const doctors = ids.length
    ? await Doctor.find({ _id: { $in: ids } })
        .select('name')
        .lean()
    : [];
  const name = new Map(doctors.map(d => [String(d._id), d.name]));
  return agg.map(a => ({
    doctorId: a._id ? String(a._id) : null,
    doctorName: a._id
      ? (name.get(String(a._id)) ?? 'Médico')
      : 'Sem médico atribuído',
    appointments: a.appointments,
    completed: a.completed,
    firstAt: a.firstAt.toISOString(),
    lastAt: a.lastAt.toISOString(),
  }));
}

// -----------------------------------------------------------------------------
// Alerta FEFO: compras com validade a expirar em ≤ N dias (ou já expiradas)
// -----------------------------------------------------------------------------
export interface ExpiringRow {
  productId: string;
  productName: string;
  warehouseName: string;
  lot: string | null;
  expiryDate: string;
  quantity: number;
  unit: string;
  expired: boolean;
}

export async function getExpiringPurchases(
  days = STOCK_EXPIRY_ALERT_DAYS,
): Promise<ExpiringRow[]> {
  const limit = new Date(Date.now() + days * DAY_MS);
  const movs = await StockMovement.find({
    type: 'purchase',
    expiryDate: { $lte: limit },
  })
    .sort({ expiryDate: 1 })
    .limit(100)
    .lean();
  if (movs.length === 0) return [];
  const [products, warehouses] = await Promise.all([
    Product.find({ _id: { $in: movs.map(m => m.productId) } })
      .select('name unit')
      .lean(),
    Warehouse.find({ _id: { $in: movs.map(m => m.warehouseId) } })
      .select('name')
      .lean(),
  ]);
  const pn = new Map(products.map(p => [String(p._id), p]));
  const wn = new Map(warehouses.map(w => [String(w._id), w.name]));
  const now = new Date();
  return movs.map(m => ({
    productId: String(m.productId),
    productName: pn.get(String(m.productId))?.name ?? '—',
    warehouseName: wn.get(String(m.warehouseId)) ?? '—',
    lot: m.lot ?? null,
    expiryDate: m.expiryDate!.toISOString(),
    quantity: m.quantity,
    unit: pn.get(String(m.productId))?.unit ?? '',
    expired: m.expiryDate! < now,
  }));
}
