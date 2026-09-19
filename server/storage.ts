import { nanoid } from "nanoid";
import { 
  players, 
  playerDocuments, 
  payments, 
  paymentRefunds,
  paymentHistory,
  paymentRefundHistory,
  sessions,
  users,
  trainers,
  trainerSalaryPayments,
  trainerAdvances,
  trainerBonuses,
  trainerPayrolls,
  expenses,
  inventoryItems,
  inventoryTransactions,
  activityLogs,
  type Player, 
  type InsertPlayer,
  type PlayerDocument,
  type InsertPlayerDocument,
  type Payment,
  type InsertPayment,
  type PaymentRefund,
  type InsertPaymentRefund,
  type PaymentHistory,
  type InsertPaymentHistory,
  type PaymentRefundHistory,
  type InsertPaymentRefundHistory,
  type Session,
  type InsertSession,
  type User,
  type InsertUser,
  type Trainer,
  type InsertTrainer,
  type TrainerSalaryPayment,
  type InsertTrainerSalaryPayment,
  type TrainerAdvance,
  type InsertTrainerAdvance,
  type TrainerBonus,
  type InsertTrainerBonus,
  type TrainerPayroll,
  type InsertTrainerPayroll,
  type Expense,
  type InsertExpense,
  type InventoryItem,
  type InsertInventoryItem,
  type InventoryTransaction,
  type InsertInventoryTransaction,
  type ActivityLog,
  type InsertActivityLog,
  subscriptions,
  type Subscription,
  type InsertSubscription,
  accountingPeriods,
  auditLogs,
  trainerAdvanceRepayments,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, asc, sql, and, gte, lte, lt, ne, count, sum, isNull } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────
// Compute the final (discounted) subscription price the player actually owes.
// finalPrice = price * (1 - discount/100), clamped to >= 0, returned as a 2dp string.
export function computeFinalPrice(price: string | number | null | undefined, discountPercentage: string | number | null | undefined): string {
  const base = parseFloat(String(price ?? '0')) || 0;
  const discount = parseFloat(String(discountPercentage ?? '0')) || 0;
  const clampedDiscount = Math.min(100, Math.max(0, discount));
  const final = Math.max(0, base * (1 - clampedDiscount / 100));
  return final.toFixed(2);
}

// ─────────────────────────────────────────────────────────────────
// Allowed refund methods — any other value is rejected at the storage layer
export const ALLOWED_REFUND_METHODS = [
  'cash', 'bank_transfer', 'card_reversal', 'wallet', 'adjustment'
] as const;
export type RefundMethod = typeof ALLOWED_REFUND_METHODS[number];

// ─────────────────────────────────────────────────────────────────
// Structured audit logger — emits JSON to stdout for log aggregation
type RefundEventType = 
  | 'REFUND_SUCCESS'
  | 'REFUND_FAILED_VALIDATION'
  | 'REFUND_FAILED_OVER_LIMIT'
  | 'REFUND_FAILED_CANCELLED'
  | 'REFUND_FAILED_FULLY_REFUNDED'
  | 'REFUND_FAILED_INVALID_METHOD'
  | 'REFUND_TRANSACTION_ERROR';

function logRefundEvent(event: RefundEventType, details: {
  adminId?: string;
  paymentId: string;
  playerId?: string;
  amount?: number;
  error?: string;
}) {
  const entry = {
    timestamp: new Date().toISOString(),
    event,
    ...details,
  };
  // Use stderr for error events, stdout for success
  if (event === 'REFUND_SUCCESS') {
    process.stdout.write(JSON.stringify(entry) + '\n');
  } else {
    process.stderr.write(JSON.stringify(entry) + '\n');
  }
}

// ─────────────────────────────────────────────────────────────────
// Safe integer-cent arithmetic for money — avoids JS float precision issues.
// All DB values are stored as DECIMAL(10,2) strings; convert once to cents,
// do integer arithmetic, convert back to string with .toFixed(2) for storage.
function toCents(decimalStr: string | number): number {
  return Math.round(parseFloat(String(decimalStr)) * 100);
}
function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}


export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Players
  getPlayer(id: string): Promise<Player | undefined>;
  getPlayers(): Promise<Player[]>;
  getPlayersByActivity(activity: string): Promise<Player[]>;
  createPlayer(player: InsertPlayer): Promise<Player>;
  createPlayerWithSubscription(player: InsertPlayer, subscription: Omit<InsertSubscription, 'playerId'>, paymentData?: Omit<InsertPayment, 'playerId'>, documents?: Omit<InsertPlayerDocument, 'playerId'>[]): Promise<Player>;
  updatePlayer(id: string, player: Partial<typeof players.$inferInsert>): Promise<Player | undefined>;
  deletePlayer(id: string): Promise<boolean>;
  updatePlayerSubscriptionStatus(playerId: string, status: string): Promise<void>;
  renewPlayerSubscription(playerId: string, renewalData: Partial<typeof players.$inferInsert>, subscriptionData: Omit<InsertSubscription, 'playerId'>, paymentData?: Omit<InsertPayment, 'playerId'>): Promise<Player>;
  
  // Player Documents
  getPlayerDocuments(playerId: string): Promise<PlayerDocument[]>;
  getPlayerDocument(id: string): Promise<PlayerDocument | null>;
  createPlayerDocument(document: InsertPlayerDocument): Promise<PlayerDocument>;
  deletePlayerDocument(id: string): Promise<boolean>;
  
  // Payments
  getPayment(id: string): Promise<Payment | undefined>;
  getPayments(): Promise<Payment[]>;
  getPlayerPayments(playerId: string): Promise<Payment[]>;
  createPayment(payment: InsertPayment): Promise<Payment>;
  updatePayment(id: string, payment: Partial<InsertPayment>): Promise<Payment | undefined>;

  // Payment Refunds
  createPaymentRefund(refund: InsertPaymentRefund, refundedBy?: string): Promise<PaymentRefund>;
  getPaymentRefunds(paymentId: string): Promise<PaymentRefund[]>;
  getPlayerRefunds(playerId: string): Promise<PaymentRefund[]>;
  getRefundSummary(paymentId: string): Promise<{ totalRefunded: number; remainingRefundable: number }>;
  
  // Payment History
  getPlayerPaymentHistory(playerId: string): Promise<PaymentHistory[]>;
  archivePlayerPayments(playerId: string, subscriptionPeriodStart: Date, subscriptionPeriodEnd: Date): Promise<void>;
  clearPlayerCurrentPayments(playerId: string): Promise<void>;
  
  // Sessions
  getPlayerSessions(playerId: string): Promise<Session[]>;
  getAllSessions(): Promise<Session[]>;
  createSession(session: InsertSession): Promise<Session>;
  updateSession(id: string, session: Partial<InsertSession>): Promise<Session | undefined>;
  markAttendance(sessionId: string, attendanceStatus: string, notes?: string): Promise<Session | undefined>;
  
  // Dashboard Statistics
  getDashboardStats(): Promise<{
    totalPlayers: number;
    activeSubscriptions: number;
    pendingPayments: string;
    playersByActivity: Array<{ activity: string; count: number }>;
    outstandingSalaries: string;
    totalAdvancesOutstanding: string;
    // Cash-flow monthly
    monthlyIncome: string;
    monthlyExpenses: string;
    monthlyProfit: string;
    // Cash-flow monthly breakdown
    monthlyPlayerRevenue: string;
    monthlyAdvanceRepayments: string;
    monthlyTrainerCashPayments: string;
    monthlyAdvancesCreated: string;
    monthlyRefunds: string;
    // Cash-flow annual
    annualIncome: string;
    annualExpenses: string;
    annualNetProfit: string;
    annualRefunds: string;

    // Inventory summary
    inventoryTotalItems: number;
    inventoryLowStock: number;
    inventoryOutOfStock: number;
    inventoryTotalValue: string;

    // Payment method breakdown (monthly)
    paymentMethodBreakdown: Record<string, number>;
    paymentMethodTotal: number;
    overduePayments: string;

    // Legacy (keep for backward compat)
    monthlyRevenue: string;
    totalSalaryExpenses: string;
    totalBonuses: string;
  }>;
  
  // Trainer CRUD
  getTrainers(): Promise<Trainer[]>;
  getTrainer(id: string): Promise<Trainer | undefined>;
  createTrainer(trainer: InsertTrainer): Promise<Trainer>;
  updateTrainer(id: string, trainer: Partial<InsertTrainer>): Promise<Trainer | undefined>;
  deleteTrainer(id: string): Promise<boolean>;

  // Trainer Salary Payments
  getTrainerSalaryPayments(trainerId?: string, month?: string): Promise<TrainerSalaryPayment[]>;
  createTrainerSalaryPayment(
    payment: InsertTrainerSalaryPayment,
    advanceIdsToDeduct?: string[]
  ): Promise<TrainerSalaryPayment>;

  // Trainer Advances
  getTrainerAdvances(trainerId?: string, status?: string): Promise<TrainerAdvance[]>;
  createTrainerAdvance(advance: InsertTrainerAdvance): Promise<TrainerAdvance>;
  repayTrainerAdvance(advanceId: string, repaidNote?: string): Promise<TrainerAdvance | undefined>;

  // Trainer Bonuses
  getTrainerBonuses(trainerId?: string, month?: string): Promise<TrainerBonus[]>;
  createTrainerBonus(bonus: InsertTrainerBonus): Promise<TrainerBonus>;

  // Trainer Payroll / Ledger
  getTrainerPayroll(trainerId: string, month: string): Promise<TrainerPayroll | undefined>;
  lockTrainerPayroll(trainerId: string, month: string): Promise<TrainerPayroll>;

  getTrainerLedger(trainerId: string, month: string): Promise<{
    baseSalary: string;
    carryForward: string;
    totalBonuses: string;
    totalPendingAdvances: string;
    totalPaid: string;
    netPayable: string;
    status: "unpaid" | "partial" | "paid" | "over_advanced";
    isLocked: boolean;
    advances: TrainerAdvance[];
    payments: TrainerSalaryPayment[];
    bonuses: TrainerBonus[];
  }>;
  
  // Reports
  getUpcomingRenewals(): Promise<Array<Player & { sessionsLeft: number }>>;
  getRecentActivities(): Promise<Array<{
    type: string;
    description: string;
    timestamp: Date;
    playerId?: string;
    playerName?: string;
  }>>;
  getRenewalNotifications(): Promise<Array<{
    playerId: string;
    playerName: string;
    activity: string;
    renewalDate: Date;
    daysUntilRenewal: number;
    sessionsLeft: number;
    subscriptionStatus: string;
    reason: 'sessions_low' | 'renewal_due';
  }>>;

  // ─── Expenses ─────────────────────────────────────────────────────────────
  getExpenses(filters?: { month?: string, category?: string }): Promise<Expense[]>;
  getExpense(id: string): Promise<Expense | undefined>;
  createExpense(expense: InsertExpense, reqContext?: { ipAddress?: string; userAgent?: string }): Promise<Expense>;
  updateExpense(id: string, expense: Partial<typeof expenses.$inferInsert>, reqContext?: { ipAddress?: string; userAgent?: string }): Promise<Expense | undefined>;
  deleteExpense(id: string, userId?: string, reason?: string, reqContext?: { ipAddress?: string; userAgent?: string }): Promise<boolean>;

  // ─── Inventory ────────────────────────────────────────────────────────────
  getInventoryItems(filters?: { category?: string }): Promise<InventoryItem[]>;
  getInventoryItem(id: string): Promise<InventoryItem | undefined>;
  createInventoryItem(item: InsertInventoryItem, reqContext?: { ipAddress?: string; userAgent?: string }): Promise<InventoryItem>;
  updateInventoryItem(id: string, item: Partial<typeof inventoryItems.$inferInsert>, reqContext?: { ipAddress?: string; userAgent?: string }): Promise<InventoryItem | undefined>;
  deleteInventoryItem(id: string, userId?: string, reason?: string, reqContext?: { ipAddress?: string; userAgent?: string }): Promise<boolean>;

  getInventoryTransactions(itemId?: string): Promise<InventoryTransaction[]>;
  createInventoryTransaction(
    transaction: InsertInventoryTransaction,
    expenseData?: { createExpense: boolean; unitCost: number; category: string; paymentMethod: string },
    reqContext?: { ipAddress?: string; userAgent?: string }
  ): Promise<InventoryTransaction>;

  // ─── Activity Logs ────────────────────────────────────────────────────────
  getActivityLogs(filters?: { entityType?: string; limit?: number; offset?: number }): Promise<{ logs: ActivityLog[]; total: number }>;
  logActivity(log: InsertActivityLog & { ipAddress?: string; userAgent?: string }): Promise<void>;

  // ─── Dashboard Charts ─────────────────────────────────────────────────────
  getExpenseTrends(): Promise<Array<{ month: string; total: string }>>;
  getExpenseCategories(): Promise<Array<{ category: string; total: string }>>;
  getInventoryMovements(): Promise<Array<{ month: string; stockIn: number; stockOut: number; adjustment: number }>>;
}

