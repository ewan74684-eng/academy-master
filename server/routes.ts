import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage, ALLOWED_REFUND_METHODS } from "./storage";
import { insertPlayerSchema, insertPaymentSchema, insertSessionSchema, subscriptions } from "@shared/schema";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import multer from "multer";
import path from "path";
import { requireRole } from "./auth";
import { uploadToCloudinary, deleteFromCloudinary, extractPublicId } from "./cloudinary";
// Rate limiting definitions moved to index.ts

// File signature validation (Magic Bytes) — works on Buffer directly
function validateFileSignatureFromBuffer(buffer: Buffer): boolean {
  if (!buffer || buffer.length < 4) return false;
  const hex = buffer.subarray(0, 4).toString('hex').toUpperCase();
  // JPEG: FFD8FF, PNG: 89504E47, PDF: 25504446
  return hex.startsWith('FFD8FF') || hex.startsWith('89504E47') || hex.startsWith('25504446');
}

// Configure multer for file uploads — memory storage (files go to Cloudinary)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only .png, .jpg, .jpeg and .pdf format allowed!'));
    }
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Authentication middleware for API routes
  app.use('/api', (req, res, next) => {
    // Allow authentication endpoints to go through without check
    const publicPaths = ['/login', '/logout', '/user'];
    if (publicPaths.includes(req.path)) {
      return next();
    }
    
    // Check if user is authenticated for all other API routes
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({ message: "Authentication required" });
    }
    
    next();
  });

  // Dashboard routes - Require Admin Role
  app.get("/api/dashboard/stats", requireRole(['admin']), async (req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ message: "Failed to fetch dashboard statistics" });
    }
  });

  app.get("/api/dashboard/upcoming-renewals", async (req, res) => {
    try {
      const renewals = await storage.getUpcomingRenewals();
      res.json(renewals);
    } catch (error) {
      console.error("Error fetching upcoming renewals:", error);
      res.status(500).json({ message: "Failed to fetch upcoming renewals" });
    }
  });

  app.get("/api/dashboard/recent-activities", async (req, res) => {
    try {
      const activities = await storage.getRecentActivities();
      res.json(activities);
    } catch (error) {
      console.error("Error fetching recent activities:", error);
      res.status(500).json({ message: "Failed to fetch recent activities" });
    }
  });

  app.get("/api/dashboard/renewal-notifications", async (req, res) => {
    try {
      const notifications = await storage.getRenewalNotifications();
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching renewal notifications:", error);
      res.status(500).json({ message: "Failed to fetch renewal notifications" });
    }
  });

  // Player routes
  app.get("/api/players", async (req, res) => {
    try {
      const { activity } = req.query;
      let players;
      
      if (activity && typeof activity === 'string') {
        players = await storage.getPlayersByActivity(activity);
      } else {
        players = await storage.getPlayers();
      }
      
      res.json(players);
    } catch (error) {
      console.error("Error fetching players:", error);
      res.status(500).json({ message: "Failed to fetch players" });
    }
  });

  app.get("/api/players/:id", async (req, res) => {
    try {
      const player = await storage.getPlayer(req.params.id);
      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }
      
      // Get player documents and payments
      const documents = await storage.getPlayerDocuments(player.id);
      const payments = await storage.getPlayerPayments(player.id);
      const sessions = await storage.getPlayerSessions(player.id);
      
      res.json({
        ...player,
        documents,
        payments,
        sessions
      });
    } catch (error) {
      console.error("Error fetching player:", error);
      res.status(500).json({ message: "Failed to fetch player details" });
    }
  });

  app.post("/api/players", upload.fields([
    { name: 'idDocument', maxCount: 1 },
    { name: 'medicalForm', maxCount: 1 }
  ]), async (req, res) => {
    try {
      // Parse subscription date and end date
      const subscriptionDate = new Date(req.body.subscriptionDate);
      
      // Use provided end date or calculate renewal date (subscription date + 1 month)
      let renewalDate: Date;
      let subscriptionEndDate: Date;
      
      if (req.body.subscriptionEndDate && req.body.subscriptionEndDate.trim() !== '') {
        subscriptionEndDate = new Date(req.body.subscriptionEndDate);
        renewalDate = new Date(req.body.subscriptionEndDate);
      } else {
        renewalDate = new Date(subscriptionDate);
        renewalDate.setMonth(renewalDate.getMonth() + 1);
        subscriptionEndDate = new Date(renewalDate);
      }

      // Validate player data
      const playerData = insertPlayerSchema.parse({
        fullName: req.body.fullName,
        dateOfBirth: new Date(req.body.dateOfBirth),
        phoneNumber: req.body.phoneNumber || null,
        email: req.body.email || null,
        activity: req.body.activity,
        subscriptionDate: subscriptionDate,
        renewalDate: renewalDate,
        subscriptionEndDate: subscriptionEndDate,
        totalSessionsAllowed: parseInt(req.body.totalSessionsAllowed) || 8,
        monthlySubscriptionFee: Array.isArray(req.body.subscriptionFee) ? req.body.subscriptionFee[0] : (req.body.subscriptionFee || "200"),
        discountPercentage: Array.isArray(req.body.discountPercentage) ? req.body.discountPercentage[0] : (req.body.discountPercentage || "0"),
        specialNotes: req.body.specialNotes || null,
      });

      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
      const documents: any[] = [];
      
      if (files?.idDocument) {
        const file = files.idDocument[0];
        if (!validateFileSignatureFromBuffer(file.buffer)) {
          return res.status(400).json({ message: "Invalid ID document file signature. File is potentially malicious." });
        }
        const uploaded = await uploadToCloudinary(file.buffer, { folder: 'academy-uploads/documents', resourceType: file.mimetype === 'application/pdf' ? 'raw' : 'image' });
        documents.push({
          documentType: 'id',
          fileName: file.originalname,
          filePath: uploaded.url,
          fileSize: file.size,
          mimeType: file.mimetype,
        });
      }

      if (files?.medicalForm) {
        const file = files.medicalForm[0];
        if (!validateFileSignatureFromBuffer(file.buffer)) {
          return res.status(400).json({ message: "Invalid medical form file signature. File is potentially malicious." });
        }
        const uploaded = await uploadToCloudinary(file.buffer, { folder: 'academy-uploads/documents', resourceType: file.mimetype === 'application/pdf' ? 'raw' : 'image' });
        documents.push({
          documentType: 'medical_form',
          fileName: file.originalname,
          filePath: uploaded.url,
          fileSize: file.size,
          mimeType: file.mimetype,
        });
      }

      const subscriptionFee = Array.isArray(req.body.subscriptionFee) ? req.body.subscriptionFee[0] : (req.body.subscriptionFee || "200");
      const amountPaidInput = Array.isArray(req.body.amountPaid) ? req.body.amountPaid[0] : (req.body.amountPaid || '0');
      const amountPaid = parseFloat(amountPaidInput);
      const parsedFee = parseFloat(subscriptionFee);

      if (isNaN(parsedFee) || parsedFee < 0) {
        return res.status(400).json({ message: "Subscription fee cannot be negative" });
      }
      if (isNaN(amountPaid) || amountPaid < 0) {
        return res.status(400).json({ message: "Amount paid cannot be negative" });
      }
      if (amountPaid > parsedFee) {
        return res.status(400).json({ message: "Amount paid cannot exceed subscription fee" });
      }

      let paymentData: any = undefined;
      if (parsedFee > 0 && amountPaid > 0) {
        paymentData = {
          subscriptionFee: subscriptionFee,
          amountPaid: amountPaid.toString(),
          remainingBalance: (parseFloat(subscriptionFee) - amountPaid).toString(),
          paymentMethod: Array.isArray(req.body.paymentMethod) ? req.body.paymentMethod[0] : (req.body.paymentMethod || 'cash'),
          description: 'Initial subscription payment',
        };
      }

      const subscriptionData = {
        activity: req.body.activity || 'football',
        status: 'active' as const,
        startDate: subscriptionDate,
        endDate: subscriptionEndDate,
        sessionsAllowed: parseInt(req.body.totalSessionsAllowed) || 8,
        sessionsUsed: 0,
        price: subscriptionFee,
      };

      const player = await storage.createPlayerWithSubscription(playerData, subscriptionData, paymentData, documents);

      res.status(201).json(player);
    } catch (error) {
      console.error("Error creating player:", error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to create player" });
    }
  });

  app.put("/api/players/:id", async (req, res) => {
    try {
      const currentPlayer = await storage.getPlayer(req.params.id);
      if (!currentPlayer) {
        return res.status(404).json({ message: "Player not found" });
      }

      // Convert date strings to Date objects and calculate renewal date if subscription date is provided
      const updateData: Record<string, any> = { ...req.body };
      
      if (req.body.dateOfBirth) {
        updateData.dateOfBirth = new Date(req.body.dateOfBirth);
      }
      
      if (req.body.subscriptionDate) {
        updateData.subscriptionDate = new Date(req.body.subscriptionDate);
        // Update renewalDate when subscriptionDate changes
        if (req.body.subscriptionEndDate) {
          updateData.renewalDate = new Date(req.body.subscriptionEndDate);
        } else {
          const renewalDate = new Date(updateData.subscriptionDate);
          renewalDate.setMonth(renewalDate.getMonth() + 1);
          updateData.renewalDate = renewalDate;
        }
      }
      
      if (req.body.subscriptionEndDate) {
        updateData.subscriptionEndDate = new Date(req.body.subscriptionEndDate);
        // Also update renewalDate to match subscriptionEndDate
        updateData.renewalDate = new Date(req.body.subscriptionEndDate);
      }
      
      if (req.body.pausedDate) {
        updateData.pausedDate = new Date(req.body.pausedDate);
      }

      const playerData = insertPlayerSchema.partial().parse(updateData);
      await storage.updatePlayer(req.params.id, playerData);

      // Subscription-related fields (status, sessions allowed, price, activity, dates) live on the
      // subscriptions table, not the players table, so they must be updated separately. We target the
      // latest subscription for this player (the same one getPlayer reads from) so edits always persist.
      const [latestSub] = await db.select().from(subscriptions)
        .where(eq(subscriptions.playerId, req.params.id))
        .orderBy(desc(subscriptions.createdAt))
        .limit(1);

      if (latestSub) {
        const updateSubData: any = { updatedAt: new Date() };
        if (req.body.activity) updateSubData.activity = req.body.activity;
        if (req.body.subscriptionDate) updateSubData.startDate = new Date(req.body.subscriptionDate);
        if (req.body.subscriptionEndDate) updateSubData.endDate = new Date(req.body.subscriptionEndDate);
        if (req.body.subscriptionStatus) updateSubData.status = req.body.subscriptionStatus;
        if (req.body.totalSessionsAllowed !== undefined && req.body.totalSessionsAllowed !== null && req.body.totalSessionsAllowed !== '') {
          updateSubData.sessionsAllowed = parseInt(req.body.totalSessionsAllowed);
        }
        if (req.body.monthlySubscriptionFee !== undefined && req.body.monthlySubscriptionFee !== null && req.body.monthlySubscriptionFee !== '') {
          updateSubData.price = String(req.body.monthlySubscriptionFee);
        }

        await db.update(subscriptions)
          .set(updateSubData)
          .where(eq(subscriptions.id, latestSub.id));
      }

      // Re-read so the response reflects the updated subscription (status, sessions, finalPrice, etc.)
      const player = await storage.getPlayer(req.params.id);

      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }
      
      res.json(player);
    } catch (error) {
      console.error("Error updating player:", error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to update player" });
    }
  });

  // Player renewal route
  app.post("/api/players/:id/renew", async (req, res) => {
    try {
      const { id } = req.params;
      const { 
        subscriptionFee, 
        totalSessionsAllowed, 
        subscriptionStartDate,
        subscriptionEndDate,
        amountPaid = 0, 
        paymentMethod = 'cash', 
        description = 'Subscription renewal' 
      } = req.body;
      
      // Get current player
      const currentPlayer = await storage.getPlayer(id);
      if (!currentPlayer) {
        return res.status(404).json({ message: "Player not found" });
      }

      // Fetch the active subscription to carry forward parameters
      const [activeSub] = await db.select().from(subscriptions)
        .where(and(eq(subscriptions.playerId, id), eq(subscriptions.status, 'active')));
      
      const currentActivity = activeSub?.activity || 'football';
      const currentTotalSessions = activeSub?.sessionsAllowed || 8;
      const currentFee = activeSub?.price || '200';
      
      // Use provided dates or calculate new dates
      const newSubscriptionDate = subscriptionStartDate ? new Date(subscriptionStartDate) : new Date();
      const newRenewalDate = subscriptionEndDate ? new Date(subscriptionEndDate) : (() => {
        const calculated = new Date(newSubscriptionDate);
        calculated.setMonth(calculated.getMonth() + 1);
        return calculated;
      })();
      
      // Update player
      const renewalData = {};

      const newSubscriptionFee = parseFloat(subscriptionFee) || parseFloat(currentFee) || 0;
      const paymentAmount = parseFloat(amountPaid) || 0;

      if (isNaN(newSubscriptionFee) || newSubscriptionFee < 0) {
        return res.status(400).json({ message: "Subscription fee cannot be negative" });
      }
      if (isNaN(paymentAmount) || paymentAmount < 0) {
        return res.status(400).json({ message: "Amount paid cannot be negative" });
      }
      if (paymentAmount > newSubscriptionFee) {
        return res.status(400).json({ message: "Amount paid cannot exceed subscription fee" });
      }

      let paymentData: any = undefined;
      if (newSubscriptionFee > 0 && paymentAmount > 0) {
        const remainingBalance = newSubscriptionFee - paymentAmount;
        paymentData = {
          subscriptionFee: newSubscriptionFee.toString(),
          amountPaid: paymentAmount.toString(),
          remainingBalance: remainingBalance.toString(),
          paymentMethod: paymentMethod,
          description: description || "Payment for new subscription period",
        };
      }

      const subscriptionData = {
        activity: currentActivity,
        status: 'active' as const,
        startDate: newSubscriptionDate,
        endDate: newRenewalDate,
        sessionsAllowed: totalSessionsAllowed || currentTotalSessions,
        sessionsUsed: 0,
        price: newSubscriptionFee.toString(),
      };

      const updatedPlayer = await storage.renewPlayerSubscription(id, renewalData, subscriptionData, paymentData);
      
      res.json(updatedPlayer);
    } catch (error) {
      console.error("Error renewing player subscription:", error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to renew subscription" });
    }
  });

  app.delete("/api/players/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
      // First get player to check if exists
      const player = await storage.getPlayer(id);
      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }

      // Get player documents to clean up files
      const documents = await storage.getPlayerDocuments(id);
      
      // Delete the player (this should cascade delete related records)
      const deleted = await storage.deletePlayer(id);
      
      if (!deleted) {
        return res.status(500).json({ message: "Failed to delete player" });
      }

      // Clean up document files from Cloudinary
      for (const doc of documents) {
        try {
          const publicId = extractPublicId(doc.filePath);
          if (publicId) {
            await deleteFromCloudinary(publicId, doc.mimeType?.startsWith('application/pdf') ? 'raw' : 'image');
          }
        } catch (fileError) {
          console.warn("Could not delete document from Cloudinary:", fileError);
        }
      }

      res.json({ message: "Player deleted successfully" });
    } catch (error) {
      console.error("Error deleting player:", error);
      res.status(500).json({ message: "Failed to delete player" });
    }
  });

  // Payment routes
  app.get("/api/payments", async (req, res) => {
    try {
      const playerId = req.query.playerId as string;
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      
      if (playerId && playerId !== "all") {
        // Fetch payments for specific player with date filtering
        let payments = await storage.getPlayerPayments(playerId);
        
        // Apply date filtering if provided
        if (startDate && endDate) {
          const start = new Date(startDate);
          const end = new Date(endDate);
          payments = payments.filter((payment: any) => {
            const paymentDate = new Date(payment.paymentDate);
            return paymentDate >= start && paymentDate <= end;
          });
        }
        
        res.json(payments);
      } else {
        // Fetch all payments with date filtering
        let payments = await storage.getPayments();
        
        // Apply date filtering if provided
        if (startDate && endDate) {
          const start = new Date(startDate);
          const end = new Date(endDate);
          payments = payments.filter((payment: any) => {
            const paymentDate = new Date(payment.paymentDate);
            return paymentDate >= start && paymentDate <= end;
          });
        }
        
        res.json(payments);
      }
    } catch (error) {
      console.error("Error fetching payments:", error);
      res.status(500).json({ message: "Failed to fetch payments" });
    }
  });

  app.get("/api/payments/history/:playerId", async (req, res) => {
    try {
      const { playerId } = req.params;
      const paymentHistory = await storage.getPlayerPaymentHistory(playerId);
      res.json(paymentHistory);
    } catch (error) {
      console.error("Error fetching payment history:", error);
      res.status(500).json({ message: "Failed to fetch payment history" });
    }
  });

  app.post("/api/payments", async (req, res) => {
    try {
      const paymentData = insertPaymentSchema.parse(req.body);
      const payment = await storage.createPayment(paymentData);
      
      // Setting player to active status because they made a payment
      await storage.updatePlayerSubscriptionStatus((paymentData as any).playerId, 'active');

      res.status(201).json(payment);
    } catch (error) {
      console.error("Error creating payment:", error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to create payment" });
    }
  });

  app.post("/api/payments/additional", async (req, res) => {
    try {
      const { playerId, amountPaid, paymentMethod, description } = req.body;

      // Get player to access subscription fee
      const player = await storage.getPlayer(playerId);
      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }

      // Get all payments for this player to calculate total paid
      const playerPayments = await storage.getPlayerPayments(playerId);
      
      // Use player's monthly subscription fee as the baseline
      const subscriptionFee = parseFloat((player as any).monthlySubscriptionFee || '0');
      
      // Calculate total paid so far
      const totalPaidSoFar = playerPayments.reduce((sum: number, payment: any) => {
        return sum + parseFloat(payment.amountPaid);
      }, 0);
      
      const newAmountPaid = parseFloat(amountPaid);
      if (isNaN(newAmountPaid) || newAmountPaid <= 0) {
        return res.status(400).json({ message: "Amount paid must be greater than zero" });
      }
      
      const newTotalPaid = totalPaidSoFar + newAmountPaid;
      const newRemainingBalance = Math.max(0, subscriptionFee - newTotalPaid);

      // Validate that the new payment doesn't exceed subscription fee
      if (newTotalPaid > subscriptionFee) {
        return res.status(400).json({ 
          message: `Payment amount exceeds subscription fee. Maximum payment allowed: AED ${(subscriptionFee - totalPaidSoFar).toFixed(2)}`
        });
      }

      // Generate receipt number
      const receiptNumber = `RCT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const paymentData = {
        playerId: playerId,
        subscriptionFee: subscriptionFee.toString(),
        amountPaid: newAmountPaid.toString(),
        remainingBalance: newRemainingBalance.toString(),
        paymentMethod: paymentMethod,
        description: description || 'Additional subscription payment',
        receiptNumber: receiptNumber,
      };

      const payment = await storage.createPayment(paymentData);

      // Setting player to active status because they made a payment
      await storage.updatePlayerSubscriptionStatus(playerId, 'active');

      res.status(201).json(payment);
    } catch (error) {
      console.error("Error creating additional payment:", error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to create payment" });
    }
  });

  // ─── Payment Refund routes ──────────────────────────────────────────────────

  app.post("/api/payments/:paymentId/refund", async (req, res) => {
    try {
      const { paymentId } = req.params;
      const { refundAmount, refundMethod, reason } = req.body;

      // ── 1. Extract authenticated admin from session (NEVER from body) ────────
      // Passport.js populates req.user from the session after successful login.
      // Accepting refundedBy from the request body would allow spoofing.
      const refundedBy: string | undefined = (req.user as any)?.id;

      // ── 2. Validate refund method against strict allowlist ─────────────────
      const normalizedMethod = (refundMethod ?? 'cash').toString().toLowerCase().trim();
      if (!(ALLOWED_REFUND_METHODS as readonly string[]).includes(normalizedMethod)) {
        return res.status(400).json({
          message: `Invalid refund method '${normalizedMethod}'. Allowed values: ${ALLOWED_REFUND_METHODS.join(', ')}`,
        });
      }

      // ── 3. Validate amount ─────────────────────────────────────────────────
      if (!refundAmount || isNaN(parseFloat(refundAmount)) || parseFloat(refundAmount) <= 0) {
        return res.status(400).json({ message: "refundAmount must be a positive number" });
      }

      // ── 4. Validate reason ─────────────────────────────────────────────────
      if (!reason || reason.trim().length < 3) {
        return res.status(400).json({ message: "Refund reason is required (min 3 characters)" });
      }

      // ── 5. Verify payment exists ───────────────────────────────────────────
      const payment = await storage.getPayment(paymentId);
      if (!payment) {
        return res.status(404).json({ message: "Payment not found" });
      }

      // ── 6. Delegate to storage — playerId is derived from payment, NOT from body
      const refund = await storage.createPaymentRefund(
        {
          paymentId,
          playerId: payment.playerId,   // always server-side, never body
          refundAmount: String(parseFloat(refundAmount)),
          refundMethod: normalizedMethod,
          reason: reason.trim(),
        },
        refundedBy,
      );

      // Return updated payment state and summary for the UI to sync
      const updatedPayment = await storage.getPayment(paymentId);
      const summary = await storage.getRefundSummary(paymentId);

      res.status(201).json({ refund, payment: updatedPayment, summary });
    } catch (error) {
      console.error("Error creating refund:", error);
      const msg = error instanceof Error ? error.message : "Failed to process refund";
      const status = msg.includes('not found') ? 404
                   : msg.includes('Cannot refund') || msg.includes('exceeds') ? 422
                   : 400;
      res.status(status).json({ message: msg });
    }
  });

  app.get("/api/payments/:paymentId/refunds", async (req, res) => {
    try {
      const { paymentId } = req.params;
      const refunds = await storage.getPaymentRefunds(paymentId);
      const summary = await storage.getRefundSummary(paymentId);
      res.json({ refunds, summary });
    } catch (error) {
      console.error("Error fetching refunds:", error);
      res.status(500).json({ message: "Failed to fetch refunds" });
    }
  });

  app.get("/api/players/:playerId/refunds", async (req, res) => {
    try {
      const { playerId } = req.params;
      const refunds = await storage.getPlayerRefunds(playerId);
      res.json(refunds);
    } catch (error) {
      console.error("Error fetching player refunds:", error);
      res.status(500).json({ message: "Failed to fetch player refunds" });
    }
  });

  // Document Management Routes
  app.post("/api/players/:playerId/documents", upload.any(), async (req, res) => {
    try {
      const { playerId } = req.params;
      const { documentType } = req.body;
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const file = files[0];
      if (!validateFileSignatureFromBuffer(file.buffer)) {
         return res.status(400).json({ message: "Invalid file signature. File is potentially malicious." });
      }

      const uploaded = await uploadToCloudinary(file.buffer, { folder: 'academy-uploads/documents', resourceType: file.mimetype === 'application/pdf' ? 'raw' : 'image' });

      const document = await storage.createPlayerDocument({
        playerId,
        documentType,
        fileName: file.originalname,
        filePath: uploaded.url,
        fileSize: file.size,
        mimeType: file.mimetype,
      });

      res.status(201).json(document);
    } catch (error) {
      console.error("Error uploading document:", error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to upload document" });
    }
  });

  app.delete("/api/players/documents/:documentId", async (req, res) => {
    try {
      const { documentId } = req.params;

      // Get document info before deletion to remove file
      const document = await storage.getPlayerDocument(documentId);
      
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      const deleted = await storage.deletePlayerDocument(documentId);
      
      if (!deleted) {
        return res.status(500).json({ message: "Failed to delete document from database" });
      }

      // Try to delete from Cloudinary
      try {
        const publicId = extractPublicId(document.filePath);
        if (publicId) {
          await deleteFromCloudinary(publicId, document.mimeType?.startsWith('application/pdf') ? 'raw' : 'image');
        }
      } catch (fileError) {
        console.warn("Could not delete file from Cloudinary:", fileError);
      }

      res.json({ message: "Document deleted successfully" });
    } catch (error) {
      console.error("Error deleting document:", error);
      res.status(500).json({ message: "Failed to delete document" });
    }
  });

  // Session routes
  app.get("/api/sessions", async (req, res) => {
    try {
      const sessions = await storage.getAllSessions();
      res.json(sessions);
    } catch (error) {
      console.error("Error fetching sessions:", error);
      res.status(500).json({ message: "Failed to fetch sessions" });
    }
  });

  app.post("/api/sessions", async (req, res) => {
    try {
      const playerId = req.body.playerId;
      let subscriptionId = req.body.subscriptionId;

      if (!subscriptionId) {
        const [activeSub] = await db.select().from(subscriptions)
          .where(and(eq(subscriptions.playerId, playerId), eq(subscriptions.status, 'active')));
        if (!activeSub) {
          return res.status(400).json({ message: "Player does not have an active subscription." });
        }
        subscriptionId = activeSub.id;
      }

      // Convert date strings to Date objects before validation
      const scheduledStartTime = new Date(req.body.scheduledStartTime);
      const scheduledEndTime = new Date(req.body.scheduledEndTime);

      // Validate that the end time is after the start time
      if (scheduledEndTime <= scheduledStartTime) {
        return res.status(400).json({ message: "Session end time must be after the start time." });
      }
      if (req.body.actualStartTime && req.body.actualEndTime &&
          new Date(req.body.actualEndTime) <= new Date(req.body.actualStartTime)) {
        return res.status(400).json({ message: "Actual end time must be after the actual start time." });
      }

      const sessionData = {
        playerId,
        sessionDate: new Date(req.body.sessionDate),
        scheduledStartTime,
        scheduledEndTime,
        instructorName: req.body.instructorName || null,
        notes: req.body.notes || null,
        attendanceStatus: req.body.attendanceStatus || 'present',
        sessionStatus: req.body.sessionStatus || 'scheduled',
        actualStartTime: req.body.actualStartTime ? new Date(req.body.actualStartTime) : null,
        actualEndTime: req.body.actualEndTime ? new Date(req.body.actualEndTime) : null,
        subscriptionId,
      };
      
      const session = await storage.createSession(sessionData as any);
      res.json(session);
    } catch (error: any) {
      console.error("Error creating session:", error);
      res.status(500).json({ message: "Failed to create session" });
    }
  });

  app.post("/api/sessions/:sessionId/attendance", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { playerId, status, notes } = req.body;
      
      const session = await storage.markAttendance(sessionId, status, notes);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      
      res.json(session);
    } catch (error) {
      console.error("Error marking attendance:", error);
      res.status(500).json({ message: "Failed to mark attendance" });
    }
  });

  app.get("/api/sessions/player/:playerId", async (req, res) => {
    try {
      const { playerId } = req.params;
      const sessions = await storage.getPlayerSessions(playerId);
      res.json(sessions);
    } catch (error) {
      console.error("Error fetching player sessions:", error);
      res.status(500).json({ message: "Failed to fetch player sessions" });
    }
  });

  app.get("/api/payments/player/:playerId", async (req, res) => {
    try {
      const payments = await storage.getPlayerPayments(req.params.playerId);
      res.json(payments);
    } catch (error) {
      console.error("Error fetching player payments:", error);
      res.status(500).json({ message: "Failed to fetch player payments" });
    }
  });

  // Dashboard API routes
  app.get("/api/dashboard/renewal-notifications", async (req, res) => {
    try {
      const notifications = await storage.getRenewalNotifications();
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching renewal notifications:", error);
      res.status(500).json({ message: "Failed to fetch renewal notifications" });
    }
  });

  app.get("/api/dashboard/upcoming-renewals", async (req, res) => {
    try {
      const renewals = await storage.getUpcomingRenewals();
      res.json(renewals);
    } catch (error) {
      console.error("Error fetching upcoming renewals:", error);
      res.status(500).json({ message: "Failed to fetch upcoming renewals" });
    }
  });

  app.get("/api/dashboard/recent-activities", async (req, res) => {
    try {
      const activities = await storage.getRecentActivities();
      res.json(activities);
    } catch (error) {
      console.error("Error fetching recent activities:", error);
      res.status(500).json({ message: "Failed to fetch recent activities" });
    }
  });

  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });





  app.put("/api/sessions/:id", async (req, res) => {
    try {
      const sessionData = insertSessionSchema.partial().parse(req.body);

      // Validate that the end time is after the start time when both are provided
      if (sessionData.scheduledStartTime && sessionData.scheduledEndTime &&
          new Date(sessionData.scheduledEndTime as any) <= new Date(sessionData.scheduledStartTime as any)) {
        return res.status(400).json({ message: "Session end time must be after the start time." });
      }
      if (sessionData.actualStartTime && sessionData.actualEndTime &&
          new Date(sessionData.actualEndTime as any) <= new Date(sessionData.actualStartTime as any)) {
        return res.status(400).json({ message: "Actual end time must be after the actual start time." });
      }

      const session = await storage.updateSession(req.params.id, sessionData);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      
      res.json(session);
    } catch (error) {
      console.error("Error updating session:", error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to update session" });
    }
  });

  // ─── Trainer routes ────────────────────────────────────────────────────────

  app.get("/api/trainers", async (req, res) => {
    try {
      const trainerList = await storage.getTrainers();
      res.json(trainerList);
    } catch (error) {
      console.error("Error fetching trainers:", error);
      res.status(500).json({ message: "Failed to fetch trainers" });
    }
  });

  app.post("/api/trainers", async (req, res) => {
    try {
      const { name, activity, baseSalary } = req.body;
      if (!name || !activity || baseSalary === undefined) {
        return res.status(400).json({ message: "name, activity, and baseSalary are required" });
      }
      const trainer = await storage.createTrainer({ name, activity, baseSalary: String(baseSalary) });
      res.status(201).json(trainer);
    } catch (error) {
      console.error("Error creating trainer:", error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to create trainer" });
    }
  });

  app.put("/api/trainers/:id", async (req, res) => {
    try {
      const update: any = {};
      if (req.body.name !== undefined) update.name = req.body.name;
      if (req.body.activity !== undefined) update.activity = req.body.activity;
      if (req.body.baseSalary !== undefined) update.baseSalary = String(req.body.baseSalary);
      const trainer = await storage.updateTrainer(req.params.id, update);
      if (!trainer) return res.status(404).json({ message: "Trainer not found" });
      res.json(trainer);
    } catch (error) {
      console.error("Error updating trainer:", error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to update trainer" });
    }
  });

  app.delete("/api/trainers/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteTrainer(req.params.id);
      if (!deleted) return res.status(404).json({ message: "Trainer not found" });
      res.json({ message: "Trainer deleted successfully" });
    } catch (error) {
      console.error("Error deleting trainer:", error);
      res.status(500).json({ message: "Failed to delete trainer" });
    }
  });

  // Trainer salary payments
  app.get("/api/trainers/:id/salary-payments", async (req, res) => {
    try {
      const month = req.query.month as string | undefined;
      const payments = await storage.getTrainerSalaryPayments(req.params.id, month);
      res.json(payments);
    } catch (error) {
      console.error("Error fetching trainer salary payments:", error);
      res.status(500).json({ message: "Failed to fetch salary payments" });
    }
  });

  app.post("/api/trainers/:id/salary-payments", async (req, res) => {
    try {
      const { amount, month, notes, advanceIdsToDeduct = [] } = req.body;
      if (!amount || !month) {
        return res.status(400).json({ message: "amount and month are required" });
      }
      const payment = await storage.createTrainerSalaryPayment(
        { trainerId: req.params.id, amount: String(amount), month, notes: notes || null },
        advanceIdsToDeduct
      );
      res.status(201).json(payment);
    } catch (error) {
      console.error("Error creating salary payment:", error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to create salary payment" });
    }
  });

  // Trainer advances
  app.get("/api/trainers/:id/advances", async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const advances = await storage.getTrainerAdvances(req.params.id, status);
      res.json(advances);
    } catch (error) {
      console.error("Error fetching trainer advances:", error);
      res.status(500).json({ message: "Failed to fetch advances" });
    }
  });

  app.post("/api/trainers/:id/advances", async (req, res) => {
    try {
      const { amount, notes } = req.body;
      if (!amount) {
        return res.status(400).json({ message: "amount is required" });
      }
      const advance = await storage.createTrainerAdvance({
        trainerId: req.params.id,
        amount: String(amount),
        remainingBalance: String(amount),
        notes: notes || null,
      });
      res.status(201).json(advance);
    } catch (error) {
      console.error("Error creating advance:", error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to create advance" });
    }
  });

  app.post("/api/trainers/:id/advances/:advanceId/repay", async (req, res) => {
    try {
      // repaid_note is optional — stored alongside timestamp in notes field
      const { repaid_note } = req.body;
      const advance = await storage.repayTrainerAdvance(req.params.advanceId, repaid_note);
      if (!advance) {
        return res.status(404).json({ message: "Advance not found or not pending" });
      }
      res.json(advance);
    } catch (error) {
      console.error("Error repaying advance:", error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to repay advance" });
    }
  });

  // Trainer bonuses
  app.get("/api/trainers/:id/bonuses", async (req, res) => {
    try {
      const month = req.query.month as string | undefined;
      const bonuses = await storage.getTrainerBonuses(req.params.id, month);
      res.json(bonuses);
    } catch (error) {
      console.error("Error fetching trainer bonuses:", error);
      res.status(500).json({ message: "Failed to fetch bonuses" });
    }
  });

  app.post("/api/trainers/:id/bonuses", async (req, res) => {
    try {
      const { amount, month, note } = req.body;
      if (!amount || !month) {
        return res.status(400).json({ message: "amount and month are required" });
      }
      const bonus = await storage.createTrainerBonus({
        trainerId: req.params.id,
        amount: String(amount),
        month,
        note: note || null,
      });
      res.status(201).json(bonus);
    } catch (error) {
      console.error("Error creating bonus:", error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to create bonus" });
    }
  });

  // Trainer payroll locking
  app.post("/api/trainers/:id/payrolls/lock", async (req, res) => {
    try {
      const { month } = req.body;
      if (!month) {
        return res.status(400).json({ message: "month is required" });
      }
      const payroll = await storage.lockTrainerPayroll(req.params.id, month);
      res.status(200).json(payroll);
    } catch (error) {
      console.error("Error locking payroll:", error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to lock payroll" });
    }
  });

  // Trainer ledger
  app.get("/api/trainers/:id/ledger", async (req, res) => {
    try {
      const month = (req.query.month as string) || 
        `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
      const ledger = await storage.getTrainerLedger(req.params.id, month);
      res.json(ledger);
    } catch (error) {
      console.error("Error fetching trainer ledger:", error);
      res.status(500).json({ message: "Failed to fetch trainer ledger" });
    }
  });

  // ─── Expenses Routes ────────────────────────────────────────────────────────
  app.get("/api/expenses", async (req, res) => {
    try {
      const expensesList = await storage.getExpenses(req.query);
      res.json(expensesList);
    } catch (error) {
      console.error("Error fetching expenses:", error);
      res.status(500).json({ message: "Failed to fetch expenses" });
    }
  });

  app.post("/api/expenses", async (req, res) => {
    try {
      const expenseData = {
        ...req.body,
        date: req.body.date ? new Date(req.body.date) : new Date(),
        createdBy: ((req.user as any)?.id === 'admin-id') ? null : (req.user as any)?.id
      };
      const reqContext = { ipAddress: req.ip, userAgent: req.headers['user-agent'] };
      const created = await storage.createExpense(expenseData, reqContext);
      res.status(201).json(created);
    } catch (error) {
      console.error("Error creating expense:", error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to create expense" });
    }
  });

  app.put("/api/expenses/:id", async (req, res) => {
    try {
      const updateData = {
        ...req.body,
        date: req.body.date ? new Date(req.body.date) : undefined,
        updatedBy: ((req.user as any)?.id === 'admin-id') ? null : (req.user as any)?.id
      };
      const reqContext = { ipAddress: req.ip, userAgent: req.headers['user-agent'] };
      const updated = await storage.updateExpense(req.params.id, updateData, reqContext);
      if (!updated) {
        return res.status(404).json({ message: "Expense not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error updating expense:", error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to update expense" });
    }
  });

  app.delete("/api/expenses/:id", async (req, res) => {
    try {
      const userId = ((req.user as any)?.id === 'admin-id') ? null : (req.user as any)?.id;
      const reason = req.body?.reason || undefined;
      const reqContext = { ipAddress: req.ip, userAgent: req.headers['user-agent'] };
      const deleted = await storage.deleteExpense(req.params.id, userId, reason, reqContext);
      if (!deleted) {
        return res.status(404).json({ message: "Expense not found" });
      }
      res.json({ message: "Expense deleted successfully" });
    } catch (error) {
      console.error("Error deleting expense:", error);
      res.status(500).json({ message: "Failed to delete expense" });
    }
  });

  // ─── Inventory Routes ───────────────────────────────────────────────────────
  app.get("/api/inventory", async (req, res) => {
    try {
      const items = await storage.getInventoryItems(req.query);
      res.json(items);
    } catch (error) {
      console.error("Error fetching inventory:", error);
      res.status(500).json({ message: "Failed to fetch inventory" });
    }
  });

  app.post("/api/inventory", async (req, res) => {
    try {
      const itemData = {
        ...req.body,
        sku: req.body.sku?.trim() || null,
        createdBy: ((req.user as any)?.id === 'admin-id') ? null : (req.user as any)?.id
      };
      const reqContext = { ipAddress: req.ip, userAgent: req.headers['user-agent'] };
      const created = await storage.createInventoryItem(itemData, reqContext);
      res.status(201).json(created);
    } catch (error) {
      console.error("Error creating inventory item:", error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to create inventory item" });
    }
  });

  app.put("/api/inventory/:id", async (req, res) => {
    try {
      const updateData = {
        ...req.body,
        sku: req.body.sku?.trim() || null,
        updatedBy: ((req.user as any)?.id === 'admin-id') ? null : (req.user as any)?.id
      };
      const reqContext = { ipAddress: req.ip, userAgent: req.headers['user-agent'] };
      const updated = await storage.updateInventoryItem(req.params.id, updateData, reqContext);
      if (!updated) {
        return res.status(404).json({ message: "Inventory item not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error updating inventory item:", error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to update inventory item" });
    }
  });

  app.delete("/api/inventory/:id", async (req, res) => {
    try {
      const userId = ((req.user as any)?.id === 'admin-id') ? null : (req.user as any)?.id;
      const reason = req.body?.reason || undefined;
      const reqContext = { ipAddress: req.ip, userAgent: req.headers['user-agent'] };
      const deleted = await storage.deleteInventoryItem(req.params.id, userId, reason, reqContext);
      if (!deleted) {
        return res.status(404).json({ message: "Inventory item not found" });
      }
      res.json({ message: "Inventory item deleted successfully" });
    } catch (error) {
      console.error("Error deleting inventory item:", error);
      res.status(500).json({ message: "Failed to delete inventory item" });
    }
  });

  app.get("/api/inventory/:id/transactions", async (req, res) => {
    try {
      const txs = await storage.getInventoryTransactions(req.params.id);
      res.json(txs);
    } catch (error) {
      console.error("Error fetching inventory transactions:", error);
      res.status(500).json({ message: "Failed to fetch inventory transactions" });
    }
  });

  app.post("/api/inventory/transactions", async (req, res) => {
    try {
      const { createExpense, expenseCategory, paymentMethod, unitCostAtTransaction, ...restData } = req.body;
      const txData = {
        ...restData,
        // Carry user-provided unit cost so storage can record it on the transaction
        unitCostAtTransaction: unitCostAtTransaction || null,
        transactionDate: req.body.transactionDate ? new Date(req.body.transactionDate) : new Date(),
        createdBy: ((req.user as any)?.id === 'admin-id') ? null : (req.user as any)?.id
      };
      
      const expenseData = createExpense ? {
        createExpense: true,
        unitCost: parseFloat(unitCostAtTransaction || "0"),
        category: expenseCategory || 'equipment',
        paymentMethod: paymentMethod || 'cash'
      } : undefined;

      const reqContext = {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      };

      const created = await storage.createInventoryTransaction(txData, expenseData, reqContext);

      res.status(201).json(created);
    } catch (error) {
      console.error("Error creating inventory transaction:", error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to process inventory transaction" });
    }
  });

  // ─── Receipt Upload for Expenses ─────────────────────────────────────────
  app.post("/api/expenses/:id/receipt", upload.single('receipt'), async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      if (!validateFileSignatureFromBuffer(file.buffer)) {
         return res.status(400).json({ message: "Invalid file signature. File is potentially malicious." });
      }
      const uploaded = await uploadToCloudinary(file.buffer, { folder: 'academy-uploads/receipts' });
      const receiptUrl = uploaded.url;
      const updated = await storage.updateExpense(req.params.id, { receiptUrl } as any);
      if (!updated) {
        return res.status(404).json({ message: "Expense not found" });
      }
      res.json({ receiptUrl, message: "Receipt uploaded successfully" });
    } catch (error) {
      console.error("Error uploading receipt:", error);
      res.status(500).json({ message: "Failed to upload receipt" });
    }
  });

  // ─── Activity Logs ────────────────────────────────────────────────────────
  app.get("/api/activity-logs", async (req, res) => {
    try {
      const { entityType, limit, offset } = req.query;
      const result = await storage.getActivityLogs({
        entityType: entityType as string,
        limit: limit ? parseInt(limit as string) : 50,
        offset: offset ? parseInt(offset as string) : 0,
      });
      res.json(result);
    } catch (error) {
      console.error("Error fetching activity logs:", error);
      res.status(500).json({ message: "Failed to fetch activity logs" });
    }
  });

  // ─── Dashboard Chart Data ─────────────────────────────────────────────────
  app.get("/api/dashboard/expense-trends", async (req, res) => {
    try {
      const trends = await storage.getExpenseTrends();
      res.json(trends);
    } catch (error) {
      console.error("Error fetching expense trends:", error);
      res.status(500).json({ message: "Failed to fetch expense trends" });
    }
  });

  app.get("/api/dashboard/expense-categories", async (req, res) => {
    try {
      const categories = await storage.getExpenseCategories();
      res.json(categories);
    } catch (error) {
      console.error("Error fetching expense categories:", error);
      res.status(500).json({ message: "Failed to fetch expense categories" });
    }
  });

  app.get("/api/dashboard/inventory-movements", async (req, res) => {
    try {
      const movements = await storage.getInventoryMovements();
      res.json(movements);
    } catch (error) {
      console.error("Error fetching inventory movements:", error);
      res.status(500).json({ message: "Failed to fetch inventory movements" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
