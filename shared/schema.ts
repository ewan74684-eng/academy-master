import { sql, relations } from "drizzle-orm";
import { 
  mysqlTable, 
  text, 
  varchar, 
  timestamp, 
  datetime,
  int as integer, 
  decimal, 
  boolean,
  date,
  mysqlEnum,
  unique,
  index,
  customType
} from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

const int11 = customType<{ data: number; driverData: number | string }>({
  dataType() {
    return "int(11)";
  },
  fromDriver(value) {
    return typeof value === "string" ? Number(value) : value;
  },
});

// Payment status as string literals (not MySQL ENUM) to allow ALTER-free migration
export const PAYMENT_STATUS_ALL = [
  'pending', 'completed', 'overdue', 'cancelled', 'refunded', 'partially_refunded'
] as const;
export type PaymentStatusValue = typeof PAYMENT_STATUS_ALL[number];

// Enum Values
export const ACTIVITY_VALUES = [
  'karate', 'kickboxing', 'football', 'swimming', 'zumba', 'aerobics', 'crossfit', 'gymnastics', 'quran_memorization', 'kindergarten',
  // Added categories (gymnastics already existed above and is intentionally not repeated)
  'muay_thai', 'special_needs', 'aqua_aerobics', 'basketball', 'volleyball'
] as const;

// Non-coaching staff paid through the trainers/payroll section (not offered to players)
export const STAFF_ROLE_VALUES = ['cleaning', 'reception'] as const;

export const TRAINER_ROLE_VALUES = [...ACTIVITY_VALUES, ...STAFF_ROLE_VALUES] as const;

export const PAYMENT_METHOD_VALUES = [
  'cash', 'visa', 'bank_transfer'
] as const;

// Keep legacy constant for backward compat, but status column is now VARCHAR
export const PAYMENT_STATUS_VALUES = [
  'pending', 'completed', 'overdue', 'cancelled', 'refunded', 'partially_refunded'
] as const;

export const SUBSCRIPTION_STATUS_VALUES = [
  'active', 'paused', 'expired', 'renewal_due', 'cancelled'
] as const;

export const SESSION_STATUS_VALUES = [
  'scheduled', 'attended', 'missed', 'cancelled'
] as const;

export const ATTENDANCE_STATUS_VALUES = [
  'present', 'absent', 'late', 'excused'
] as const;

export const EXPENSE_CATEGORY_VALUES = [
  'rent', 'utilities', 'maintenance', 'equipment', 'salary', 'marketing', 'transportation', 'other',
  // Added categories
  'water', 'electricity', 'license_fees', 'residency_fees', 'sewage',
  'internet', 'cleaning_supplies', 'pool_sanitization'
] as const;

export const INVENTORY_STATUS_VALUES = [
  'active', 'low_stock', 'out_of_stock', 'inactive', 'discontinued'
] as const;

export const INVENTORY_CONDITION_VALUES = [
  'new', 'good', 'damaged', 'expired'
] as const;

export const EXPENSE_STATUS_VALUES = [
  'pending', 'approved', 'rejected', 'paid'
] as const;

export const ACTIVITY_LOG_ACTION_VALUES = [
  'created', 'updated', 'deleted', 'stock_in', 'stock_out', 'adjustment', 'status_change'
] as const;

export const INVENTORY_TRANSACTION_TYPE_VALUES = [
  'in', 'out', 'adjustment'
] as const;

