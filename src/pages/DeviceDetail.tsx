import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Activity,
  Terminal as TerminalIcon,
  Archive,
  Shield,
  Clock,
  Zap,
  FolderOpen,
  Gauge,
  Folder,
  File,
  ArrowLeft,
  Monitor,
  RefreshCw,
  Server,
  Cpu,
  Wifi,
  HardDrive,
  ClipboardList,
  ShieldAlert,
  MessageSquare,
  Wrench,
  Code2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { deviceService } from '../services/device.service';
import { diagnosticsService } from '../services/diagnostics.service';
import { inventoryService, type InventoryDetail } from '../services/inventory.service';
import { securityService } from '../services/security.service';
import { commandService } from '../services/command.service';
import { eventLogsService } from '../services/eventLogs.service';
import { sessionsService } from '../services/sessions.service';
import { healthService } from '../services/health.service';
import { remoteOpsService } from '../services/remoteOps.service';
import { messagingService } from '../services/messaging.service';
import { maintenanceService } from '../services/maintenance.service';
import { privacyService } from '../services/privacy.service';
import { scriptsService } from '../services/scripts.service';
import { toErrorMessage } from '../utils/error';
import type { Device, SecuritySnapshot, PerformanceMetrics } from '../types/device.types';
import type { CommandExecution, CommandResultPayload } from '../types/command.types';
import type { SessionSummary } from '../types/session.types';
import type { EventLogEntry } from '../services/eventLogs.service';
import { useTranslation } from '../hooks/useTranslation';
import { useAuthStore } from '../stores/authStore';
import InventoryOverview from '../components/inventory/InventoryOverview';

// Helper function to format uptime
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) {
    return `${days}g ${hours}s ${minutes}d`;
  }
  if (hours > 0) {
    return `${hours}s ${minutes}d`;
  }
  return `${minutes}d`;
}


function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)),
  ]);
}

export type DetailTab =
  | 'overview'
  | 'commands'
  | 'inventory'
  | 'security'
  | 'eventlogs'
  | 'sessions'
  | 'files'
  | 'performance'
  | 'messaging'
  | 'maintenance'
  | 'scripts';

interface TabDefinition {
  id: DetailTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface TabConfig {
  id: DetailTab;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  fallback: string;
}

const tabConfig: TabConfig[] = [
  { id: 'overview', labelKey: 'deviceDetail.tabs.overview', icon: Activity, fallback: 'Overview' },
  { id: 'commands', labelKey: 'deviceDetail.tabs.commands', icon: TerminalIcon, fallback: 'Commands' },
  { id: 'inventory', labelKey: 'deviceDetail.tabs.inventory', icon: Archive, fallback: 'Inventory' },
  { id: 'security', labelKey: 'deviceDetail.tabs.security', icon: Shield, fallback: 'Security' },
  { id: 'eventlogs', labelKey: 'deviceDetail.tabs.eventlogs', icon: Clock, fallback: 'Event Logs' },
  { id: 'sessions', labelKey: 'deviceDetail.tabs.sessions', icon: Zap, fallback: 'Sessions' },
  { id: 'files', labelKey: 'deviceDetail.tabs.files', icon: FolderOpen, fallback: 'Files' },
  { id: 'performance', labelKey: 'deviceDetail.tabs.performance', icon: Gauge, fallback: 'Performance' },
  { id: 'messaging', labelKey: 'deviceDetail.tabs.messaging', icon: MessageSquare, fallback: 'Messaging' },
  { id: 'maintenance', labelKey: 'deviceDetail.tabs.maintenance', icon: Wrench, fallback: 'Maintenance' },
  { id: 'scripts', labelKey: 'deviceDetail.tabs.scripts', icon: Code2, fallback: 'Scripts' },
];

interface DiagnosticsState {
  loading: boolean;
  status?: Record<string, unknown>;
  agentInfo?: Record<string, unknown>;
  connectionDetails?: Record<string, unknown>;
  pingResult?: Record<string, unknown>;
  error?: string;
}

interface InventoryState {
  loading: boolean;
  error?: string;
  data?: InventoryDetail;
}

interface SecurityState {
  loading: boolean;
  snapshot?: SecuritySnapshot;
  error?: string;
}

interface CommandsState {
  loading: boolean;
  items: CommandExecution[];
  error?: string;
}

interface EventLogState {
  loading: boolean;
  items: EventLogEntry[];
  error?: string;
}

interface SessionsState {
  loading: boolean;
  items: SessionSummary[];
  error?: string;
}

type DiagnosticsBundle = [
  CommandResultPayload<Record<string, unknown>>,
  CommandResultPayload<Record<string, unknown>>,
  CommandResultPayload<Record<string, unknown>>,
  CommandResultPayload<Record<string, unknown>>
];

interface PerformanceState {
  loading: boolean;
  metrics?: PerformanceMetrics;
  error?: string;
}

type MessagingAction = 'agentmsg' | 'messagebox' | 'notify' | 'toast' | 'chat';

interface MessagingFormState {
  action: MessagingAction;
  title: string;
  message: string;
  duration: number;
  sending: boolean;
  feedback?: string;
  error?: string;
}

interface MaintenanceFormState {
  version: string;
  channel: string;
  force: boolean;
  installerUrl: string;
  preserveConfig: boolean;
  tailLines: number;
  includeDiagnostics: boolean;
  busy: boolean;
  message?: string;
  error?: string;
  logResult?: string;
}

interface ScriptsState {
  loading: boolean;
  scripts: string[];
  handlers: string[];
  error?: string;
}

interface ScriptFormState {
  name: string;
  code: string;
  busy: boolean;
  feedback?: string;
  error?: string;
}
export default function DeviceDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useTranslation();
  const tabs = useMemo<TabDefinition[]>(
    () =>
      tabConfig.map((config) => ({
        id: config.id,
        icon: config.icon,
        label: t(config.labelKey, undefined, config.fallback),
      })),
    [t],
  );

  const initialTab = (searchParams.get('tab') as DetailTab) || 'overview';

  const [activeTab, setActiveTab] = useState<DetailTab>(initialTab);
  const [device, setDevice] = useState<Device | null>(null);
  const [loadingDevice, setLoadingDevice] = useState(true);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsState>({ loading: false });
  const [inventory, setInventory] = useState<InventoryState>({ loading: false });
  const [security, setSecurity] = useState<SecurityState>({ loading: false });
  const [commands, setCommands] = useState<CommandsState>({ loading: false, items: [] });
  const [eventLogs, setEventLogs] = useState<EventLogState>({ loading: false, items: [] });
  const [sessions, setSessions] = useState<SessionsState>({ loading: false, items: [] });
  const [performance, setPerformance] = useState<PerformanceState>({ loading: false });
  const [messagingForm, setMessagingForm] = useState<MessagingFormState>({
    action: 'agentmsg',
    title: '',
    message: '',
    duration: 5000,
    sending: false,
  });
  const [maintenanceForm, setMaintenanceForm] = useState<MaintenanceFormState>({
    version: '',
    channel: '',
    force: false,
    installerUrl: '',
    preserveConfig: true,
    tailLines: 200,
    includeDiagnostics: false,
    busy: false,
    logResult: undefined,
  });
  const [scriptsState, setScriptsState] = useState<ScriptsState>({
    loading: false,
    scripts: [],
    handlers: [],
  });
  const [scriptForm, setScriptForm] = useState<ScriptFormState>({
    name: '',
    code: '',
    busy: false,
  });

  const deviceId = id ?? '';

  const refreshDeviceInfo = useCallback(async () => {
    if (!deviceId) return;
    setLoadingDevice(true);
    try {
      const data = await deviceService.getDeviceById(deviceId);
      setDevice(data);
    } catch (error) {
      console.error('Failed to load device info', error);
    } finally {
      setLoadingDevice(false);
    }
  }, [deviceId]);

  useEffect(() => {
    refreshDeviceInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]); // Only run when deviceId changes

