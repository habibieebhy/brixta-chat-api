import { cn } from "@/lib/utils";
import { 
  LayoutDashboard,
  MessageSquare,
  Users,
  BarChart3, 
  Settings, 
  Book,
  Key,
  Bot
} from "lucide-react";

type TabType = "dashboard" | "inquiries" | "vendors" | "analytics" | "bot-config" | "api-keys" | "api";

interface SidebarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export default function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "inquiries", label: "Inquiries", icon: MessageSquare },
    { id: "vendors", label: "Vendors", icon: Users },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    { id: "bot-config", label: "Bot Config", icon: Settings },
    { id: "api-keys", label: "API Keys", icon: Key },
    { id: "api", label: "API Docs", icon: Book },
  ] as const;

  return (
    <div className="w-64 bg-white shadow-lg border-r border-slate-200 h-screen flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">PriceBot</h1>
            <p className="text-xs text-slate-500">Admin Dashboard</p>
          </div>
        </div>
      </div>
      
      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id as TabType)}
              className={cn(
                "w-full flex items-center space-x-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              )}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      
      {/* User Profile */}
      <div className="p-4 border-t border-slate-200">
        <div className="flex items-center space-x-3 p-3 bg-slate-100 rounded-lg">
          <div className="w-8 h-8 bg-slate-400 rounded-full flex items-center justify-center">
            <span className="text-white text-sm font-medium">A</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900">Admin User</p>
            <p className="text-xs text-slate-500 truncate">admin@pricebot.com</p>
          </div>
        </div>
      </div>
    </div>
  );
}