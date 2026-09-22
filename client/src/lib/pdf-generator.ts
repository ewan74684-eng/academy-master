import jsPDF from 'jspdf';
import type { Player, Payment } from '@shared/schema';
import { ACTIVITIES, PAYMENT_METHODS } from './constants';
import { LOGO_BASE64 } from './logo-base64';
import { TRAINER_ROLE_DISPLAY } from '@shared/schema';

// Shared logo header helper — draws the logo + academy name at the top of every PDF
function drawLogoHeader(pdf: jsPDF, subtitle: string) {
  // Logo image (left-aligned in the center block)
  try {
    pdf.addImage(LOGO_BASE64, 'JPEG', 75, 8, 22, 22);
  } catch {
    // Fallback: draw a blue rectangle placeholder
    pdf.setFillColor(37, 99, 235);
    pdf.roundedRect(75, 8, 22, 22, 3, 3, 'F');
    pdf.setFontSize(14);
    pdf.setTextColor(255, 255, 255);
    pdf.text('E1', 86, 22, { align: 'center' });
  }

  // Academy name
  pdf.setFontSize(18);
  pdf.setTextColor(30, 64, 175); // blue-700
  pdf.text('E1 Sport', 105, 14, { align: 'center' });

  pdf.setFontSize(11);
  pdf.setTextColor(220, 38, 38); // red-600
  pdf.text('Champions Academy', 105, 22, { align: 'center' });

  // Subtitle
  pdf.setFontSize(10);
  pdf.setTextColor(100, 100, 100);
  pdf.text(subtitle, 105, 30, { align: 'center' });

  // Divider line
  pdf.setDrawColor(37, 99, 235);
  pdf.setLineWidth(0.5);
  pdf.line(20, 36, 190, 36);

  pdf.setTextColor(0, 0, 0);
}

export function generateReceipt(player: Player, payment: Payment, allPayments?: Payment[]) {
  const pdf = new jsPDF();

  drawLogoHeader(pdf, 'Payment Receipt');

  // Receipt details
  const startY = 48;

  pdf.setFontSize(11);
  pdf.setTextColor(55, 65, 81);
  pdf.text(`Receipt #:`, 20, startY);
  pdf.setTextColor(0, 0, 0);
  pdf.setFontSize(11);
  pdf.text(payment.receiptNumber, 60, startY);

  pdf.setTextColor(55, 65, 81);
  pdf.text(`Player:`, 20, startY + 10);
  pdf.setTextColor(0, 0, 0);
  pdf.text(player.fullName, 60, startY + 10);

  const activity = ACTIVITIES[(player as any).activity as keyof typeof ACTIVITIES];
  pdf.setTextColor(55, 65, 81);
  pdf.text(`Activity:`, 20, startY + 20);
  pdf.setTextColor(0, 0, 0);
  pdf.text(`${activity?.label || (player as any).activity}`, 60, startY + 20);

  pdf.setTextColor(55, 65, 81);
  pdf.text(`Date:`, 20, startY + 30);
  pdf.setTextColor(0, 0, 0);
  pdf.text(new Date(payment.paymentDate).toLocaleDateString(), 60, startY + 30);

  const paymentMethod = PAYMENT_METHODS[payment.paymentMethod as keyof typeof PAYMENT_METHODS];
  pdf.setTextColor(55, 65, 81);
  pdf.text(`Payment Method:`, 20, startY + 40);
  pdf.setTextColor(0, 0, 0);
  pdf.text(paymentMethod?.label || payment.paymentMethod, 60, startY + 40);

  // Payment breakdown
  pdf.setDrawColor(200, 200, 200);
  pdf.line(20, startY + 55, 190, startY + 55);

  pdf.setFontSize(12);
  pdf.setTextColor(30, 64, 175);
  pdf.text('Payment Breakdown', 20, startY + 65);

  pdf.setFontSize(11);
  pdf.setTextColor(55, 65, 81);
  pdf.text(`Subscription Fee:`, 20, startY + 78);
  pdf.setTextColor(0, 0, 0);
  pdf.text(`AED ${payment.subscriptionFee}`, 150, startY + 78);

  pdf.setTextColor(55, 65, 81);
  pdf.text(`Amount Paid:`, 20, startY + 88);
  pdf.setTextColor(22, 163, 74); // green
  pdf.text(`AED ${payment.amountPaid}`, 150, startY + 88);

  pdf.setTextColor(55, 65, 81);
  pdf.text(`Balance Remaining:`, 20, startY + 98);
  const balance = parseFloat(payment.remainingBalance);
  pdf.setTextColor(balance > 0 ? 220 : 22, balance > 0 ? 38 : 163, balance > 0 ? 38 : 74);
  pdf.text(`AED ${payment.remainingBalance}`, 150, startY + 98);

  pdf.setDrawColor(200, 200, 200);
  pdf.line(20, startY + 108, 190, startY + 108);

  let currentY = startY + 120;

  // Historical Payments Section
  if (allPayments && allPayments.length > 0) {
    pdf.setFontSize(12);
    pdf.setTextColor(30, 64, 175);
    pdf.text('Payment History', 20, currentY);

    currentY += 12;
    pdf.setFontSize(9);
    pdf.setTextColor(100, 100, 100);
    pdf.text('Date', 20, currentY);
    pdf.text('Receipt #', 55, currentY);
    pdf.text('Method', 105, currentY);
    pdf.text('Amount', 145, currentY);
    pdf.text('Balance', 170, currentY);

    currentY += 4;
    pdf.line(20, currentY, 190, currentY);

    pdf.setTextColor(0, 0, 0);
    const sortedPayments = [...allPayments].sort((a, b) =>
      new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime()
    ).slice(0, 10);

    sortedPayments.forEach((p) => {
      currentY += 9;
      if (currentY > 270) {
        pdf.addPage();
        drawLogoHeader(pdf, 'Payment Receipt (continued)');
        currentY = 50;
      }
      const pMethod = PAYMENT_METHODS[p.paymentMethod as keyof typeof PAYMENT_METHODS]?.label || p.paymentMethod;
      pdf.setFontSize(9);
      pdf.text(new Date(p.paymentDate).toLocaleDateString(), 20, currentY);
      pdf.text(p.receiptNumber?.slice(0, 18) || 'N/A', 55, currentY);
      pdf.text(pMethod, 105, currentY);
      pdf.text(`AED ${p.amountPaid}`, 145, currentY);
      pdf.text(`AED ${p.remainingBalance}`, 170, currentY);
    });

    currentY += 15;
  }

  // Footer
  pdf.setFontSize(9);
  pdf.setTextColor(100, 100, 100);
  pdf.text('Thank you for choosing E1 Sport Champions Academy', 105, currentY + 10, { align: 'center' });

  return pdf;
}