  // Sync activeTab with URL when URL changes externally (e.g., browser back/forward)
  useEffect(() => {
    const urlTab = (searchParams.get('tab') as DetailTab) || 'overview';
    if (urlTab !== activeTab) {
      setActiveTab(urlTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);


  const handleTabChange = (tab: DetailTab) => {
    setActiveTab(tab);
    setSearchParams((params) => {
      params.set('tab', tab);
      return params;
    });
  };

  const runMaintenanceAction = useCallback(
    async (action: () => Promise<string | undefined>) => {
      if (!deviceId) return;
      setMaintenanceForm((prev) => ({ ...prev, busy: true, message: undefined, error: undefined }));
      try {
        const message = (await action()) ?? t('deviceDetail.maintenance.genericSuccess');
        setMaintenanceForm((prev) => ({ ...prev, busy: false, message, error: undefined }));
      } catch (error) {
        setMaintenanceForm((prev) => ({
          ...prev,
          busy: false,
          error: toErrorMessage(error, t('deviceDetail.maintenance.error')),
        }));
      }
    },
    [deviceId, t],
  );

  const updateMessagingForm = useCallback((patch: Partial<MessagingFormState>) => {
    setMessagingForm((prev) => ({
      ...prev,
      ...patch,
      feedback: patch.feedback !== undefined ? patch.feedback : prev.feedback,
      error: patch.error !== undefined ? patch.error : prev.error,
    }));
  }, []);

  const handleMessagingSend = useCallback(async () => {
    if (!deviceId) return;
    setMessagingForm((prev) => ({ ...prev, sending: true, feedback: undefined, error: undefined }));
    try {
      const fallbackTitle = messagingForm.title || t('deviceDetail.messaging.defaultTitle');
      switch (messagingForm.action) {
        case 'agentmsg':
          await messagingService.sendAgentMessage(deviceId, { message: messagingForm.message });
          break;
        case 'messagebox':
          await messagingService.showMessageBox(deviceId, {
            title: fallbackTitle,
            message: messagingForm.message,
            type: 'info',
          });
          break;
        case 'notify':
          await messagingService.sendNotification(deviceId, {
            title: fallbackTitle,
            message: messagingForm.message,
          });
          break;
        case 'toast':
          await messagingService.showToast(deviceId, {
            title: fallbackTitle,
            message: messagingForm.message,
            duration: messagingForm.duration,
          });
          break;
        case 'chat':
          await messagingService.sendChatMessage(deviceId, { message: messagingForm.message });
          break;
        default:
          break;
      }
      setMessagingForm((prev) => ({
        ...prev,
        sending: false,
        feedback: t('deviceDetail.messaging.success'),
        error: undefined,
        message: '',
        title: '',
      }));
    } catch (error) {
      setMessagingForm((prev) => ({
        ...prev,
        sending: false,
        error: toErrorMessage(error, t('deviceDetail.messaging.error')),
      }));
    }
  }, [deviceId, messagingForm.action, messagingForm.duration, messagingForm.message, messagingForm.title, t]);

  const updateMaintenanceFields = useCallback((patch: Partial<MaintenanceFormState>) => {
    setMaintenanceForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const updateScriptForm = useCallback((patch: Partial<ScriptFormState>) => {
    setScriptForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleMaintenanceUpdate = useCallback(async () => {
    await runMaintenanceAction(async () => {
      const payload = {
        version: maintenanceForm.version || undefined,
        channel: maintenanceForm.channel || undefined,
        force: maintenanceForm.force,
      };
      const result = await maintenanceService.update(deviceId, payload);
      if (result.status !== 'Completed') throw new Error(result.result ?? t('deviceDetail.maintenance.error'));
      return t('deviceDetail.maintenance.updateQueued');
    });
  }, [deviceId, maintenanceForm.channel, maintenanceForm.force, maintenanceForm.version, runMaintenanceAction, t]);

  const handleMaintenanceReinstall = useCallback(async () => {
    await runMaintenanceAction(async () => {
      const result = await maintenanceService.reinstall(deviceId, {
        installerUrl: maintenanceForm.installerUrl || undefined,
        preserveConfig: maintenanceForm.preserveConfig,
      });
      if (result.status !== 'Completed') throw new Error(result.result ?? t('deviceDetail.maintenance.error'));
      return t('deviceDetail.maintenance.reinstallQueued');
    });
  }, [deviceId, maintenanceForm.installerUrl, maintenanceForm.preserveConfig, runMaintenanceAction, t]);

  const handleMaintenanceLogs = useCallback(async () => {
    await runMaintenanceAction(async () => {
      const result = await maintenanceService.collectLogs(deviceId, {
        tailLines: maintenanceForm.tailLines,
        includeDiagnostics: maintenanceForm.includeDiagnostics,
      });
      if (result.status !== 'Completed') throw new Error(result.result ?? t('deviceDetail.maintenance.error'));
      const text = result.result ?? t('deviceDetail.maintenance.logsQueued');
      setMaintenanceForm((prev) => ({ ...prev, logResult: text }));
      return t('deviceDetail.maintenance.logsQueued');
    });
  }, [
    deviceId,
    maintenanceForm.includeDiagnostics,
    maintenanceForm.tailLines,
    runMaintenanceAction,
    t,
  ]);

  const handlePrivacyShow = useCallback(async () => {
    await runMaintenanceAction(async () => {
      const result = await privacyService.showBar(deviceId);
      if (result.status !== 'Completed') throw new Error(result.result ?? t('deviceDetail.maintenance.error'));
      return t('deviceDetail.maintenance.privacyShown');
    });
  }, [deviceId, runMaintenanceAction, t]);

  const handlePrivacyHide = useCallback(async () => {
    await runMaintenanceAction(async () => {
      const result = await privacyService.hideBar(deviceId);
      if (result.status !== 'Completed') throw new Error(result.result ?? t('deviceDetail.maintenance.error'));
      return t('deviceDetail.maintenance.privacyHidden');
    });
  }, [deviceId, runMaintenanceAction, t]);

  const loadScripts = useCallback(async () => {
    if (!deviceId) return;
    setScriptsState((prev) => ({ ...prev, loading: true, error: undefined }));
    try {
      const result = await scriptsService.list(deviceId);
      setScriptsState({
        loading: false,
        scripts: result.data?.scripts ?? [],
        handlers: result.data?.handlers ?? [],
        error: result.error,
      });
    } catch (error) {
      setScriptsState({
        loading: false,
        scripts: [],
        handlers: [],
        error: toErrorMessage(error, t('deviceDetail.scripts.error')),
      });
    }
  }, [deviceId, t]);

  const handleScriptDeploy = useCallback(async () => {
    if (!deviceId) return;
    setScriptForm((prev) => ({ ...prev, busy: true, feedback: undefined, error: undefined }));
    try {
      const result = await scriptsService.deploy(deviceId, {
        name: scriptForm.name || undefined,
        code: scriptForm.code,
      });
      if (!result.success) throw new Error(result.error ?? 'Deploy failed');
      setScriptForm((prev) => ({ ...prev, busy: false, feedback: t('deviceDetail.scripts.deploySuccess'), code: '' }));
      loadScripts();
    } catch (error) {
      setScriptForm((prev) => ({
        ...prev,
        busy: false,
        error: toErrorMessage(error, t('deviceDetail.scripts.error')),
      }));
    }
  }, [deviceId, loadScripts, scriptForm.code, scriptForm.name, t]);

  const handleScriptReload = useCallback(async () => {
    if (!deviceId) return;
    setScriptForm((prev) => ({ ...prev, busy: true, feedback: undefined, error: undefined }));
    try {
      const result = await scriptsService.reload(deviceId);
      if (!result.success) throw new Error(result.error ?? 'Reload failed');
      setScriptForm((prev) => ({ ...prev, busy: false, feedback: t('deviceDetail.scripts.reloadSuccess') }));
      loadScripts();
    } catch (error) {
      setScriptForm((prev) => ({
        ...prev,
        busy: false,
        error: toErrorMessage(error, t('deviceDetail.scripts.error')),
      }));
    }
  }, [deviceId, loadScripts, t]);

  const handleScriptRemove = useCallback(
    async (name: string) => {
      if (!deviceId) return;
      setScriptsState((prev) => ({ ...prev, loading: true }));
      try {
        const result = await scriptsService.remove(deviceId, { name });
        if (!result.success) throw new Error(result.error ?? 'Remove failed');
        await loadScripts();
      } catch (error) {
        setScriptsState({
          loading: false,
          scripts: [],
          handlers: [],
          error: toErrorMessage(error, t('deviceDetail.scripts.error')),
        });
      }
    },
    [deviceId, loadScripts, t],
  );

  useEffect(() => {
    loadScripts();
  }, [loadScripts]);

  const runDiagnostics = useCallback(async () => {
    if (!deviceId) return;
    setDiagnostics((prev) => ({ ...prev, loading: true, error: undefined }));
    const timeoutSeconds = 15;
    const timeoutMessage = t(
      'deviceDetail.errors.timeout',
      { seconds: timeoutSeconds },
      'Request timed out. Agent may be offline or not responding.',
    );

    try {
      const diagnostics = await withTimeout<DiagnosticsBundle>(
        Promise.all([
          diagnosticsService.getStatus(deviceId),
          diagnosticsService.getAgentInfo(deviceId),
          diagnosticsService.getConnectionDetails(deviceId),
          diagnosticsService.ping(deviceId),
        ]),
        timeoutSeconds * 1000,
        timeoutMessage,
      );

      const [status, agentInfo, connectionDetails, pingResult] = diagnostics;

      setDiagnostics({
        loading: false,
        status: status.data,
        agentInfo: agentInfo.data,
        connectionDetails: connectionDetails.data,
        pingResult: pingResult.data,
      });
    } catch (error) {
      console.error('Diagnostics error:', error);
      setDiagnostics({
        loading: false,
        error: toErrorMessage(error, t('deviceDetail.errors.diagnostics', undefined, timeoutMessage)),
      });
    }
  }, [deviceId, t]);

  const loadInventory = useCallback(async () => {
    if (!deviceId || inventory.loading) return;
    setInventory({ loading: true });
    try {
      const result = await inventoryService.getFullInventory(deviceId);
      if (!result.success || !result.data) {
        setInventory({
          loading: false,
          error: result.error ?? t('deviceDetail.errors.inventory'),
        });
      } else {
        setInventory({
          loading: false,
          data: result.data,
        });
      }
    } catch (error) {
      setInventory({ loading: false, error: toErrorMessage(error, t('deviceDetail.errors.inventory')) });
    }
  }, [deviceId, inventory.loading, t]);

  const loadSecurity = useCallback(async () => {
    if (!deviceId || security.loading) return;
    setSecurity({ loading: true });
    try {
      const snapshot = await securityService.getSecurityStatus(deviceId);
      setSecurity({ loading: false, snapshot: snapshot.data ?? undefined });
    } catch (error) {
      setSecurity({ loading: false, error: toErrorMessage(error, t('deviceDetail.errors.security')) });
    }
  }, [deviceId, security.loading, t]);

  const loadCommands = useCallback(async () => {
    if (!deviceId || commands.loading) return;
    setCommands((prev) => ({ ...prev, loading: true, error: undefined }));
    try {
      const items = await commandService.getCommandsByDevice(deviceId);
      setCommands({ loading: false, items });
    } catch (error) {
      setCommands({ loading: false, items: [], error: toErrorMessage(error, t('deviceDetail.errors.commands')) });
    }
  }, [deviceId, commands.loading, t]);

  const loadEventLogs = useCallback(async () => {
    if (!deviceId || eventLogs.loading) return;
    setEventLogs((prev) => ({ ...prev, loading: true, error: undefined }));
    try {
      const result = await eventLogsService.getAll(deviceId, { maxEvents: 100 });
      setEventLogs({ loading: false, items: result.data ?? [] });
    } catch (error) {
      setEventLogs({ loading: false, items: [], error: toErrorMessage(error, t('deviceDetail.errors.eventLogs')) });
    }
  }, [deviceId, eventLogs.loading, t]);

  const loadSessions = useCallback(async () => {
    if (!deviceId || sessions.loading) return;
    setSessions((prev) => ({ ...prev, loading: true, error: undefined }));
    try {
      const activeSessions = await sessionsService.getSessionsByDevice(deviceId);
      setSessions({ loading: false, items: activeSessions });
    } catch (error) {
      setSessions({ loading: false, items: [], error: toErrorMessage(error, t('deviceDetail.errors.sessions')) });
    }
  }, [deviceId, sessions.loading, t]);

  const loadPerformance = useCallback(async () => {
    if (!deviceId || performance.loading) return;
    setPerformance((prev) => ({ ...prev, loading: true, error: undefined }));
    const timeoutSeconds = 15;
    const timeoutMessage = t(
      'deviceDetail.errors.timeout',
      { seconds: timeoutSeconds },
      'Request timed out. Agent may be offline or not responding.',
    );

    try {
      const metrics = await withTimeout(
        healthService.getMetrics(deviceId),
        timeoutSeconds * 1000,
        timeoutMessage,
      );

      setPerformance({ loading: false, metrics: metrics.data });
    } catch (error) {
      console.error('Performance error:', error);
      setPerformance({
        loading: false,
        error: toErrorMessage(error, t('deviceDetail.errors.performance', undefined, timeoutMessage)),
      });
    }
  }, [deviceId, performance.loading, t]);

  useEffect(() => {
    if (!deviceId) return;
    switch (activeTab) {
      case 'overview':
        runDiagnostics();
        loadPerformance();
        break;
      case 'inventory':
        loadInventory();
        break;
      case 'security':
        loadSecurity();
        break;
      case 'commands':
        loadCommands();
        break;
      case 'eventlogs':
        loadEventLogs();
        break;
      case 'sessions':
        loadSessions();
        break;
      case 'performance':
        loadPerformance();
        break;
      default:
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, deviceId]);

  const statusBadge = useMemo(() => {
    if (!device) return null;
    const color =
      device.status === 'Connected'
        ? 'bg-emerald-500'
        : device.status === 'Error'
          ? 'bg-destructive'
          : device.status === 'Connecting'
            ? 'bg-blue-400'
            : 'bg-muted';
    const statusLabel = t(`devices.statusLabels.${device.status}`, undefined, device.status);
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">
        <span className={`h-2 w-2 rounded-full ${color}`} />
        {statusLabel}
      </span>
    );
  }, [device, t]);

  if (!deviceId) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">{t('deviceDetail.messages.missingId')}</p>
      </div>
    );
  }

  if (loadingDevice) {
    return (
      <div className="flex h-full items-center justify-center gap-3 text-muted-foreground">
        <RefreshCw className="h-5 w-5 animate-spin" />
        {t('deviceDetail.messages.loading')}
      </div>
    );
  }

  if (!device) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <p className="text-lg font-semibold text-muted-foreground">{t('deviceDetail.messages.notFound')}</p>
        <button
          onClick={() => navigate('/devices')}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('deviceDetail.back')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border bg-card">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/devices')}
              className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary/70"
            >
              <ArrowLeft className="mr-2 inline h-4 w-4" />
              {t('deviceDetail.messages.back')}
            </button>
            <div>
              <h1 className="text-2xl font-semibold">{device.hostname}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                {statusBadge}
                <span className="flex items-center gap-2">
                  <Server className="h-4 w-4" />
                  {device.domain ?? t('deviceDetail.messages.noDomain')}
                </span>
                <span className="flex items-center gap-2">
                  <Cpu className="h-4 w-4" />
                  {device.osVersion ?? t('deviceDetail.messages.unknownOs')}
                </span>
                <span className="flex items-center gap-2">
                  <Wifi className="h-4 w-4" />
                  {device.ipAddress ?? t('deviceDetail.messages.noIp')}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refreshDeviceInfo}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary/80"
            >
              <RefreshCw className="h-4 w-4" />
              {t('deviceDetail.header.refresh')}
            </button>
            <button
              onClick={() => navigate(`/devices/${device.id}/desktop`)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
            >
              <Monitor className="h-4 w-4" />
              {t('deviceDetail.header.openDesktop')}
            </button>
            <button
              onClick={() => navigate(`/devices/${device.id}/terminal`)}
              className="inline-flex items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-foreground transition hover:bg-secondary/80"
            >
              <TerminalIcon className="h-4 w-4" />
              {t('deviceDetail.header.openTerminal')}
            </button>
          </div>
        </div>

        <div className="flex h-14 items-center gap-1 overflow-x-auto px-4">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
                  isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-secondary/70'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-muted/10 p-6">
        {activeTab === 'overview' && (
          <OverviewTab
            diagnostics={diagnostics}
            onRefresh={runDiagnostics}
            device={device}
            performance={performance}
            onRefreshPerformance={loadPerformance}
          />
        )}
        {activeTab === 'commands' && (
          <CommandsTab state={commands} onRefresh={loadCommands} />
        )}
        {activeTab === 'inventory' && (
          <InventoryTab state={inventory} onRefresh={loadInventory} />
        )}
        {activeTab === 'security' && (
          <SecurityTab state={security} onRefresh={loadSecurity} />
        )}
        {activeTab === 'eventlogs' && (
          <EventLogsTab state={eventLogs} onRefresh={loadEventLogs} deviceId={device.id} />
        )}
        {activeTab === 'sessions' && (
          <SessionsTab state={sessions} onRefresh={loadSessions} deviceId={device.id} />
        )}
        {activeTab === 'files' && <FilesTab deviceId={device.id} />}
        {activeTab === 'performance' && (
          <PerformanceTab state={performance} onRefresh={loadPerformance} deviceId={device.id} />
        )}
        {activeTab === 'messaging' && (
          <MessagingTab
            state={messagingForm}
            onChange={updateMessagingForm}
            onSend={handleMessagingSend}
            disabled={!deviceId}
          />
        )}
        {activeTab === 'maintenance' && (
          <MaintenanceTab
            state={maintenanceForm}
            onChange={updateMaintenanceFields}
            onUpdate={handleMaintenanceUpdate}
            onReinstall={handleMaintenanceReinstall}
            onCollectLogs={handleMaintenanceLogs}
            onShowPrivacy={handlePrivacyShow}
            onHidePrivacy={handlePrivacyHide}
          />
        )}
        {activeTab === 'scripts' && (
          <ScriptsTab
            state={scriptsState}
            form={scriptForm}
            onFormChange={updateScriptForm}
            onDeploy={handleScriptDeploy}
            onReload={handleScriptReload}
            onRefresh={loadScripts}
            onRemove={handleScriptRemove}
          />
        )}
      </div>
    </div>
  );
}
function OverviewTab({
  diagnostics,
  onRefresh,
  device,
  performance,
  onRefreshPerformance,
}: {
  diagnostics: DiagnosticsState;
  onRefresh: () => void;
  device: Device;
  performance: PerformanceState;
  onRefreshPerformance: () => void;
}) {
  const { t, language } = useTranslation();
  const locale = language === 'tr' ? 'tr-TR' : 'en-GB';

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t('deviceDetail.overview.diagnosticsTitle')}</h2>
            <p className="text-sm text-muted-foreground">
              {t('deviceDetail.overview.diagnosticsDescription')}
            </p>
          </div>
          <button
            onClick={onRefresh}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-secondary/70"
          >
            <RefreshCw className="h-4 w-4" />
            {t('deviceDetail.overview.diagnosticsRefresh')}
          </button>
        </div>
        {diagnostics.loading ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            <RefreshCw className="mr-3 h-4 w-4 animate-spin" />
            {t('deviceDetail.overview.diagnosticsLoading')}
          </div>
        ) : diagnostics.error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {diagnostics.error}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <DiagnosticCard title={t('deviceDetail.overview.cards.status')} icon={ShieldAlert} data={diagnostics.status} />
            <DiagnosticCard title={t('deviceDetail.overview.cards.agent')} icon={ClipboardList} data={diagnostics.agentInfo} />
            <DiagnosticCard
              title={t('deviceDetail.overview.cards.connection')}
              icon={Monitor}
              data={diagnostics.connectionDetails}
            />
            <DiagnosticCard title={t('deviceDetail.overview.cards.ping')} icon={Wifi} data={diagnostics.pingResult} />
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t('deviceDetail.overview.performanceTitle')}</h2>
            <p className="text-sm text-muted-foreground">{t('deviceDetail.overview.performanceDescription')}</p>
          </div>
          <button
            onClick={onRefreshPerformance}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-secondary/70"
          >
            <RefreshCw className="h-4 w-4" />
            {t('deviceDetail.overview.performanceRefresh')}
          </button>
        </div>
        {performance.loading ? (
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            <RefreshCw className="mr-3 h-4 w-4 animate-spin" />
            {t('deviceDetail.overview.performanceLoading')}
          </div>
        ) : performance.error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {performance.error}
          </div>
        ) : performance.metrics ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard title={t('deviceDetail.performance.labels.cpu')} value={`${performance.metrics.cpuUsage.toFixed(1)} %`} icon={Cpu} />
            <MetricCard title={t('deviceDetail.performance.labels.memory')} value={`${performance.metrics.memoryUsage.toFixed(1)} %`} icon={HardDrive} />
            <MetricCard title={t('deviceDetail.performance.labels.disk')} value={`${performance.metrics.diskUsage.toFixed(1)} %`} icon={Archive} />
            <MetricCard
              title={t('deviceDetail.performance.labels.uptime')}
              value={formatUptime(performance.metrics.uptimeSeconds)}
              icon={Activity}
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('deviceDetail.overview.metricsUnavailable')}</p>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">{t('deviceDetail.overview.metaTitle')}</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Property label={t('deviceDetail.overview.fields.hostname')} value={device.hostname} />
          <Property label={t('deviceDetail.overview.fields.ipAddress')} value={device.ipAddress ?? '-'} />
          <Property label={t('deviceDetail.overview.fields.macAddress')} value={device.macAddress ?? '-'} />
          <Property label={t('deviceDetail.overview.fields.domain')} value={device.domain ?? '-'} />
          <Property label={t('deviceDetail.overview.fields.os')} value={device.osVersion ?? '-'} />
          <Property label={t('deviceDetail.overview.fields.agentVersion')} value={device.agentVersion ?? '-'} />
          <Property label={t('deviceDetail.overview.fields.registeredAt')} value={new Date(device.registeredAt).toLocaleString(locale)} />
          <Property
            label={t('deviceDetail.overview.fields.lastSeen')}
            value={device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString(locale) : '-'}
          />
        </div>
      </section>
    </div>
  );
}
function DiagnosticCard({
  title,
  icon: Icon,
  data,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  data?: Record<string, unknown>;
}) {
  const { t } = useTranslation();

  return (
    <div className="rounded-xl border border-border bg-background/60 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="space-y-1 text-xs text-muted-foreground">
        {data ? (
          Object.entries(data).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <span className="font-medium text-foreground/80">{formatKey(key)}</span>
              <span className="truncate">{String(value)}</span>
            </div>
          ))
        ) : (
          <p>{t('common.noData')}</p>
        )}
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/60 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase text-muted-foreground">{title}</p>
          <p className="mt-1 text-lg font-semibold">{value}</p>
        </div>
        <Icon className="h-6 w-6 text-primary" />
      </div>
    </div>
  );
}

