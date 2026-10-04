import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ACTIVITIES, PAYMENT_METHODS } from "@/lib/constants";
import { RefreshCw, Calendar, CreditCard } from "lucide-react";
import DocumentManager from "@/components/ui/document-manager";
import { PhoneInput } from "@/components/ui/phone-input";
import { addOneMonth } from "@/lib/utils";

const editPlayerSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  dateOfBirth: z.string().min(1, "Date of birth is required"),
  phoneNumber: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  activity: z.string().min(1, "Activity selection is required"),
  subscriptionDate: z.string().min(1, "Subscription date is required"),
  subscriptionEndDate: z.string().optional(),
  totalSessionsAllowed: z.string().min(1, "Sessions allowed is required"),
  monthlySubscriptionFee: z.string().min(1, "Monthly fee is required"),
  discountPercentage: z.string().optional(),
  subscriptionStatus: z.string(),
  pauseReason: z.string().optional(),
  specialNotes: z.string().optional(),
});

const renewalSchema = z.object({
  subscriptionFee: z.string().min(1, "Subscription fee is required"),
  totalSessionsAllowed: z.string().min(1, "Sessions allowed is required"),
  subscriptionStartDate: z.string().min(1, "Subscription start date is required"),
  subscriptionEndDate: z.string().min(1, "Subscription end date is required"),
  amountPaid: z.string().optional(),
  paymentMethod: z.string(),
  description: z.string().optional(),
});

type EditPlayerForm = z.infer<typeof editPlayerSchema>;
type RenewalForm = z.infer<typeof renewalSchema>;

// Normalize any stored date value (ISO string, 'YYYY-MM-DD', or Date) to the
// 'YYYY-MM-DD' format an <input type="date"> requires.
function toDateInputValue(value: any): string {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  const d = new Date(value);
  return isNaN(d.getTime()) ? "" : format(d, "yyyy-MM-dd");
}

interface EditPlayerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  player: any;
  defaultTab?: string;
}

