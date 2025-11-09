export type ConnectionStatus = 'Disconnected' | 'Connecting' | 'Connected' | 'Reconnecting' | 'Error';

export interface Device {
  id: string;
  hostname: string;
  macAddress?: string;
  domain?: string;
  osVersion?: string;
  architecture?: string;
  ipAddress?: string;
  agentVersion?: string;
  status: ConnectionStatus;
  lastSeenAt?: string;
  registeredAt: string;
  groupId?: string;
  groupName?: string;
}

export interface DeviceListResponse {
  success: boolean;
  data: Device[];
}

export interface DeviceDetail extends Device {
  hardware?: HardwareInventory;
  software?: SoftwareInventory;
  security?: SecuritySnapshot;
}

export interface HardwareInventory {
  systemManufacturer?: string;
  systemModel?: string;
  processor?: string;
  physicalMemory?: string;
  biosVersion?: string;
  disks?: DiskInfo[];
  motherboard?: string;
  gpu?: string;
}

export interface DiskInfo {
  name: string;
  sizeBytes: number;
  freeBytes: number;
  filesystem?: string;
  type?: string;
}

export interface SoftwareInventory {
  installedApplications?: InstalledSoftware[];
  installedPatches?: PatchInfo[];
  pendingUpdates?: UpdateInfo[];
}

export interface InstalledSoftware {
  name: string;
  version?: string;
  publisher?: string;
  installDate?: string;
  sizeMb?: number;
}

export interface PatchInfo {
  kbNumber: string;
  title: string;
  installDate?: string;
  description?: string;
}

export interface UpdateInfo {
  kbNumber: string;
  title: string;
  severity?: 'Critical' | 'Important' | 'Moderate' | 'Low';
  sizeMb?: number;
  description?: string;
}

export interface SecuritySnapshot {
  antivirusStatus?: string;
  firewallStatus?: string;
  defenderStatus?: string;
  uacStatus?: string;
  encryptionStatus?: string;
  lastSecurityScan?: string;
  riskScore?: number;
}

export interface PerformanceMetrics {
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  uptimeSeconds: number;
  network?: NetworkMetrics;
  timestamp: string;
}

export interface NetworkMetrics {
  totalSentKb: number;
  totalReceivedKb: number;
  interfaces: NetworkInterfaceMetrics[];
}

export interface NetworkInterfaceMetrics {
  name: string;
  ipAddress?: string;
  macAddress?: string;
  speedMbps?: number;
  isUp: boolean;
}