function Property({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
function CommandsTab({ state, onRefresh }: { state: CommandsState; onRefresh: () => void }) {
  const { t, language } = useTranslation();
  const locale = language === 'tr' ? 'tr-TR' : 'en-GB';

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t('deviceDetail.commands.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('deviceDetail.commands.description')}</p>
        </div>
        <button
          onClick={onRefresh}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-secondary/70"
        >
          <RefreshCw className="h-4 w-4" />
          {t('deviceDetail.commands.refresh')}
        </button>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-secondary/60">
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3">{t('deviceDetail.commands.columns.command')}</th>
              <th className="px-4 py-3">{t('deviceDetail.commands.columns.status')}</th>
              <th className="px-4 py-3">{t('deviceDetail.commands.columns.result')}</th>
              <th className="px-4 py-3">{t('deviceDetail.commands.columns.started')}</th>
              <th className="px-4 py-3">{t('deviceDetail.commands.columns.finished')}</th>
            </tr>
          </thead>
          <tbody>
            {state.loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  {t('deviceDetail.commands.loading')}
                </td>
              </tr>
            ) : state.items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  {t('deviceDetail.commands.empty')}
                </td>
              </tr>
            ) : (
              state.items.map((command) => (
                <tr key={command.id} className="border-t border-border/70">
                  <td className="px-4 py-3 font-medium text-foreground">{command.commandType}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={command.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    <code className="block max-w-[320px] truncate font-mono text-xs">{command.result ?? '-'}</code>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(command.createdAt).toLocaleString(locale)}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {command.completedAt ? new Date(command.completedAt).toLocaleString(locale) : '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {state.error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {state.error}
        </div>
      )}
    </section>
  );
}
function InventoryTab({ state, onRefresh }: { state: InventoryState; onRefresh: () => void }) {
  const { t, language } = useTranslation();
  const { user } = useAuthStore();
  const [refreshing, setRefreshing] = React.useState(false);
  const locale = language === 'tr' ? 'tr-TR' : 'en-GB';

  const handleRefresh = async () => {
    if (!state.data?.deviceId || !user?.id || refreshing) return;

    setRefreshing(true);
    try {
      await inventoryService.refreshInventory(state.data.deviceId, user.id);
      setTimeout(() => {
        onRefresh();
        setRefreshing(false);
      }, 2000);
    } catch (error) {
      console.error('Refresh failed:', error);
      setRefreshing(false);
    }
  };

  const resolvedError = state.error
    ? state.error === 'Inventory not collected yet. Please refresh.'
      ? t('deviceDetail.inventory.notCollected')
      : state.error
    : null;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t('deviceDetail.inventory.title')}</h2>
          <p className="text-sm text-muted-foreground">
            {state.data?.updatedAt
              ? `${t('deviceDetail.inventory.lastUpdated')}: ${new Date(state.data.updatedAt).toLocaleString(locale)}`
              : t('deviceDetail.inventory.notCollected')}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={!state.data?.deviceId || !user?.id || state.loading || refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-secondary/70 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={'h-4 w-4 ' + ((state.loading || refreshing) ? 'animate-spin' : '')} />
          {t('deviceDetail.inventory.refresh')}
        </button>
      </div>

      {state.loading ? (
        <div className="flex h-40 items-center justify-center gap-3 text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          {t('deviceDetail.inventory.loading')}
        </div>
      ) : resolvedError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {resolvedError}
        </div>
      ) : state.data ? (
        <InventoryOverview data={state.data} locale={locale} />
      ) : (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          {t('deviceDetail.inventory.notCollected')}
        </div>
      )}
    </section>
  );
}
function SecurityTab({ state, onRefresh }: { state: SecurityState; onRefresh: () => void }) {
  const { t } = useTranslation();

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t('deviceDetail.security.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('deviceDetail.security.description')}</p>
        </div>
        <button
          onClick={onRefresh}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-secondary/70"
        >
          <RefreshCw className="h-4 w-4" />
          {t('deviceDetail.security.refresh')}
        </button>
      </div>

      {state.loading ? (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          <RefreshCw className="mr-3 h-4 w-4 animate-spin" />
          {t('deviceDetail.security.loading')}
        </div>
      ) : state.error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {state.error}
        </div>
      ) : state.snapshot ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Object.entries(state.snapshot).map(([key, value]) => (
            <div key={key} className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs uppercase text-muted-foreground">{formatKey(key)}</p>
              <p className="mt-1 text-sm font-medium text-foreground">{String(value)}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t('deviceDetail.security.empty')}</p>
      )}
    </section>
  );
}

