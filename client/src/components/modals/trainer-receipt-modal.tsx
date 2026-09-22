import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { generateTrainerReceipt } from "@/lib/pdf-generator";
import { printElementById } from "@/lib/print";

interface TrainerReceiptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trainer?: any;
  payment?: any;
  advances?: any[];
}

export default function TrainerReceiptModal({ 
  open, 
  onOpenChange, 
  trainer, 
  payment,
  advances = []
}: TrainerReceiptModalProps) {
  
  const handlePrint = () => {
    printElementById("receipt-content", {
      title: `Employee Receipt ${payment?.month ?? ""}`.trim(),
      styles: "body { max-width: 480px; margin: 0 auto; }",
    });
  };

  const handleDownloadPDF = () => {
    if (trainer && payment) {
      const pdf = generateTrainerReceipt(trainer, payment, advances);
      pdf.save(`trainer-receipt-${payment.month}-${trainer.name.replace(/\s+/g, '-')}.pdf`);
    }
  };

  if (!trainer || !payment) return null;

  const deductedAdvances = advances.filter(a => a.salaryPaymentId === payment.id);
  const totalDeducted = deductedAdvances.reduce((sum, adv) => sum + parseFloat(adv.amount), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Employee Salary Receipt</DialogTitle>
          <DialogDescription>
            Download or print salary receipt for {trainer.name}
          </DialogDescription>
        </DialogHeader>

        <div id="receipt-content" className="p-6">
          {/* Receipt Header */}
          <div className="text-center mb-6">
            <div className="flex items-center justify-center space-x-3 mb-2">
              <img 
                src="/e1-sport-logo.jpg" 
                alt="E1 Sport Champions Academy" 
                className="w-14 h-14 object-contain rounded-lg shadow-sm"
              />
              <div>
                <h2 className="text-xl font-bold text-gray-900">E1 Sport</h2>
                <p className="text-sm text-academy-red font-medium">Champions Academy</p>
              </div>
            </div>
            <p className="text-sm text-gray-600">Employee Salary Receipt</p>
          </div>

          {/* Receipt Details */}
          <div className="space-y-3 mb-6">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Receipt ID:</span>
              <span className="text-sm font-medium">{payment.id.slice(0, 8).toUpperCase()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Employee:</span>
              <span className="text-sm font-medium">{trainer.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Payment Date:</span>
              <span className="text-sm font-medium">
                {new Date(payment.createdAt).toLocaleDateString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Salary Period:</span>
              <span className="text-sm font-medium">{payment.month}</span>
            </div>
          </div>

          {/* Payment Breakdown */}
          <div className="border-t border-gray-200 pt-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Paid Amount (Cash):</span>
              <span className="text-sm font-medium text-green-600">AED {parseFloat(payment.amount).toLocaleString()}</span>
            </div>
            
            {deductedAdvances.length > 0 && (
              <div className="flex justify-between pt-1">
                <span className="text-sm text-gray-600">Deducted Advances:</span>
                <span className="text-sm font-medium text-red-600">AED {totalDeducted.toLocaleString()}</span>
              </div>
            )}
          </div>
          
          {payment.notes && (
             <div className="mt-4 pt-4 border-t border-gray-200">
               <span className="text-sm text-gray-600 block mb-1">Notes:</span>
               <p className="text-sm text-gray-900">{payment.notes}</p>
             </div>
          )}

          {/* Footer */}
          <div className="text-center mt-6 pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-500">Thank you for choosing E1 Sport Champions Academy</p>
          </div>
        </div>

        <div className="flex space-x-4 p-6 border-t">
          <Button 
            className="flex-1 bg-academy-blue hover:bg-academy-blue-light text-white"
            onClick={handlePrint}
          >
            Print Receipt
          </Button>
          <Button 
            variant="outline" 
            className="flex-1"
            onClick={handleDownloadPDF}
          >
            Download PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
