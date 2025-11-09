import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Monitor, Activity, Users, ShieldCheck } from 'lucide-react';
import { dashboardService } from '../services/dashboard.service';
import type { Device } from '../types/device.types';
import type { CommandExecution } from '../types/command.types';
import { useTranslation } from '../hooks/useTranslation';

type DashboardStats = {
  totalDevices: number;
  onlineDevices: number;
  warningCount: number;
  activeSessions: number;
};

type RecentData = {
  devices: Device[];
  commands: CommandExecution[];
};

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recent, setRecent] = useState<RecentData>({ devices: [], commands: [] });
  const [loading, setLoading] = useState(true);
  const { t, language } = useTranslation();
  const locale = language === 'tr' ? 'tr-TR' : 'en-GB';

  const load = async () => {
    setLoading(true);
    try {
      const [newStats, devices, commands] = await Promise.all([
        dashboardService.getStats(),
        dashboardService.getRecentDevices(),
        dashboardService.getRecentCommands(),
      ]);
      setStats(newStats);
      setRecent({ devices, commands });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t('dashboard.title')}</h1>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary/70"
        >
          <RefreshCw className="h-4 w-4" />
          {t('common.refresh')}
        </button>
      </div>

      <StatsGrid stats={stats} loading={loading} />

      <div className="grid gap-6 md:grid-cols-2">
        <Card title={t('dashboard.recentDevices')} loading={loading}>
          <DeviceList devices={recent.devices} />
        </Card>
        <Card title={t('dashboard.recentCommands')} loading={loading}>
          <CommandList commands={recent.commands} locale={locale} />
        </Card>
      </div>
    </div>
  );
}

function StatsGrid({ stats, loading }: { stats: DashboardStats | null; loading: boolean }) {
  const { t } = useTranslation();
  const items = useMemo(
    () => [
      { label: t('dashboard.stats.totalDevices'), value: stats?.totalDevices ?? 0, icon: Monitor },
      { label: t('dashboard.stats.onlineDevices'), value: stats?.onlineDevices ?? 0, icon: Activity },
      { label: t('dashboard.stats.warningCount'), value: stats?.warningCount ?? 0, icon: ShieldCheck },
      { label: t('dashboard.stats.activeSessions'), value: stats?.activeSessions ?? 0, icon: Users },
    ],
    [stats, t],
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase text-muted-foreground">{item.label}</p>
              <p className="mt-2 text-2xl font-semibold">{loading ? '-' : item.value}</p>
            </div>
            <item.icon className="h-6 w-6 text-primary" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Card({ title, loading, children }: { title: string; loading: boolean; children: React.ReactNode }) {
  const { t } = useTranslation();

  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      <div className="flex-1 overflow-auto text-sm text-muted-foreground">
        {loading ? <div className="flex h-full items-center justify-center">{t('common.loading')}</div> : children}
      </div>
    </div>
  );
}

function DeviceList({ devices }: { devices: Device[] }) {
  const { t } = useTranslation();

  if (devices.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('dashboard.noDevices')}</p>;
  }

  return (
    <ul className="space-y-3">
      {devices.map((device) => (
        <li key={device.id} className="rounded-lg border border-border/60 bg-background/40 p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">{device.hostname}</p>
              <p className="text-xs text-muted-foreground">
                {(device.ipAddress ?? t('common.noData'))} | {(device.osVersion ?? t('common.noData'))}
              </p>
            </div>
            <span className={`h-2 w-2 rounded-full ${device.status === 'Connected' ? 'bg-emerald-500' : 'bg-muted'}`} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function CommandList({ commands, locale }: { commands: CommandExecution[]; locale: string }) {
  const { t } = useTranslation();

  if (commands.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('dashboard.noCommands')}</p>;
  }

  return (
    <ul className="space-y-3">
      {commands.map((command) => (
        <li key={command.id} className="rounded-lg border border-border/60 bg-background/40 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-foreground">{command.commandType}</p>
              <p className="text-xs text-muted-foreground">{new Date(command.createdAt).toLocaleString(locale)}</p>
            </div>
            <span className="shrink-0 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">
              {t(`deviceDetail.commands.statusLabels.${command.status}`, undefined, command.status)}
            </span>
          </div>
          {command.result && <p className="mt-2 truncate text-xs text-muted-foreground">{command.result}</p>}
        </li>
      ))}
    </ul>
  );
}
