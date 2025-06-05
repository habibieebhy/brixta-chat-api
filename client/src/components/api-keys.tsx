import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Copy, Plus, MoreVertical, Trash2, Eye, EyeOff, Key } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function ApiKeys() {
 const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
 const { toast } = useToast();
const [newKeyName, setNewKeyName] = useState("");
const [keyType, setKeyType] = useState("vendor_rates");
const [rateLimitPerHour, setRateLimitPerHour] = useState(1000);
const [permissions, setPermissions] = useState("");
const [visibleKeys, setVisibleKeys] = useState<Set<number>>(new Set());

 const { data: apiKeys, isLoading } = useQuery({
  queryKey: ["apiKeys"],
  queryFn: () => fetch('/api/admin/api-keys').then(res => res.json()) // ← Use this endpoint
});

const createKeyMutation = useMutation({
  mutationKey: ['createApiKey'],
  mutationFn: async (keyData: any) => {
    console.log("🚀 Mutation function called with:", keyData);
    const response = await fetch("/api/admin/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(keyData)
    });
    console.log("📡 Response received:", response.status);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const result = await response.json();
    console.log("✅ JSON parsed:", result);
    return result;
  },
  onSuccess: (data) => {
    console.log("🎉 SUCCESS CALLBACK TRIGGERED!", data);
    queryClient.invalidateQueries({ queryKey: ["apiKeys"] }); // ← FIXED
    setIsCreateDialogOpen(false);
    setNewKeyName("");
    setKeyType("vendor_rates");
    setRateLimitPerHour(1000);
    setPermissions("");
    toast({ title: "Success", description: "API key created successfully" });
  },
  onError: (error) => {
    console.log("❌ ERROR CALLBACK:", error);
    toast({ title: "Error", description: "Failed to create API key", variant: "destructive" });
  }
});
const deleteKeyMutation = useMutation({
  mutationKey: ['deleteApiKey'],
  mutationFn: async (keyId: number) => {
    console.log("🗑️ Delete mutation called for keyId:", keyId);
    const response = await fetch(`/api/admin/api-keys/${keyId}`, {
      method: 'DELETE'
    });
    console.log("📡 Delete response:", response.status);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const result = await response.json();
    console.log("✅ Delete JSON parsed:", result);
    return result;
  },
  onSuccess: async (data, keyId) => {
    console.log("🎉 DELETE SUCCESS CALLBACK TRIGGERED!", data);
    toast({ title: "Success", description: "API key deleted successfully" });
    await queryClient.invalidateQueries({ queryKey: ["apiKeys"] }); // ← FIXED
    await queryClient.refetchQueries({ queryKey: ["apiKeys"] }); // ← FIXED
  },
  onError: (error) => {
    console.log("❌ DELETE ERROR:", error);
    toast({ title: "Error", description: "Failed to delete API key", variant: "destructive" });
  }
});

 const toggleKeyMutation = useMutation({
  mutationFn: ({ keyId, isActive }: { keyId: number; isActive: boolean }) =>
    apiRequest("PUT", `/api/admin/api-keys/${keyId}`, { isActive }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["apiKeys"] }); // ← FIXED
    toast({ title: "Success", description: "API key status updated" });
  },
  onError: () => {
    toast({ title: "Error", description: "Failed to update API key", variant: "destructive" });
  }
});
 const generateApiKey = () => {
  return 'pk_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};
const handleCreateKey = () => {
  if (!newKeyName.trim()) {
    toast({ title: "Error", description: "Please enter a key name", variant: "destructive" });
    return;
  }
  const keyData = {
    name: newKeyName,
    keyType: keyType,
    rateLimitPerHour: rateLimitPerHour,
    permissions: permissions.split(',').map(p => p.trim()).filter(p => p),
    isActive: true
  };
  console.log('Sending keyData:', keyData);
  createKeyMutation.mutate(keyData);
};
const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text);
  toast({ title: "Copied", description: "API key copied to clipboard" });
};
const toggleKeyVisibility = (keyId: number) => {
  const newVisible = new Set(visibleKeys);
  if (newVisible.has(keyId)) {
    newVisible.delete(keyId);
  } else {
    newVisible.add(keyId);
  }
  setVisibleKeys(newVisible);
};

  const maskKey = (key: string) => {
    return key.substring(0, 8) + '••••••••••••••••••••';
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>API Keys</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-slate-100 rounded animate-pulse"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center space-x-2">
                <Key className="w-5 h-5" />
                <span>API Keys Management</span>
              </CardTitle>
              <p className="text-sm text-slate-600 mt-1">
                Create and manage API keys for accessing vendor pricing data
              </p>
            </div>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Create API Key
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New API Key</DialogTitle>
                  <DialogDescription>
                    Generate a new API key for accessing vendor pricing data or telegram bot integration
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="keyName">Key Name</Label>
                    <Input
                      id="keyName"
                      placeholder="e.g., Production API, Mobile App, etc."
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                    />
                  </div>

                  <div>
                    <Label htmlFor="keyType">API Type</Label>
                    <select
                      id="keyType"
                      className="w-full p-2 border border-slate-300 rounded-md"
                      value={keyType}
                      onChange={(e) => setKeyType(e.target.value)}
                    >
                      <option value="vendor_rates">Vendor Rates API</option>
                      <option value="telegram_bot">Telegram Bot API</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="rateLimitPerHour">Rate Limit (requests per hour)</Label>
                    <Input
                      id="rateLimitPerHour"
                      type="number"
                      placeholder="1000"
                      value={rateLimitPerHour}
                      onChange={(e) => setRateLimitPerHour(parseInt(e.target.value) || 1000)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="permissions">Permissions (comma-separated)</Label>
                    <Input
                      id="permissions"
                      placeholder="read, write, admin"
                      value={permissions}
                      onChange={(e) => setPermissions(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateKey} disabled={createKeyMutation.isPending}>
                    {createKeyMutation.isPending ? "Creating..." : "Create Key"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {apiKeys.length === 0 ? (
            <div className="text-center py-12">
              <Key className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">No API keys found</p>
              <p className="text-sm text-slate-400 mb-4">Create your first API key to get started</p>
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create API Key
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {apiKeys.map((key: any) => (
                <div key={key.id} className="border border-slate-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <h3 className="text-lg font-semibold text-slate-900">{key.name}</h3>
                        <Badge variant={key.isActive ? "default" : "secondary"}>
                          {key.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <div className="mt-2 flex items-center space-x-2">
                        <code className="bg-slate-100 px-3 py-1 rounded text-sm font-mono">
                          {visibleKeys.has(key.id) ? key.keyValue : maskKey(key.keyValue)}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleKeyVisibility(key.id)}
                        >
                          {visibleKeys.has(key.id) ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(key.keyValue)}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="mt-2 text-sm text-slate-500">
                        Created: {new Date(key.createdAt).toLocaleDateString()}
                        {key.lastUsed && (
                          <span className="ml-4">
                            Last used: {new Date(key.lastUsed).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem
                          onClick={() => toggleKeyMutation.mutate({ keyId: key.id, isActive: !key.isActive })}
                        >
                          {key.isActive ? "Deactivate" : "Activate"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => copyToClipboard(key.keyValue)}>
                          Copy Key
                        </DropdownMenuItem>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem
                              className="text-red-600"
                              onSelect={(e) => e.preventDefault()}
                            >
                              Delete
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete API Key</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete the API key "{key.name}".
                                Applications using this key will lose access immediately.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteKeyMutation.mutate(key.id)}
                                className="bg-red-600"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* API Documentation */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Start Guide</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-medium mb-2">1. Authentication</h4>
            <p className="text-sm text-slate-600 mb-2">Include your API key in the Authorization header:</p>
            <pre className="bg-slate-100 p-3 rounded text-sm">
              {`curl -H "Authorization: Bearer YOUR_API_KEY" \\
     https://your-api.com/api/vendors`}
            </pre>
          </div>

          <div>
            <h4 className="font-medium mb-2">2. Get Vendor Pricing</h4>
            <p className="text-sm text-slate-600 mb-2">Fetch current vendor rates:</p>
            <pre className="bg-slate-100 p-3 rounded text-sm">
              {`GET /api/vendors/rates?material=cement&city=mumbai`}
            </pre>
          </div>

          <div>
            <h4 className="font-medium mb-2">3. Submit Inquiry</h4>
            <p className="text-sm text-slate-600 mb-2">Create new price inquiry:</p>
            <pre className="bg-slate-100 p-3 rounded text-sm">
              {`POST /api/inquiries
{
  "material": "cement",
  "city": "mumbai",
  "quantity": "100 bags"
}`}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}