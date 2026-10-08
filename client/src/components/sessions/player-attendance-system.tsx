import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { 
  Calendar, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Users, 
  Plus,
  Search,
  Filter,
  UserCheck
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ACTIVITIES } from "@/lib/constants";
import { apiRequest } from "@/lib/queryClient";
import MarkPlayerAttendanceModal from "@/components/modals/mark-player-attendance-modal";
import { LockedSpecialNeedsPanel } from "@/components/protected-area";
import { useProtectedArea, useOnProtectedAreaLock } from "@/hooks/use-protected-area";
import { PROTECTED_ACTIVITY } from "@shared/schema";

const ATTENDANCE_STATUS_COLORS = {
  present: "bg-green-100 text-green-800",
  absent: "bg-red-100 text-red-800", 
  late: "bg-yellow-100 text-yellow-800",
  excused: "bg-blue-100 text-blue-800",
} as const;

const SUBSCRIPTION_STATUS_COLORS = {
  active: "bg-green-100 text-green-800",
  paused: "bg-yellow-100 text-yellow-800",
  expired: "bg-red-100 text-red-800",
  renewal_due: "bg-orange-100 text-orange-800",
  cancelled: "bg-gray-100 text-gray-800",
} as const;

export default function PlayerAttendanceSystem() {
  const [selectedActivity, setSelectedActivity] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isUnlocked } = useProtectedArea();

  // Don't leave a Special Needs player on screen once the protected area locks
  useOnProtectedAreaLock(() => {
    if (selectedPlayer?.activity === PROTECTED_ACTIVITY) {
      setShowAttendanceModal(false);
      setSelectedPlayer(null);
    }
  });

  const { data: players, isLoading: playersLoading } = useQuery({
    queryKey: ["/api/players"],
  });

  const { data: sessions } = useQuery({
    queryKey: ["/api/sessions"],
  });

  const markAttendanceMutation = useMutation({
    mutationFn: async (data: {
      playerId: string;
      sessionDate: string;
      sessionTime: string;
      attendanceStatus: string;
      actualStartTime?: string;
      actualEndTime?: string;
      instructorName?: string;
      notes?: string;
    }) => {
      // Create session date with time
      const sessionDateTime = new Date(`${data.sessionDate}T${data.sessionTime}`);
      const scheduledEndTime = new Date(sessionDateTime);
      scheduledEndTime.setHours(scheduledEndTime.getHours() + 1); // Default 1 hour session

      const actualStartTime = data.actualStartTime 
        ? new Date(`${data.sessionDate}T${data.actualStartTime}`)
        : sessionDateTime;
      
      const actualEndTime = data.actualEndTime 
        ? new Date(`${data.sessionDate}T${data.actualEndTime}`)
        : null;

      const sessionData = {
        playerId: data.playerId,
        sessionDate: sessionDateTime.toISOString(),
        scheduledStartTime: sessionDateTime.toISOString(),
        scheduledEndTime: scheduledEndTime.toISOString(),
        actualStartTime: actualStartTime.toISOString(),
        actualEndTime: actualEndTime ? actualEndTime.toISOString() : null,
        attendanceStatus: data.attendanceStatus,
        // sessionStatus label: 'present'/'late' → 'attended', 'absent'/'excused' → 'missed'.
        // Session-balance consumption is decided by the backend: every status EXCEPT
        // 'excused' consumes a session (present, late and absent all deduct). The backend
        // re-derives sessionStatus authoritatively — see createSession.
        sessionStatus: (data.attendanceStatus === 'present' || data.attendanceStatus === 'late') ? 'attended' : 'missed',
        instructorName: data.instructorName || null,
        notes: data.notes || null,
      };

      return apiRequest('POST', '/api/sessions', sessionData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      toast({
        title: "Success",
        description: "Attendance marked successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const filteredPlayers = (players as any)?.filter((player: any) => {
    const matchesActivity = !selectedActivity || selectedActivity === 'all' || player.activity === selectedActivity;
    const matchesSearch = !searchTerm || player.fullName?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesActivity && matchesSearch;
  }) || [];

  // Get today's sessions
  const todaySessions = (sessions as any)?.filter((session: any) => 
    format(new Date(session.sessionDate), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
  ) || [];

  const todayStats = {
    totalSessions: todaySessions.length,
    present: todaySessions.filter((s: any) => s.attendanceStatus === 'present').length,
    absent: todaySessions.filter((s: any) => s.attendanceStatus === 'absent').length,
    late: todaySessions.filter((s: any) => s.attendanceStatus === 'late').length,
  };

  if (playersLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-200 rounded-lg"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Today's Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-6">
        <Card>
          <CardContent className="p-3 md:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <div className="mb-2 sm:mb-0">
                <p className="text-xs sm:text-sm font-medium text-gray-600">Today's Sessions</p>
                <p className="text-xl md:text-2xl font-bold text-gray-900">{todayStats.totalSessions}</p>
              </div>
              <Calendar className="h-6 w-6 sm:h-8 sm:w-8 text-academy-blue" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 md:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <div className="mb-2 sm:mb-0">
                <p className="text-xs sm:text-sm font-medium text-gray-600">Present Today</p>
                <p className="text-xl md:text-2xl font-bold text-green-600">{todayStats.present}</p>
              </div>
              <CheckCircle className="h-6 w-6 sm:h-8 sm:w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 md:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <div className="mb-2 sm:mb-0">
                <p className="text-xs sm:text-sm font-medium text-gray-600">Absent Today</p>
                <p className="text-xl md:text-2xl font-bold text-red-600">{todayStats.absent}</p>
              </div>
              <XCircle className="h-6 w-6 sm:h-8 sm:w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 md:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <div className="mb-2 sm:mb-0">
                <p className="text-xs sm:text-sm font-medium text-gray-600">Late Today</p>
                <p className="text-xl md:text-2xl font-bold text-yellow-600">{todayStats.late}</p>
              </div>
              <Clock className="h-6 w-6 sm:h-8 sm:w-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 md:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <div className="mb-2 sm:mb-0">
                <p className="text-xs sm:text-sm font-medium text-gray-600">Rate</p>
                <p className="text-xl md:text-2xl font-bold text-academy-blue">
                  {/* Attendance rate: present AND late both count as attended (both consume a session). */}
                  {todayStats.totalSessions > 0
                    ? Math.round(((todayStats.present + todayStats.late) / todayStats.totalSessions) * 100)
                    : 0}%
                </p>
              </div>
              <Users className="h-6 w-6 sm:h-8 sm:w-8 text-academy-blue" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Player List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Mark Player Attendance</span>
            <div className="text-sm font-normal text-gray-600">
              Select a player to mark their attendance
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-4 sm:mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search players..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 text-sm"
                />
              </div>
            </div>
            <Select value={selectedActivity} onValueChange={setSelectedActivity}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="All Activities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Activities</SelectItem>
                {Object.entries(ACTIVITIES).map(([key, activity]) => (
                  <SelectItem key={key} value={key}>
                    {activity.emoji} {activity.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Players Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredPlayers.map((player: any) => {
              const activity = ACTIVITIES[player.activity as keyof typeof ACTIVITIES];
              const remainingSessions = player.totalSessionsAllowed - player.sessionsAttended;
              
              return (
                <Card key={player.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-3 space-y-2 sm:space-y-0">
                      <div className="flex items-center space-x-2 sm:space-x-3">
                        <div className="text-xl sm:text-2xl">{activity?.emoji}</div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-medium text-gray-900 text-sm sm:text-base truncate">{player.fullName}</h3>
                          <p className="text-xs sm:text-sm text-gray-600">{activity?.label}</p>
                        </div>
                      </div>
                      <Badge 
                        className={`${SUBSCRIPTION_STATUS_COLORS[player.subscriptionStatus as keyof typeof SUBSCRIPTION_STATUS_COLORS]} text-xs flex-shrink-0`}
                      >
                        {player.subscriptionStatus?.replace('_', ' ')}
                      </Badge>
                    </div>

                    <div className="space-y-2 mb-3 sm:mb-4">
                      <div className="flex justify-between text-xs sm:text-sm">
                        <span className="text-gray-600">Sessions:</span>
                        <span className={`font-medium ${remainingSessions <= 3 ? 'text-orange-600' : 'text-gray-900'}`}>
                          {remainingSessions} / {player.totalSessionsAllowed}
                        </span>
                      </div>
                      {remainingSessions <= 3 && (
                        <Badge variant="outline" className="w-full justify-center text-orange-600 border-orange-200 text-xs">
                          {remainingSessions === 0 ? 'No Sessions Left' : 'Low Sessions'}
                        </Badge>
                      )}
                    </div>

                    <Button
                      onClick={() => {
                        setSelectedPlayer(player);
                        setShowAttendanceModal(true);
                      }}
                      className="w-full bg-academy-blue hover:bg-academy-blue-light text-white text-xs sm:text-sm"
                      size="sm"
                    >
                      <UserCheck className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                      Mark Attendance
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* While locked the server leaves Special Needs players out, so ask for the password */}
          {filteredPlayers.length === 0 && (!isUnlocked && selectedActivity === PROTECTED_ACTIVITY ? (
            <LockedSpecialNeedsPanel />
          ) : (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No players found matching your filters.</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Recent Sessions Today */}
      {todaySessions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Today's Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {todaySessions.map((session: any) => (
                <div key={session.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="text-lg">
                      {ACTIVITIES[session.activity as keyof typeof ACTIVITIES]?.emoji}
                    </div>
                    <div>
                      <p className="font-medium">{session.playerName}</p>
                      <p className="text-sm text-gray-600">
                        {format(new Date(session.sessionDate), 'HH:mm')}
                        {session.instructorName && ` • ${session.instructorName}`}
                      </p>
                    </div>
                  </div>
                  <Badge className={ATTENDANCE_STATUS_COLORS[session.attendanceStatus as keyof typeof ATTENDANCE_STATUS_COLORS]}>
                    {session.attendanceStatus}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modal */}
      <MarkPlayerAttendanceModal
        open={showAttendanceModal}
        onOpenChange={setShowAttendanceModal}
        player={selectedPlayer}
        onMarkAttendance={(data) => {
          markAttendanceMutation.mutate({
            playerId: selectedPlayer.id,
            ...data,
          });
        }}
      />
    </div>
  );
}