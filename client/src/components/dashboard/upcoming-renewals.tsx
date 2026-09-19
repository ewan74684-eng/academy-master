import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { User } from "lucide-react";
import { ACTIVITIES } from "@/lib/constants";
import { format } from "date-fns";
import ViewPlayerModal from "@/components/modals/view-player-modal";
import RenewPlayerModal from "@/components/modals/renew-player-modal";

export default function UpcomingRenewals() {
  const [renewPlayerId, setRenewPlayerId] = useState<string | null>(null);
  const [contactPlayerId, setContactPlayerId] = useState<string | null>(null);

  const { data: renewals, isLoading } = useQuery({
    queryKey: ["/api/dashboard/upcoming-renewals"],
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Upcoming Renewals</CardTitle>
        </CardHeader>
        <CardContent className="animate-pulse">
          <div className="h-64 bg-gray-200 rounded"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle>Upcoming Renewals</CardTitle>
      </CardHeader>
      <CardContent className="p-0 sm:p-6">
        {/* Mobile card list */}
        <div className="sm:hidden divide-y divide-gray-100">
          {(renewals as any)?.length === 0 && (
            <p className="text-center text-gray-400 py-8 text-sm">No upcoming renewals.</p>
          )}
          {(renewals as any)?.map((player: any) => {
            const activity = ACTIVITIES[player.activity as keyof typeof ACTIVITIES];
            return (
              <div key={player.id} className="p-4 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-gray-300 rounded-full flex items-center justify-center shrink-0">
                    <User className="h-4 w-4 text-gray-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{player.fullName}</p>
                    <p className="text-xs text-gray-500">{activity ? `${activity.emoji} ${activity.label}` : player.activity || 'No Activity'}</p>
                  </div>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 shrink-0">
                    Due
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-600 pl-12">
                  <span>{format(new Date(player.renewalDate), 'MMM dd, yyyy')}</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 font-medium">
                    {player.sessionsLeft} sessions left
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Player</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Activity</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Renewal Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sessions Left</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {(renewals as any)?.map((player: any) => {
                const activity = ACTIVITIES[player.activity as keyof typeof ACTIVITIES];
                return (
                  <tr key={player.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center">
                          <User className="h-5 w-5 text-gray-600" />
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{player.fullName}</div>
                          <div className="text-sm text-gray-500">ID: #{player.id.slice(0, 8)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {activity ? `${activity.emoji} ${activity.label}` : player.activity || 'No Activity'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {format(new Date(player.renewalDate), 'MMM dd, yyyy')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        {player.sessionsLeft} sessions
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        Renewal Due
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                      <Button
                        variant="link"
                        className="text-academy-blue hover:text-academy-blue-light p-0"
                        onClick={() => setRenewPlayerId(player.id)}
                      >
                        Renew
                      </Button>
                      <Button
                        variant="link"
                        className="text-gray-600 hover:text-gray-900 p-0"
                        onClick={() => setContactPlayerId(player.id)}
                      >
                        Contact
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>

    <RenewPlayerModal
      open={!!renewPlayerId}
      onOpenChange={(open) => { if (!open) setRenewPlayerId(null); }}
      playerId={renewPlayerId}
    />
    <ViewPlayerModal
      open={!!contactPlayerId}
      onOpenChange={(open) => { if (!open) setContactPlayerId(null); }}
      playerId={contactPlayerId}
    />
  </>
  );
}