export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = nanoid();
    await db.insert(users).values({ ...insertUser, id });
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getPlayer(id: string): Promise<Player | undefined> {
    const [player] = await db.select().from(players).where(eq(players.id, id));
    if (!player) return undefined;

    const [sub] = await db.select()
      .from(subscriptions)
      .where(eq(subscriptions.playerId, id))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);

    return {
      ...player,
      activity: sub?.activity || null,
      subscriptionStatus: sub?.status || 'expired',
      sessionsAttended: sub?.sessionsUsed || 0,
      totalSessionsAllowed: sub?.sessionsAllowed || 8,
      subscriptionDate: sub?.startDate || player.createdAt,
      subscriptionEndDate: sub?.endDate || null,
      renewalDate: sub?.endDate || null,
      monthlySubscriptionFee: sub?.price || '0.00',
      finalPrice: computeFinalPrice(sub?.price || '0.00', player.discountPercentage),
    } as any;
  }

  async getPlayers(): Promise<Player[]> {
    await this.updateExpiredSubscriptions();
    const allPlayers = await db.select().from(players).orderBy(desc(players.createdAt));
    const allSubs = await db.select().from(subscriptions).orderBy(desc(subscriptions.createdAt));

    const latestSubMap = new Map<string, typeof subscriptions.$inferSelect>();
    for (const sub of allSubs) {
      if (!latestSubMap.has(sub.playerId)) {
        latestSubMap.set(sub.playerId, sub);
      }
    }

    return allPlayers.map(player => {
      const sub = latestSubMap.get(player.id);
      return {
        ...player,
        activity: sub?.activity || null,
        subscriptionStatus: sub?.status || 'expired',
        sessionsAttended: sub?.sessionsUsed || 0,
        totalSessionsAllowed: sub?.sessionsAllowed || 8,
        subscriptionDate: sub?.startDate || player.createdAt,
        subscriptionEndDate: sub?.endDate || null,
        renewalDate: sub?.endDate || null,
        monthlySubscriptionFee: sub?.price || '0.00',
        finalPrice: computeFinalPrice(sub?.price || '0.00', player.discountPercentage),
      } as any;
    });
  }

  async getPlayersByActivity(activity: string): Promise<Player[]> {
    await this.updateExpiredSubscriptions();
    const records = await db.select({ 
      player: players,
      subscription: subscriptions
    })
      .from(subscriptions)
      .innerJoin(players, eq(players.id, subscriptions.playerId))
      .where(and(eq(subscriptions.activity, activity as any), eq(subscriptions.status, 'active')))
      .orderBy(desc(subscriptions.createdAt));

    const uniquePlayers: any[] = [];
    const seen = new Set<string>();
    for (const r of records) {
      if (!seen.has(r.player.id)) {
        seen.add(r.player.id);
        uniquePlayers.push({
          ...r.player,
          activity: r.subscription.activity,
          subscriptionStatus: r.subscription.status,
          sessionsAttended: r.subscription.sessionsUsed,
          totalSessionsAllowed: r.subscription.sessionsAllowed,
          subscriptionDate: r.subscription.startDate,
          subscriptionEndDate: r.subscription.endDate,
          renewalDate: r.subscription.endDate,
          monthlySubscriptionFee: r.subscription.price,
          finalPrice: computeFinalPrice(r.subscription.price, r.player.discountPercentage),
        });
      }
    }
    return uniquePlayers;
  }

  async createPlayer(insertPlayer: InsertPlayer): Promise<Player> {
    const id = nanoid();
    await db.insert(players).values({
      ...insertPlayer,
      id,
    } as any);
    return (await this.getPlayer(id))!;
  }

  async createPlayerWithSubscription(insertPlayer: InsertPlayer, subscriptionData: Omit<InsertSubscription, 'playerId'>, paymentData?: Omit<InsertPayment, 'playerId'>, documents?: Omit<InsertPlayerDocument, 'playerId'>[]): Promise<Player> {
    const id = nanoid();
    await db.transaction(async (tx) => {
      // 1. Insert Player
      await tx.insert(players).values({ ...insertPlayer, id } as any);
      
      // 2. Insert Subscription
      const subId = nanoid();
      await tx.insert(subscriptions).values({
        ...subscriptionData,
        id: subId,
        playerId: id,
      });

      // 3. Insert Payment if provided
      if (paymentData) {
        const paymentId = nanoid();
        const receiptNumber = `E1-${new Date().getFullYear()}-${Date.now()}`;
        
        const subscriptionFee = parseFloat(String(paymentData.subscriptionFee || '0'));
        const amountPaid = parseFloat(String(paymentData.amountPaid || '0'));
        const remaining = parseFloat(String((paymentData as any).remainingBalance || '0'));
        let derivedStatus: string = remaining <= 0 ? 'completed' : (amountPaid > 0 ? 'pending' : 'pending');

        await tx.insert(payments).values({
          ...paymentData,
          id: paymentId,
          playerId: id,
          receiptNumber,
          paymentStatus: derivedStatus,
        } as any);
      }

      // 4. Insert Documents if provided
      if (documents && documents.length > 0) {
        for (const doc of documents) {
          const docId = nanoid();
          await tx.insert(playerDocuments).values({ ...doc, id: docId, playerId: id } as any);
        }
      }
    });

    return (await this.getPlayer(id))!;
  }

  async updatePlayer(id: string, playerUpdate: Partial<typeof players.$inferInsert>): Promise<Player | undefined> {
    await db
      .update(players)
      .set({ ...playerUpdate, updatedAt: new Date() })
      .where(eq(players.id, id));
    return await this.getPlayer(id);
  }

  async deletePlayer(id: string): Promise<boolean> {
    const result = await db.delete(players).where(eq(players.id, id));
    return (result[0]?.affectedRows ?? 0) > 0;
  }

  async updatePlayerSubscriptionStatus(playerId: string, status: string): Promise<void> {
    await db.update(subscriptions)
      .set({ status: status as any, updatedAt: new Date() })
      .where(eq(subscriptions.playerId, playerId));
  }

  async renewPlayerSubscription(playerId: string, renewalData: Partial<typeof players.$inferInsert>, subscriptionData: Omit<InsertSubscription, 'playerId'>, paymentData?: Omit<InsertPayment, 'playerId'>): Promise<Player> {
    await db.transaction(async (tx) => {
      const currentPayments = await tx.select().from(payments).where(eq(payments.playerId, playerId));
      
      for (const payment of currentPayments) {
        const historyId = nanoid();
        await tx.insert(paymentHistory).values({
          id: historyId,
          playerId: payment.playerId,
          subscriptionFee: payment.subscriptionFee,
          amountPaid: payment.amountPaid,
          remainingBalance: payment.remainingBalance,
          paymentMethod: payment.paymentMethod,
          paymentStatus: payment.paymentStatus,
          paymentDate: payment.paymentDate,
          description: payment.description,
          receiptNumber: payment.receiptNumber,
          subscriptionPeriodStart: new Date(), 
          subscriptionPeriodEnd: new Date(), 
          createdAt: payment.createdAt,
        });

        const refunds = await tx.select().from(paymentRefunds).where(eq(paymentRefunds.paymentId, payment.id));
        for (const refund of refunds) {
          await tx.insert(paymentRefundHistory).values({
            id: nanoid(),
            originalRefundId: refund.id,
            paymentHistoryId: historyId,
            playerId: refund.playerId,
            refundAmount: refund.refundAmount,
            refundMethod: refund.refundMethod,
            reason: refund.reason,
            refundedBy: refund.refundedBy,
            refundDate: refund.refundDate,
            createdAt: refund.createdAt,
          });
        }
      }

      await tx.delete(payments).where(eq(payments.playerId, playerId));
      await tx.update(players).set({ ...renewalData, updatedAt: new Date() }).where(eq(players.id, playerId));

      // Mark all previous subscriptions as cancelled so they don't appear in renewal notifications
      await tx.update(subscriptions)
        .set({ status: 'cancelled' })
        .where(eq(subscriptions.playerId, playerId));

      await tx.insert(subscriptions).values({
        ...subscriptionData,
        id: nanoid(),
        playerId,
      });

      if (paymentData) {
        const paymentId = nanoid();
        const receiptNumber = `E1-${new Date().getFullYear()}-${Date.now()}`;
        
        const subscriptionFee = parseFloat(String(paymentData.subscriptionFee || '0'));
        const amountPaid = parseFloat(String(paymentData.amountPaid || '0'));
        const remaining = parseFloat(String((paymentData as any).remainingBalance || '0'));
        let derivedStatus: string = remaining <= 0 ? 'completed' : (amountPaid > 0 ? 'pending' : 'pending');

        await tx.insert(payments).values({
          ...paymentData,
          id: paymentId,
          playerId,
          receiptNumber,
          paymentStatus: derivedStatus,
        } as any);
      }
    });

    return (await this.getPlayer(playerId))!;
  }

  async getPlayerDocuments(playerId: string): Promise<PlayerDocument[]> {
    return await db.select().from(playerDocuments).where(eq(playerDocuments.playerId, playerId));
  }

  async getPlayerDocument(id: string): Promise<PlayerDocument | null> {
    const [doc] = await db.select().from(playerDocuments).where(eq(playerDocuments.id, id));
    return doc || null;
  }

  async createPlayerDocument(document: InsertPlayerDocument): Promise<PlayerDocument> {
    const id = nanoid();
    await db.insert(playerDocuments).values({ ...document, id } as any);
    const [doc] = await db.select().from(playerDocuments).where(eq(playerDocuments.id, id));
    return doc;
  }

  async deletePlayerDocument(id: string): Promise<boolean> {
    const result = await db.delete(playerDocuments).where(eq(playerDocuments.id, id));
    return (result[0]?.affectedRows ?? 0) > 0;
  }

  async getPayment(id: string): Promise<Payment | undefined> {
    const [payment] = await db.select().from(payments).where(eq(payments.id, id));
    return payment || undefined;
  }

  async getPayments(): Promise<Payment[]> {
    return await db
      .select({
        id: payments.id,
        playerId: payments.playerId,
        subscriptionFee: payments.subscriptionFee,
        amountPaid: payments.amountPaid,
        remainingBalance: payments.remainingBalance,
        paymentMethod: payments.paymentMethod,
        paymentStatus: payments.paymentStatus,
        paymentDate: payments.paymentDate,
        receiptNumber: payments.receiptNumber,
        description: payments.description,
        totalRefunded: payments.totalRefunded,
        createdAt: payments.createdAt,
        playerName: players.fullName,
        activity: sql<string>`(SELECT activity FROM subscriptions WHERE player_id = ${players.id} ORDER BY created_at DESC LIMIT 1)`,
      })
      .from(payments)
      .leftJoin(players, eq(payments.playerId, players.id))
      .orderBy(desc(payments.createdAt));
  }

  async getPlayerPayments(playerId: string): Promise<Payment[]> {
    return await db.select().from(payments).where(eq(payments.playerId, playerId)).orderBy(desc(payments.createdAt));
  }

  async createPayment(insertPayment: InsertPayment): Promise<Payment> {
    const id = nanoid();
    const receiptNumber = `E1-${new Date().getFullYear()}-${Date.now()}`;

    // Derive paymentStatus from the balance — schema default is 'completed' which is wrong for partial payments
    const subscriptionFee = parseFloat(String(insertPayment.subscriptionFee || '0'));
    const amountPaid = parseFloat(String(insertPayment.amountPaid || '0'));
    const remaining = parseFloat(String((insertPayment as any).remainingBalance || '0'));
    let derivedStatus: string;
    if (remaining <= 0) {
      derivedStatus = 'completed';
    } else if (amountPaid > 0) {
      derivedStatus = 'pending'; // partial payment — still owes
    } else {
      derivedStatus = 'pending'; // no payment made yet
    }

    await db.insert(payments).values({
      ...insertPayment,
      id,
      receiptNumber,
      paymentStatus: derivedStatus,
    } as any);
    const [payment] = await db.select().from(payments).where(eq(payments.id, id));
    return payment;
  }

  async updatePayment(id: string, paymentUpdate: Partial<InsertPayment>): Promise<Payment | undefined> {
    await db
      .update(payments)
      .set(paymentUpdate)
      .where(eq(payments.id, id));
    const [payment] = await db.select().from(payments).where(eq(payments.id, id));
    return payment || undefined;
  }

  // ─── Payment Refund methods ────────────────────────────────────────────────

  async getRefundSummary(paymentId: string): Promise<{ totalRefunded: number; remainingRefundable: number }> {
    const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId));
    if (!payment) return { totalRefunded: 0, remainingRefundable: 0 };

    const refunds = await db.select().from(paymentRefunds).where(eq(paymentRefunds.paymentId, paymentId));
    // Use integer cent arithmetic to avoid floating-point drift
    const amountPaidCents = toCents(payment.amountPaid);
    const totalRefundedCents = refunds.reduce((s, r) => s + toCents(r.refundAmount), 0);
    const remainingCents = Math.max(0, amountPaidCents - totalRefundedCents);

    return {
      totalRefunded: totalRefundedCents / 100,
      remainingRefundable: remainingCents / 100,
    };
  }

  async createPaymentRefund(
    insertRefund: InsertPaymentRefund,
    refundedBy?: string,
  ): Promise<PaymentRefund> {
    const paymentId = insertRefund.paymentId;

    // Pre-flight: validate refund method before acquiring any lock
    const method = (insertRefund.refundMethod ?? 'cash') as string;
    if (!(ALLOWED_REFUND_METHODS as readonly string[]).includes(method)) {
      logRefundEvent('REFUND_FAILED_INVALID_METHOD', { paymentId, adminId: refundedBy, amount: parseFloat(String(insertRefund.refundAmount)) });
      throw new Error(`Invalid refund method '${method}'. Allowed: ${ALLOWED_REFUND_METHODS.join(', ')}`);
    }
    if (!insertRefund.reason || insertRefund.reason.trim() === '') {
      logRefundEvent('REFUND_FAILED_VALIDATION', { paymentId, adminId: refundedBy });
      throw new Error('Refund reason is required');
    }
    const refundAmtCents = toCents(insertRefund.refundAmount);
    if (refundAmtCents <= 0) {
      logRefundEvent('REFUND_FAILED_VALIDATION', { paymentId, adminId: refundedBy, amount: refundAmtCents });
      throw new Error('Refund amount must be greater than zero');
    }

    // ── All critical work runs inside a DB transaction with row-level lock ──────
    let createdRefundId: string;
    try {
      await db.transaction(async (tx) => {
        // ── 1. Lock the payment row to prevent concurrent over-refund ─────────────
        // SELECT ... FOR UPDATE acquires an exclusive row lock that is held
        // until the transaction commits or rolls back. Any concurrent transaction
        // attempting to lock the same row will block here until we finish.
        const [lockedPayment] = await tx.execute(
          sql`SELECT * FROM payments WHERE id = ${paymentId} FOR UPDATE`
        ) as any;
        const payment = (lockedPayment as any[])[0] as any;

        if (!payment) {
          throw new Error('Payment not found');
        }

        // ── 2. Validate payment status ───────────────────────────────────────────
        if (payment.payment_status === 'cancelled') {
          logRefundEvent('REFUND_FAILED_CANCELLED', { paymentId, adminId: refundedBy, playerId: payment.player_id });
          throw new Error('Cannot refund a cancelled payment');
        }
        if (payment.payment_status === 'refunded') {
          logRefundEvent('REFUND_FAILED_FULLY_REFUNDED', { paymentId, adminId: refundedBy, playerId: payment.player_id });
          throw new Error('Payment has already been fully refunded');
        }

        // ── 3. Calculate remaining refundable using integer cents ────────────────
        // Read all existing refunds inside the same transaction to prevent
        // concurrent reads from seeing a stale (pre-refund) total.
        const existingRefunds = await tx
          .select({ refundAmount: paymentRefunds.refundAmount })
          .from(paymentRefunds)
          .where(eq(paymentRefunds.paymentId, paymentId));

        const amountPaidCents = toCents(payment.amount_paid);
        const totalAlreadyRefundedCents = existingRefunds.reduce(
          (s, r) => s + toCents(r.refundAmount),
          0
        );
        const remainingCents = amountPaidCents - totalAlreadyRefundedCents;

        // ── 4. Strict over-refund guard (no float tolerance) ─────────────────
        if (refundAmtCents > remainingCents) {
          logRefundEvent('REFUND_FAILED_OVER_LIMIT', {
            adminId: refundedBy,
            paymentId,
            playerId: payment.player_id,
            amount: refundAmtCents / 100,
            error: `Remaining refundable: AED ${fromCents(remainingCents)}`,
          });
          throw new Error(
            `Refund AED ${fromCents(refundAmtCents)} exceeds remaining refundable AED ${fromCents(remainingCents)}`
          );
        }

        // ── 5. Insert refund record ────────────────────────────────────────────────
        createdRefundId = nanoid();
        await tx.insert(paymentRefunds).values({
          id: createdRefundId,
          paymentId,
          playerId: payment.player_id,          // always from payment row, never from request
          refundAmount: fromCents(refundAmtCents), // stored as DECIMAL-safe string
          refundMethod: method,
          reason: insertRefund.reason!.trim(),
          refundedBy: refundedBy ?? null,
        } as any);

        // ── 6. Recalculate and update payment status ────────────────────────────
        const newTotalCents = totalAlreadyRefundedCents + refundAmtCents;
        let newStatus: string;
        if (newTotalCents >= amountPaidCents) {
          newStatus = 'refunded';
        } else if (newTotalCents > 0) {
          newStatus = 'partially_refunded';
        } else {
          newStatus = 'completed';
        }

        await tx
          .update(payments)
          .set({ paymentStatus: newStatus, totalRefunded: fromCents(newTotalCents) } as any)
          .where(eq(payments.id, paymentId));

        // Audit success inside transaction scope (will still log even if outer try catches)
        logRefundEvent('REFUND_SUCCESS', {
          adminId: refundedBy,
          paymentId,
          playerId: payment.player_id,
          amount: refundAmtCents / 100,
        });
      }); // ── transaction auto-commits here, or auto-rolls back on throw ────────
    } catch (err) {
      // If it wasn't already logged (e.g. unexpected DB error), log it now
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('Cannot refund') && !msg.includes('Refund') && !msg.includes('Payment not found')) {
        logRefundEvent('REFUND_TRANSACTION_ERROR', { paymentId, adminId: refundedBy, error: msg });
      }
      throw err; // re-throw so the route handler returns the correct HTTP error
    }

    const [refund] = await db.select().from(paymentRefunds).where(eq(paymentRefunds.id, createdRefundId!));
    return refund;
  }

  async getPaymentRefunds(paymentId: string): Promise<PaymentRefund[]> {
    return await db
      .select()
      .from(paymentRefunds)
      .where(eq(paymentRefunds.paymentId, paymentId))
      .orderBy(desc(paymentRefunds.createdAt));
  }

  async getPlayerRefunds(playerId: string): Promise<PaymentRefund[]> {
    return await db
      .select()
      .from(paymentRefunds)
      .where(eq(paymentRefunds.playerId, playerId))
      .orderBy(desc(paymentRefunds.createdAt));
  }

  async getPlayerSessions(playerId: string): Promise<Session[]> {
    return await db.select().from(sessions).where(eq(sessions.playerId, playerId)).orderBy(desc(sessions.sessionDate));
  }

  async getAllSessions(): Promise<Session[]> {
    return await db
      .select({
        id: sessions.id,
        playerId: sessions.playerId,
        sessionDate: sessions.sessionDate,
        scheduledStartTime: sessions.scheduledStartTime,
        scheduledEndTime: sessions.scheduledEndTime,
        actualStartTime: sessions.actualStartTime,
        actualEndTime: sessions.actualEndTime,
        subscriptionId: sessions.subscriptionId,
        attendanceStatus: sessions.attendanceStatus,
        sessionStatus: sessions.sessionStatus,
        instructorName: sessions.instructorName,
        notes: sessions.notes,
        createdAt: sessions.createdAt,
        playerName: players.fullName,
        activity: subscriptions.activity,
      })
      .from(sessions)
      .leftJoin(players, eq(sessions.playerId, players.id))
      .leftJoin(subscriptions, eq(sessions.subscriptionId, subscriptions.id))
      .orderBy(desc(sessions.sessionDate));
  }

  async createSession(session: InsertSession): Promise<Session> {
    const id = nanoid();
    const attendanceStatus = (session as any).attendanceStatus;
    // 'present' and 'late' mean the player actually attended → used for the 'attended' label.
    const isAttended = attendanceStatus === 'present' || attendanceStatus === 'late';
    // A session slot is consumed for every status EXCEPT 'excused'. present, late AND absent
    // all deduct one session from the player's balance (a no-show still burns the booked slot);
    // only an excused absence is forgiven and leaves the balance untouched.
    const consumesSession = attendanceStatus !== 'excused';

    // Single source of truth for sessionStatus: derive it from attendance instead of
    // trusting the client. 'present' AND 'late' map to 'attended'; 'absent'/'excused'
    // map to 'missed'. Scheduling a future session ('scheduled') or cancelling it is preserved.
    const incomingSessionStatus = (session as any).sessionStatus;
    if (incomingSessionStatus !== 'scheduled' && incomingSessionStatus !== 'cancelled') {
      (session as any).sessionStatus = isAttended ? 'attended' : 'missed';
    }

    // Prevent duplicate attendance: a player may only have one session record per calendar day.
    // If one already exists, update that record's status instead of inserting a duplicate.
    const sessionDate = (session as any).sessionDate ? new Date((session as any).sessionDate) : new Date();
    const [existing] = await db.select().from(sessions)
      .where(and(
        eq(sessions.playerId, (session as any).playerId),
        sql`DATE(${sessions.sessionDate}) = DATE(${sessionDate})`
      ))
      .limit(1);

    if (existing) {
      const updated = await this.updateSession(existing.id, {
        attendanceStatus: (session as any).attendanceStatus,
        sessionStatus: (session as any).sessionStatus,
        scheduledStartTime: (session as any).scheduledStartTime,
        scheduledEndTime: (session as any).scheduledEndTime,
        actualStartTime: (session as any).actualStartTime,
        actualEndTime: (session as any).actualEndTime,
        instructorName: (session as any).instructorName,
        notes: (session as any).notes,
      } as any);
      return updated!;
    }

    return await db.transaction(async (tx) => {
      if (consumesSession) {
        const [result] = await tx.update(subscriptions)
          .set({ sessionsUsed: sql`${subscriptions.sessionsUsed} + 1`, updatedAt: new Date() })
          .where(and(
            eq(subscriptions.id, (session as any).subscriptionId),
            sql`${subscriptions.sessionsUsed} < ${subscriptions.sessionsAllowed}`
          ));

        if (result.affectedRows === 0) {
          throw new Error("Maximum sessions exceeded or subscription not found");
        }
      }
      
      await tx.insert(sessions).values({ ...session, id } as any);
      const [sess] = await tx.select().from(sessions).where(eq(sessions.id, id));
      return sess;
    });
  }

  async updateSession(id: string, sessionUpdate: Partial<InsertSession>): Promise<Session | undefined> {
    return await db.transaction(async (tx) => {
      const [existingSession] = await tx.select().from(sessions).where(eq(sessions.id, id));
      if (!existingSession) throw new Error("Session not found");
      
      const oldStatus = existingSession.attendanceStatus;
      const newStatus = sessionUpdate.attendanceStatus !== undefined ? sessionUpdate.attendanceStatus : oldStatus;

      // A session slot is consumed for every status except 'excused' (present, late and
      // absent all deduct; excused does not). Only adjust sessionsUsed when the consuming
      // state actually flips — e.g. absent → excused frees a slot, excused → absent takes one.
      const wasConsuming = oldStatus !== 'excused';
      const isConsuming = newStatus !== 'excused';

      if (!wasConsuming && isConsuming) {
        const [result] = await tx.update(subscriptions)
          .set({ sessionsUsed: sql`${subscriptions.sessionsUsed} + 1`, updatedAt: new Date() })
          .where(and(
            eq(subscriptions.id, existingSession.subscriptionId),
            sql`${subscriptions.sessionsUsed} < ${subscriptions.sessionsAllowed}`
          ));
        if (result.affectedRows === 0) {
          throw new Error("Maximum sessions exceeded or subscription not found");
        }
      } else if (wasConsuming && !isConsuming) {
        await tx.update(subscriptions)
          .set({ sessionsUsed: sql`GREATEST(0, ${subscriptions.sessionsUsed} - 1)`, updatedAt: new Date() })
          .where(eq(subscriptions.id, existingSession.subscriptionId));
      }
      
      await tx.update(sessions).set(sessionUpdate).where(eq(sessions.id, id));
      const [selectedSession] = await tx.select().from(sessions).where(eq(sessions.id, id));
      return selectedSession;
    });
  }

  async markAttendance(sessionId: string, attendanceStatus: string, notes?: string): Promise<Session | undefined> {
    const isAttendedStatus = attendanceStatus === 'present' || attendanceStatus === 'late';
    return this.updateSession(sessionId, {
        attendanceStatus: attendanceStatus as any,
        sessionStatus: isAttendedStatus ? 'attended' : 'missed' as any,
        notes: notes
    });
  }

  // Auto-update subscription statuses based on end dates
  private async updateExpiredSubscriptions(): Promise<void> {
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    // Mark as expired: subscriptionEndDate has passed and still active
    await db
      .update(subscriptions)
      .set({ status: 'expired' as any, updatedAt: new Date() })
      .where(
        and(
          sql`${subscriptions.endDate} < ${now}`,
          sql`${subscriptions.endDate} IS NOT NULL`,
          sql`${subscriptions.status} IN ('active', 'renewal_due')`
        )
      );

    // Mark as renewal_due: subscriptionEndDate is within 3 days and still active
    await db
      .update(subscriptions)
      .set({ status: 'renewal_due' as any, updatedAt: new Date() })
      .where(
        and(
          sql`${subscriptions.endDate} >= ${now}`,
          sql`${subscriptions.endDate} <= ${threeDaysFromNow}`,
          sql`${subscriptions.endDate} IS NOT NULL`,
          eq(subscriptions.status, 'active')
        )
      );
  }

  async getDashboardStats() {
    // Auto-update subscription statuses before computing stats
    await this.updateExpiredSubscriptions();

    // ── Date Boundaries ──────────────────────────────────────────────────────
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed
    const currentMonthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
    const monthStart = new Date(currentYear, currentMonth, 1);
    const monthEnd = new Date(currentYear, currentMonth + 1, 1);   // exclusive upper bound
    const yearStart = new Date(currentYear, 0, 1);

    // ── Player Counts ────────────────────────────────────────────────────────
    const totalPlayersResult = await db.select({ count: count() }).from(players);
    const totalPlayers = totalPlayersResult[0].count;

    const activeSubscriptionsResult = await db
      .select({ count: count() })
      .from(subscriptions)
      .where(eq(subscriptions.status, 'active'));
    const activeSubscriptions = activeSubscriptionsResult[0].count;

    // ── Pending Player Payments (outstanding debt) ────────────────────────────
    const pendingPaymentsResult = await db
      .select({ total: sql<string>`COALESCE(CAST(SUM(${payments.remainingBalance}) AS CHAR), '0')` })
      .from(payments)
      .where(sql`${payments.remainingBalance} > 0`);
    const pendingPayments = pendingPaymentsResult[0].total || '0';

    // ── Player Activity Breakdown ─────────────────────────────────────────────
    const playersByActivityResult = await db
      .select({ activity: subscriptions.activity, count: count() })
      .from(subscriptions)
      .where(eq(subscriptions.status, 'active'))
      .groupBy(subscriptions.activity);

    // ── CASH FLOW: INCOME ─────────────────────────────────────────────────────
    // Income = real cash entering the academy.
    // Sources: (1) player subscription payments  (2) advance repayments by trainers
    // Excluded: CarryForward, NetPayable, PendingAdvances — these are ledger states, not cash.

    // (1) Monthly player payments (gross)
    const monthlyPlayerRevenueResult = await db
      .select({ total: sql<string>`COALESCE(CAST(SUM(${payments.amountPaid}) AS CHAR), '0')` })
      .from(payments)
      .where(and(gte(payments.paymentDate, monthStart), lt(payments.paymentDate, monthEnd)));
    const monthlyPlayerRevenue = monthlyPlayerRevenueResult[0].total || '0';

    // (2) Monthly advance repayments (advances the trainer paid BACK in cash this month)
    //     Status = 'repaid', deductedAt is used as the repayment timestamp
    const monthlyAdvanceRepaymentsResult = await db
      .select({ total: sql<string>`COALESCE(CAST(SUM(${trainerAdvances.amount}) AS CHAR), '0')` })
      .from(trainerAdvances)
      .where(and(
        eq(trainerAdvances.status, 'repaid'),
        gte(trainerAdvances.deductedAt, monthStart),
        lt(trainerAdvances.deductedAt, monthEnd)
      ));
    const monthlyAdvanceRepayments = monthlyAdvanceRepaymentsResult[0].total || '0';

    // (3) Monthly refunds issued — these reduce net income (cash left the academy)
    const monthlyRefundsResult = await db
      .select({ total: sql<string>`COALESCE(CAST(SUM(${paymentRefunds.refundAmount}) AS CHAR), '0')` })
      .from(paymentRefunds)
      .where(and(gte(paymentRefunds.refundDate, monthStart), lt(paymentRefunds.refundDate, monthEnd)));
    const monthlyRefunds = monthlyRefundsResult[0].total || '0';

    const monthlyIncomeNum =
      parseFloat(monthlyPlayerRevenue) +
      parseFloat(monthlyAdvanceRepayments) -
      parseFloat(monthlyRefunds);  // refunds reduce net income
    const monthlyIncome = monthlyIncomeNum.toFixed(2);

    // ── CASH FLOW: EXPENSES ───────────────────────────────────────────────────
    // Expenses = real cash leaving the academy.
    // Sources: (1) trainer cash salary payments  (2) advances created this month
    // Excluded: deducted advances (status-only change, no new cash), CarryForward, NetPayable.

    // (1) Monthly trainer cash payments (amount = cash only, per our payroll logic)
    //     Cash-basis: recognized when the cash actually left (createdAt = payment date),
    //     NOT by the payroll `month` period. Paying August's salary on 28 Jul is a JULY
    //     cash expense. This matches the expenses list and every other cash-flow line here.
    const monthlyTrainerCashResult = await db
      .select({ total: sql<string>`COALESCE(CAST(SUM(${trainerSalaryPayments.amount}) AS CHAR), '0')` })
      .from(trainerSalaryPayments)
      .where(and(
        gte(trainerSalaryPayments.createdAt, monthStart),
        lt(trainerSalaryPayments.createdAt, monthEnd)
      ));
    const monthlyTrainerCashPayments = monthlyTrainerCashResult[0].total || '0';

    // (2) Advances CREATED this month — cash left the academy when the advance was issued
    //     Counted regardless of current status (pending/deducted/repaid already accounted for)
    const monthlyAdvancesCreatedResult = await db
      .select({ total: sql<string>`COALESCE(CAST(SUM(${trainerAdvances.amount}) AS CHAR), '0')` })
      .from(trainerAdvances)
      .where(and(
        gte(trainerAdvances.createdAt, monthStart),
        lt(trainerAdvances.createdAt, monthEnd)
      ));
    const monthlyAdvancesCreated = monthlyAdvancesCreatedResult[0].total || '0';

    // (3) Monthly academy expenses (rent, utilities, etc.) — exclude soft-deleted.
    //     Exclude category='salary': trainer salary cash is already counted via
    //     monthlyTrainerCashPayments (payroll). Counting salary-category expense rows
    //     here too would (a) double-count salary and (b) disagree with the Expenses page,
    //     which also excludes category='salary' (see getExpenses). This is the source of
    //     the dashboard-vs-expenses discrepancy.
    const monthlyAcademyExpensesResult = await db
      .select({ total: sql<string>`COALESCE(CAST(SUM(${expenses.amount}) AS CHAR), '0')` })
      .from(expenses)
      .where(and(
        gte(expenses.date, monthStart),
        lt(expenses.date, monthEnd),
        isNull(expenses.deletedAt),
        ne(expenses.category, 'salary' as any)
      ));
    const monthlyAcademyExpenses = monthlyAcademyExpensesResult[0].total || '0';

    const monthlyExpensesNum = parseFloat(monthlyTrainerCashPayments) + parseFloat(monthlyAdvancesCreated) + parseFloat(monthlyAcademyExpenses);
    const monthlyExpenses = monthlyExpensesNum.toFixed(2);

    // Monthly Profit
    const monthlyProfit = (monthlyIncomeNum - monthlyExpensesNum).toFixed(2);

    // ── ANNUAL CASH FLOW ──────────────────────────────────────────────────────
    // Annual Income: player payments YTD + advance repayments YTD - refunds YTD
    const annualPlayerRevenueResult = await db
      .select({ total: sql<string>`COALESCE(CAST(SUM(${payments.amountPaid}) AS CHAR), '0')` })
      .from(payments)
      .where(gte(payments.paymentDate, yearStart));
    const annualPlayerRevenue = parseFloat(annualPlayerRevenueResult[0].total || '0');

    const annualAdvanceRepaymentsResult = await db
      .select({ total: sql<string>`COALESCE(CAST(SUM(${trainerAdvances.amount}) AS CHAR), '0')` })
      .from(trainerAdvances)
      .where(and(
        eq(trainerAdvances.status, 'repaid'),
        gte(trainerAdvances.deductedAt, yearStart)
      ));
    const annualAdvanceRepayments = parseFloat(annualAdvanceRepaymentsResult[0].total || '0');

    // Annual refunds YTD
    const annualRefundsResult = await db
      .select({ total: sql<string>`COALESCE(CAST(SUM(${paymentRefunds.refundAmount}) AS CHAR), '0')` })
      .from(paymentRefunds)
      .where(gte(paymentRefunds.refundDate, yearStart));
    const annualRefunds = parseFloat(annualRefundsResult[0].total || '0');

    const annualIncomeNum = annualPlayerRevenue + annualAdvanceRepayments - annualRefunds;

    // Annual Expenses: trainer cash payments YTD + advances created YTD
    //     Cash-basis: recognized by actual payment date (createdAt), consistent with the
    //     monthly figure above and the rest of the cash-flow calc.
    const annualTrainerCashResult = await db
      .select({ total: sql<string>`COALESCE(CAST(SUM(${trainerSalaryPayments.amount}) AS CHAR), '0')` })
      .from(trainerSalaryPayments)
      .where(gte(trainerSalaryPayments.createdAt, yearStart));
    const annualTrainerCash = parseFloat(annualTrainerCashResult[0].total || '0');

    const annualAdvancesCreatedResult = await db
      .select({ total: sql<string>`COALESCE(CAST(SUM(${trainerAdvances.amount}) AS CHAR), '0')` })
      .from(trainerAdvances)
      .where(gte(trainerAdvances.createdAt, yearStart));
    const annualAdvancesCreated = parseFloat(annualAdvancesCreatedResult[0].total || '0');
    // Exclude category='salary' — salary cash is counted via annualTrainerCash (payroll).
    // Keeps the annual figure consistent with the Expenses page and avoids double-counting.
    const annualAcademyExpensesResult = await db
      .select({ total: sql<string>`COALESCE(CAST(SUM(${expenses.amount}) AS CHAR), '0')` })
      .from(expenses)
      .where(and(
        gte(expenses.date, yearStart),
        isNull(expenses.deletedAt),
        ne(expenses.category, 'salary' as any)
      ));
    const annualAcademyExpenses = parseFloat(annualAcademyExpensesResult[0].total || '0');

    const annualExpensesNum = annualTrainerCash + annualAdvancesCreated + annualAcademyExpenses;

    // ── LEDGER STATES (not cash flow) ─────────────────────────────────────────
    // Outstanding (pending) advances — a liability, not an expense
    const advancesOutstandingResult = await db
      .select({ total: sql<string>`COALESCE(CAST(SUM(${trainerAdvances.amount}) AS CHAR), '0')` })
      .from(trainerAdvances)
      .where(eq(trainerAdvances.status, 'pending'));
    const totalAdvancesOutstanding = advancesOutstandingResult[0].total || '0';

    // Total Bonuses for current month (for display reference)
    const bonusesResult = await db
      .select({ total: sql<string>`COALESCE(CAST(SUM(${trainerBonuses.amount}) AS CHAR), '0')` })
      .from(trainerBonuses)
      .where(eq(trainerBonuses.month, currentMonthStr));
    const totalBonuses = bonusesResult[0].total || '0';

    // Outstanding Salaries = sum of positive NetPayable across all trainers this month
    // This MUST match getTrainerLedger()'s NetPayable exactly (single source of truth),
    // otherwise the dashboard total disagrees with the payroll page.
    //   NetPayable = BaseSalary + CarryForward + Bonuses(current) - PendingAdvances - CashPaid(current)
    //   CarryForward = Σ over each past month since the trainer was created of
    //                  (BaseSalary + bonuses(m) - cashPaid(m))   [cash only, no advances]
    // Kept to O(1) queries: pull all bonuses/payments once and group in JS (no N+1).
    const allTrainers = await db.select({ trainerId: trainers.id, salary: trainers.baseSalary, createdAt: trainers.createdAt }).from(trainers);
    const allBonusRows = await db.select({ trainerId: trainerBonuses.trainerId, month: trainerBonuses.month, amount: trainerBonuses.amount }).from(trainerBonuses);
    const allPaymentRows = await db.select({ trainerId: trainerSalaryPayments.trainerId, month: trainerSalaryPayments.month, amount: trainerSalaryPayments.amount }).from(trainerSalaryPayments);
    const allPendingAdvRows = await db.select({ trainerId: trainerAdvances.trainerId, total: sql<string>`COALESCE(SUM(${trainerAdvances.amount}), 0)` }).from(trainerAdvances).where(eq(trainerAdvances.status, 'pending')).groupBy(trainerAdvances.trainerId);

    // trainerId -> (month -> summed amount)
    const bonusByTM = new Map<string, Map<string, number>>();
    for (const b of allBonusRows) {
      const m = bonusByTM.get(b.trainerId) ?? new Map<string, number>();
      m.set(b.month, (m.get(b.month) || 0) + parseFloat(b.amount || '0'));
      bonusByTM.set(b.trainerId, m);
    }
    const paidByTM = new Map<string, Map<string, number>>();
    for (const p of allPaymentRows) {
      const m = paidByTM.get(p.trainerId) ?? new Map<string, number>();
      m.set(p.month, (m.get(p.month) || 0) + parseFloat(p.amount || '0'));
      paidByTM.set(p.trainerId, m);
    }
    const pendingAdvMap = Object.fromEntries(allPendingAdvRows.map(a => [a.trainerId, parseFloat(a.total || '0')]));

    const [curY, curM] = currentMonthStr.split('-').map(Number);

    let outstandingSalariesNum = 0;
    for (const t of allTrainers) {
      const baseSalary = parseFloat(t.salary || '0');
      const bonusMonths = bonusByTM.get(t.trainerId);
      const paidMonths = paidByTM.get(t.trainerId);

      // Walk every month from the trainer's creation month up to (excluding) the current month.
      let carryForward = 0;
      const startD = new Date(t.createdAt);
      let y = startD.getFullYear();
      let mo = startD.getMonth() + 1;
      while (y < curY || (y === curY && mo < curM)) {
        const key = `${y}-${String(mo).padStart(2, '0')}`;
        const mBonus = bonusMonths?.get(key) || 0;
        const mPaid = paidMonths?.get(key) || 0;
        carryForward += (baseSalary + mBonus) - mPaid;
        mo++;
        if (mo > 12) { mo = 1; y++; }
      }

      const currentBonus = bonusMonths?.get(currentMonthStr) || 0;
      const currentPaid = paidMonths?.get(currentMonthStr) || 0;
      const pendingAdvance = pendingAdvMap[t.trainerId] || 0;

      const netPayable = (baseSalary + carryForward + currentBonus) - pendingAdvance - currentPaid;
      if (netPayable > 0.01) outstandingSalariesNum += netPayable;
    }
    const outstandingSalaries = outstandingSalariesNum.toFixed(2);

    // ── PAYMENT METHOD BREAKDOWN (monthly) ───────────────────────────────────
    const methodBreakdownResult = await db
      .select({
        method: payments.paymentMethod,
        total: sql<string>`COALESCE(CAST(SUM(${payments.amountPaid}) AS CHAR), '0')`,
      })
      .from(payments)
      .where(and(gte(payments.paymentDate, monthStart), lt(payments.paymentDate, monthEnd)))
      .groupBy(payments.paymentMethod);

    const paymentMethodBreakdown: Record<string, number> = { cash: 0, visa: 0, bank_transfer: 0 };
    let methodTotal = 0;
    for (const row of methodBreakdownResult) {
      const amount = parseFloat(row.total || '0');
      paymentMethodBreakdown[row.method] = amount;
      methodTotal += amount;
    }

    // ── OVERDUE BALANCE ───────────────────────────────────────────────────────
    // Overdue = player has unpaid balance AND their subscription is expired/cancelled.
    // We derive this dynamically (paymentStatus='overdue' is never set by any job).
    const overduePaymentsResult = await db
      .select({ total: sql<string>`COALESCE(CAST(SUM(${payments.remainingBalance}) AS CHAR), '0')` })
      .from(payments)
      .leftJoin(subscriptions, eq(payments.playerId, subscriptions.playerId))
      .where(
        and(
          sql`${payments.remainingBalance} > 0`,
          sql`${subscriptions.status} IN ('expired', 'cancelled')`
        )
      );
    const overduePayments = overduePaymentsResult[0].total || '0';

    // ── INVENTORY STATS ───────────────────────────────────────────────────────
    // Exclude soft-deleted items; include all non-deleted regardless of status
    const allInventoryItems = await db.select().from(inventoryItems).where(
      isNull(inventoryItems.deletedAt)
    );
    
    let inventoryTotalItems = 0;
    let inventoryLowStock = 0;
    let inventoryOutOfStock = 0;
    let inventoryValueNum = 0;

    for (const item of allInventoryItems) {
      if (item.status === 'discontinued' || item.status === 'inactive') continue;
      inventoryTotalItems++;
      if (item.quantity <= 0) {
        inventoryOutOfStock++;
      } else if (item.quantity <= item.minQuantity) {
        inventoryLowStock++;
      }
      
      if (item.unitPrice && item.quantity > 0) {
        inventoryValueNum += item.quantity * parseFloat(item.unitPrice);
      }
    }
    const inventoryTotalValue = inventoryValueNum.toFixed(2);

    return {
      totalPlayers,
      activeSubscriptions,
      pendingPayments,
      playersByActivity: playersByActivityResult,
      outstandingSalaries,
      totalAdvancesOutstanding,
      // Cash-flow monthly
      monthlyIncome,
      monthlyExpenses,
      monthlyProfit,
      // Monthly breakdown (for tooltip / drill-down)
      monthlyPlayerRevenue,
      monthlyAdvanceRepayments,
      monthlyTrainerCashPayments,
      monthlyAdvancesCreated,
      monthlyRefunds,
      // Cash-flow annual
      annualIncome: annualIncomeNum.toFixed(2),
      annualExpenses: annualExpensesNum.toFixed(2),
      annualNetProfit: (annualIncomeNum - annualExpensesNum).toFixed(2),
      annualRefunds: annualRefunds.toFixed(2),
      // Inventory summary
      inventoryTotalItems,
      inventoryLowStock,
      inventoryOutOfStock,
      inventoryTotalValue,
      // Payment method breakdown for current month
      paymentMethodBreakdown,
      paymentMethodTotal: methodTotal,
      overduePayments,
      // Legacy fields — kept for backward compatibility
      monthlyRevenue: monthlyPlayerRevenue,
      totalSalaryExpenses: monthlyTrainerCashPayments,
      totalBonuses,
    };
  }

  async getUpcomingRenewals(): Promise<Array<Player & { sessionsLeft: number }>> {
    // Auto-update statuses first
    await this.updateExpiredSubscriptions();

    const upcomingRenewals = await db
      .select({
        id: players.id,
        fullName: players.fullName,
        phoneNumber: players.phoneNumber,
        subscription: subscriptions
      })
      .from(players)
      .innerJoin(subscriptions, eq(players.id, subscriptions.playerId))
      .where(
        and(
          lte(subscriptions.endDate, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)), // Within 7 days
          sql`${subscriptions.status} IN ('active', 'renewal_due')`
        )
      )
      .orderBy(asc(subscriptions.endDate));

    return upcomingRenewals.map((record: any) => ({
      ...record,
      activity: record.subscription.activity,
      renewalDate: record.subscription.endDate,
      subscriptionStatus: record.subscription.status,
      sessionsLeft: Math.max(0, record.subscription.sessionsAllowed - record.subscription.sessionsUsed)
    }));
  }

  async getRecentActivities() {
    // Get recent player registrations
    const recentPlayers = await db
      .select({
        id: players.id,
        fullName: players.fullName,
        activity: sql<string>`(SELECT activity FROM subscriptions WHERE player_id = ${players.id} ORDER BY created_at DESC LIMIT 1)`,
        createdAt: players.createdAt
      })
      .from(players)
      .orderBy(desc(players.createdAt))
      .limit(5);

    // Get recent payments
    const recentPayments = await db
      .select({
        id: payments.id,
        playerId: payments.playerId,
        amountPaid: payments.amountPaid,
        createdAt: payments.createdAt,
        playerName: players.fullName,
      })
      .from(payments)
      .innerJoin(players, eq(payments.playerId, players.id))
      .orderBy(desc(payments.createdAt))
      .limit(5);

    const activities = [
      ...recentPlayers.map((player: any) => ({
        type: 'registration',
        description: `New player registration: ${player.fullName}`,
        timestamp: player.createdAt,
        playerId: player.id,
        playerName: player.fullName
      })),
      ...recentPayments.map((payment: any) => ({
        type: 'payment',
        description: `Payment received: AED ${payment.amountPaid}`,
        timestamp: payment.createdAt,
        playerId: payment.playerId,
        playerName: payment.playerName || ''
      }))
    ];

    return activities
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 10);
  }

  async getRenewalNotifications() {
    // Auto-update statuses first
    await this.updateExpiredSubscriptions();

    // Get all active + renewal_due + expired players that need attention
    const activeSubs = await db
      .select({
        player: players,
        subscription: subscriptions
      })
      .from(subscriptions)
      .innerJoin(players, eq(players.id, subscriptions.playerId))
      .where(sql`${subscriptions.status} IN ('active', 'renewal_due', 'expired')`)
      .orderBy(asc(subscriptions.endDate));

    const now = new Date();
    const notifications: any[] = [];

    for (const record of activeSubs) {
      const player = record.player;
      const sub = record.subscription;
      const endDate = sub.endDate ? new Date(sub.endDate) : null;
      const referenceDate = endDate;
      const daysUntilRenewal = referenceDate
        ? Math.ceil((referenceDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      const sessionsLeft = Math.max(0, sub.sessionsAllowed - sub.sessionsUsed);
      
      let shouldNotify = false;
      let reason: 'sessions_low' | 'renewal_due' = 'sessions_low';

      if (sub.status === 'expired' || daysUntilRenewal < 0) {
        shouldNotify = true;
        reason = 'renewal_due';
      } else if (sub.status === 'renewal_due' || daysUntilRenewal <= 3) {
        shouldNotify = true;
        reason = 'renewal_due';
      } else if (sessionsLeft <= 3) {
        shouldNotify = true;
        reason = 'sessions_low';
      }

      if (shouldNotify) {
        notifications.push({
          playerId: player.id,
          playerName: player.fullName,
          activity: sub.activity,
          renewalDate: sub.endDate,
          daysUntilRenewal,
          sessionsLeft,
          subscriptionStatus: sub.status,
          reason
        });
      }
    }

    // Sort by urgency: renewal_due first, then by days/sessions
    notifications.sort((a, b) => {
      if (a.reason === 'renewal_due' && b.reason !== 'renewal_due') return -1;
      if (b.reason === 'renewal_due' && a.reason !== 'renewal_due') return 1;
      
      if (a.reason === 'renewal_due') {
        return a.daysUntilRenewal - b.daysUntilRenewal;
      } else {
        return a.sessionsLeft - b.sessionsLeft;
      }
    });

    return notifications;
  }

  // Payment History methods
  async getPlayerPaymentHistory(playerId: string): Promise<PaymentHistory[]> {
    return await db
      .select()
      .from(paymentHistory)
      .where(eq(paymentHistory.playerId, playerId))
      .orderBy(desc(paymentHistory.archivedAt));
  }

  async archivePlayerPayments(playerId: string, subscriptionPeriodStart: Date, subscriptionPeriodEnd: Date): Promise<void> {
    // Get all current payments for the player
    const currentPayments = await db
      .select()
      .from(payments)
      .where(eq(payments.playerId, playerId));

    // Archive each payment
    for (const payment of currentPayments) {
      const historyId = nanoid();
      await db.insert(paymentHistory).values({
        id: historyId,
        playerId: payment.playerId,
        subscriptionFee: payment.subscriptionFee,
        amountPaid: payment.amountPaid,
        remainingBalance: payment.remainingBalance,
        paymentMethod: payment.paymentMethod,
        paymentStatus: payment.paymentStatus,
        paymentDate: payment.paymentDate,
        description: payment.description,
        receiptNumber: payment.receiptNumber,
        subscriptionPeriodStart,
        subscriptionPeriodEnd,
        createdAt: payment.createdAt,
      });

      // Archive refunds for this payment
      const refunds = await db.select().from(paymentRefunds).where(eq(paymentRefunds.paymentId, payment.id));
      for (const refund of refunds) {
        await db.insert(paymentRefundHistory).values({
          id: nanoid(),
          originalRefundId: refund.id,
          paymentHistoryId: historyId,
          playerId: refund.playerId,
          refundAmount: refund.refundAmount,
          refundMethod: refund.refundMethod,
          reason: refund.reason,
          refundedBy: refund.refundedBy,
          refundDate: refund.refundDate,
          createdAt: refund.createdAt,
        });
      }
    }
  }

  async clearPlayerCurrentPayments(playerId: string): Promise<void> {
    await db
      .delete(payments)
      .where(eq(payments.playerId, playerId));
  }

  // ─── Trainer methods ──────────────────────────────────────────────────────

  async getTrainers(): Promise<Trainer[]> {
    return await db.select().from(trainers).orderBy(desc(trainers.createdAt));
  }

  async getTrainer(id: string): Promise<Trainer | undefined> {
    const [trainer] = await db.select().from(trainers).where(eq(trainers.id, id));
    return trainer || undefined;
  }

  async createTrainer(insertTrainer: InsertTrainer): Promise<Trainer> {
    const id = nanoid();
    await db.insert(trainers).values({ ...insertTrainer, id } as any);
    const [trainer] = await db.select().from(trainers).where(eq(trainers.id, id));
    return trainer;
  }

  async updateTrainer(id: string, trainerUpdate: Partial<InsertTrainer>): Promise<Trainer | undefined> {
    await db.update(trainers).set(trainerUpdate as any).where(eq(trainers.id, id));
    const [trainer] = await db.select().from(trainers).where(eq(trainers.id, id));
    return trainer || undefined;
  }

  async deleteTrainer(id: string): Promise<boolean> {
    const result = await db.delete(trainers).where(eq(trainers.id, id));
    return (result[0]?.affectedRows ?? 0) > 0;
  }

  async getTrainerSalaryPayments(trainerId?: string, month?: string): Promise<TrainerSalaryPayment[]> {
    let query = db.select().from(trainerSalaryPayments).$dynamic();
    const conditions: any[] = [];
    if (trainerId) conditions.push(eq(trainerSalaryPayments.trainerId, trainerId));
    if (month) conditions.push(eq(trainerSalaryPayments.month, month));
    if (conditions.length > 0) query = query.where(and(...conditions));
    return await query.orderBy(desc(trainerSalaryPayments.createdAt));
  }

  async createTrainerSalaryPayment(
    insertPayment: InsertTrainerSalaryPayment,
    advanceIdsToDeduct: string[] = []
  ): Promise<TrainerSalaryPayment> {
    // Block if month is locked
    const payroll = await this.getTrainerPayroll(insertPayment.trainerId, insertPayment.month);
    if (payroll?.isLocked) {
      throw new Error(`Month ${insertPayment.month} is locked for this trainer.`);
    }

    // Validate: cash amount must not exceed current net payable
    // netPayable = BaseSalary + CarryForward + Bonuses - PendingAdvances - CashPayments
    const ledgerBefore = await this.getTrainerLedger(insertPayment.trainerId, insertPayment.month);
    const cashAmount = parseFloat(insertPayment.amount);

    if (cashAmount > parseFloat(ledgerBefore.netPayable) + 0.01) {
      throw new Error("Payment exceeds net payable");
    }

    // Insert the salary payment — amount = CASH ONLY (never includes advance amounts)
    const id = nanoid();
    await db.insert(trainerSalaryPayments).values({ ...insertPayment, id } as any);

    // FIFO advance deduction: process explicitly requested advance IDs first,
    // then auto-apply remaining oldest pending advances up to the cash amount.
    // Deducted advances only change their status; they are NOT added to the cash amount.
    const allPendingAdvances = await db
      .select()
      .from(trainerAdvances)
      .where(and(eq(trainerAdvances.trainerId, insertPayment.trainerId), eq(trainerAdvances.status, 'pending')))
      .orderBy(asc(trainerAdvances.createdAt));

    // Determine which advances to deduct (explicit list from caller takes priority, then FIFO auto)
    const toDeduct = advanceIdsToDeduct.length > 0
      ? allPendingAdvances.filter(a => advanceIdsToDeduct.includes(a.id))
      : allPendingAdvances; // auto-FIFO: deduct oldest first

    for (const advance of toDeduct) {
      await db
        .update(trainerAdvances)
        .set({
          status: 'deducted' as any,
          deductedAt: new Date(),
          salaryPaymentId: id,
        })
        .where(and(eq(trainerAdvances.id, advance.id), eq(trainerAdvances.status, 'pending')));
    }

    const [payment] = await db.select().from(trainerSalaryPayments).where(eq(trainerSalaryPayments.id, id));
    return payment;
  }

  async getTrainerAdvances(trainerId?: string, status?: string): Promise<TrainerAdvance[]> {
    let query = db.select().from(trainerAdvances).$dynamic();
    const conditions: any[] = [];
    if (trainerId) conditions.push(eq(trainerAdvances.trainerId, trainerId));
    if (status) conditions.push(eq(trainerAdvances.status, status as any));
    if (conditions.length > 0) query = query.where(and(...conditions));
    return await query.orderBy(desc(trainerAdvances.createdAt));
  }

  async createTrainerAdvance(insertAdvance: InsertTrainerAdvance): Promise<TrainerAdvance> {
    // Block if the CURRENT calendar month is locked for this trainer
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const payroll = await this.getTrainerPayroll(insertAdvance.trainerId, currentMonth);
    if (payroll?.isLocked) {
      throw new Error(`Month ${currentMonth} is locked — new advances cannot be created.`);
    }
    const id = nanoid();
    await db.insert(trainerAdvances).values({ ...insertAdvance, id, status: 'pending' } as any);
    const [advance] = await db.select().from(trainerAdvances).where(eq(trainerAdvances.id, id));
    return advance;
  }

  async repayTrainerAdvance(advanceId: string, repaidNote?: string): Promise<TrainerAdvance | undefined> {
    // NOTE: repay is a cash repayment — completely separate from salary payments.
    // It immediately removes the advance from NetPayable (status → 'repaid').
    // Lock does NOT block repaying old advances (per spec: lock only blocks new advances/payments/bonuses).
    const [existing] = await db
      .select()
      .from(trainerAdvances)
      .where(and(eq(trainerAdvances.id, advanceId), eq(trainerAdvances.status, 'pending')));
      
    if (existing) {
      const repaidAt = new Date();
      const noteText = repaidNote
        ? `${repaidNote} (Repaid in Cash ${repaidAt.toLocaleDateString()})`
        : existing.notes
          ? `${existing.notes} | Repaid in Cash on ${repaidAt.toLocaleDateString()}`
          : `Repaid in Cash on ${repaidAt.toLocaleDateString()}`;

      await db
        .update(trainerAdvances)
        .set({
          status: 'repaid' as any,
          // Store repaid_at timestamp in deductedAt field (no schema change needed)
          deductedAt: repaidAt,
          notes: noteText,
        })
        .where(eq(trainerAdvances.id, advanceId));
        
      const [updated] = await db.select().from(trainerAdvances).where(eq(trainerAdvances.id, advanceId));
      return updated;
    }
    return undefined;
  }

  async getTrainerBonuses(trainerId?: string, month?: string): Promise<TrainerBonus[]> {
    let query = db.select().from(trainerBonuses).$dynamic();
    const conditions: any[] = [];
    if (trainerId) conditions.push(eq(trainerBonuses.trainerId, trainerId));
    if (month) conditions.push(eq(trainerBonuses.month, month));
    if (conditions.length > 0) query = query.where(and(...conditions));
    return await query.orderBy(desc(trainerBonuses.createdAt));
  }

  async createTrainerBonus(insertBonus: InsertTrainerBonus): Promise<TrainerBonus> {
    const payroll = await this.getTrainerPayroll(insertBonus.trainerId, insertBonus.month);
    if (payroll?.isLocked) {
      throw new Error(`Month ${insertBonus.month} is locked for this trainer.`);
    }
    const id = nanoid();
    await db.insert(trainerBonuses).values({ ...insertBonus, id } as any);
    const [bonus] = await db.select().from(trainerBonuses).where(eq(trainerBonuses.id, id));
    return bonus;
  }

  async getTrainerPayroll(trainerId: string, month: string): Promise<TrainerPayroll | undefined> {
    const [payroll] = await db.select().from(trainerPayrolls)
      .where(and(eq(trainerPayrolls.trainerId, trainerId), eq(trainerPayrolls.month, month)));
    return payroll || undefined;
  }

  async lockTrainerPayroll(trainerId: string, month: string): Promise<TrainerPayroll> {
    const ledger = await this.getTrainerLedger(trainerId, month);
    const existing = await this.getTrainerPayroll(trainerId, month);
    
    if (existing) {
      await db.update(trainerPayrolls).set({ 
        isLocked: true,
        baseSalary: ledger.baseSalary,
        carryForward: ledger.carryForward,
        totalBonuses: ledger.totalBonuses,
        totalAdvances: ledger.totalPendingAdvances,
        totalPaid: ledger.totalPaid,
        netPayable: ledger.netPayable,
        status: ledger.status as any,
      }).where(eq(trainerPayrolls.id, existing.id));
      return (await this.getTrainerPayroll(trainerId, month))!;
    } else {
      const id = nanoid();
      await db.insert(trainerPayrolls).values({
        id,
        trainerId,
        month,
        baseSalary: ledger.baseSalary,
        carryForward: ledger.carryForward,
        totalBonuses: ledger.totalBonuses,
        totalAdvances: ledger.totalPendingAdvances,
        totalPaid: ledger.totalPaid,
        netPayable: ledger.netPayable,
        status: ledger.status as any,
        isLocked: true,
      });
      return (await this.getTrainerPayroll(trainerId, month))!;
    }
  }

  // (duplicate definitions removed — see implementations above)

  async getTrainerLedger(trainerId: string, month: string) {
    const trainer = await this.getTrainer(trainerId);
    if (!trainer) throw new Error('Trainer not found');

    const baseSalary = parseFloat(trainer.baseSalary);
    const targetMonth = month;

    // Fetch all historical data for this trainer
    const allBonuses = await db.select().from(trainerBonuses).where(eq(trainerBonuses.trainerId, trainerId));
    const allPayments = await db.select().from(trainerSalaryPayments).where(eq(trainerSalaryPayments.trainerId, trainerId));
    const allAdvances = await db
      .select()
      .from(trainerAdvances)
      .where(eq(trainerAdvances.trainerId, trainerId))
      .orderBy(asc(trainerAdvances.createdAt)); // oldest first for FIFO reference

    // ── Carry Forward Calculation ────────────────────────────────────────────
    // For each past month:
    //   earned   = baseSalary + bonuses
    //   settled  = cashPaid ONLY (actual cash handed to trainer)
    //   carry    += earned - settled
    //
    // IMPORTANT: Advances are intentionally excluded from CarryForward.
    // CarryForward represents only "unpaid earnings from previous months".
    // Advance debt is handled globally via PendingAdvances in the main formula:
    //   NetPayable = BaseSalary + CarryForward + Bonuses - PendingAdvances - CashPayments
    // Including advances here would cause double-deduction across months.
    const pastMonths: string[] = [];
    const startD = new Date(trainer.createdAt);
    let currYear = startD.getFullYear();
    let currMonth = startD.getMonth() + 1;

    const [targetY, targetM] = targetMonth.split('-').map(Number);

    while (currYear < targetY || (currYear === targetY && currMonth < targetM)) {
      pastMonths.push(`${currYear}-${String(currMonth).padStart(2, '0')}`);
      currMonth++;
      if (currMonth > 12) { currMonth = 1; currYear++; }
    }

    let carryForward = 0;
    for (const m of pastMonths) {
      const mBonuses = allBonuses
        .filter(b => b.month === m)
        .reduce((s, b) => s + parseFloat(b.amount), 0);

      // Cash paid in that month (cash only — advances never participate here)
      const mCashPaid = allPayments
        .filter(p => p.month === m)
        .reduce((s, p) => s + parseFloat(p.amount), 0);

      // CarryForward = unpaid earnings only. NO advances, no deductions, no repayments.
      carryForward += (baseSalary + mBonuses) - mCashPaid;
    }

    // ── Current Month ─────────────────────────────────────────────────────────
    const currentBonusesList = allBonuses.filter(b => b.month === targetMonth);
    const totalBonuses = currentBonusesList.reduce((s, b) => s + parseFloat(b.amount), 0);

    const currentPaymentsList = allPayments
      .filter(p => p.month === targetMonth)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    // FIX: totalCashPaid = SUM(trainer_salary_payments.amount) for this month ONLY.
    // amount stored = cash handed to trainer (does NOT include deducted advances).
    const totalCashPaid = currentPaymentsList.reduce((s, p) => s + parseFloat(p.amount), 0);

    // FIX: pendingAdvances = only advances with status = 'pending' (global pool, all months).
    // 'deducted' and 'repaid' advances do NOT affect NetPayable.
    const pendingAdvancesList = allAdvances.filter(a => a.status === 'pending');
    const totalPendingAdvances = pendingAdvancesList.reduce((s, a) => s + parseFloat(a.amount), 0);

    // ── Net Payable Formula ──────────────────────────────────────────────────
    // NetPayable = BaseSalary + CarryForward + Bonuses - PendingAdvances - CashPayments
    // CashPayments = SUM(trainer_salary_payments.amount) for current month
    // PendingAdvances = only status='pending' advances (global)
    const netPayable = (baseSalary + carryForward + totalBonuses) - totalPendingAdvances - totalCashPaid;

    // totalPaid exposed to UI = cash paid this month + deducted advances this month (for display)
    const currentPaymentIds = currentPaymentsList.map(p => p.id);
    const totalAdvancesDeductedCurrent = allAdvances
      .filter(a => a.status === 'deducted' && a.salaryPaymentId && currentPaymentIds.includes(a.salaryPaymentId))
      .reduce((s, a) => s + parseFloat(a.amount), 0);
    const totalPaid = totalCashPaid + totalAdvancesDeductedCurrent;

    let status: "unpaid" | "partial" | "paid" | "over_advanced" = "unpaid";
    if (netPayable < -0.01) {
      status = "over_advanced";
    } else if (netPayable <= 0.01) {
      status = "paid";
    } else if (totalCashPaid > 0 || totalAdvancesDeductedCurrent > 0) {
      status = "partial";
    } else {
      status = "unpaid";
    }

    const payrollRecord = await this.getTrainerPayroll(trainerId, month);
    const isLocked = payrollRecord?.isLocked ?? false;

    return {
      baseSalary: baseSalary.toFixed(2),
      carryForward: carryForward.toFixed(2),
      totalBonuses: totalBonuses.toFixed(2),
      totalPendingAdvances: totalPendingAdvances.toFixed(2),
      totalPaid: totalPaid.toFixed(2),
      netPayable: netPayable.toFixed(2),
      status,
      isLocked,
      advances: allAdvances,
      payments: currentPaymentsList,
      bonuses: currentBonusesList,
    };
  }

  // ─── Expenses Methods ─────────────────────────────────────────────────────
  async getExpenses(filters?: { month?: string, category?: string }): Promise<Expense[]> {
    const showSalary = !filters?.category || filters.category === 'all' || filters.category === 'salary';
    const showNonSalary = !filters?.category || filters.category === 'all' || filters.category !== 'salary';

    // Query regular expenses (exclude soft-deleted, optionally exclude salary category since those come from payroll)
    let regularRows: Expense[] = [];
    if (showNonSalary) {
      const conditions: any[] = [isNull(expenses.deletedAt), ne(expenses.category, 'salary' as any)];
      if (filters?.month && filters.month !== 'all') {
        conditions.push(sql`DATE_FORMAT(${expenses.date}, '%Y-%m') = ${filters.month}`);
      }
      regularRows = await db.select().from(expenses).where(and(...conditions)).orderBy(desc(expenses.date)) as any;
    }

    // Query salary payments from payroll table and map to Expense shape
    let salaryRows: Expense[] = [];
    if (showSalary) {
      const salaryConditions: any[] = [];
      if (filters?.month && filters.month !== 'all') {
        // salary payments: filter by payment date (createdAt), not the salary month period
        salaryConditions.push(sql`DATE_FORMAT(${trainerSalaryPayments.createdAt}, '%Y-%m') = ${filters.month}`);
      }
      const rawSalary = await db
        .select({
          id: trainerSalaryPayments.id,
          amount: trainerSalaryPayments.amount,
          month: trainerSalaryPayments.month,
          notes: trainerSalaryPayments.notes,
          createdAt: trainerSalaryPayments.createdAt,
          trainerName: trainers.name,
        })
        .from(trainerSalaryPayments)
        .innerJoin(trainers, eq(trainerSalaryPayments.trainerId, trainers.id))
        .where(salaryConditions.length ? and(...salaryConditions) : undefined as any)
        .orderBy(desc(trainerSalaryPayments.createdAt));

      salaryRows = rawSalary.map(r => ({
        id: r.id,
        category: 'salary' as any,
        amount: r.amount,
        date: r.createdAt,
        description: `Salary Payment: ${r.trainerName} - ${new Date(r.month + '-01').toLocaleString('en-US', { month: 'long', year: 'numeric' })} Salary`,
        paymentMethod: 'cash' as any,
        status: 'paid',
        notes: r.notes ?? null,
        receiptUrl: null,
        createdBy: null,
        updatedBy: null,
        createdAt: r.createdAt,
        updatedAt: r.createdAt,
        deletedAt: null,
        deletedBy: null,
        deletedReason: null,
      })) as any;
    }

    // Merge and sort by date descending
    const all = [...regularRows, ...salaryRows];
    all.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return all;
  }

  async getExpense(id: string): Promise<Expense | undefined> {
    const [expense] = await db.select().from(expenses).where(and(eq(expenses.id, id), isNull(expenses.deletedAt)));
    return expense || undefined;
  }

  async createExpense(expense: InsertExpense, reqContext?: { ipAddress?: string; userAgent?: string }): Promise<Expense> {
    // Salary is tracked via Payroll (trainer_salary_payments), never as a manual expense.
    // A manual 'salary' expense row is invisible on the Expenses page (which sources salary
    // from payroll) yet was counted on the dashboard — the exact cause of the mismatch.
    if ((expense as any).category === 'salary') {
      throw new Error("Salary expenses must be recorded through Payroll, not as a manual expense.");
    }
    const id = nanoid();
    await db.insert(expenses).values({ ...expense, id } as any);
    const [created] = await db.select().from(expenses).where(eq(expenses.id, id));
    
    // Activity log
    await this.logActivity({
      entityType: 'expense',
      entityId: id,
      action: 'created',
      description: `Expense created: ${expense.category} - ${expense.amount}`,
      metadata: JSON.stringify({ category: expense.category, amount: expense.amount, paymentMethod: expense.paymentMethod }),
      performedBy: expense.createdBy || null,
      ipAddress: reqContext?.ipAddress,
      userAgent: reqContext?.userAgent,
    });
    
    return created;
  }

  async updateExpense(id: string, expenseUpdate: Partial<typeof expenses.$inferInsert>, reqContext?: { ipAddress?: string; userAgent?: string }): Promise<Expense | undefined> {
    // Get original for audit — only non-deleted records
    const [original] = await db.select().from(expenses).where(and(eq(expenses.id, id), isNull(expenses.deletedAt)));
    if (!original) return undefined;

    await db.update(expenses).set({ ...expenseUpdate, updatedAt: new Date() }).where(and(eq(expenses.id, id), isNull(expenses.deletedAt)));
    const [expense] = await db.select().from(expenses).where(and(eq(expenses.id, id), isNull(expenses.deletedAt)));
    
    // Activity log
    await this.logActivity({
      entityType: 'expense',
      entityId: id,
      action: 'updated',
      description: `Expense updated: ${expense?.category}`,
      metadata: JSON.stringify({ before: { amount: original?.amount, category: original?.category }, after: { amount: expense?.amount, category: expense?.category } }),
      performedBy: expenseUpdate.updatedBy || null,
      ipAddress: reqContext?.ipAddress,
      userAgent: reqContext?.userAgent,
    });
    
    return expense || undefined;
  }

  async deleteExpense(id: string, userId?: string, reason?: string, reqContext?: { ipAddress?: string; userAgent?: string }): Promise<boolean> {
    // Soft delete
    const [original] = await db.select().from(expenses).where(eq(expenses.id, id));
    if (!original) return false;
    
    await db.update(expenses).set({
      deletedAt: new Date(),
      deletedBy: userId || null,
      deletedReason: reason || 'Deleted by user',
      updatedAt: new Date(),
    } as any).where(eq(expenses.id, id));
    
    // Activity log
    await this.logActivity({
      entityType: 'expense',
      entityId: id,
      action: 'deleted',
      description: `Expense soft-deleted: ${original.category} - ${original.amount}`,
      metadata: JSON.stringify({ category: original.category, amount: original.amount, reason }),
      performedBy: userId || null,
      ipAddress: reqContext?.ipAddress,
      userAgent: reqContext?.userAgent,
    });
    
    return true;
  }

  // ─── Inventory Methods ────────────────────────────────────────────────────
  async getInventoryItems(filters?: { category?: string }): Promise<InventoryItem[]> {
    const conditions: any[] = [isNull(inventoryItems.deletedAt)]; // Always exclude soft-deleted
    
    if (filters?.category && filters.category !== 'all') {
      conditions.push(eq(inventoryItems.category, filters.category));
    }
    
    return await db.select().from(inventoryItems)
      .where(and(...conditions))
      .orderBy(asc(inventoryItems.name));
  }

  async getInventoryItem(id: string): Promise<InventoryItem | undefined> {
    const [item] = await db.select().from(inventoryItems).where(and(eq(inventoryItems.id, id), isNull(inventoryItems.deletedAt)));
    return item || undefined;
  }

  async createInventoryItem(item: InsertInventoryItem, reqContext?: { ipAddress?: string; userAgent?: string }): Promise<InventoryItem> {
    const id = nanoid();
    // Do not allow passing quantity directly to bypass transactions
    const safeItem = { ...item, quantity: 0, status: 'out_of_stock', id };
    await db.insert(inventoryItems).values(safeItem as any);
    const [created] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
    
    // Activity log
    await this.logActivity({
      entityType: 'inventory_item',
      entityId: id,
      action: 'created',
      description: `Inventory item created: ${item.name}`,
      metadata: JSON.stringify({ name: item.name, category: item.category, unitPrice: item.unitPrice }),
      performedBy: item.createdBy || null,
      ipAddress: reqContext?.ipAddress,
      userAgent: reqContext?.userAgent,
    });
    
    return created;
  }

  async updateInventoryItem(id: string, itemUpdate: Partial<typeof inventoryItems.$inferInsert>, reqContext?: { ipAddress?: string; userAgent?: string }): Promise<InventoryItem | undefined> {
    // Prevent direct quantity update — must go through transactions
    const { quantity, status, ...safeUpdate } = itemUpdate as any;
    
    // Get original for audit
    const [original] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
    
    await db.update(inventoryItems).set({ ...safeUpdate, updatedAt: new Date() }).where(eq(inventoryItems.id, id));
    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
    
    // Activity log
    await this.logActivity({
      entityType: 'inventory_item',
      entityId: id,
      action: 'updated',
      description: `Inventory item updated: ${item?.name}`,
      metadata: JSON.stringify({ before: { name: original?.name, unitPrice: original?.unitPrice }, after: { name: item?.name, unitPrice: item?.unitPrice } }),
      performedBy: (itemUpdate as any).updatedBy || null,
      ipAddress: reqContext?.ipAddress,
      userAgent: reqContext?.userAgent,
    });
    
    return item || undefined;
  }

  async deleteInventoryItem(id: string, userId?: string, reason?: string, reqContext?: { ipAddress?: string; userAgent?: string }): Promise<boolean> {
    // Soft delete — keep transaction history
    const [original] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
    if (!original) return false;
    
    await db.update(inventoryItems).set({
      status: 'discontinued',
      deletedAt: new Date(),
      deletedBy: userId || null,
      deletedReason: reason || 'Deleted by user',
      updatedAt: new Date(),
    } as any).where(eq(inventoryItems.id, id));
    
    // Activity log
    await this.logActivity({
      entityType: 'inventory_item',
      entityId: id,
      action: 'deleted',
      description: `Inventory item soft-deleted: ${original.name}`,
      metadata: JSON.stringify({ name: original.name, quantity: original.quantity, reason }),
      performedBy: userId || null,
      ipAddress: reqContext?.ipAddress,
      userAgent: reqContext?.userAgent,
    });
    
    return true;
  }

  async getInventoryTransactions(itemId?: string): Promise<InventoryTransaction[]> {
    const conditions: any[] = [isNull(inventoryTransactions.deletedAt)];
    if (itemId) {
      conditions.push(eq(inventoryTransactions.itemId, itemId));
    }
    return await db.select().from(inventoryTransactions)
      .where(and(...conditions))
      .orderBy(desc(inventoryTransactions.transactionDate));
  }

  async createInventoryTransaction(
    transaction: InsertInventoryTransaction,
    expenseData?: { createExpense: boolean; unitCost: number; category: string; paymentMethod: string },
    reqContext?: { ipAddress?: string; userAgent?: string }
  ): Promise<InventoryTransaction> {
    const id = nanoid();

    // Safety: adjustment transactions MUST have notes
    if (transaction.type === 'adjustment' && (!transaction.notes || transaction.notes.trim() === '')) {
      throw new Error('Adjustment transactions require notes explaining the reason');
    }

    await db.transaction(async (tx) => {
      // 1. Fetch item inside transaction with row-level lock
      const items = await tx.select()
        .from(inventoryItems)
        .where(and(eq(inventoryItems.id, transaction.itemId), isNull(inventoryItems.deletedAt)))
        .for('update');
      
      const item = items[0];
      if (!item) {
        throw new Error('Inventory item not found');
      }

      // 2. Validate transaction and compute new quantity
      let newQuantity = item.quantity;
      const transQty = transaction.quantity;

      if (transaction.type === 'in') {
        if (transQty <= 0) throw new Error('Stock in quantity must be positive');
        newQuantity += transQty;
      } else if (transaction.type === 'out') {
        if (transQty <= 0) throw new Error('Stock out quantity must be positive');
        if (transQty > item.quantity) {
          throw new Error(`Insufficient stock. Available: ${item.quantity}, Requested: ${transQty}`);
        }
        newQuantity -= transQty;
      } else if (transaction.type === 'adjustment') {
        // Adjustment quantity is the *difference* (can be negative)
        newQuantity += transQty;
        if (newQuantity < 0) {
          throw new Error('Adjustment would result in negative stock');
        }
      }

      // 3. Auto-determine inventory status based on new quantity
      let newStatus: string = 'active';
      if (newQuantity <= 0) newStatus = 'out_of_stock';
      else if (newQuantity <= item.minQuantity) newStatus = 'low_stock';

      // 4. Insert transaction with audit fields
      await tx.insert(inventoryTransactions).values({
        ...transaction,
        id,
        balanceAfter: newQuantity,
        // Prefer the caller-supplied cost (user's purchase price); fall back to item's reference price
        unitCostAtTransaction: (transaction as any).unitCostAtTransaction || item.unitPrice || null,
      } as any);
      
      // 5. Update item quantity AND status atomically
      await tx.update(inventoryItems).set({
        quantity: newQuantity,
        status: newStatus,
        updatedAt: new Date(),
      } as any).where(eq(inventoryItems.id, transaction.itemId));

      // 6. Create related expense inside transaction
      if (expenseData?.createExpense && transaction.type === 'in' && transQty > 0) {
        if (expenseData.unitCost > 0) {
          const amount = transQty * expenseData.unitCost;
          const expenseId = nanoid();
          
          await tx.insert(expenses).values({
            id: expenseId,
            category: expenseData.category || 'equipment',
            amount: amount.toString(),
            date: new Date(),
            description: `Inventory Purchase: ${item.name} (${transQty} units)`,
            paymentMethod: expenseData.paymentMethod || 'cash',
            status: 'paid',
            createdBy: transaction.createdBy || null,
          } as any);

          // Log expense creation
          await tx.insert(activityLogs).values({
            id: nanoid(),
            entityType: 'expense',
            entityId: expenseId,
            action: 'created',
            description: `Expense created via inventory stock-in: ${expenseData.category} - ${amount}`,
            metadata: JSON.stringify({ category: expenseData.category, amount: amount.toString(), paymentMethod: expenseData.paymentMethod, relatedInventoryTx: id }),
            performedBy: transaction.createdBy || null,
            ipAddress: reqContext?.ipAddress,
            userAgent: reqContext?.userAgent,
            createdAt: new Date(),
          } as any);
        }
      }
    });

    // Activity log (outside transaction for non-critical path)
    const actionType = transaction.type === 'in' ? 'stock_in' : transaction.type === 'out' ? 'stock_out' : 'adjustment';
    await this.logActivity({
      entityType: 'inventory_transaction',
      entityId: id,
      action: actionType,
      description: `${actionType.replace('_', ' ')} of ${transaction.quantity} units for item ${transaction.itemId}`,
      metadata: JSON.stringify({ itemId: transaction.itemId, type: transaction.type, quantity: transaction.quantity, reference: transaction.reference }),
      performedBy: transaction.createdBy || null,
      ipAddress: reqContext?.ipAddress,
      userAgent: reqContext?.userAgent,
    });

    const [t] = await db.select().from(inventoryTransactions).where(eq(inventoryTransactions.id, id));
    return t;
  }

  // ─── Activity Log Methods ─────────────────────────────────────────────────
  async logActivity(log: InsertActivityLog & { ipAddress?: string; userAgent?: string }): Promise<void> {
    try {
      const id = nanoid();
      await db.insert(activityLogs).values({ ...log, id } as any);
    } catch (err) {
      // Activity logging should never break the main operation
      console.error('Failed to log activity:', err);
    }
  }

  async getActivityLogs(filters?: { entityType?: string; limit?: number; offset?: number }): Promise<{ logs: ActivityLog[]; total: number }> {
    const conditions: any[] = [];
    
    if (filters?.entityType && filters.entityType !== 'all') {
      conditions.push(eq(activityLogs.entityType, filters.entityType));
    }

    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;

    // Get total count
    const countQuery = db.select({ count: sql<number>`COUNT(*)` }).from(activityLogs);
    if (conditions.length > 0) {
      (countQuery as any).where(and(...conditions));
    }
    const [countResult] = await countQuery;
    const total = Number(countResult?.count || 0);

    // Get paginated results
    let query = db.select().from(activityLogs);
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    const logs = await query
      .orderBy(desc(activityLogs.createdAt))
      .limit(limit)
      .offset(offset);

    return { logs, total };
  }

  // ─── Dashboard Chart Data Methods ─────────────────────────────────────────
  async getExpenseTrends(): Promise<Array<{ month: string; total: string }>> {
    const result = await db.execute(
      sql`SELECT DATE_FORMAT(date, '%Y-%m') as month, 
          CAST(SUM(amount) AS CHAR) as total 
          FROM expenses 
          WHERE deleted_at IS NULL 
          AND date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
          GROUP BY DATE_FORMAT(date, '%Y-%m') 
          ORDER BY month ASC`
    );
    return (result[0] as unknown as any[]).map((r: any) => ({ month: r.month, total: r.total || '0' }));
  }

  async getExpenseCategories(): Promise<Array<{ category: string; total: string }>> {
    const result = await db.execute(
      sql`SELECT category, 
          CAST(SUM(amount) AS CHAR) as total 
          FROM expenses 
          WHERE deleted_at IS NULL 
          AND DATE_FORMAT(date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')
          GROUP BY category 
          ORDER BY SUM(amount) DESC`
    );
    return (result[0] as unknown as any[]).map((r: any) => ({ category: r.category, total: r.total || '0' }));
  }

  async getInventoryMovements(): Promise<Array<{ month: string; stockIn: number; stockOut: number; adjustment: number }>> {
    const result = await db.execute(
      sql`SELECT DATE_FORMAT(transaction_date, '%Y-%m') as month,
          SUM(CASE WHEN type = 'in' THEN quantity ELSE 0 END) as stock_in,
          SUM(CASE WHEN type = 'out' THEN quantity ELSE 0 END) as stock_out,
          SUM(CASE WHEN type = 'adjustment' THEN ABS(quantity) ELSE 0 END) as adjustment
          FROM inventory_transactions 
          WHERE deleted_at IS NULL 
          AND transaction_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
          GROUP BY DATE_FORMAT(transaction_date, '%Y-%m') 
          ORDER BY month ASC`
    );
    return (result[0] as unknown as any[]).map((r: any) => ({
      month: r.month,
      stockIn: Number(r.stock_in || 0),
      stockOut: Number(r.stock_out || 0),
      adjustment: Number(r.adjustment || 0),
    }));
  }
}

export const storage = new DatabaseStorage();