export function generatePlayerProfile(player: Player, payments: Payment[], sessions: any[]) {
  const pdf = new jsPDF();

  drawLogoHeader(pdf, 'Player Profile Report');

  const startY = 50;

  pdf.setFontSize(14);
  pdf.setTextColor(30, 64, 175);
  pdf.text('Personal Information', 20, startY);

  pdf.setFontSize(11);
  pdf.setTextColor(0, 0, 0);
  pdf.text(`Name:`, 25, startY + 12);
  pdf.setTextColor(55, 65, 81);
  pdf.text(player.fullName, 70, startY + 12);

  pdf.setTextColor(0, 0, 0);
  pdf.text(`Player ID:`, 25, startY + 22);
  pdf.setTextColor(55, 65, 81);
  pdf.text(player.id, 70, startY + 22);

  pdf.setTextColor(0, 0, 0);
  pdf.text(`Date of Birth:`, 25, startY + 32);
  pdf.setTextColor(55, 65, 81);
  pdf.text(new Date(player.dateOfBirth).toLocaleDateString(), 70, startY + 32);

  const activity = ACTIVITIES[(player as any).activity as keyof typeof ACTIVITIES];
  pdf.setTextColor(0, 0, 0);
  pdf.text(`Activity:`, 25, startY + 42);
  pdf.setTextColor(55, 65, 81);
  pdf.text(`${activity?.label || (player as any).activity}`, 70, startY + 42);

  pdf.setTextColor(0, 0, 0);
  pdf.text(`Phone:`, 25, startY + 52);
  pdf.setTextColor(55, 65, 81);
  pdf.text(player.phoneNumber || 'N/A', 70, startY + 52);

  pdf.setTextColor(0, 0, 0);
  pdf.text(`Email:`, 25, startY + 62);
  pdf.setTextColor(55, 65, 81);
  pdf.text(player.email || 'N/A', 70, startY + 62);

  // Subscription section
  pdf.setDrawColor(200, 200, 200);
  pdf.line(20, startY + 74, 190, startY + 74);

  pdf.setFontSize(14);
  pdf.setTextColor(30, 64, 175);
  pdf.text('Subscription Details', 20, startY + 84);

  pdf.setFontSize(11);
  pdf.setTextColor(0, 0, 0);
  pdf.text(`Status:`, 25, startY + 96);
  pdf.setTextColor(55, 65, 81);
  pdf.text((player as any).subscriptionStatus?.replace('_', ' ') || 'N/A', 70, startY + 96);

  pdf.setTextColor(0, 0, 0);
  pdf.text(`Start Date:`, 25, startY + 106);
  pdf.setTextColor(55, 65, 81);
  pdf.text(new Date((player as any).subscriptionDate).toLocaleDateString(), 70, startY + 106);

  pdf.setTextColor(0, 0, 0);
  pdf.text(`Renewal Date:`, 25, startY + 116);
  pdf.setTextColor(55, 65, 81);
  pdf.text(new Date((player as any).renewalDate).toLocaleDateString(), 70, startY + 116);

  pdf.setTextColor(0, 0, 0);
  pdf.text(`Monthly Fee:`, 25, startY + 126);
  pdf.setTextColor(55, 65, 81);
  pdf.text(`AED ${(player as any).monthlySubscriptionFee}`, 70, startY + 126);

  pdf.setTextColor(0, 0, 0);
  pdf.text(`Sessions:`, 25, startY + 136);
  pdf.setTextColor(55, 65, 81);
  pdf.text(`${(player as any).sessionsAttended}/${(player as any).totalSessionsAllowed} attended (${Math.max(0, (player as any).totalSessionsAllowed - (player as any).sessionsAttended)} remaining)`, 70, startY + 136);

  // Payment history
  if (payments.length > 0) {
    pdf.setDrawColor(200, 200, 200);
    pdf.line(20, startY + 148, 190, startY + 148);

    pdf.setFontSize(14);
    pdf.setTextColor(30, 64, 175);
    pdf.text('Payment History', 20, startY + 158);

    pdf.setFontSize(9);
    pdf.setTextColor(100, 100, 100);
    let pyY = startY + 170;
    pdf.text('Date', 25, pyY);
    pdf.text('Amount', 80, pyY);
    pdf.text('Method', 120, pyY);
    pdf.text('Balance', 165, pyY);
    pyY += 4;
    pdf.line(20, pyY, 190, pyY);

    payments.slice(0, 8).forEach((payment) => {
      pyY += 9;
      if (pyY > 270) {
        pdf.addPage();
        drawLogoHeader(pdf, 'Player Profile (continued)');
        pyY = 50;
      }
      pdf.setTextColor(0, 0, 0);
      pdf.text(new Date(payment.paymentDate).toLocaleDateString(), 25, pyY);
      pdf.text(`AED ${payment.amountPaid}`, 80, pyY);
      pdf.text(payment.paymentMethod, 120, pyY);
      pdf.text(`AED ${payment.remainingBalance}`, 165, pyY);
    });
  }

  return pdf;
}

