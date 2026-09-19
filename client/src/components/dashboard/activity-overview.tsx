import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ACTIVITIES } from "@/lib/constants";

export default function ActivityOverview() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["/api/dashboard/stats"],
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Players by Activity</CardTitle>
        </CardHeader>
        <CardContent className="animate-pulse">
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const activityCounts = (stats as any)?.playersByActivity || [];

  return (
    <Card className="glass border-none bg-white/60">
      <CardHeader className="border-b border-gray-100/50 pb-4">  
        <CardTitle className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600">Players by Activity</CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="space-y-4">
          {activityCounts.map((item: any) => {
            const activity = ACTIVITIES[item.activity as keyof typeof ACTIVITIES];
            if (!activity) return null;
            return (
              <div 
                key={item.activity}
                className="flex items-center justify-between p-4 bg-white/40 rounded-xl transition-all hover:scale-[1.02] hover:bg-white/60 hover:shadow-sm border border-transparent hover:border-white/50 cursor-default"
              >
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-gray-50 to-gray-100 rounded-full flex items-center justify-center shadow-sm border border-gray-100 flex-shrink-0">
                    <span className="text-2xl">{activity.emoji}</span>
                  </div>
                  <span className="font-semibold text-gray-800 tracking-wide">{activity.label}</span>
                </div>
                <span className="bg-gradient-to-r from-academy-blue to-blue-600 text-white px-4 py-1.5 rounded-full text-sm font-bold shadow-sm">
                  {item.count}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
