import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { TRAINER_ROLE_DISPLAY } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

interface Trainer {
  id: string;
  name: string;
  activity: string;
  baseSalary: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trainer?: Trainer | null; // if provided → edit mode
}

export default function AddTrainerModal({ open, onOpenChange, trainer }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [activity, setActivity] = useState("");
  const [baseSalary, setBaseSalary] = useState("");

  const isEdit = !!trainer;

  // Populate form in edit mode
  useEffect(() => {
    if (trainer) {
      setName(trainer.name);
      setActivity(trainer.activity);
      setBaseSalary(trainer.baseSalary);
    } else {
      setName("");
      setActivity("");
      setBaseSalary("");
    }
  }, [trainer, open]);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = { name, activity, baseSalary: parseFloat(baseSalary) };
      if (isEdit) {
        return await apiRequest("PUT", `/api/trainers/${trainer!.id}`, payload);
      }
      return await apiRequest("POST", "/api/trainers", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trainers"] });
      toast({ title: isEdit ? "Employee updated" : "Employee added", description: name });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !activity || !baseSalary) return;
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            {isEdit ? "Edit Employee" : "Add New Employee"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 pt-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="trainer-name">Full Name</Label>
            <Input
              id="trainer-name"
              placeholder="e.g. Ahmed Hassan"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          {/* Activity */}
          <div className="space-y-1.5">
            <Label htmlFor="trainer-activity">Role</Label>
            <Select value={activity} onValueChange={setActivity} required>
              <SelectTrigger id="trainer-activity">
                <SelectValue placeholder="Select role…" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TRAINER_ROLE_DISPLAY).map(([key, val]) => (
                  <SelectItem key={key} value={key}>
                    {val.emoji} {val.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Base Salary */}
          <div className="space-y-1.5">
            <Label htmlFor="trainer-salary">Monthly Base Salary (AED)</Label>
            <Input
              id="trainer-salary"
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 5000"
              value={baseSalary}
              onChange={(e) => setBaseSalary(e.target.value)}
              required
            />
          </div>

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Saving…" : isEdit ? "Save Changes" : "Add Employee"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