// Users table for admin authentication
export const users = mysqlTable("users", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  username: varchar("username", { length: 255 }).notNull().unique(),
  password: text("password").notNull(), // Hashed password
  role: varchar("role", { length: 20 }).notNull().default('admin'), // RBAC role
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Players table
export const players = mysqlTable("players", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  fullName: text("full_name").notNull(),
  dateOfBirth: date("date_of_birth").notNull(),
  phoneNumber: text("phone_number"),
  email: text("email"),
  discountPercentage: decimal("discount_percentage", { precision: 5, scale: 2 }).default('0'),
  specialNotes: text("special_notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Subscriptions table (New Architecture)
export const subscriptions = mysqlTable("subscriptions", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  playerId: varchar("player_id", { length: 36 }).notNull().references(() => players.id, { onDelete: 'cascade' }),
  activity: mysqlEnum("activity", ACTIVITY_VALUES).notNull(),
  startDate: datetime("start_date", { mode: 'date' }).notNull(),
  endDate: datetime("end_date", { mode: 'date' }).notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  sessionsAllowed: int11("sessions_allowed").notNull(),
  sessionsUsed: int11("sessions_used").notNull().default(0),
  status: mysqlEnum("status", SUBSCRIPTION_STATUS_VALUES).notNull().default('active'),
  paymentStatus: varchar("payment_status", { length: 30 }).notNull().default('pending'),
  createdBy: varchar("created_by", { length: 36 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  playerIdIdx: index("sub_player_id_idx").on(table.playerId),
  statusIdx: index("sub_status_idx").on(table.status),
}));

// Player documents table
export const playerDocuments = mysqlTable("player_documents", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  playerId: varchar("player_id", { length: 36 }).notNull().references(() => players.id, { onDelete: 'cascade' }),
  documentType: text("document_type").notNull(),
  fileName: text("file_name").notNull(),
  filePath: text("file_path").notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: text("mime_type").notNull(),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
});

// Payments table — paymentStatus is VARCHAR(30) so we can add new statuses without ALTER TABLE ENUM
export const payments = mysqlTable("payments", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  playerId: varchar("player_id", { length: 36 }).notNull().references(() => players.id, { onDelete: 'cascade' }),
  subscriptionFee: decimal("subscription_fee", { precision: 10, scale: 2 }).notNull(),
  amountPaid: decimal("amount_paid", { precision: 10, scale: 2 }).notNull(),
  remainingBalance: decimal("remaining_balance", { precision: 10, scale: 2 }).notNull().default('0'),
  paymentMethod: mysqlEnum("payment_method", PAYMENT_METHOD_VALUES).notNull(),
  paymentStatus: varchar("payment_status", { length: 30 }).notNull().default('completed'),
  paymentDate: timestamp("payment_date").notNull().defaultNow(),
  description: text("description"),
  receiptNumber: text("receipt_number").notNull().default(''),
  totalRefunded: decimal("total_refunded", { precision: 10, scale: 2 }).notNull().default('0'),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  playerIdIdx: index("pay_player_id_idx").on(table.playerId),
  paymentDateIdx: index("pay_date_idx").on(table.paymentDate),
}));

