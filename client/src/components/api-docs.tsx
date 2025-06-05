import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Code, Copy, Key, Globe, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function ApiDocs() {
  const [newKeyName, setNewKeyName] = useState("");
  const { toast } = useToast();

  const { data: apiKeys, isLoading } = useQuery({
    queryKey: ["/api/admin/api-keys"],
  });

  const handleCopyKey = (keyValue: string) => {
    navigator.clipboard.writeText(keyValue);
    toast({
      title: "Copied!",
      description: "API key copied to clipboard"
    });
  };

  const endpoints = [
    {
      method: "GET",
      path: "/api/rates",
      description: "Get latest pricing data filtered by city and material",
      params: "city, material, limit",
      example: "https://api.pricebot.com/api/rates?city=guwahati&material=tmt"
    },
    {
      method: "POST", 
      path: "/api/vendor-response",
      description: "Submit vendor pricing response",
      params: "vendor_id, material, price, gst, delivery_charge",
      example: "POST with JSON body"
    },
    {
      method: "GET",
      path: "/api/top-vendors", 
      description: "Get top performing vendors by material and city",
      params: "material, city, limit",
      example: "https://api.pricebot.com/api/top-vendors?material=cement"
    },
    {
      method: "POST",
      path: "/api/inquiry-log",
      description: "Log new inquiry for tracking and analytics", 
      params: "inquiry_id, user_name, city, material, vendors_contacted",
      example: "POST with JSON body"
    }
  ];

  const getMethodColor = (method: string) => {
    switch (method) {
      case "GET":
        return "bg-green-100 text-green-800";
      case "POST":
        return "bg-blue-100 text-blue-800";
      case "PUT":
        return "bg-yellow-100 text-yellow-800";
      case "DELETE":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-slate-200 rounded animate-pulse"></div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* API Overview */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold text-slate-900">API Documentation</CardTitle>
              <p className="text-sm text-slate-600 mt-1">Access pricing data and manage vendor responses programmatically</p>
            </div>
            <div className="flex items-center space-x-4">
              <Badge className="bg-green-100 text-green-800">
                <Globe className="w-3 h-3 mr-1" />
                API Status: Active
              </Badge>
              <Button size="sm">
                <Key className="w-4 h-4 mr-2" />
                Generate API Key
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* API Keys Section */}
          <div className="bg-slate-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-medium text-slate-700">Your API Keys</p>
                <p className="text-xs text-slate-500">Keep these keys secure and do not share them publicly</p>
              </div>
            </div>
            
            <div className="space-y-3">
              {apiKeys && apiKeys.length > 0 ? (
                apiKeys.map((key: any) => (
                  <div key={key.id} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{key.keyName}</p>
                      <code className="text-xs text-slate-600 font-mono">{key.keyValue}</code>
                      {key.lastUsed && (
                        <p className="text-xs text-slate-500 mt-1">Last used: {new Date(key.lastUsed).toLocaleString()}</p>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge className={key.isActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                        {key.isActive ? "Active" : "Inactive"}
                      </Badge>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleCopyKey(key.keyValue)}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <Key className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500">No API keys found</p>
                  <p className="text-sm text-slate-400">Generate your first API key to get started</p>
                </div>
              )}
            </div>
          </div>

          {/* Authentication */}
          <div>
            <h4 className="text-sm font-semibold text-slate-800 mb-3">Authentication</h4>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <p className="text-sm text-slate-600 mb-2">API Key Authentication Required</p>
              <div className="bg-slate-900 text-green-400 text-sm p-3 rounded font-mono">
                Authorization: Bearer YOUR_API_KEY
              </div>
            </div>
          </div>

          {/* Endpoints */}
          <div>
            <h4 className="text-sm font-semibold text-slate-800 mb-3">Available Endpoints</h4>
            <div className="space-y-4">
              {endpoints.map((endpoint, index) => (
                <Card key={index} className="border border-slate-200">
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <Badge className={getMethodColor(endpoint.method)}>
                        {endpoint.method}
                      </Badge>
                      <code className="text-sm font-mono text-slate-700">{endpoint.path}</code>
                    </div>
                    <p className="text-sm text-slate-600 mb-2">{endpoint.description}</p>
                    
                    {endpoint.params && (
                      <div className="mb-2">
                        <p className="text-xs font-medium text-slate-700 mb-1">Parameters:</p>
                        <p className="text-xs text-slate-500">{endpoint.params}</p>
                      </div>
                    )}
                    
                    <div className="bg-slate-900 rounded p-3 text-sm">
                      <code className="text-green-400">{endpoint.method}</code>{" "}
                      <code className="text-white">{endpoint.example}</code>
                      {endpoint.method === "GET" && (
                        <>
                          <br />
                          <code className="text-yellow-400">Authorization:</code>{" "}
                          <code className="text-white">Bearer YOUR_API_KEY</code>
                        </>
                      )}
                    </div>

                    {endpoint.method === "GET" && endpoint.path === "/api/rates" && (
                      <div className="mt-3">
                        <p className="text-xs font-medium text-slate-700 mb-1">Response Example:</p>
                        <div className="bg-slate-50 rounded p-3 text-xs">
                          <pre className="text-slate-700">{`{
  "status": "success",
  "data": [
    {
      "vendor_id": "vendor_001",
      "vendorName": "Kumar Construction",
      "material": "tmt",
      "price": "52400.00",
      "gst": "18.00",
      "delivery_charge": "100.00",
      "timestamp": "2025-05-30T14:32:15Z"
    }
  ]
}`}</pre>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Rate Limits */}
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
              <div>
                <h5 className="text-sm font-medium text-yellow-800 mb-2">Rate Limits</h5>
                <ul className="text-xs text-yellow-700 space-y-1">
                  <li>• 1000 requests per hour for authenticated requests</li>
                  <li>• 20 requests per minute for real-time data endpoints</li>
                  <li>• 429 status code returned when limits exceeded</li>
                  <li>• Contact support for higher limits if needed</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Example Usage */}
          <div>
            <h4 className="text-sm font-semibold text-slate-800 mb-3">Example Usage</h4>
            <div className="bg-slate-900 text-sm p-4 rounded-lg">
              <div className="text-gray-400 mb-2">// JavaScript/Node.js example</div>
              <code className="text-white">
                <span className="text-blue-400">const</span> response = <span className="text-blue-400">await</span> <span className="text-yellow-300">fetch</span>(<span className="text-green-400">'https://api.pricebot.com/api/rates?city=guwahati&material=cement'</span>, {"{"}
                <br />
                &nbsp;&nbsp;headers: {"{"}
                <br />
                &nbsp;&nbsp;&nbsp;&nbsp;<span className="text-green-400">'Authorization'</span>: <span className="text-green-400">'Bearer YOUR_API_KEY'</span>
                <br />
                &nbsp;&nbsp;{"}"}
                <br />
                {"}"});
                <br />
                <span className="text-blue-400">const</span> data = <span className="text-blue-400">await</span> response.<span className="text-yellow-300">json</span>();
              </code>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
