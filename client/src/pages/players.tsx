import { useState } from "react";
import { Plus, Search, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import PlayersTable from "@/components/players/players-table";
import AddPlayerModal from "@/components/modals/add-player-modal";
import { ACTIVITIES } from "@/lib/constants";
import { useQuery } from "@tanstack/react-query";
import { generateAllPlayersPDF } from "@/lib/pdf-generator";
import { PROTECTED_ACTIVITY } from "@shared/schema";
import { useProtectedArea } from "@/hooks/use-protected-area";
import { HiddenProtectedNotice, LockedSpecialNeedsPanel } from "@/components/protected-area";

export default function Players() {
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedActivity, setSelectedActivity] = useState("");
  const [isPrinting, setIsPrinting] = useState(false);
  const { isUnlocked } = useProtectedArea();
  // While locked the server leaves Special Needs players out of the list
  const specialNeedsSelected = selectedActivity === PROTECTED_ACTIVITY;

  const { data: allPlayers } = useQuery({ queryKey: ["/api/players"] });

  const handlePrintAll = () => {
    const players = allPlayers as any[];
    if (!players || players.length === 0) return;
    setIsPrinting(true);
    try {
      const pdf = generateAllPlayersPDF(players);
      pdf.save(`all-players-${new Date().toISOString().split('T')[0]}.pdf`);
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <>
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 px-4 sm:px-8 py-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">Players</h2>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              onClick={handlePrintAll}
              disabled={isPrinting || !allPlayers || (allPlayers as any[]).length === 0}
              className="border-gray-300 text-gray-700 hover:bg-gray-50 hidden sm:flex"
            >
              <Printer className="mr-2 h-4 w-4" />
              {isPrinting ? "Generating..." : "Print All"}
            </Button>
            <Button 
              onClick={() => setShowAddPlayer(true)}
              className="bg-academy-blue hover:bg-academy-blue-light text-white"
            >
              <Plus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Add Player</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 p-4 sm:p-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {/* Filters */}
          <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h3 className="text-lg font-semibold text-gray-900">Player Management</h3>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="Search players..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 w-full sm:w-64"
                  />
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
                        {key === PROTECTED_ACTIVITY && !isUnlocked && " 🔒"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {!isUnlocked && specialNeedsSelected ? (
            <LockedSpecialNeedsPanel />
          ) : (
            <>
              {!isUnlocked && (!selectedActivity || selectedActivity === "all") && (
                <HiddenProtectedNotice message="Special Needs players are hidden until the password is entered." />
              )}
              <PlayersTable searchTerm={searchTerm} activityFilter={selectedActivity} />
            </>
          )}
        </div>
      </main>

      <AddPlayerModal 
        open={showAddPlayer}
        onOpenChange={setShowAddPlayer}
      />
    </>
  );
}
