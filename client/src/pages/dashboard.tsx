import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Sidebar from "@/components/sidebar";
import MetricsCards from "@/components/metrics-cards";
import InquiriesTable from "@/components/inquiries-table";
import VendorsTable from "@/components/vendors-table";
import BotConfig from "@/components/bot-config";
import ApiDocs from "@/components/api-docs";
import ApiKeys from "@/components/api-keys";
import { Bell, User, MessageCircle, X, Trash2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type TabType = "dashboard" | "inquiries" | "vendors" | "analytics" | "bot-config" | "api" | "api-keys";

// Fixed Notification Bell Component
function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["/api/admin/notifications"],
    refetchInterval: 30000,
  });

  const markAsReadMutation = useMutation({
    mutationFn: (notificationId: number) => 
      apiRequest("PUT", `/api/admin/notifications/${notificationId}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notifications"] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/admin/notifications/mark-all-read"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notifications"] });
      toast({ title: "Success", description: "All notifications marked as read" });
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/admin/notifications/clear-all"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notifications"] });
      setIsOpen(false);
      toast({ title: "Success", description: "All notifications cleared" });
    },
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: (notificationId: number) => 
      apiRequest("DELETE", `/api/admin/notifications/${notificationId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notifications"] });
      toast({ title: "Success", description: "Notification deleted" });
    },
  });

  const unreadCount = notifications.filter((n: any) => !n.read).length;

  const handleNotificationClick = (notification: any) => {
    if (!notification.read) {
      markAsReadMutation.mutate(notification.id);
    }
  };

  const handleDeleteNotification = (e: React.MouseEvent, notificationId: number) => {
    e.stopPropagation();
    deleteNotificationMutation.mutate(notificationId);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button className="relative p-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      
      <PopoverContent className="w-80 p-0" align="end">
        <Card className="border-0 shadow-lg">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Notifications</CardTitle>
              <div className="flex gap-1">
                {unreadCount > 0 && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => markAllAsReadMutation.mutate()}
                    disabled={markAllAsReadMutation.isPending}
                  >
                    Mark all read
                  </Button>
                )}
                {notifications.length > 0 && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="text-red-600">
                        <Trash2 className="w-3 h-3 mr-1" />Clear All
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Clear All Notifications</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete all {notifications.length} notifications.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={() => clearAllMutation.mutate()} 
                          className="bg-red-600"
                          disabled={clearAllMutation.isPending}
                        >
                          {clearAllMutation.isPending ? "Clearing..." : "Clear All"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-60">
              {isLoading ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="flex items-start space-x-3 p-3 animate-pulse">
                      <div className="w-8 h-8 bg-slate-200 rounded-full"></div>
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                        <div className="h-3 bg-slate-200 rounded w-1/2"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-8 text-center">
                  <Bell className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500">No notifications yet</p>
                </div>
              ) : (
                notifications.map((notification: any) => (
                  <div
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={`p-4 border-b hover:bg-slate-50 cursor-pointer group ${!notification.read ? "bg-blue-50" : ""}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${!notification.read ? "font-semibold" : ""}`}>
                          {notification.title}
                        </p>
                        <p className="text-sm text-slate-600 mt-1">
                          {notification.message}
                        </p>
                        <p className="text-xs text-slate-400 mt-2">
                          {new Date(notification.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <button
                        onClick={(e) => handleDeleteNotification(e, notification.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 rounded text-red-500 transition-opacity"
                        disabled={deleteNotificationMutation.isPending}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </PopoverContent>
    </Popover>
  );
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<TabType>("dashboard");

  const { data: whatsappStatus } = useQuery({
    queryKey: ["/api/admin/whatsapp-status"],
    refetchInterval: 30000,
  });

  const { data: telegramStatus, isError: telegramError } = useQuery({
    queryKey: ["/api/admin/telegram-status"],
    refetchInterval: 15000,
    retry: 3,
  });

  const tabTitles = {
    dashboard: "Dashboard Overview",
    inquiries: "Inquiry Management", 
    vendors: "Vendor Management",
    analytics: "Analytics & Reports",
    "bot-config": "Bot Configuration",
    "api-keys": "API Keys Management",
    api: "API Documentation"
  };

  const tabDescriptions = {
    dashboard: "Monitor bot activity and vendor engagement",
    inquiries: "View and manage all price inquiries",
    vendors: "Manage vendor profiles and performance", 
    analytics: "View detailed analytics and insights",
    "bot-config": "Configure bot settings and templates",
    "api-keys": "Generate and manage API access keys",
    api: "REST API documentation and examples"
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case "dashboard":
        return (
          <div className="space-y-6">
            <MetricsCards />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <InquiriesTable 
                  limit={5} 
                  showHeader={true} 
                  title="Recent Inquiries"
                  onViewAll={() => {
                    console.log("Navigating to inquiries tab");
                    setActiveTab("inquiries");
                  }}
                />
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">Top Cities by Activity</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-700">Mumbai</span>
                    <div className="flex items-center space-x-2">
                      <div className="w-20 h-2 bg-slate-200 rounded-full">
                        <div className="w-4/5 h-2 bg-primary rounded-full"></div>
                      </div>
                      <span className="text-sm font-medium">421</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-700">Delhi</span>
                    <div className="flex items-center space-x-2">
                      <div className="w-20 h-2 bg-slate-200 rounded-full">
                        <div className="w-3/5 h-2 bg-primary rounded-full"></div>
                      </div>
                      <span className="text-sm font-medium">312</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-700">Guwahati</span>
                    <div className="flex items-center space-x-2">
                      <div className="w-20 h-2 bg-slate-200 rounded-full">
                        <div className="w-2/5 h-2 bg-primary rounded-full"></div>
                      </div>
                      <span className="text-sm font-medium">187</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      case "inquiries":
        return <InquiriesTable />;
      case "vendors":
        return <VendorsTable />;
      case "analytics":
        return (
          <div className="space-y-6">
            <MetricsCards />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Response Trends</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64 flex items-center justify-center text-slate-400">
                    Chart placeholder - Integration with charting library needed
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Top Performing Vendors</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded">
                      <span className="font-medium">ABC Construction</span>
                      <Badge className="bg-green-100 text-green-800">98% Response Rate</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded">
                      <span className="font-medium">XYZ Materials</span>
                      <Badge className="bg-green-100 text-green-800">95% Response Rate</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded">
                      <span className="font-medium">DEF Suppliers</span>
                      <Badge className="bg-yellow-100 text-yellow-800">87% Response Rate</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        );
      case "bot-config":
        return <BotConfig />;
      case "api-keys":
        return <ApiKeys />;
      case "api":
        return <ApiDocs />;
      default:
        return <div>Page not found</div>;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex">
        <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
        
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <header className="bg-white border-b border-slate-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">
                  {tabTitles[activeTab]}
                </h1>
                <p className="text-slate-600 mt-1">
                  {tabDescriptions[activeTab]}
                </p>
              </div>
              
              <div className="flex items-center space-x-4">
                {/* Bot Status Indicators */}
                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2">
                    <MessageCircle className="w-4 h-4 text-green-600" />
                    <span className="text-sm text-slate-600">WhatsApp</span>
                    <Badge className={whatsappStatus?.connected ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                      {whatsappStatus?.connected ? "Connected" : "Disconnected"}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Send className="w-4 h-4 text-blue-600" />
                    <span className="text-sm text-slate-600">Telegram</span>
                    <Badge className={!telegramError && telegramStatus?.connected ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                      {!telegramError && telegramStatus?.connected ? "Connected" : "Disconnected"}
                    </Badge>
                  </div>
                </div>

                {/* Notification Bell */}
                <NotificationBell />

                {/* User Menu */}
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                    <User className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-sm font-medium text-slate-700">Admin</span>
                </div>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 p-6">
            {renderTabContent()}
          </main>
        </div>
      </div>
    </div>
  );
}