import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { User, Eye, Edit, Printer, Calendar, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ACTIVITIES, SUBSCRIPTION_STATUS_COLORS } from "@/lib/constants";
import { format } from "date-fns";
import ViewPlayerModal from "@/components/modals/view-player-modal";
import EditPlayerModal from "@/components/modals/edit-player-modal";
import AddPaymentModal from "@/components/modals/add-payment-modal";
import AddAdditionalPaymentModal from "@/components/modals/add-additional-payment-modal";
import { useOnProtectedAreaLock } from "@/hooks/use-protected-area";
import { PROTECTED_ACTIVITY } from "@shared/schema";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface PlayersTableProps {
  searchTerm: string;
  activityFilter: string;
}

export default function PlayersTable({ searchTerm, activityFilter }: PlayersTableProps) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showAdditionalPaymentModal, setShowAdditionalPaymentModal] = useState(false);
  const [deletePlayerId, setDeletePlayerId] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: players, isLoading } = useQuery({
    queryKey: ["/api/players"],
  });

  // Don't leave a Special Needs player's details on screen once the protected area locks
  useOnProtectedAreaLock(() => {
    if (selectedPlayer?.activity === PROTECTED_ACTIVITY) {
      setShowEditModal(false);
      setShowPaymentModal(false);
      setShowAdditionalPaymentModal(false);
      setSelectedPlayer(null);
    }
  });

  const deletePlayerMutation = useMutation({
    mutationFn: async (playerId: string) => {
      const response = await fetch(`/api/players/${playerId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete player");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Player deleted successfully",
        description: "The player and all associated data have been removed.",
      });
      setDeletePlayerId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error deleting player",
        description: error.message || "Failed to delete player. Please try again.",
        variant: "destructive",
      });
    },
  });

  const filteredPlayers =
    (players as any)?.filter((player: any) => {
      const matchesSearch = player.fullName
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      const matchesActivity =
        !activityFilter ||
        activityFilter === "all" ||
        player.activity === activityFilter;
      return matchesSearch && matchesActivity;
    }) || [];

  if (isLoading) {
    return (
      <div className="overflow-x-auto">
        <div className="min-w-full animate-pulse">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 border-b border-gray-200 bg-gray-50" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ── Mobile card list (hidden on sm+) ── */}
      <div className="sm:hidden divide-y divide-gray-100">
        {filteredPlayers.length === 0 && (
          <p className="text-center text-gray-400 py-10 text-sm">
            No players found.
          </p>
        )}
        {filteredPlayers.map((player: any) => {
          const activity = player.activity ? ACTIVITIES[player.activity as keyof typeof ACTIVITIES] : null;
          const age = player.dateOfBirth 
            ? new Date().getFullYear() - new Date(player.dateOfBirth).getFullYear()
            : 0;
          return (
            <div key={player.id} className="p-4 space-y-3">
              {/* Row 1: avatar + name + status */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center shrink-0">
                  <User className="h-5 w-5 text-gray-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {player.fullName}
                  </p>
                  <p className="text-xs text-gray-500">
                    Age {age} · #{player.id.slice(0, 8)}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${
                    player.subscriptionStatus && SUBSCRIPTION_STATUS_COLORS[
                      player.subscriptionStatus as keyof typeof SUBSCRIPTION_STATUS_COLORS
                    ] || "bg-gray-100 text-gray-800"
                  }`}
                >
                  {player.subscriptionStatus === "active"
                    ? "Active"
                    : player.subscriptionStatus === "expired"
                    ? "Expired"
                    : player.subscriptionStatus === "renewal_due"
                    ? "Renewal"
                    : player.subscriptionStatus === "paused"
                    ? "Paused"
                    : player.subscriptionStatus?.replace("_", " ") || "No Plan"}
                </span>
              </div>

              {/* Row 2: activity + sessions */}
              <div className="flex items-center gap-3 text-xs text-gray-600">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-medium">
                  {activity ? `${activity.emoji} ${activity.label}` : player.activity || 'No Activity'}
                </span>
                <span>
                  {player.sessionsAttended || 0}/{player.totalSessionsAllowed || 8}{" "}
                  sessions
                </span>
              </div>

              {/* Row 3: action buttons */}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs px-2 text-academy-blue border-blue-200"
                  onClick={() => {
                    setSelectedPlayerId(player.id);
                    setShowViewModal(true);
                  }}
                >
                  <Eye className="h-3.5 w-3.5 mr-1" /> View
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs px-2 text-blue-600 border-blue-200"
                  onClick={() => {
                    setSelectedPlayer(player);
                    setShowEditModal(true);
                  }}
                >
                  <Edit className="h-3.5 w-3.5 mr-1" /> Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs px-2 text-green-600 border-green-200"
                  onClick={() => {
                    setSelectedPlayerId(player.id);
                    setSelectedPlayer(player);
                    setShowAdditionalPaymentModal(true);
                  }}
                >
                  <Edit className="h-3.5 w-3.5 mr-1" /> Payment
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs px-2 text-red-600 border-red-200"
                  onClick={() => setDeletePlayerId(player.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Desktop table (hidden on mobile) ── */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Player
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Activity
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Subscription
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Payment Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Sessions
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredPlayers.map((player: any) => {
              const activity = player.activity ? ACTIVITIES[player.activity as keyof typeof ACTIVITIES] : null;
              const age = player.dateOfBirth
                ? new Date().getFullYear() - new Date(player.dateOfBirth).getFullYear()
                : 0;

              return (
                <tr key={player.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center">
                        <User className="h-5 w-5 text-gray-600" />
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {player.fullName}
                        </div>
                        <div className="text-sm text-gray-500">
                          ID: #{player.id.slice(0, 8)} • Age: {age}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {activity ? `${activity.emoji} ${activity.label}` : player.activity || 'No Activity'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {player.subscriptionDate ? (
                      <>
                        <div>
                          {format(
                            new Date(player.subscriptionDate),
                            "MMM dd, yyyy"
                          )}{" "}
                          -{" "}
                          {format(
                            new Date(
                              player.subscriptionEndDate || player.renewalDate
                            ),
                            "MMM dd, yyyy"
                          )}
                        </div>
                        <div className="text-xs text-gray-500">
                          {(() => {
                            const startDate = new Date(player.subscriptionDate);
                            const endDate = new Date(
                              player.subscriptionEndDate || player.renewalDate
                            );
                            const diffTime = Math.abs(
                              endDate.getTime() - startDate.getTime()
                            );
                            const diffDays = Math.ceil(
                              diffTime / (1000 * 60 * 60 * 24)
                            );
                            if (diffDays <= 7)
                              return `${diffDays} Day${diffDays > 1 ? "s" : ""} Plan`;
                            if (diffDays <= 14)
                              return `${Math.round(diffDays / 7)} Week${
                                Math.round(diffDays / 7) > 1 ? "s" : ""
                              } Plan`;
                            return `${Math.round(diffDays / 30)} Month${
                              Math.round(diffDays / 30) > 1 ? "s" : ""
                            } Plan`;
                          })()}
                        </div>
                      </>
                    ) : (
                      <span className="text-gray-400">No active plan</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        player.subscriptionStatus && SUBSCRIPTION_STATUS_COLORS[
                          player.subscriptionStatus as keyof typeof SUBSCRIPTION_STATUS_COLORS
                        ] || "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {player.subscriptionStatus === "active"
                        ? "Active"
                        : player.subscriptionStatus === "expired"
                        ? "Expired"
                        : player.subscriptionStatus === "renewal_due"
                        ? "Renewal Due"
                        : player.subscriptionStatus === "paused"
                        ? "Paused"
                        : player.subscriptionStatus === "cancelled"
                        ? "Cancelled"
                        : player.subscriptionStatus?.replace("_", " ") || "No Plan"}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {player.sessionsAttended || 0}/{player.totalSessionsAllowed || 8}{" "}
                      attended
                    </div>
                    <div className="text-xs text-gray-500">
                      {Math.max(
                        0,
                        (player.totalSessionsAllowed || 8) - (player.sessionsAttended || 0)
                      )}{" "}
                      remaining
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    <Button
                      variant="link"
                      className="text-academy-blue hover:text-academy-blue-light p-0"
                      onClick={() => {
                        setSelectedPlayerId(player.id);
                        setShowViewModal(true);
                      }}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Button>
                    <Button
                      variant="link"
                      className="text-blue-600 hover:text-blue-700 p-0"
                      onClick={() => {
                        setSelectedPlayer(player);
                        setShowEditModal(true);
                      }}
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="link"
                      className="text-green-600 hover:text-green-700 p-0"
                      onClick={() => {
                        setSelectedPlayerId(player.id);
                        setSelectedPlayer(player);
                        setShowAdditionalPaymentModal(true);
                      }}
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      Add Payment
                    </Button>
                    <Button
                      variant="link"
                      className="text-purple-600 hover:text-purple-700 p-0"
                      onClick={() => {
                        setSelectedPlayerId(player.id);
                        setShowViewModal(true);
                      }}
                    >
                      <Printer className="h-4 w-4 mr-1" />
                      Print
                    </Button>
                    <Button
                      variant="link"
                      className="text-red-600 hover:text-red-700 p-0"
                      onClick={() => setDeletePlayerId(player.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      <ViewPlayerModal
        open={showViewModal}
        onOpenChange={setShowViewModal}
        playerId={selectedPlayerId}
      />
      <AddPaymentModal
        open={showPaymentModal}
        onOpenChange={setShowPaymentModal}
        selectedPlayerId={selectedPlayerId || undefined}
      />
      <EditPlayerModal
        open={showEditModal}
        onOpenChange={setShowEditModal}
        player={selectedPlayer}
      />
      <AddAdditionalPaymentModal
        open={showAdditionalPaymentModal}
        onOpenChange={setShowAdditionalPaymentModal}
        playerId={selectedPlayerId || undefined}
        playerName={selectedPlayer?.fullName || undefined}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deletePlayerId}
        onOpenChange={() => setDeletePlayerId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Player</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this player? This action will
              permanently remove the player and all associated data including
              payments, documents, and session records. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deletePlayerId && deletePlayerMutation.mutate(deletePlayerId)
              }
              className="bg-red-600 hover:bg-red-700"
              disabled={deletePlayerMutation.isPending}
            >
              {deletePlayerMutation.isPending ? "Deleting..." : "Delete Player"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
