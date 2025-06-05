import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Store, Search, Plus, User, Trash2, Edit, MessageSquare, Phone } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertVendorSchema } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import EditVendorModal from "@/components/EditVendorModal";

const vendorFormSchema = insertVendorSchema.extend({
  materials: z.array(z.string()).min(1, "At least one material must be selected")
});

type VendorFormData = z.infer<typeof vendorFormSchema>;

export default function VendorsTable() {
  const [searchTerm, setSearchTerm] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [materialFilter, setMaterialFilter] = useState("");
  const [platformFilter, setPlatformFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<any>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: vendors, isLoading } = useQuery({
    queryKey: ["/api/admin/vendors"],
  });

  const form = useForm<VendorFormData>({
    resolver: zodResolver(vendorFormSchema),
    defaultValues: {
      vendorId: "",
      name: "",
      phone: "",
      city: "",
      materials: [],
      responseCount: 0,
      responseRate: "0",
      rank: 0,
      isActive: true
    }
  });

  const createVendorMutation = useMutation({
    mutationFn: (data: VendorFormData) => apiRequest("POST", "/api/admin/vendors", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/vendors"] });
      setIsDialogOpen(false);
      form.reset();
      toast({
        title: "Success",
        description: "Vendor created successfully"
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create vendor",
        variant: "destructive"
      });
    }
  });

  const deleteVendorMutation = useMutation({
    mutationFn: (vendorId: number) => apiRequest("DELETE", `/api/admin/vendors/${vendorId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/vendors"] });
      toast({
        title: "Success",
        description: "Vendor deleted successfully"
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete vendor",
        variant: "destructive"
      });
    }
  });

  const updateVendorMutation = useMutation({
    mutationFn: ({ vendorId, data }: { vendorId: number; data: any }) =>
      apiRequest("PUT", `/api/admin/vendors/${vendorId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/vendors"] });
      toast({
        title: "Success",
        description: "Vendor updated successfully"
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update vendor",
        variant: "destructive"
      });
    }
  });

  const sendTestMessageMutation = useMutation({
    mutationFn: ({ vendorId, message, platform }: { vendorId: number; message: string; platform: string }) =>
      apiRequest("POST", `/api/admin/vendors/${vendorId}/test-message`, { message, platform }),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Test message sent successfully"
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send test message",
        variant: "destructive"
      });
    }
  });

  const filteredVendors = (vendors || []).filter((vendor: any) => {
    const matchesSearch = vendor.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vendor.phone.includes(searchTerm);
    const matchesCity = !cityFilter || cityFilter === "all" || vendor.city === cityFilter;
    const matchesMaterial = !materialFilter || materialFilter === "all" || vendor.materials.includes(materialFilter);
    const matchesPlatform = !platformFilter || platformFilter === "all" ||
      (platformFilter === "whatsapp" && !vendor.telegramId) ||
      (platformFilter === "telegram" && vendor.telegramId);
    const matchesStatus = !statusFilter || statusFilter === "all" ||
      (statusFilter === "active" && vendor.isActive) ||
      (statusFilter === "inactive" && !vendor.isActive);

    return matchesSearch && matchesCity && matchesMaterial && matchesPlatform && matchesStatus;
  });

  const handleStatusToggle = (vendor: any) => {
    updateVendorMutation.mutate({
      vendorId: vendor.id,
      data: { isActive: !vendor.isActive }
    });
  };

  const handleTestMessage = (vendor: any) => {
    const platform = vendor.telegramId ? "telegram" : "whatsapp";
    const message = `Hi ${vendor.name}, this is a test message from the admin panel. Please confirm receipt.`;

    sendTestMessageMutation.mutate({
      vendorId: vendor.id,
      message,
      platform
    });
  };

  const onSubmit = (data: VendorFormData) => {
    createVendorMutation.mutate({
      ...data,
      vendorId: `vendor_${Date.now()}`
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-20 bg-slate-100 rounded animate-pulse"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm border-slate-200">
      <CardHeader className="border-b border-slate-200">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-slate-900">Vendor Directory</CardTitle>
          <div className="flex items-center space-x-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                placeholder="Search vendors..."
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
            <Select value={materialFilter} onValueChange={setMaterialFilter}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Material" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Materials</SelectItem>
                <SelectItem value="cement">Cement</SelectItem>
                <SelectItem value="tmt">TMT Bar</SelectItem>
              </SelectContent>
            </Select>
            <Select value={platformFilter} onValueChange={setPlatformFilter}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Platform" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Platforms</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="telegram">Telegram</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Vendor
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Add New Vendor</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Vendor Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter vendor name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone Number</FormLabel>
                          <FormControl>
                            <Input placeholder="+91 98765 43210" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>City</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter city" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="materials"
                      render={() => (
                        <FormItem>
                          <FormLabel>Materials</FormLabel>
                          <div className="space-y-2">
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="cement"
                                checked={form.watch("materials").includes("cement")}
                                onCheckedChange={(checked) => {
                                  const materials = form.getValues("materials");
                                  if (checked) {
                                    form.setValue("materials", [...materials, "cement"]);
                                  } else {
                                    form.setValue("materials", materials.filter(m => m !== "cement"));
                                  }
                                }}
                              />
                              <label htmlFor="cement" className="text-sm">Cement</label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="tmt"
                                checked={form.watch("materials").includes("tmt")}
                                onCheckedChange={(checked) => {
                                  const materials = form.getValues("materials");
                                  if (checked) {
                                    form.setValue("materials", [...materials, "tmt"]);
                                  } else {
                                    form.setValue("materials", materials.filter(m => m !== "tmt"));
                                  }
                                }}
                              />
                              <label htmlFor="tmt" className="text-sm">TMT Bar</label>
                            </div>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex justify-end space-x-2 pt-4">
                      <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={createVendorMutation.isPending}>
                        {createVendorMutation.isPending ? "Creating..." : "Create Vendor"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Vendor</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">City</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Materials</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Platform</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Response Rate</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Latest Quote</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {filteredVendors.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center space-y-3">
                      <Store className="w-12 h-12 text-slate-300" />
                      <p className="text-slate-500">No vendors found</p>
                      <p className="text-sm text-slate-400">Try adjusting your search criteria</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredVendors.map((vendor: any) => (
                  <tr key={vendor.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="w-10 h-10 bg-slate-200 rounded-lg flex items-center justify-center">
                          <Store className="w-5 h-5 text-slate-500" />
                        </div>
                        <div className="ml-3">
                          <div className="text-sm font-medium text-slate-900">{vendor.name}</div>
                          <div className="text-sm text-slate-500 flex items-center">
                            <Phone className="w-3 h-3 mr-1" />
                            {vendor.phone}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {vendor.city}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-wrap gap-1">
                        {vendor.materials?.map((material: string) => (
                          <Badge key={material} variant="secondary" className="text-xs">
                            {material}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {vendor.telegramId ? (
                        <Badge className="bg-blue-100 text-blue-800 text-xs">Telegram</Badge>
                      ) : (
                        <Badge className="bg-green-100 text-green-800 text-xs">WhatsApp</Badge>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {vendor.responseRate || 0}%
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {vendor.latest_quote ? (
                        <div className="space-y-1">
                          <div className="text-sm font-medium text-slate-900">
                            ₹{vendor.latest_quote.price} per unit
                          </div>
                          <div className="text-xs text-slate-500">
                            GST: {vendor.latest_quote.gst}% | Delivery: ₹{vendor.latest_quote.delivery_charge}
                          </div>
                          <div className="text-xs text-slate-400">
                            {vendor.latest_quote.material}
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-slate-400">
                          No quotes yet
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge className={vendor.isActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                        {vendor.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        {/* Status Toggle */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleStatusToggle(vendor)}
                          className={vendor.isActive ? "text-orange-600 hover:text-orange-700" : "text-green-600 hover:text-green-700"}
                          title={vendor.isActive ? "Deactivate vendor" : "Activate vendor"}
                        >
                          {vendor.isActive ? "Deactivate" : "Activate"}
                        </Button>

                        {/* Edit Button */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-slate-600 hover:text-slate-900"
                          title="Edit vendor"
                          onClick={() => {
                            setEditingVendor(vendor);
                            setIsEditModalOpen(true);
                          }}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>

                        {/* Test Message Button */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-blue-600 hover:text-blue-700"
                          onClick={() => handleTestMessage(vendor)}
                          disabled={sendTestMessageMutation.isPending}
                          title="Send test message"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </Button>

                        {/* Delete Button with Confirmation */}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" title="Delete vendor">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Vendor</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete {vendor.name}? This action cannot be undone.
                                All associated data including price responses will be permanently deleted.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteVendorMutation.mutate(vendor.id)}
                                className="bg-red-600 hover:bg-red-700"
                              >
                                Delete Vendor
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filteredVendors.length > 0 && (
          <div className="px-6 py-4 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-600">
                Showing {filteredVendors.length} of {(vendors || []).length} vendors
              </p>
              <div className="text-sm text-slate-500">
                Active: {filteredVendors.filter((v: any) => v.isActive).length} •
                Inactive: {filteredVendors.filter((v: any) => !v.isActive).length}
              </div>
            </div>
          </div>
        )}
      </CardContent>

      <EditVendorModal
        vendor={editingVendor}
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingVendor(null);
        }}
      />
    </Card>
  );
}