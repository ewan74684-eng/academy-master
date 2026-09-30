import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,  
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ACTIVITIES, SUBSCRIPTION_PLANS, PAYMENT_METHODS } from "@/lib/constants";
import FileUpload from "@/components/ui/file-upload";
import { PhoneInput } from "@/components/ui/phone-input";
import { addOneMonth } from "@/lib/utils";

const addPlayerSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  dateOfBirth: z.string().min(1, "Date of birth is required"),
  phoneNumber: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  activity: z.string().min(1, "Activity selection is required"),
  subscriptionDate: z.string().min(1, "Subscription date is required"),
  subscriptionEndDate: z.string().optional(),
  totalSessionsAllowed: z.string().min(1, "Sessions allowed is required"),
  subscriptionFee: z.string().min(1, "Total subscription fee is required"),
  discountPercentage: z.string().optional(),
  amountPaid: z.string().optional(),
  paymentMethod: z.string().optional(),
  specialNotes: z.string().optional(),
});

type AddPlayerForm = z.infer<typeof addPlayerSchema>;

interface AddPlayerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AddPlayerModal({ open, onOpenChange }: AddPlayerModalProps) {
  const [idDocument, setIdDocument] = useState<File | null>(null);
  const [medicalForm, setMedicalForm] = useState<File | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const today = new Date().toISOString().split('T')[0];
  const form = useForm<AddPlayerForm>({
    resolver: zodResolver(addPlayerSchema),
    defaultValues: {
      fullName: "",
      dateOfBirth: "",
      phoneNumber: "",
      email: "",
      activity: "",
      subscriptionDate: today,
      subscriptionEndDate: addOneMonth(today),
      totalSessionsAllowed: "8",
      subscriptionFee: "200",
      discountPercentage: "0",
      amountPaid: "0",
      paymentMethod: "cash",
      specialNotes: "",
    },
  });

  const createPlayerMutation = useMutation({
    mutationFn: async (data: AddPlayerForm) => {
      const formData = new FormData();
      
      // Add form fields
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined && value !== null) formData.append(key, value);
      });

      // Add subscription fee
      formData.append("subscriptionFee", data.subscriptionFee);
      
      // Add files if present
      if (idDocument) {
        formData.append("idDocument", idDocument);
      }
      if (medicalForm) {
        formData.append("medicalForm", medicalForm);
      }

      const response = await fetch("/api/players", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to create player");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Success",
        description: "Player added successfully",
      });
      onOpenChange(false);
      form.reset();
      setIdDocument(null);
      setMedicalForm(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: AddPlayerForm) => {
    createPlayerMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-gray-900">
            Add New Player
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Personal Information */}
            <div>
              <h4 className="text-lg font-medium text-gray-900 mb-4">
                Personal Information
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter full name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dateOfBirth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date of Birth *</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phoneNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <PhoneInput {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl>
                        <Input 
                          type="email" 
                          placeholder="email@example.com" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Activity Selection */}
            <div>
              <h4 className="text-lg font-medium text-gray-900 mb-4">
                Activity Selection
              </h4>
              <FormField
                control={form.control}
                name="activity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Select Activity</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose an activity" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(ACTIVITIES).map(([key, activity]) => (
                          <SelectItem key={key} value={key}>
                            {activity.emoji} {activity.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Document Upload */}
            <div>
              <h4 className="text-lg font-medium text-gray-900 mb-4">Documents</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    ID Document
                  </label>
                  <FileUpload
                    onFileSelect={setIdDocument}
                    accept=".png,.jpg,.jpeg,.pdf"
                    maxSize={10 * 1024 * 1024}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Medical Form
                  </label>
                  <FileUpload
                    onFileSelect={setMedicalForm}
                    accept=".png,.jpg,.jpeg,.pdf"
                    maxSize={10 * 1024 * 1024}
                  />
                </div>
              </div>
            </div>

            {/* Subscription & Payment */}
            <div>
              <h4 className="text-lg font-medium text-gray-900 mb-4">
                Subscription & Payment Details
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <FormField
                  control={form.control}
                  name="subscriptionDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Subscription Start Date *</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                          onChange={(e) => {
                            field.onChange(e);
                            form.setValue("subscriptionEndDate", addOneMonth(e.target.value));
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="subscriptionEndDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Subscription End Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="totalSessionsAllowed"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sessions Allowed *</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          min="1"
                          placeholder="8" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <FormField
                  control={form.control}
                  name="subscriptionFee"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Total Subscription Fee (AED) *</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.01" 
                          min="0"
                          placeholder="200.00" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="discountPercentage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Discount (%)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.01" 
                          min="0"
                          max="100"
                          placeholder="0" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Final price after discount (auto-calculated) */}
              {(() => {
                const fee = parseFloat(form.watch("subscriptionFee") || "0") || 0;
                const discount = Math.min(100, Math.max(0, parseFloat(form.watch("discountPercentage") || "0") || 0));
                const finalPrice = Math.max(0, fee * (1 - discount / 100));
                return (
                  <div className="mb-6 bg-blue-50 border border-blue-100 p-4 rounded-lg flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-blue-900">Final Price After Discount</p>
                      <p className="text-xs text-blue-700">
                        {discount > 0 ? `AED ${fee.toFixed(2)} − ${discount}% discount` : "No discount applied"}
                      </p>
                    </div>
                    <p className="text-xl font-bold text-academy-blue">AED {finalPrice.toFixed(2)}</p>
                  </div>
                );
              })()}

              <div className="bg-gray-50 p-4 rounded-lg">
                <h5 className="text-md font-medium text-gray-900 mb-3">Initial Payment (Optional)</h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="amountPaid"
                    render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount Paid</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.01" 
                          placeholder="0.00" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="paymentMethod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment Method</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select method" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.entries(PAYMENT_METHODS).map(([key, method]) => (
                            <SelectItem key={key} value={key}>
                              {method.icon} {method.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                </div>
                <div className="col-span-2 text-sm text-gray-600">
                  <p>You can add more payments later if needed until the full subscription fee is paid.</p>
                </div>
              </div>
            </div>

            {/* Special Notes */}
            <div>
              <h4 className="text-lg font-medium text-gray-900 mb-4">Additional Information</h4>
              <FormField
                control={form.control}
                name="specialNotes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Special Notes</FormLabel>
                    <FormControl>
                      <textarea 
                        className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        placeholder="Any special instructions, medical conditions, or notes about this player..."
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-academy-blue hover:bg-academy-blue-light text-white"
                disabled={createPlayerMutation.isPending}
              >
                {createPlayerMutation.isPending ? "Adding..." : "Add Player"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
