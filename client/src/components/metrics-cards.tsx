import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Search, 
  Store, 
  TrendingUp, 
  MessageSquare,
  ArrowUp,
  ArrowDown
} from "lucide-react";

export default function MetricsCards() {
  const { data: metrics, isLoading } = useQuery({
    queryKey: ["/api/metrics"],
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-20 bg-slate-200 rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const metricCards = [
    {
      title: "Total Inquiries",
      value: metrics?.totalInquiries?.toLocaleString() || "0",
      change: "+12.5%",
      changeType: "positive" as const,
      icon: Search,
      color: "blue"
    },
    {
      title: "Active Vendors", 
      value: metrics?.activeVendors?.toString() || "0",
      change: "+8.2%",
      changeType: "positive" as const,
      icon: Store,
      color: "green"
    },
    {
      title: "Response Rate",
      value: `${metrics?.responseRate || 0}%`,
      change: "-2.1%",
      changeType: "negative" as const,
      icon: TrendingUp,
      color: "yellow"
    },
    {
      title: "Messages Sent",
      value: metrics?.messagesSent?.toLocaleString() || "0",
      change: "+15.3%",
      changeType: "positive" as const,
      icon: MessageSquare,
      color: "purple"
    }
  ];

  const colorClasses = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600", 
    yellow: "bg-yellow-50 text-yellow-600",
    purple: "bg-purple-50 text-purple-600"
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {metricCards.map((card, index) => {
        const Icon = card.icon;
        const isPositive = card.changeType === "positive";
        
        return (
          <Card key={index} className="shadow-sm border-slate-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">{card.title}</p>
                  <p className="text-2xl font-bold text-slate-900 mt-2">{card.value}</p>
                  <div className="flex items-center mt-2">
                    {isPositive ? (
                      <ArrowUp className="w-3 h-3 text-green-600 mr-1" />
                    ) : (
                      <ArrowDown className="w-3 h-3 text-red-600 mr-1" />
                    )}
                    <span className={`text-xs font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                      {card.change}
                    </span>
                    <span className="text-xs text-slate-500 ml-1">vs last month</span>
                  </div>
                </div>
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${colorClasses[card.color]}`}>
                  <Icon className="w-6 h-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
