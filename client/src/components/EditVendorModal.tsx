import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { insertVendorSchema } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";

const editVendorSchema = insertVendorSchema.extend({
  materials: z.array(z.string()).min(1, "At least one material must be selected")
}).partial();

type EditVendorData = z.infer<typeof editVendorSchema>;

interface EditVendorModalProps {
  vendor: any | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function EditVendorModal({ vendor, isOpen, onClose }: EditVendorModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<EditVendorData>({
    resolver: zodResolver(editVendorSchema),
    defaultValues: {
      name: "",
      phone: "",
      city: "",
      materials: [],
      isActive: true,
      telegramId: ""
    }
  });

  useEffect(() => {
    if (vendor) {
      form.reset({
        name: vendor.name,
        phone: vendor.phone,
        city: vendor.city,
        materials: vendor.materials || [],
        isActive: vendor.isActive,
        telegramId: vendor.telegramId || ""
      });
    }
  }, [vendor, form]);

  const updateVendorMutation = useMutation({
    mutationFn: async (data: EditVendorData) => {
      if (!vendor) throw new Error("No vendor selected");
      const response = await apiRequest("PUT", `/api/admin/vendors/${vendor.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/vendors"] });
      onClose();
      toast({
        title: "Success",
        description: "Vendor updated successfully"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update vendor",
        variant: "destructive"
      });
    }
  });

  const onSubmit = (data: EditVendorData) => {
    updateVendorMutation.mutate(data);
  };

  const handleClose = () => {
    form.reset();
    onClose();
  };

  if (!vendor) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Vendor: {vendor.name}</DialogTitle>
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
              name="telegramId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telegram ID (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Telegram user ID" {...field} />
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
                        id="edit-cement"
                        checked={form.watch("materials")?.includes("cement") || false}
                        onCheckedChange={(checked) => {
                          const materials = form.getValues("materials") || [];
                          if (checked) {
                            form.setValue("materials", [...materials, "cement"]);
                          } else {
                            form.setValue("materials", materials.filter(m => m !== "cement"));
                          }
                        }}
                      />
                      <label htmlFor="edit-cement" className="text-sm">Cement</label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="edit-tmt"
                        checked={form.watch("materials")?.includes("tmt") || false}
                        onCheckedChange={(checked) => {
                          const materials = form.getValues("materials") || [];
                          if (checked) {
                            form.setValue("materials", [...materials, "tmt"]);
                          } else {
                            form.setValue("materials", materials.filter(m => m !== "tmt"));
                          }
                        }}
                      />
                      <label htmlFor="edit-tmt" className="text-sm">TMT Bar</label>
                    </div>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between">
                  <div>
                    <FormLabel>Vendor Status</FormLabel>
                    <p className="text-xs text-slate-500">Enable or disable this vendor</p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end space-x-2 pt-4">
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateVendorMutation.isPending}>
                {updateVendorMutation.isPending ? "Updating..." : "Update Vendor"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}