export default function EditPlayerModal({ open, onOpenChange, player, defaultTab = "edit" }: EditPlayerModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState(defaultTab);

  // Fetch full player data (including documents)
  const { data: fullPlayerData, isLoading: isLoadingPlayer } = useQuery<any>({
    queryKey: ['/api/players', player?.id],
    enabled: !!player?.id && open,
  });

  // Reset active tab whenever the modal opens or the defaultTab changes
  useEffect(() => {
    if (open) {
      setActiveTab(defaultTab);
    }
  }, [open, defaultTab]);

  const form = useForm<EditPlayerForm>({
    resolver: zodResolver(editPlayerSchema),
    defaultValues: {
      fullName: "",
      dateOfBirth: "",
      phoneNumber: "",
      email: "",
      activity: "",
      subscriptionDate: "",
      subscriptionEndDate: "",
      totalSessionsAllowed: "8",
      monthlySubscriptionFee: "100",
      discountPercentage: "0",
      subscriptionStatus: "active",
      pauseReason: "",
      specialNotes: "",
    },
  });

  const renewalForm = useForm<RenewalForm>({
    resolver: zodResolver(renewalSchema),
    defaultValues: {
      subscriptionFee: "100",
      totalSessionsAllowed: "8",
      amountPaid: "0",
      paymentMethod: "cash",
      description: "Subscription renewal",
    },
  });

  // Update form when player data changes
  useEffect(() => {
    if (player && open) {
      form.reset({
        fullName: player.fullName || "",
        dateOfBirth: toDateInputValue(player.dateOfBirth),
        phoneNumber: player.phoneNumber || "",
        email: player.email || "",
        activity: player.activity || "",
        subscriptionDate: player.subscriptionDate ? new Date(player.subscriptionDate).toISOString().split('T')[0] : "",
        subscriptionEndDate: player.subscriptionEndDate ? new Date(player.subscriptionEndDate).toISOString().split('T')[0] : "",
        totalSessionsAllowed: player.totalSessionsAllowed?.toString() || "8",
        monthlySubscriptionFee: player.monthlySubscriptionFee || "100",
        discountPercentage: player.discountPercentage || "0",
        subscriptionStatus: player.subscriptionStatus || "active",
        pauseReason: player.pauseReason || "",
        specialNotes: player.specialNotes || "",
      });
      
      const today = new Date().toISOString().split('T')[0];
      const oneMonthLater = new Date();
      oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
      const oneMonthLaterStr = oneMonthLater.toISOString().split('T')[0];
      
      renewalForm.reset({
        subscriptionFee: player.monthlySubscriptionFee || "100",
        totalSessionsAllowed: player.totalSessionsAllowed?.toString() || "8",
        subscriptionStartDate: today,
        subscriptionEndDate: oneMonthLaterStr,
        amountPaid: "0",
        paymentMethod: "cash",
        description: "Subscription renewal",
      });
    }
  }, [player, open, form, renewalForm]);

  const updatePlayerMutation = useMutation({
    mutationFn: async (data: EditPlayerForm) => {
      const updateData = {
        ...data,
        totalSessionsAllowed: parseInt(data.totalSessionsAllowed),
        // Keep the original pause date when a paused player is edited; only stamp it when pausing now
        pausedDate: data.subscriptionStatus === 'paused'
          ? (player.subscriptionStatus === 'paused' && player.pausedDate ? player.pausedDate : new Date())
          : null,
      };

      return apiRequest("PUT", `/api/players/${player.id}`, updateData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Success",
        description: "Player updated successfully",
      });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const renewSubscriptionMutation = useMutation({
    mutationFn: async (data: RenewalForm) => {
      return apiRequest("POST", `/api/players/${player.id}/renew`, {
        subscriptionFee: data.subscriptionFee,
        totalSessionsAllowed: parseInt(data.totalSessionsAllowed),
        subscriptionStartDate: data.subscriptionStartDate,
        subscriptionEndDate: data.subscriptionEndDate,
        amountPaid: parseFloat(data.amountPaid || "0"),
        paymentMethod: data.paymentMethod,
        description: data.description || "Subscription renewal",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/renewal-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/upcoming-renewals"] });
      toast({
        title: "Success",
        description: "Subscription renewed successfully",
      });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: EditPlayerForm) => {
    updatePlayerMutation.mutate(data);
  };

  const onRenewalSubmit = (data: RenewalForm) => {
    renewSubscriptionMutation.mutate(data);
  };

  const watchedSubscriptionStatus = form.watch("subscriptionStatus");
  const watchedFee = parseFloat(form.watch("monthlySubscriptionFee") || "0") || 0;
  const watchedDiscount = Math.min(100, Math.max(0, parseFloat(form.watch("discountPercentage") || "0") || 0));
  const finalPrice = Math.max(0, watchedFee * (1 - watchedDiscount / 100));

  if (!player) return null;

  const remainingSessions = (player.totalSessionsAllowed || 8) - (player.sessionsAttended || 0);
  // The server charges the renewal at the fee after the player's discount
  const renewalDiscount = Math.min(100, Math.max(0, parseFloat(player.discountPercentage || "0") || 0));
  const renewalAmountDue = Math.max(0, (parseFloat(renewalForm.watch('subscriptionFee') || "0") || 0) * (1 - renewalDiscount / 100));
  const activity = player.activity ? ACTIVITIES[player.activity as keyof typeof ACTIVITIES] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Player - {player.fullName}</DialogTitle>
          <DialogDescription>
            Update player information, subscription status, and other details.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="edit">Edit Information</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="renew">Renew Subscription</TabsTrigger>
          </TabsList>

          {/* Player Information Overview */}
          <Card className="mt-4">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="text-2xl">{activity?.emoji}</div>
                  <div>
                    <h3 className="font-medium text-gray-900">{player.fullName}</h3>
                    <p className="text-sm text-gray-600">{activity?.label}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600">Sessions Remaining</p>
                  <p className="text-lg font-bold text-academy-blue">
                    {remainingSessions} / {player.totalSessionsAllowed}
                  </p>
                  <Badge className={
                    player.subscriptionStatus === 'active' 
                      ? 'bg-green-100 text-green-800'
                      : player.subscriptionStatus === 'paused'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-red-100 text-red-800'
                  }>
                    {player.subscriptionStatus?.replace('_', ' ')}
                  </Badge>
                </div>
              </div>
              {player.renewalDate && (
                <div className="mt-2 flex items-center text-sm text-gray-600">
                  <Calendar className="w-4 h-4 mr-1" />
                  Next renewal: {format(new Date(player.renewalDate), 'MMM dd, yyyy')}
                </div>
              )}
            </CardContent>
          </Card>

          <TabsContent value="edit" className="space-y-6 mt-6">
            <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
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
                    <Select onValueChange={field.onChange} value={field.value}>
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

            {/* Subscription Management */}
            <div>
              <h4 className="text-lg font-medium text-gray-900 mb-4">
                Subscription Management
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
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <FormField
                  control={form.control}
                  name="subscriptionStatus"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Subscription Status *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="paused">Paused</SelectItem>
                          <SelectItem value="expired">Expired</SelectItem>
                          <SelectItem value="renewal_due">Renewal Due</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
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

              {watchedSubscriptionStatus === 'paused' && (
                <FormField
                  control={form.control}
                  name="pauseReason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pause Reason</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Enter reason for pausing subscription" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            {/* Pricing Details */}
            <div>
              <h4 className="text-lg font-medium text-gray-900 mb-4">
                Pricing Details
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="monthlySubscriptionFee"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Monthly Subscription Fee (AED) *</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.01" 
                          min="0"
                          placeholder="100.00" 
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
              <div className="mt-4 bg-blue-50 border border-blue-100 p-4 rounded-lg flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-blue-900">Final Price After Discount</p>
                  <p className="text-xs text-blue-700">
                    {watchedDiscount > 0
                      ? `AED ${watchedFee.toFixed(2)} − ${watchedDiscount}% discount`
                      : "No discount applied"}
                  </p>
                </div>
                <p className="text-xl font-bold text-academy-blue">AED {finalPrice.toFixed(2)}</p>
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
                disabled={updatePlayerMutation.isPending}
              >
                {updatePlayerMutation.isPending ? "Updating..." : "Update Player"}
              </Button>
            </div>
          </form>
        </Form>
      </TabsContent>

      <TabsContent value="documents" className="space-y-6 mt-6">
        <div className="space-y-6">
          <div>
            <h4 className="text-lg font-medium text-gray-900 mb-4">Player Documents</h4>
            <p className="text-sm text-gray-600 mb-6">
              Manage player documents including ID documents, medical forms, and other files.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <DocumentManager
              playerId={player.id}
              documents={fullPlayerData?.documents || []}
              documentType="id"
              documentLabel="ID Document"
              accept=".png,.jpg,.jpeg,.pdf"
              maxSize={10 * 1024 * 1024}
            />

            <DocumentManager
              playerId={player.id}
              documents={fullPlayerData?.documents || []}
              documentType="medical_form"
              documentLabel="Medical Form"
              accept=".png,.jpg,.jpeg,.pdf"
              maxSize={10 * 1024 * 1024}
            />
          </div>
        </div>
      </TabsContent>

      <TabsContent value="renew" className="space-y-6 mt-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <RefreshCw className="w-5 h-5 text-academy-blue" />
              <span>Renew Subscription</span>
            </CardTitle>
            <CardDescription>
              Start a new subscription period and reset session counts. This will create a new subscription cycle from today.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...renewalForm}>
              <form onSubmit={renewalForm.handleSubmit(onRenewalSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={renewalForm.control}
                    name="subscriptionFee"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>New Subscription Fee (AED) *</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            step="0.01" 
                            min="0"
                            placeholder="100.00" 
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={renewalForm.control}
                    name="totalSessionsAllowed"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Total Sessions Allowed *</FormLabel>
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={renewalForm.control}
                    name="subscriptionStartDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Subscription Start Date *</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            {...field}
                            onChange={(e) => {
                              field.onChange(e);
                              renewalForm.setValue("subscriptionEndDate", addOneMonth(e.target.value));
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={renewalForm.control}
                    name="subscriptionEndDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Subscription End Date *</FormLabel>
                        <FormControl>
                          <Input 
                            type="date" 
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={renewalForm.control}
                    name="amountPaid"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Amount Paid Today (AED)</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            step="0.01" 
                            min="0"
                            placeholder="0.00" 
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={renewalForm.control}
                    name="paymentMethod"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Payment Method *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select payment method" />
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

                <FormField
                  control={renewalForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Subscription renewal" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="bg-blue-50 p-4 rounded-lg">
                  <h4 className="font-medium text-blue-900 mb-2 flex items-center">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Renewal Summary
                  </h4>
                  <div className="space-y-2 text-sm text-blue-800">
                    <div className="flex justify-between">
                      <span>Current sessions attended:</span>
                      <span>{player.sessionsAttended}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Current sessions remaining:</span>
                      <span>{remainingSessions}</span>
                    </div>
                    <Separator className="my-2" />
                    <div className="flex justify-between font-medium">
                      <span>After renewal sessions:</span>
                      <span>{renewalForm.watch('totalSessionsAllowed') || player.totalSessionsAllowed} (Reset to full)</span>
                    </div>
                    <div className="flex justify-between">
                      <span>New subscription start:</span>
                      <span>{renewalForm.watch('subscriptionStartDate') ? format(new Date(renewalForm.watch('subscriptionStartDate')), 'MMM dd, yyyy') : 'Not set'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>New subscription end:</span>
                      <span>{renewalForm.watch('subscriptionEndDate') ? format(new Date(renewalForm.watch('subscriptionEndDate')), 'MMM dd, yyyy') : 'Not set'}</span>
                    </div>
                    <div className="flex justify-between font-medium">
                      <span>New subscription fee:</span>
                      <span>AED {renewalForm.watch('subscriptionFee') || player.monthlySubscriptionFee}</span>
                    </div>
                    {renewalDiscount > 0 && (
                      <div className="flex justify-between font-medium">
                        <span>Amount due after {renewalDiscount}% discount:</span>
                        <span>AED {renewalAmountDue.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-end space-x-3 pt-6">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => onOpenChange(false)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    className="bg-green-600 hover:bg-green-700 text-white"
                    disabled={renewSubscriptionMutation.isPending}
                  >
                    {renewSubscriptionMutation.isPending ? "Renewing..." : "Renew Subscription"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
      </DialogContent>
    </Dialog>
  );
}