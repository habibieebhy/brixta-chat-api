import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { User, Search, Download, MoreVertical, Trash2, CheckCircle, XCircle, Clock, Eye } from "lucide-react";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface InquiriesTableProps {
  limit?: number;
  showHeader?: boolean;
  title?: string;
  onViewAll?: () => void; // FIXED: Added this prop
}

export default function InquiriesTable({ limit, showHeader = false, title = "All Inquiries", onViewAll }: InquiriesTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedInquiries, setSelectedInquiries] = useState<string[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: inquiries, isLoading } = useQuery({
    queryKey: ["/api/admin/inquiries", { limit }],
  });

  // Mutations
  const updateStatusMutation = useMutation({
    mutationFn: ({ inquiryId, status }: { inquiryId: string; status: string }) => 
      apiRequest("PUT", `/api/admin/inquiries/${inquiryId}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/inquiries"] });
      toast({ title: "Success", description: "Status updated successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
    }
  });

  const deleteInquiryMutation = useMutation({
    mutationFn: (inquiryId: string) => apiRequest("DELETE", `/api/admin/inquiries/${inquiryId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/inquiries"] });
      toast({ title: "Success", description: "Inquiry deleted successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete inquiry", variant: "destructive" });
    }
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: ({ inquiryIds, action }: { inquiryIds: string[]; action: string }) => 
      apiRequest("POST", "/api/admin/inquiries/bulk", { inquiryIds, action }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/inquiries"] });
      setSelectedInquiries([]);
      toast({ title: "Success", description: "Bulk action completed successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to complete bulk action", variant: "destructive" });
    }
  });

  const filteredInquiries = (inquiries || []).filter((inquiry: any) => {
    const matchesSearch = inquiry.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         inquiry.material.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCity = !cityFilter || cityFilter === "all" || inquiry.city === cityFilter;
    const matchesStatus = !statusFilter || statusFilter === "all" || inquiry.status === statusFilter;
    return matchesSearch && matchesCity && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "responded": return "bg-green-100 text-green-800";
      case "pending": return "bg-yellow-100 text-yellow-800";
      case "completed": return "bg-blue-100 text-blue-800";
      case "cancelled": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getMaterialColor = (material: string) => {
    return material.toLowerCase() === "cement" 
      ? "bg-gray-100 text-gray-800"
      : "bg-blue-100 text-blue-800";
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "responded": return CheckCircle;
      case "pending": return Clock;
      case "completed": return Eye;
      case "cancelled": return XCircle;
      default: return Clock;
    }
  };

  const handleStatusChange = (inquiryId: string, newStatus: string) => {
    updateStatusMutation.mutate({ inquiryId, status: newStatus });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedInquiries(filteredInquiries.map((i: any) => i.id));
    } else {
      setSelectedInquiries([]);
    }
  };

  const handleSelectInquiry = (inquiryId: string, checked: boolean) => {
    if (checked) {
      setSelectedInquiries([...selectedInquiries, inquiryId]);
    } else {
      setSelectedInquiries(selectedInquiries.filter(id => id !== inquiryId));
    }
  };

  const handleBulkAction = (action: string) => {
    if (selectedInquiries.length === 0) {
      toast({ title: "Warning", description: "Please select inquiries first", variant: "destructive" });
      return;
    }
    bulkUpdateMutation.mutate({ inquiryIds: selectedInquiries, action });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 bg-slate-100 rounded animate-pulse"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm border-slate-200">
      <CardHeader className={showHeader ? "border-b border-slate-200" : "pb-2"}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-slate-900">{title}</CardTitle>
          {!showHeader && (
            <div className="flex items-center space-x-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input
                  placeholder="Search inquiries..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-64"
                />
              </div>
              <Select value={cityFilter} onValueChange={setCityFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="City" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Cities</SelectItem>
                  <SelectItem value="Guwahati">Guwahati</SelectItem>
                  <SelectItem value="Mumbai">Mumbai</SelectItem>
                  <SelectItem value="Delhi">Delhi</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="responded">Responded</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline">
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
            </div>
          )}
          {/* FIXED: Proper View All button */}
          {showHeader && limit && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-primary hover:text-primary/80"
              onClick={() => {
                console.log("View All clicked!"); // Debug
                onViewAll?.();
              }}
            >
              View All ({inquiries?.length || 0})
            </Button>
          )}
        </div>
        
        {/* Bulk Actions */}
        {selectedInquiries.length > 0 && (
          <div className="flex items-center space-x-2 mt-4 p-3 bg-blue-50 rounded-lg">
            <span className="text-sm text-blue-800">
              {selectedInquiries.length} selected
            </span>
            <Button size="sm" onClick={() => handleBulkAction("completed")}>
              Mark Completed
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleBulkAction("cancelled")}>
              Mark Cancelled
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="destructive">
                  <Trash2 className="w-4 h-4 mr-1" />
                  Delete Selected
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {selectedInquiries.length} Inquiries</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete the selected inquiries. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => handleBulkAction("delete")} className="bg-red-600">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </CardHeader>
      
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left">
                  <Checkbox
                    checked={selectedInquiries.length === filteredInquiries.length && filteredInquiries.length > 0}
                    onCheckedChange={handleSelectAll}
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">User</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Material</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">City</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Vendors</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {filteredInquiries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center space-y-3">
                      <Search className="w-12 h-12 text-slate-300" />
                      <p className="text-slate-500">No inquiries found</p>
                      <p className="text-sm text-slate-400">Try adjusting your search criteria</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredInquiries.map((inquiry: any) => {
                  const StatusIcon = getStatusIcon(inquiry.status);
                  return (
                    <tr key={inquiry.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <Checkbox
                          checked={selectedInquiries.includes(inquiry.id)}
                          onCheckedChange={(checked) => handleSelectInquiry(inquiry.id, checked)}
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center">
                            <User className="w-4 h-4 text-slate-600" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-900">{inquiry.userName}</p>
                            <p className="text-sm text-slate-500">{inquiry.phone}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge className={getMaterialColor(inquiry.material)}>
                          {inquiry.material}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-900">{inquiry.city}</td>
                      <td className="px-6 py-4 text-sm text-slate-900">{inquiry.vendorsContacted?.length || 0} contacted</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-2">
                          <StatusIcon className="w-4 h-4" />
                          <Badge className={getStatusColor(inquiry.status)}>
                            {inquiry.status}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {new Date(inquiry.timestamp).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem onClick={() => handleStatusChange(inquiry.id, "completed")}>
                              Mark Completed
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStatusChange(inquiry.id, "cancelled")}>
                              Mark Cancelled
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => deleteInquiryMutation.mutate(inquiry.id)}
                              className="text-red-600"
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}