// Payment Refunds table — each row is an individual reversal record, never modifies original payment amounts
export const paymentRefunds = mysqlTable("payment_refunds", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  paymentId: varchar("payment_id", { length: 36 }).notNull().references(() => payments.id, { onDelete: 'cascade' }),
  playerId: varchar("player_id", { length: 36 }).notNull().references(() => players.id, { onDelete: 'cascade' }),
  refundAmount: decimal("refund_amount", { precision: 10, scale: 2 }).notNull(),
  refundMethod: varchar("refund_method", { length: 30 }).notNull().default('cash'),
  reason: text("reason"),
  // refunded_by is always populated server-side from the authenticated session — never from request body
  refundedBy: varchar("refunded_by", { length: 36 }),
  refundDate: timestamp("refund_date").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Payment History/Archive table for old payment records
export const paymentHistory = mysqlTable("payment_history", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  playerId: varchar("player_id", { length: 36 }).notNull().references(() => players.id, { onDelete: 'cascade' }),
  subscriptionFee: decimal("subscription_fee", { precision: 10, scale: 2 }).notNull(),
  amountPaid: decimal("amount_paid", { precision: 10, scale: 2 }).notNull(),
  remainingBalance: decimal("remaining_balance", { precision: 10, scale: 2 }).notNull().default('0'),
  paymentMethod: mysqlEnum("payment_method", PAYMENT_METHOD_VALUES).notNull(),
  paymentStatus: varchar("payment_status", { length: 30 }).notNull().default('completed'),
  paymentDate: timestamp("payment_date").notNull().defaultNow(),
  description: text("description"),
  receiptNumber: text("receipt_number").notNull().default(''),
  subscriptionPeriodStart: datetime("subscription_period_start", { mode: 'date' }).notNull(),
  subscriptionPeriodEnd: datetime("subscription_period_end", { mode: 'date' }).notNull(),
  archivedAt: timestamp("archived_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const paymentRefundHistory = mysqlTable("payment_refund_history", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  originalRefundId: varchar("original_refund_id", { length: 36 }).notNull(),
  paymentHistoryId: varchar("payment_history_id", { length: 36 }).notNull().references(() => paymentHistory.id, { onDelete: 'cascade' }),
  playerId: varchar("player_id", { length: 36 }).notNull().references(() => players.id, { onDelete: 'cascade' }),
  refundAmount: decimal("refund_amount", { precision: 10, scale: 2 }).notNull(),
  refundMethod: varchar("refund_method", { length: 30 }).notNull().default('cash'),
  reason: text("reason"),
  refundedBy: varchar("refunded_by", { length: 36 }),
  refundDate: timestamp("refund_date").notNull().defaultNow(),
  archivedAt: timestamp("archived_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Sessions table
export const sessions = mysqlTable("sessions", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  playerId: varchar("player_id", { length: 36 }).notNull().references(() => players.id, { onDelete: 'cascade' }),
  subscriptionId: varchar("subscription_id", { length: 36 }).notNull().references(() => subscriptions.id, { onDelete: 'cascade' }),
  sessionDate: datetime("session_date", { mode: 'date' }).notNull(),
  scheduledStartTime: datetime("scheduled_start_time", { mode: 'date' }).notNull(),
  scheduledEndTime: datetime("scheduled_end_time", { mode: 'date' }).notNull(),
  actualStartTime: datetime("actual_start_time", { mode: 'date' }),
  actualEndTime: datetime("actual_end_time", { mode: 'date' }),
  attendanceStatus: mysqlEnum("attendance_status", ATTENDANCE_STATUS_VALUES).notNull().default('present'),
  sessionStatus: mysqlEnum("session_status", SESSION_STATUS_VALUES).notNull().default('scheduled'),
  instructorName: text("instructor_name"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Relations
export const playersRelations = relations(players, ({ many }) => ({
  documents: many(playerDocuments),
  payments: many(payments),
  paymentHistory: many(paymentHistory),
  paymentRefunds: many(paymentRefunds),
  sessions: many(sessions),
  subscriptions: many(subscriptions),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  player: one(players, {
    fields: [subscriptions.playerId],
    references: [players.id],
  }),
  sessions: many(sessions),
}));

export const playerDocumentsRelations = relations(playerDocuments, ({ one }) => ({
  player: one(players, {
    fields: [playerDocuments.playerId],
    references: [players.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one, many }) => ({
  player: one(players, {
    fields: [payments.playerId],
    references: [players.id],
  }),
  refunds: many(paymentRefunds),
}));

export const paymentRefundsRelations = relations(paymentRefunds, ({ one }) => ({
  payment: one(payments, {
    fields: [paymentRefunds.paymentId],
    references: [payments.id],
  }),
  player: one(players, {
    fields: [paymentRefunds.playerId],
    references: [players.id],
  }),
}));

export const paymentHistoryRelations = relations(paymentHistory, ({ one, many }) => ({
  player: one(players, {
    fields: [paymentHistory.playerId],
    references: [players.id],
  }),
  refunds: many(paymentRefundHistory),
}));

export const paymentRefundHistoryRelations = relations(paymentRefundHistory, ({ one }) => ({
  paymentHistory: one(paymentHistory, {
    fields: [paymentRefundHistory.paymentHistoryId],
    references: [paymentHistory.id],
  }),
  player: one(players, {
    fields: [paymentRefundHistory.playerId],
    references: [players.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  player: one(players, {
    fields: [sessions.playerId],
    references: [players.id],
  }),
  subscription: one(subscriptions, {
    fields: [sessions.subscriptionId],
    references: [subscriptions.id],
  }),
}));

// ─── Trainer tables ──────────────────────────────────────────────────────────

export const TRAINER_ADVANCE_STATUS_VALUES = ['pending', 'deducted', 'repaid'] as const;

export const trainers = mysqlTable("trainers", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  activity: mysqlEnum("activity", TRAINER_ROLE_VALUES).notNull(),
  baseSalary: decimal("base_salary", { precision: 10, scale: 2 }).notNull().default('0'),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const trainerSalaryPayments = mysqlTable("trainer_salary_payments", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  trainerId: varchar("trainer_id", { length: 36 }).notNull().references(() => trainers.id, { onDelete: 'cascade' }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  month: varchar("month", { length: 7 }).notNull(), // YYYY-MM
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const trainerAdvances = mysqlTable("trainer_advances", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  trainerId: varchar("trainer_id", { length: 36 }).notNull().references(() => trainers.id, { onDelete: 'cascade' }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  remainingBalance: decimal("remaining_balance", { precision: 10, scale: 2 }).notNull(),
  status: mysqlEnum("status", TRAINER_ADVANCE_STATUS_VALUES).notNull().default('pending'),
  deductedAt: timestamp("deducted_at"),
  salaryPaymentId: varchar("salary_payment_id", { length: 36 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const trainerAdvanceRepayments = mysqlTable("trainer_advance_repayments", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  advanceId: varchar("advance_id", { length: 36 }).notNull().references(() => trainerAdvances.id, { onDelete: 'restrict' }),
  payrollId: varchar("payroll_id", { length: 36 }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  date: timestamp("date").notNull().defaultNow(),
});

export const trainerBonuses = mysqlTable("trainer_bonuses", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  trainerId: varchar("trainer_id", { length: 36 }).notNull().references(() => trainers.id, { onDelete: 'cascade' }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  month: varchar("month", { length: 7 }).notNull(), // YYYY-MM
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const TRAINER_PAYROLL_STATUS_VALUES = ['unpaid', 'partial', 'paid', 'over_advanced'] as const;

export const trainerPayrolls = mysqlTable("trainer_payrolls", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  trainerId: varchar("trainer_id", { length: 36 }).notNull().references(() => trainers.id, { onDelete: 'cascade' }),
  month: varchar("month", { length: 7 }).notNull(), // YYYY-MM
  baseSalary: decimal("base_salary", { precision: 10, scale: 2 }).notNull().default('0'),
  carryForward: decimal("carry_forward", { precision: 10, scale: 2 }).notNull().default('0'),
  totalBonuses: decimal("total_bonuses", { precision: 10, scale: 2 }).notNull().default('0'),
  totalAdvances: decimal("total_advances", { precision: 10, scale: 2 }).notNull().default('0'),
  totalPaid: decimal("total_paid", { precision: 10, scale: 2 }).notNull().default('0'),
  netPayable: decimal("net_payable", { precision: 10, scale: 2 }).notNull().default('0'),
  status: mysqlEnum("status", TRAINER_PAYROLL_STATUS_VALUES).notNull().default('unpaid'),
  isLocked: boolean("is_locked").notNull().default(false),
  lockedAt: timestamp("locked_at"),
  lockedBy: varchar("locked_by", { length: 36 }),
}, (table) => ({
  unqTrainerMonth: unique("unq_trainer_month").on(table.trainerId, table.month)
}));

// ─── Expenses ─────────────────────────────────────────────────────────────

export const expenses = mysqlTable("expenses", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  category: mysqlEnum("category", EXPENSE_CATEGORY_VALUES).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  date: timestamp("date").notNull().defaultNow(),
  description: text("description"),
  paymentMethod: mysqlEnum("payment_method", PAYMENT_METHOD_VALUES).notNull().default('cash'),
  receiptUrl: text("receipt_url"),
  createdBy: varchar("created_by", { length: 36 }).references(() => users.id),
  updatedBy: varchar("updated_by", { length: 36 }).references(() => users.id),
  status: varchar("status", { length: 20 }).notNull().default('pending'),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  // Soft delete
  deletedAt: datetime("deleted_at", { mode: 'date' }),
  deletedBy: varchar("deleted_by", { length: 36 }),
  deletedReason: text("deleted_reason"),
});

// ─── Inventory ────────────────────────────────────────────────────────────

export const inventoryItems = mysqlTable("inventory_items", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  sku: varchar("sku", { length: 100 }).unique(),
  category: text("category").notNull(), // tools, apparel, consumables, equipment
  quantity: int11("quantity").notNull().default(0),
  minQuantity: int11("min_quantity").notNull().default(0),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }),
  location: text("location"),
  status: mysqlEnum("status", INVENTORY_STATUS_VALUES).notNull().default('active'),
  condition: varchar("item_condition", { length: 20 }).notNull().default('new'),
  imageUrl: text("image_url"),
  notes: text("notes"),
  createdBy: varchar("created_by", { length: 36 }).references(() => users.id),
  updatedBy: varchar("updated_by", { length: 36 }).references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  // Soft delete
  deletedAt: datetime("deleted_at", { mode: 'date' }),
  deletedBy: varchar("deleted_by", { length: 36 }),
  deletedReason: text("deleted_reason"),
});

export const inventoryTransactions = mysqlTable("inventory_transactions", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  itemId: varchar("item_id", { length: 36 }).notNull().references(() => inventoryItems.id, { onDelete: 'cascade' }),
  type: mysqlEnum("type", INVENTORY_TRANSACTION_TYPE_VALUES).notNull(),
  quantity: int11("quantity").notNull(),
  balanceAfter: int11("balance_after").notNull().default(0),
  unitCostAtTransaction: decimal("unit_cost_at_transaction", { precision: 10, scale: 2 }),
  transactionDate: timestamp("transaction_date").notNull().defaultNow(),
  reference: text("reference"),
  notes: text("notes"),
  createdBy: varchar("created_by", { length: 36 }).references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  // Soft delete
  deletedAt: datetime("deleted_at", { mode: 'date' }),
  deletedBy: varchar("deleted_by", { length: 36 }),
  deletedReason: text("deleted_reason"),
});

// ─── Activity Logs ────────────────────────────────────────────────────────

export const activityLogs = mysqlTable("activity_logs", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: varchar("entity_id", { length: 36 }).notNull(),
  action: varchar("action", { length: 30 }).notNull(),
  description: text("description").notNull(),
  metadata: text("metadata"), // JSON string
  performedBy: varchar("performed_by", { length: 36 }),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Accounting Periods ───────────────────────────────────────────────────

export const accountingPeriods = mysqlTable("accounting_periods", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  yearMonth: varchar("year_month", { length: 7 }).notNull().unique(), // YYYY-MM
  isClosed: boolean("is_closed").notNull().default(false),
  closedAt: timestamp("closed_at"),
  closedBy: varchar("closed_by", { length: 36 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Audit Trail ──────────────────────────────────────────────────────────

export const auditLogs = mysqlTable("audit_logs", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  tableName: varchar("table_name", { length: 64 }).notNull(),
  recordId: varchar("record_id", { length: 36 }).notNull(),
  action: varchar("action", { length: 20 }).notNull(), // INSERT, UPDATE, DELETE
  oldValues: text("old_values"), // JSON
  newValues: text("new_values"), // JSON
  performedBy: varchar("performed_by", { length: 36 }),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

// ─── Relations ────────────────────────────────────────────────────────────

export const inventoryItemsRelations = relations(inventoryItems, ({ many }) => ({
  transactions: many(inventoryTransactions),
}));

export const inventoryTransactionsRelations = relations(inventoryTransactions, ({ one }) => ({
  item: one(inventoryItems, {
    fields: [inventoryTransactions.itemId],
    references: [inventoryItems.id],
  }),
}));

// Trainer relations
export const trainersRelations = relations(trainers, ({ many }) => ({
  salaryPayments: many(trainerSalaryPayments),
  advances: many(trainerAdvances),
  bonuses: many(trainerBonuses),
  payrolls: many(trainerPayrolls),
}));

export const trainerSalaryPaymentsRelations = relations(trainerSalaryPayments, ({ one }) => ({
  trainer: one(trainers, {
    fields: [trainerSalaryPayments.trainerId],
    references: [trainers.id],
  }),
}));

export const trainerAdvancesRelations = relations(trainerAdvances, ({ one, many }) => ({
  trainer: one(trainers, {
    fields: [trainerAdvances.trainerId],
    references: [trainers.id],
  }),
  repayments: many(trainerAdvanceRepayments),
}));

export const trainerAdvanceRepaymentsRelations = relations(trainerAdvanceRepayments, ({ one }) => ({
  advance: one(trainerAdvances, {
    fields: [trainerAdvanceRepayments.advanceId],
    references: [trainerAdvances.id],
  }),
  payroll: one(trainerPayrolls, {
    fields: [trainerAdvanceRepayments.payrollId],
    references: [trainerPayrolls.id],
  }),
}));

export const trainerBonusesRelations = relations(trainerBonuses, ({ one }) => ({
  trainer: one(trainers, {
    fields: [trainerBonuses.trainerId],
    references: [trainers.id],
  }),
}));

export const trainerPayrollsRelations = relations(trainerPayrolls, ({ one }) => ({
  trainer: one(trainers, {
    fields: [trainerPayrolls.trainerId],
    references: [trainers.id],
  }),
}));

// Types
export type User = typeof users.$inferSelect;
export const insertUserSchema = createInsertSchema(users);
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Player = typeof players.$inferSelect;
export const insertPlayerSchema = createInsertSchema(players).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPlayer = Omit<typeof players.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>;

export type Subscription = typeof subscriptions.$inferSelect;
export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({ id: true, createdAt: true, updatedAt: true })
  .refine(data => parseFloat(data.price as string) >= 0, { message: "Price cannot be negative", path: ["price"] })
  .refine(data => data.sessionsAllowed >= 0, { message: "Sessions allowed cannot be negative", path: ["sessionsAllowed"] })
  .refine(data => (data.sessionsUsed ?? 0) >= 0, { message: "Sessions used cannot be negative", path: ["sessionsUsed"] });
export type InsertSubscription = Omit<typeof subscriptions.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>;

export type PlayerDocument = typeof playerDocuments.$inferSelect;
export const insertPlayerDocumentSchema = createInsertSchema(playerDocuments);
export type InsertPlayerDocument = z.infer<typeof insertPlayerDocumentSchema>;

export type Payment = typeof payments.$inferSelect;
export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
  receiptNumber: true,
})
  .refine(data => parseFloat(data.subscriptionFee as string) >= 0, { message: "Subscription fee cannot be negative", path: ["subscriptionFee"] })
  .refine(data => parseFloat(data.amountPaid as string) >= 0, { message: "Amount paid cannot be negative", path: ["amountPaid"] });
export type InsertPayment = Omit<typeof payments.$inferInsert, 'id' | 'createdAt' | 'receiptNumber'>;

export type PaymentRefund = typeof paymentRefunds.$inferSelect;
export const insertPaymentRefundSchema = createInsertSchema(paymentRefunds).omit({
  id: true,
  createdAt: true,
  refundDate: true,
})
  .refine(data => parseFloat(data.refundAmount as string) > 0, { message: "Refund amount must be positive", path: ["refundAmount"] });
export type InsertPaymentRefund = Omit<typeof paymentRefunds.$inferInsert, 'id' | 'createdAt' | 'refundDate'>;

export type PaymentHistory = typeof paymentHistory.$inferSelect;
export const insertPaymentHistorySchema = createInsertSchema(paymentHistory).omit({
  id: true,
  createdAt: true,
  archivedAt: true,
});
export type InsertPaymentHistory = Omit<typeof paymentHistory.$inferInsert, 'id' | 'createdAt' | 'archivedAt'>;

export type PaymentRefundHistory = typeof paymentRefundHistory.$inferSelect;
export const insertPaymentRefundHistorySchema = createInsertSchema(paymentRefundHistory).omit({
  id: true,
  archivedAt: true,
});
export type InsertPaymentRefundHistory = Omit<typeof paymentRefundHistory.$inferInsert, 'id' | 'archivedAt'>;

export type Session = typeof sessions.$inferSelect;
export const insertSessionSchema = createInsertSchema(sessions).omit({
  id: true,
  createdAt: true,
});
export type InsertSession = Omit<typeof sessions.$inferInsert, 'id' | 'createdAt'>;

// Trainer types
export type Trainer = typeof trainers.$inferSelect;
export const insertTrainerSchema = createInsertSchema(trainers).omit({ id: true, createdAt: true });
export type InsertTrainer = Omit<typeof trainers.$inferInsert, 'id' | 'createdAt'>;

export type TrainerSalaryPayment = typeof trainerSalaryPayments.$inferSelect;
export const insertTrainerSalaryPaymentSchema = createInsertSchema(trainerSalaryPayments).omit({ id: true, createdAt: true });
export type InsertTrainerSalaryPayment = Omit<typeof trainerSalaryPayments.$inferInsert, 'id' | 'createdAt'>;

export type TrainerAdvance = typeof trainerAdvances.$inferSelect;
export const insertTrainerAdvanceSchema = createInsertSchema(trainerAdvances).omit({ id: true, createdAt: true, deductedAt: true, salaryPaymentId: true, status: true });
export type InsertTrainerAdvance = Omit<typeof trainerAdvances.$inferInsert, 'id' | 'createdAt' | 'deductedAt' | 'salaryPaymentId' | 'status'>;

export type TrainerBonus = typeof trainerBonuses.$inferSelect;
export const insertTrainerBonusSchema = createInsertSchema(trainerBonuses).omit({ id: true, createdAt: true });
export type InsertTrainerBonus = Omit<typeof trainerBonuses.$inferInsert, 'id' | 'createdAt'>;

export type TrainerPayroll = typeof trainerPayrolls.$inferSelect;
export const insertTrainerPayrollSchema = createInsertSchema(trainerPayrolls).omit({ id: true });
export type InsertTrainerPayroll = Omit<typeof trainerPayrolls.$inferInsert, 'id'>;

// Expenses types
export type Expense = typeof expenses.$inferSelect;
export const insertExpenseSchema = createInsertSchema(expenses).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true, deletedBy: true, deletedReason: true });
export type InsertExpense = Omit<typeof expenses.$inferInsert, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'deletedBy' | 'deletedReason'>;

// Inventory types
export type InventoryItem = typeof inventoryItems.$inferSelect;
export const insertInventoryItemSchema = createInsertSchema(inventoryItems).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true, deletedBy: true, deletedReason: true });
export type InsertInventoryItem = Omit<typeof inventoryItems.$inferInsert, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'deletedBy' | 'deletedReason'>;

export type InventoryTransaction = typeof inventoryTransactions.$inferSelect;
export const insertInventoryTransactionSchema = createInsertSchema(inventoryTransactions).omit({ id: true, createdAt: true, balanceAfter: true, unitCostAtTransaction: true, deletedAt: true, deletedBy: true, deletedReason: true });
export type InsertInventoryTransaction = Omit<typeof inventoryTransactions.$inferInsert, 'id' | 'createdAt' | 'balanceAfter' | 'unitCostAtTransaction' | 'deletedAt' | 'deletedBy' | 'deletedReason'>;

// Activity Log types
export type ActivityLog = typeof activityLogs.$inferSelect;
export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({ id: true, createdAt: true });
export type InsertActivityLog = Omit<typeof activityLogs.$inferInsert, 'id' | 'createdAt'>;

// Activity display mapping

export type TrainerAdvanceRepayment = typeof trainerAdvanceRepayments.$inferSelect;
export const insertTrainerAdvanceRepaymentSchema = createInsertSchema(trainerAdvanceRepayments).omit({ id: true, date: true });
export type InsertTrainerAdvanceRepayment = Omit<typeof trainerAdvanceRepayments.$inferInsert, 'id' | 'date'>;

export type AccountingPeriod = typeof accountingPeriods.$inferSelect;
export const insertAccountingPeriodSchema = createInsertSchema(accountingPeriods).omit({ id: true, createdAt: true });
export type InsertAccountingPeriod = Omit<typeof accountingPeriods.$inferInsert, 'id' | 'createdAt'>;

export type AuditLog = typeof auditLogs.$inferSelect;
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, timestamp: true });
export type InsertAuditLog = Omit<typeof auditLogs.$inferInsert, 'id' | 'timestamp'>;
export const ACTIVITY_DISPLAY = {
  karate: { emoji: '🥋', label: 'Karate' },
  kickboxing: { emoji: '🥊', label: 'Kickboxing' },
  football: { emoji: '⚽', label: 'Football' },
  swimming: { emoji: '🏊🏼', label: 'Swimming' },
  zumba: { emoji: '💃', label: 'Zumba' },
  aerobics: { emoji: '🏋🏻‍♂️', label: 'Aerobics' },
  crossfit: { emoji: '🏋🏻‍♂️', label: 'CrossFit' },
  gymnastics: { emoji: '👯‍♀️', label: 'Gymnastics' },
  quran_memorization: { emoji: '📖', label: 'Quran Memorization' },
  kindergarten: { emoji: '🎒', label: 'Kindergarten' },
  muay_thai: { emoji: '🥊', label: 'Muay Thai Boxing' },
  special_needs: { emoji: '🧩', label: 'Special Needs' },
  aqua_aerobics: { emoji: '🌊', label: 'Aqua Aerobics' },
  basketball: { emoji: '🏀', label: 'Basketball' },
  volleyball: { emoji: '🏐', label: 'Volleyball' },
} as const;

export const STAFF_ROLE_DISPLAY = {
  cleaning: { emoji: '🧹', label: 'Cleaning Worker' },
  reception: { emoji: '🛎️', label: 'Receptionist' },
} as const;

// Everything a trainer/staff member can be assigned to
export const TRAINER_ROLE_DISPLAY = { ...ACTIVITY_DISPLAY, ...STAFF_ROLE_DISPLAY } as const;
