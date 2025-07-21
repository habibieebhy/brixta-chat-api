export interface UserSession {
  currentFlow: string;
  step: string;
  data: {
    userType?: 'buyer' | 'vendor';
    city?: string;
    material?: 'cement' | 'tmt';
    brand?: string;
    quantity?: string;
    vendorName?: string;
    vendorPhone?: string;
    materials?: string[];
    [key: string]: any;
  };
  createdAt: Date;
  updatedAt: Date;
}