// Generate an "All Players" summary PDF
export function generateAllPlayersPDF(players: Player[]) {
  const pdf = new jsPDF({ orientation: 'landscape' });

  drawLogoHeader(pdf, `All Players Report — ${new Date().toLocaleDateString()}`);

  const headers = ['Name', 'Activity', 'Status', 'Sessions', 'Fee', 'Renewal Date'];
  const colWidths = [55, 38, 30, 25, 22, 32];
  const colX = [15, 70, 108, 138, 163, 185];

  // Table header
  let y = 46;
  pdf.setFillColor(37, 99, 235);
  pdf.rect(15, y - 5, 267, 9, 'F');

  pdf.setFontSize(9);
  pdf.setTextColor(255, 255, 255);
  headers.forEach((h, i) => pdf.text(h, colX[i], y));

  y += 9;
  pdf.setTextColor(0, 0, 0);

  players.forEach((player, idx) => {
    if (y > 190) {
      pdf.addPage();
      drawLogoHeader(pdf, 'All Players Report (continued)');
      y = 46;

      // Re-draw header
      pdf.setFillColor(37, 99, 235);
      pdf.rect(15, y - 5, 267, 9, 'F');
      pdf.setFontSize(9);
      pdf.setTextColor(255, 255, 255);
      headers.forEach((h, i) => pdf.text(h, colX[i], y));
      y += 9;
      pdf.setTextColor(0, 0, 0);
    }

    // Alternating row background
    if (idx % 2 === 0) {
      pdf.setFillColor(241, 245, 249);
      pdf.rect(15, y - 5, 267, 8, 'F');
    }

    const activity = ACTIVITIES[(player as any).activity as keyof typeof ACTIVITIES];
    const sessionsLeft = Math.max(0, (player as any).totalSessionsAllowed - (player as any).sessionsAttended);

    pdf.setFontSize(8);
    pdf.setTextColor(0, 0, 0);
    pdf.text(player.fullName.slice(0, 28), colX[0], y);
    pdf.text(activity?.label || (player as any).activity, colX[1], y);
    pdf.text(((player as any).subscriptionStatus || '').replace('_', ' '), colX[2], y);
    pdf.text(`${(player as any).sessionsAttended}/${(player as any).totalSessionsAllowed} (${sessionsLeft} left)`, colX[3], y);
    pdf.text(`AED ${(player as any).monthlySubscriptionFee}`, colX[4], y);
    pdf.text(new Date((player as any).renewalDate).toLocaleDateString(), colX[5], y);

    y += 8;
  });

  // Footer
  pdf.setFontSize(8);
  pdf.setTextColor(150, 150, 150);
  pdf.text(`Total Players: ${players.length}  |  Generated: ${new Date().toLocaleString()}  |  E1 Sport Champions Academy`, 148, 200, { align: 'center' });

  return pdf;
}