function EventLogsTab({
  state,
  onRefresh,
  deviceId,
}: {
  state: EventLogState;
  onRefresh: () => void;
  deviceId: string;
}) {
  const { t, language } = useTranslation();
  const locale = language === 'tr' ? 'tr-TR' : 'en-GB';
  const [monitorForm, setMonitorForm] = useState({ logName: 'Application', monitorId: '' });
  const [clearLogName, setClearLogName] = useState('Application');
  const [actionState, setActionState] = useState<{ busy: boolean; message?: string; error?: string }>({ busy: false });

  const runEventAction = async (action: () => Promise<unknown>) => {
    setActionState({ busy: true });
    try {
      await action();
      setActionState({ busy: false, message: t('deviceDetail.eventLogs.actionSuccess') });
    } catch (error) {
      setActionState({
        busy: false,
        error: toErrorMessage(error, t('deviceDetail.eventLogs.actionError')),
      });
    }
  };

  const handleStartMonitor = async () => {
    if (!monitorForm.logName.trim()) {
      setActionState({ busy: false, error: t('deviceDetail.eventLogs.logNameRequired') });
      return;
    }
    const monitorId = monitorForm.monitorId || `${monitorForm.logName}-${Date.now()}`;
    await runEventAction(() =>
      eventLogsService.startMonitor(deviceId, { logName: monitorForm.logName, monitorId }),
    );
    setMonitorForm((prev) => ({ ...prev, monitorId }));
  };

  const handleStopMonitor = async () => {
    if (!monitorForm.monitorId) {
      setActionState({ busy: false, error: t('deviceDetail.eventLogs.monitorIdRequired') });
      return;
    }
    await runEventAction(() => eventLogsService.stopMonitor(deviceId, { monitorId: monitorForm.monitorId }));
  };

  const handleClearLog = async () => {
    if (!clearLogName.trim()) {
      setActionState({ busy: false, error: t('deviceDetail.eventLogs.logNameRequired') });
      return;
    }
    await runEventAction(() => eventLogsService.clearLog(deviceId, { logName: clearLogName }));
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t('deviceDetail.eventLogs.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('deviceDetail.eventLogs.description')}</p>
        </div>
        <button
          onClick={onRefresh}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-secondary/70"
        >
          <RefreshCw className="h-4 w-4" />
          {t('deviceDetail.eventLogs.refresh')}
        </button>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">{t('deviceDetail.eventLogs.columns.timestamp')}</th>
              <th className="px-4 py-3 text-left">{t('deviceDetail.eventLogs.columns.level')}</th>
              <th className="px-4 py-3 text-left">{t('deviceDetail.eventLogs.columns.source')}</th>
              <th className="px-4 py-3 text-left">{t('deviceDetail.eventLogs.columns.message')}</th>
            </tr>
          </thead>
          <tbody>
            {state.loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                  {t('deviceDetail.eventLogs.loading')}
                </td>
              </tr>
            ) : state.items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                  {t('deviceDetail.eventLogs.empty')}
                </td>
              </tr>
            ) : (
              state.items.map((entry, index) => (
                <tr key={`${entry.eventId}-${index}`} className="border-t border-border/70">
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {entry.loggedAt ? new Date(entry.loggedAt).toLocaleString(locale) : '-'}
                  </td>
                  <td className="px-4 py-3 text-xs font-medium text-foreground">{entry.level ?? '-'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{entry.source ?? '-'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{entry.message ?? '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4">
          <h3 className="text-base font-semibold">{t('deviceDetail.eventLogs.monitorTitle')}</h3>
          <p className="text-sm text-muted-foreground">{t('deviceDetail.eventLogs.monitorDescription')}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <label className="text-xs font-medium uppercase text-muted-foreground">
              {t('deviceDetail.eventLogs.logNameLabel')}
            </label>
            <input
              value={monitorForm.logName}
              onChange={(event) => setMonitorForm((prev) => ({ ...prev, logName: event.target.value }))}
              className="w-full rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm"
              placeholder="Application"
            />
            <label className="text-xs font-medium uppercase text-muted-foreground">
              {t('deviceDetail.eventLogs.monitorIdLabel')}
            </label>
            <input
              value={monitorForm.monitorId}
              onChange={(event) => setMonitorForm((prev) => ({ ...prev, monitorId: event.target.value }))}
              className="w-full rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm"
              placeholder={t('deviceDetail.eventLogs.monitorIdPlaceholder')}
            />
            <div className="flex gap-2">
              <button
                onClick={handleStartMonitor}
                disabled={actionState.busy}
                className="inline-flex flex-1 items-center justify-center rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
              >
                {t('deviceDetail.eventLogs.startMonitor')}
              </button>
              <button
                onClick={handleStopMonitor}
                disabled={actionState.busy}
                className="inline-flex flex-1 items-center justify-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-secondary/70 disabled:opacity-60"
              >
                {t('deviceDetail.eventLogs.stopMonitor')}
              </button>
            </div>
          </div>
          <div className="space-y-3">
            <label className="text-xs font-medium uppercase text-muted-foreground">
              {t('deviceDetail.eventLogs.clearLogLabel')}
            </label>
            <input
              value={clearLogName}
              onChange={(event) => setClearLogName(event.target.value)}
              className="w-full rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm"
              placeholder={t('deviceDetail.eventLogs.clearLogPlaceholder')}
            />
            <button
              onClick={handleClearLog}
              disabled={actionState.busy}
              className="inline-flex w-full items-center justify-center rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-secondary/60 disabled:opacity-60"
            >
              {t('deviceDetail.eventLogs.clearLog')}
            </button>
          </div>
        </div>
        {actionState.message && (
          <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-600">
            {actionState.message}
          </div>
        )}
        {actionState.error && (
          <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {actionState.error}
          </div>
        )}
      </div>
      {state.error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {state.error}
        </div>
      )}
    </section>
  );
}
function SessionsTab({ state, onRefresh, deviceId }: { state: SessionsState; onRefresh: () => void; deviceId: string }) {
  const { t, language } = useTranslation();
  const locale = language === 'tr' ? 'tr-TR' : 'en-GB';

  const startDesktop = async () => {
    await sessionsService.startDesktopSession({ deviceId, sessionType: 'desktop' });
    onRefresh();
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t('deviceDetail.sessions.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('deviceDetail.sessions.description')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={startDesktop}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            <Monitor className="h-4 w-4" />
            {t('deviceDetail.sessions.startDesktop')}
          </button>
          <button
            onClick={onRefresh}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-secondary/70"
          >
            <RefreshCw className="h-4 w-4" />
            {t('deviceDetail.sessions.refresh')}
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">{t('deviceDetail.sessions.columns.type')}</th>
              <th className="px-4 py-3 text-left">{t('deviceDetail.sessions.columns.sessionId')}</th>
              <th className="px-4 py-3 text-left">{t('deviceDetail.sessions.columns.started')}</th>
              <th className="px-4 py-3 text-left">{t('deviceDetail.sessions.columns.lastActivity')}</th>
              <th className="px-4 py-3 text-left">{t('deviceDetail.sessions.columns.state')}</th>
            </tr>
          </thead>
          <tbody>
            {state.loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  {t('deviceDetail.sessions.loading')}
                </td>
              </tr>
            ) : state.items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  {t('deviceDetail.sessions.empty')}
                </td>
              </tr>
            ) : (
              state.items.map((session) => (
                <tr key={session.id} className="border-t border-border/70">
                  <td className="px-4 py-3 font-medium text-foreground">{session.sessionType}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{session.sessionId}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(session.startedAt).toLocaleString(locale)}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {session.lastActivityAt ? new Date(session.lastActivityAt).toLocaleString(locale) : '-'}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {session.isActive ? t('deviceDetail.sessions.states.active') : t('deviceDetail.sessions.states.closed')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {state.error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {state.error}
        </div>
      )}
    </section>
  );
}
function MessagingTab({
  state,
  onChange,
  onSend,
  disabled,
}: {
  state: MessagingFormState;
  onChange: (patch: Partial<MessagingFormState>) => void;
  onSend: () => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const actions: Array<{ id: MessagingAction; label: string }> = [
    { id: 'agentmsg', label: t('deviceDetail.messaging.actions.agentmsg') },
    { id: 'messagebox', label: t('deviceDetail.messaging.actions.messagebox') },
    { id: 'notify', label: t('deviceDetail.messaging.actions.notify') },
    { id: 'toast', label: t('deviceDetail.messaging.actions.toast') },
    { id: 'chat', label: t('deviceDetail.messaging.actions.chat') },
  ];
  const requiresTitle = state.action === 'messagebox' || state.action === 'notify' || state.action === 'toast';
  const canSend = !disabled && !state.sending && state.message.trim().length > 0;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t('deviceDetail.messaging.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('deviceDetail.messaging.description')}</p>
        </div>
      </div>
      <div className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase text-muted-foreground">
              {t('deviceDetail.messaging.fields.action')}
            </label>
            <select
              value={state.action}
              onChange={(event) => onChange({ action: event.target.value as MessagingAction })}
              className="w-full rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm"
            >
              {actions.map((action) => (
                <option key={action.id} value={action.id}>
                  {action.label}
                </option>
              ))}
            </select>
            {requiresTitle && (
              <>
                <label className="text-xs font-semibold uppercase text-muted-foreground">
                  {t('deviceDetail.messaging.fields.title')}
                </label>
                <input
                  value={state.title}
                  onChange={(event) => onChange({ title: event.target.value })}
                  className="w-full rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm"
                  placeholder={t('deviceDetail.messaging.titlePlaceholder')}
                />
              </>
            )}
          </div>
          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase text-muted-foreground">
              {t('deviceDetail.messaging.fields.message')}
            </label>
            <textarea
              value={state.message}
              onChange={(event) => onChange({ message: event.target.value })}
              className="h-32 w-full rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm"
              placeholder={t('deviceDetail.messaging.messagePlaceholder')}
            />
            {state.action === 'toast' && (
              <>
                <label className="text-xs font-semibold uppercase text-muted-foreground">
                  {t('deviceDetail.messaging.fields.duration')}
                </label>
                <input
                  type="number"
                  min={1000}
                  step={500}
                  value={state.duration}
                  onChange={(event) => onChange({ duration: Number(event.target.value) })}
                  className="w-full rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm"
                />
              </>
            )}
          </div>
        </div>
        <button
          onClick={onSend}
          disabled={!canSend}
          className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
        >
          {state.sending ? t('deviceDetail.messaging.sending') : t('deviceDetail.messaging.send')}
        </button>
        {state.feedback && (
          <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600">
            {state.feedback}
          </p>
        )}
        {state.error && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.error}
          </p>
        )}
      </div>
    </section>
  );
}
function MaintenanceTab({
  state,
  onChange,
  onUpdate,
  onReinstall,
  onCollectLogs,
  onShowPrivacy,
  onHidePrivacy,
}: {
  state: MaintenanceFormState;
  onChange: (patch: Partial<MaintenanceFormState>) => void;
  onUpdate: () => void;
  onReinstall: () => void;
  onCollectLogs: () => void;
  onShowPrivacy: () => void;
  onHidePrivacy: () => void;
}) {
  const { t } = useTranslation();
  const busy = state.busy;

  return (
    <section className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-border bg-card p-5">
          <div>
            <h3 className="text-base font-semibold">{t('deviceDetail.maintenance.updateTitle')}</h3>
            <p className="text-sm text-muted-foreground">{t('deviceDetail.maintenance.updateDescription')}</p>
          </div>
          <input
            value={state.version}
            onChange={(event) => onChange({ version: event.target.value })}
            className="w-full rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm"
            placeholder={t('deviceDetail.maintenance.versionPlaceholder')}
          />
          <input
            value={state.channel}
            onChange={(event) => onChange({ channel: event.target.value })}
            className="w-full rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm"
            placeholder={t('deviceDetail.maintenance.channelPlaceholder')}
          />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={state.force}
              onChange={(event) => onChange({ force: event.target.checked })}
            />
            {t('deviceDetail.maintenance.forceLabel')}
          </label>
          <button
            onClick={onUpdate}
            disabled={busy}
            className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
          >
            {t('deviceDetail.maintenance.updateAction')}
          </button>
        </div>
        <div className="space-y-4 rounded-xl border border-border bg-card p-5">
          <div>
            <h3 className="text-base font-semibold">{t('deviceDetail.maintenance.reinstallTitle')}</h3>
            <p className="text-sm text-muted-foreground">{t('deviceDetail.maintenance.reinstallDescription')}</p>
          </div>
          <input
            value={state.installerUrl}
            onChange={(event) => onChange({ installerUrl: event.target.value })}
            className="w-full rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm"
            placeholder={t('deviceDetail.maintenance.installerPlaceholder')}
          />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={state.preserveConfig}
              onChange={(event) => onChange({ preserveConfig: event.target.checked })}
            />
            {t('deviceDetail.maintenance.preserveLabel')}
          </label>
          <button
            onClick={onReinstall}
            disabled={busy}
            className="inline-flex w-full items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-secondary/70 disabled:opacity-60"
          >
            {t('deviceDetail.maintenance.reinstallAction')}
          </button>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-border bg-card p-5">
          <div>
            <h3 className="text-base font-semibold">{t('deviceDetail.maintenance.logsTitle')}</h3>
            <p className="text-sm text-muted-foreground">{t('deviceDetail.maintenance.logsDescription')}</p>
          </div>
          <label className="text-xs font-semibold uppercase text-muted-foreground">
            {t('deviceDetail.maintenance.tailLabel')}
          </label>
          <input
            type="number"
            min={50}
            step={50}
            value={state.tailLines}
            onChange={(event) => onChange({ tailLines: Number(event.target.value) })}
            className="w-full rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm"
          />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={state.includeDiagnostics}
              onChange={(event) => onChange({ includeDiagnostics: event.target.checked })}
            />
            {t('deviceDetail.maintenance.includeDiagnostics')}
          </label>
          <button
            onClick={onCollectLogs}
            disabled={busy}
            className="inline-flex w-full items-center justify-center rounded-lg bg-primary/80 px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary disabled:opacity-60"
          >
            {t('deviceDetail.maintenance.collectLogs')}
          </button>
          {state.logResult && (
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">
                {t('deviceDetail.maintenance.logOutput')}
              </label>
              <pre className="mt-2 max-h-60 overflow-y-auto rounded-lg border border-border bg-secondary/20 p-3 text-xs">
                {state.logResult}
              </pre>
            </div>
          )}
        </div>
        <div className="space-y-4 rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold">{t('deviceDetail.maintenance.privacyTitle')}</h3>
              <p className="text-sm text-muted-foreground">{t('deviceDetail.maintenance.privacyDescription')}</p>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <button
              onClick={onShowPrivacy}
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary/70 disabled:opacity-60"
            >
              <Eye className="h-4 w-4" />
              {t('deviceDetail.maintenance.showPrivacy')}
            </button>
            <button
              onClick={onHidePrivacy}
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary/70 disabled:opacity-60"
            >
              <EyeOff className="h-4 w-4" />
              {t('deviceDetail.maintenance.hidePrivacy')}
            </button>
          </div>
        </div>
      </div>
      {state.message && (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600">
          {state.message}
        </p>
      )}
      {state.error && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}
    </section>
  );
}

function ScriptsTab({
  state,
  form,
  onFormChange,
  onDeploy,
  onReload,
  onRefresh,
  onRemove,
}: {
  state: ScriptsState;
  form: ScriptFormState;
  onFormChange: (patch: Partial<ScriptFormState>) => void;
  onDeploy: () => void;
  onReload: () => void;
  onRefresh: () => void;
  onRemove: (name: string) => void;
}) {
  const { t } = useTranslation();

  const canDeploy = form.code.trim().length > 0 && !form.busy;

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t('deviceDetail.scripts.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('deviceDetail.scripts.description')}</p>
        </div>
        <div className="flex flex-col gap-2 md:flex-row">
          <button
            onClick={onReload}
            disabled={form.busy}
            className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary/70 disabled:opacity-60"
          >
            {t('deviceDetail.scripts.reload')}
          </button>
          <button
            onClick={onRefresh}
            disabled={state.loading}
            className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary/70 disabled:opacity-60"
          >
            {t('deviceDetail.scripts.refresh')}
          </button>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-border bg-card p-5">
          <h3 className="text-base font-semibold">{t('deviceDetail.scripts.scriptsTitle')}</h3>
          {state.loading ? (
            <p className="text-sm text-muted-foreground">{t('deviceDetail.scripts.loading')}</p>
          ) : state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : state.scripts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('deviceDetail.scripts.empty')}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {state.scripts.map((script) => (
                <li key={script} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                  <span>{script}</span>
                  <button
                    onClick={() => onRemove(script)}
                    className="text-xs text-destructive hover:underline"
                    disabled={state.loading}
                  >
                    {t('deviceDetail.scripts.remove')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-3 rounded-xl border border-border bg-card p-5">
          <h3 className="text-base font-semibold">{t('deviceDetail.scripts.handlersTitle')}</h3>
          {state.handlers.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('deviceDetail.scripts.emptyHandlers')}</p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 text-sm">
              {state.handlers.map((handler) => (
                <li key={handler} className="rounded-lg border border-border/60 bg-secondary/20 px-3 py-2">
                  {handler}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="space-y-3 rounded-xl border border-border bg-card p-5">
        <h3 className="text-base font-semibold">{t('deviceDetail.scripts.deployTitle')}</h3>
        <input
          value={form.name}
          onChange={(event) => onFormChange({ name: event.target.value })}
          className="w-full rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm"
          placeholder={t('deviceDetail.scripts.namePlaceholder')}
        />
        <textarea
          value={form.code}
          onChange={(event) => onFormChange({ code: event.target.value })}
          className="h-40 w-full rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm font-mono"
          placeholder={t('deviceDetail.scripts.codePlaceholder')}
        />
        <button
          onClick={onDeploy}
          disabled={!canDeploy}
          className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
        >
          {form.busy ? t('deviceDetail.scripts.deploying') : t('deviceDetail.scripts.deploy')}
        </button>
        {form.feedback && (
          <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600">
            {form.feedback}
          </p>
        )}
        {form.error && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {form.error}
          </p>
        )}
      </div>
    </section>
  );
}

function FilesTab({ deviceId }: { deviceId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [currentPath, setCurrentPath] = useState('');
  const [entries, setEntries] = useState<Array<{ name: string; type: 'file' | 'directory'; size?: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zipForm, setZipForm] = useState({ source: '', destination: '' });
  const [unzipForm, setUnzipForm] = useState({ source: '', destination: '' });
  const [urlToOpen, setUrlToOpen] = useState('');
  const [wolMac, setWolMac] = useState('');
  const [actionState, setActionState] = useState<{ busy: boolean; message?: string; error?: string }>({ busy: false });

  const load = async (path: string) => {
    console.log('load() called with path:', path);
    setLoading(true);
    setError(null);
    try {
      const response = await remoteOpsService.listDirectory(deviceId, path);
      console.log('listDirectory response:', response);
      if (response.success && response.data && Array.isArray(response.data)) {
        setEntries(response.data.map((item) => ({
          name: item.name,
          type: item.type === 'directory' ? 'directory' : 'file',
          size: item.size,
        })));
      } else {
        setEntries([]);
        setError(response.error ?? t('files.error'));
      }
    } catch (err: unknown) {
      console.error('File listing failed', err);
      setEntries([]);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (deviceId) {
      load(currentPath);
    }
  }, [deviceId, currentPath]);

  const goBack = () => {
    if (!currentPath) return;
    const pathParts = currentPath.split('\\').filter(p => p);
    if (pathParts.length === 1) {
      setCurrentPath('');
    } else {
      pathParts.pop();
      setCurrentPath(pathParts.join('\\'));
    }
  };

  const navigateToEntry = (entry: { name: string; type: 'file' | 'directory' }) => {
    if (entry.type === 'directory') {
      // Eğer tıklanan şey bir disk adı ise (C:\, D:\ gibi), direkt onu set et
      if (entry.name.match(/^[A-Z]:\\$/i)) {
        console.log('Setting path to disk:', entry.name);
        setCurrentPath(entry.name);
      } else if (!currentPath) {
        // Root seviyesindeyiz, disk seçimi yapılıyor
        console.log('Setting path to disk:', entry.name);
        setCurrentPath(entry.name);
      } else {
        // Normal dizin navigasyonu
        const normalized = currentPath.replace(/\\$/, '');
        const newPath = `${normalized}\\${entry.name}`;
        console.log('Setting path to:', newPath);
        setCurrentPath(newPath);
      }
    }
  };

  const runAction = async (action: () => Promise<unknown>) => {
    setActionState({ busy: true });
    try {
      await action();
      setActionState({ busy: false, message: t('deviceDetail.files.actionSuccess') });
    } catch (err) {
      setActionState({ busy: false, error: toErrorMessage(err, t('deviceDetail.files.actionError')) });
    }
  };

  const handleZip = async () => {
    if (!zipForm.source || !zipForm.destination) {
      setActionState({ busy: false, error: t('deviceDetail.files.validationPaths') });
      return;
    }
    await runAction(() => remoteOpsService.zip(deviceId, zipForm.source, zipForm.destination));
  };

  const handleUnzip = async () => {
    if (!unzipForm.source || !unzipForm.destination) {
      setActionState({ busy: false, error: t('deviceDetail.files.validationPaths') });
      return;
    }
    await runAction(() => remoteOpsService.unzip(deviceId, unzipForm.source, unzipForm.destination));
  };

  const handleOpenUrl = async () => {
    if (!urlToOpen) {
      setActionState({ busy: false, error: t('deviceDetail.files.validationUrl') });
      return;
    }
    await runAction(() => remoteOpsService.openUrl(deviceId, urlToOpen));
  };

  const handleWakeOnLan = async () => {
    if (!wolMac) {
      setActionState({ busy: false, error: t('deviceDetail.files.validationMac') });
      return;
    }
    await runAction(() => remoteOpsService.wakeOnLan(deviceId, wolMac));
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold">{t('files.title')}</h3>
        <button
          onClick={() => navigate(`/devices/${deviceId}/files`)}
          className="text-sm text-primary hover:underline"
        >
          {t('deviceDetail.files.open')}
        </button>
      </div>
      
      <div className="mb-4 flex gap-2">
        {currentPath && (
          <button
            onClick={goBack}
            className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm hover:bg-secondary/60"
            title={t('files.goBack')}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <input
          value={currentPath || t('files.drives')}
          onChange={(event) => setCurrentPath(event.target.value)}
          className="flex-1 rounded-lg border border-border bg-secondary/40 px-4 py-2 text-sm"
          placeholder={t('files.pathPlaceholder')}
        />
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center gap-3 text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          {t('files.loading')}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <ul className="max-h-96 space-y-2 overflow-y-auto text-sm">
          {entries.length === 0 ? (
            <li className="py-8 text-center text-muted-foreground">{t('files.loading')}</li>
          ) : (
            entries.map((entry) => (
              <li key={entry.name} className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 px-4 py-3">
                <div className="flex items-center gap-3">
                  {entry.type === 'directory' ? <Folder className="h-4 w-4" /> : <File className="h-4 w-4" />}
                  <button
                    onClick={() => navigateToEntry(entry)}
                    className="text-foreground hover:text-primary"
                  >
                    {entry.name}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  {entry.type === 'file' && entry.size !== undefined && (
                    <span className="text-xs text-muted-foreground">
                      {(entry.size / 1024).toFixed(1)} KB
                    </span>
                  )}
                </div>
              </li>
            ))
          )}
        </ul>
      )}
      <div className="mt-6 space-y-4 rounded-xl border border-border bg-card p-4">
        <div>
          <h4 className="text-base font-semibold">{t('deviceDetail.files.advancedTitle')}</h4>
          <p className="text-sm text-muted-foreground">{t('deviceDetail.files.advancedDescription')}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase text-muted-foreground">
              {t('deviceDetail.files.zipTitle')}
            </label>
            <input
              value={zipForm.source}
              onChange={(event) => setZipForm((prev) => ({ ...prev, source: event.target.value }))}
              className="w-full rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm"
              placeholder={t('deviceDetail.files.sourcePlaceholder')}
            />
            <input
              value={zipForm.destination}
              onChange={(event) => setZipForm((prev) => ({ ...prev, destination: event.target.value }))}
              className="w-full rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm"
              placeholder={t('deviceDetail.files.destinationPlaceholder')}
            />
            <button
              onClick={handleZip}
              disabled={actionState.busy}
              className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
            >
              {t('deviceDetail.files.zipAction')}
            </button>
          </div>
          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase text-muted-foreground">
              {t('deviceDetail.files.unzipTitle')}
            </label>
            <input
              value={unzipForm.source}
              onChange={(event) => setUnzipForm((prev) => ({ ...prev, source: event.target.value }))}
              className="w-full rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm"
              placeholder={t('deviceDetail.files.sourceZipPlaceholder')}
            />
            <input
              value={unzipForm.destination}
              onChange={(event) => setUnzipForm((prev) => ({ ...prev, destination: event.target.value }))}
              className="w-full rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm"
              placeholder={t('deviceDetail.files.destinationPlaceholder')}
            />
            <button
              onClick={handleUnzip}
              disabled={actionState.busy}
              className="inline-flex w-full items-center justify-center rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-secondary/60 disabled:opacity-60"
            >
              {t('deviceDetail.files.unzipAction')}
            </button>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase text-muted-foreground">
              {t('deviceDetail.files.openUrlTitle')}
            </label>
            <input
              value={urlToOpen}
              onChange={(event) => setUrlToOpen(event.target.value)}
              className="w-full rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm"
              placeholder="https://example.com"
            />
            <button
              onClick={handleOpenUrl}
              disabled={actionState.busy}
              className="inline-flex w-full items-center justify-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-secondary/70 disabled:opacity-60"
            >
              {t('deviceDetail.files.openUrlAction')}
            </button>
          </div>
          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase text-muted-foreground">
              {t('deviceDetail.files.wolTitle')}
            </label>
            <input
              value={wolMac}
              onChange={(event) => setWolMac(event.target.value)}
              className="w-full rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm"
              placeholder="00-11-22-33-44-55"
            />
            <button
              onClick={handleWakeOnLan}
              disabled={actionState.busy}
              className="inline-flex w-full items-center justify-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-secondary/70 disabled:opacity-60"
            >
              {t('deviceDetail.files.wakeOnLanAction')}
            </button>
          </div>
        </div>
        {actionState.message && (
          <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600">
            {actionState.message}
          </p>
        )}
        {actionState.error && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {actionState.error}
          </p>
        )}
      </div>
    </div>
  );
}
function PerformanceTab({ state, onRefresh, deviceId }: { state: PerformanceState; onRefresh: () => void; deviceId: string }) {
  const { t } = useTranslation();

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t('deviceDetail.performance.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('deviceDetail.performance.description')}</p>
        </div>
        <button
          onClick={onRefresh}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-secondary/70"
        >
          <RefreshCw className="h-4 w-4" />
          {t('deviceDetail.performance.refresh')}
        </button>
      </div>
      {state.loading ? (
        <div className="flex h-32 items-center justify-center gap-3 text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          {t('deviceDetail.performance.loading')}
        </div>
      ) : state.metrics ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <MetricCard title={t('deviceDetail.performance.labels.cpu')} value={`${state.metrics.cpuUsage.toFixed(1)} %`} icon={Cpu} />
          <MetricCard title={t('deviceDetail.performance.labels.memory')} value={`${state.metrics.memoryUsage.toFixed(1)} %`} icon={HardDrive} />
          <MetricCard title={t('deviceDetail.performance.labels.disk')} value={`${state.metrics.diskUsage.toFixed(1)} %`} icon={Archive} />
          <MetricCard
            title={t('deviceDetail.performance.labels.uptime')}
            value={formatUptime(state.metrics.uptimeSeconds)}
            icon={Activity}
          />
          <MetricCard title={t('deviceDetail.performance.labels.deviceId')} value={deviceId} icon={Server} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t('deviceDetail.performance.metricsUnavailable')}</p>
      )}
      {state.error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {state.error}
        </div>
      )}
    </section>
  );
}
function StatusBadge({ status }: { status: CommandExecution['status'] }) {
  const { t } = useTranslation();
  const variants: Record<CommandExecution['status'], string> = {
    Pending: 'bg-muted text-muted-foreground',
    Sent: 'bg-blue-500/10 text-blue-500',
    Running: 'bg-primary/10 text-primary',
    Success: 'bg-emerald-500/10 text-emerald-500',
    Completed: 'bg-emerald-500/10 text-emerald-500',
    Failed: 'bg-destructive/10 text-destructive',
    Error: 'bg-destructive/10 text-destructive',
    Cancelled: 'bg-muted text-muted-foreground',
  };
  const labels: Record<CommandExecution['status'], string> = {
    Pending: t('deviceDetail.commands.statusLabels.Pending'),
    Sent: t('deviceDetail.commands.statusLabels.Sent'),
    Running: t('deviceDetail.commands.statusLabels.Running'),
    Success: t('deviceDetail.commands.statusLabels.Completed'),
    Completed: t('deviceDetail.commands.statusLabels.Completed'),
    Failed: t('deviceDetail.commands.statusLabels.Failed'),
    Error: t('deviceDetail.commands.statusLabels.Error'),
    Cancelled: t('deviceDetail.commands.statusLabels.Cancelled'),
  };

  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${variants[status]}`}>
      {labels[status]}
    </span>
  );
}

function formatKey(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}
