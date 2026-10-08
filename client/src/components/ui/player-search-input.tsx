import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ACTIVITIES } from "@/lib/constants";

interface Player {
  id: string;
  fullName: string;
  activity: string;
  phoneNumber?: string;
}

interface PlayerSearchInputProps {
  players: Player[];
  onPlayerSelect: (playerId: string) => void;
  selectedPlayerId?: string;
  placeholder?: string;
}

export default function PlayerSearchInput({ 
  players, 
  onPlayerSelect, 
  selectedPlayerId, 
  placeholder = "Search players by name, activity, or phone..." 
}: PlayerSearchInputProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [showResults, setShowResults] = useState(false);

  const activityText = (activity: string) => {
    const display = ACTIVITIES[activity as keyof typeof ACTIVITIES];
    return display ? `${display.emoji} ${display.label}` : `- ${activity || 'No Activity'}`;
  };

  const filteredPlayers = players.filter(player => {
    const searchLower = searchTerm.toLowerCase();
    return (
      player.fullName?.toLowerCase().includes(searchLower) ||
      player.activity?.toLowerCase().includes(searchLower) ||
      activityText(player.activity).toLowerCase().includes(searchLower) ||
      (player.phoneNumber && player.phoneNumber.includes(searchTerm))
    );
  }).slice(0, 10); // Limit to 10 results

  const selectedPlayer = players.find(p => p.id === selectedPlayerId);

  const handlePlayerSelect = (player: Player) => {
    onPlayerSelect(player.id);
    setSearchTerm("");
    setShowResults(false);
  };

  const clearSelection = () => {
    onPlayerSelect("");
    setSearchTerm("");
  };

  return (
    <div className="relative">
      {selectedPlayer ? (
        <div className="flex items-center justify-between p-3 border rounded-md bg-gray-50">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
              <User className="h-4 w-4 text-gray-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{selectedPlayer.fullName}</p>
              <div className="flex items-center space-x-2">
                <Badge variant="outline" className="text-xs">
                  {activityText(selectedPlayer.activity)}
                </Badge>
                {selectedPlayer.phoneNumber && (
                  <span className="text-xs text-gray-500">{selectedPlayer.phoneNumber}</span>
                )}
              </div>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearSelection}
            className="text-gray-400 hover:text-gray-600"
          >
            ×
          </Button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              type="text"
              placeholder={placeholder}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setShowResults(e.target.value.length > 0);
              }}
              onFocus={() => searchTerm.length > 0 && setShowResults(true)}
              onBlur={() => setTimeout(() => setShowResults(false), 150)}
              className="pl-10"
            />
          </div>

          {showResults && searchTerm && (
            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-64 overflow-y-auto">
              {filteredPlayers.length > 0 ? (
                <div className="py-1">
                  {filteredPlayers.map((player) => (
                    <button
                      key={player.id}
                      type="button"
                      className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center space-x-3"
                      // Keep focus in the input: otherwise its blur hides this list before a slow click lands
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handlePlayerSelect(player)}
                    >
                      <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                        <User className="h-4 w-4 text-gray-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{player.fullName}</p>
                        <div className="flex items-center space-x-2">
                          <Badge variant="outline" className="text-xs">
                            {activityText(player.activity)}
                          </Badge>
                          {player.phoneNumber && (
                            <span className="text-xs text-gray-500">{player.phoneNumber}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-2 text-sm text-gray-500">
                  No players found matching "{searchTerm}"
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}