export function generateTrainerReceipt(trainer: any, payment: any, advances: any[]) {
  const pdf = new jsPDF();

  drawLogoHeader(pdf, 'Trainer Salary Receipt');

  const startY = 48;

  pdf.setFontSize(11);
  pdf.setTextColor(55, 65, 81);
  pdf.text(`Receipt ID:`, 20, startY);
  pdf.setTextColor(0, 0, 0);
  pdf.setFontSize(11);
  pdf.text(payment.id.slice(0, 8).toUpperCase(), 60, startY);

  pdf.setTextColor(55, 65, 81);
  pdf.text(`Trainer:`, 20, startY + 10);
  pdf.setTextColor(0, 0, 0);
  pdf.text(trainer.name, 60, startY + 10);

  pdf.setTextColor(55, 65, 81);
  pdf.text(`Activity:`, 20, startY + 20);
  pdf.setTextColor(0, 0, 0);
  const activityLabel = TRAINER_ROLE_DISPLAY[trainer.activity as keyof typeof TRAINER_ROLE_DISPLAY]?.label || trainer.activity;
  pdf.text(activityLabel, 60, startY + 20);

  pdf.setTextColor(55, 65, 81);
  pdf.text(`Payment Date:`, 20, startY + 30);
  pdf.setTextColor(0, 0, 0);
  pdf.text(new Date(payment.createdAt).toLocaleDateString(), 60, startY + 30);
  
  pdf.setTextColor(55, 65, 81);
  pdf.text(`Salary Period:`, 20, startY + 40);
  pdf.setTextColor(0, 0, 0);
  pdf.text(payment.month, 60, startY + 40);

  // Payment breakdown
  pdf.setDrawColor(200, 200, 200);
  pdf.line(20, startY + 55, 190, startY + 55);

  pdf.setFontSize(12);
  pdf.setTextColor(30, 64, 175);
  pdf.text('Payment Breakdown', 20, startY + 65);

  let currentY = startY + 78;
  pdf.setFontSize(11);
  pdf.setTextColor(55, 65, 81);
  pdf.text(`Paid Amount (Cash):`, 20, currentY);
  pdf.setTextColor(22, 163, 74); // green
  pdf.text(`AED ${parseFloat(payment.amount).toLocaleString()}`, 150, currentY);

  // Deducted advances for this payment
  const deductedAdvances = advances.filter((a: any) => a.salaryPaymentId === payment.id);
  if (deductedAdvances.length > 0) {
    currentY += 10;
    pdf.setTextColor(55, 65, 81);
    pdf.text(`Deducted Advances:`, 20, currentY);
    
    let totalDeducted = 0;
    deductedAdvances.forEach((adv) => {
      totalDeducted += parseFloat(adv.amount);
    });
    
    pdf.setTextColor(220, 38, 38); // red
    pdf.text(`AED ${totalDeducted.toLocaleString()}`, 150, currentY);
  }

  if (payment.notes) {
    currentY += 15;
    pdf.setTextColor(55, 65, 81);
    pdf.text(`Notes:`, 20, currentY);
    pdf.setTextColor(0, 0, 0);
    pdf.text(payment.notes, 40, currentY);
  }

  currentY += 15;
  pdf.setDrawColor(200, 200, 200);
  pdf.line(20, currentY, 190, currentY);

  // Footer
  pdf.setFontSize(9);
  pdf.setTextColor(100, 100, 100);
  pdf.text('Thank you for choosing E1 Sport Champions Academy', 105, currentY + 15, { align: 'center' });

  return pdf;
}
