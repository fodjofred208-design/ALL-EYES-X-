import React from 'react';

/**
 * How device icons are drawn. The operator chooses; the choice persists.
 *  - 'auto':   the OS logo while the device is online, a neutral monitor when
 *              offline (a device visibly "becomes" its OS when it reports in).
 *  - 'os':     always the OS logo, dimmed while offline.
 *  - 'device': always the neutral monitor, whatever the state.
 */
export type IconMode = 'auto' | 'os' | 'device';

const ICON_MODE_KEY = 'aeyes.iconMode';

export const getIconMode = (): IconMode => {
  try {
    const v = localStorage.getItem(ICON_MODE_KEY);
    return v === 'os' || v === 'device' ? v : 'auto';
  } catch {
    return 'auto';
  }
};

export const setIconMode = (mode: IconMode): void => {
  try {
    localStorage.setItem(ICON_MODE_KEY, mode);
  } catch {
    /* private mode - the choice just won't survive a reload */
  }
  window.dispatchEvent(new CustomEvent('aeyes-icon-mode', { detail: mode }));
};

/** Live icon mode; every DeviceIcon re-renders when the operator switches. */
export const useIconMode = (): IconMode => {
  const [mode, setMode] = React.useState<IconMode>(getIconMode);
  React.useEffect(() => {
    const on = (e: Event) => setMode(((e as CustomEvent).detail as IconMode) || 'auto');
    window.addEventListener('aeyes-icon-mode', on);
    return () => window.removeEventListener('aeyes-icon-mode', on);
  }, []);
  return mode;
};

interface DeviceIconProps {
  hostname?: string;
  os?: string;
  size?: number;
  className?: string;
  /**
   * When true the icon renders the operating-system logo (Windows, Linux,
   * macOS, Android...). When false it renders a neutral monitor, so a device
   * visibly "becomes" its OS the moment it comes online.
   */
  online?: boolean;
}

const DeviceIcon: React.FC<DeviceIconProps> = ({
  hostname = '',
  os = '',
  size = 40,
  className = '',
  online = false,
}) => {
  const mode = useIconMode();
  // 'os' forces the logo even offline; 'device' forces the monitor even online.
  const showOs = mode === 'os' ? true : mode === 'device' ? false : online;
  const combined = (os + ' ' + hostname).toLowerCase();

  const isWindows = combined.includes('windows');
  // Distribution names an agent can legitimately report. Kept as one list so a
  // new distro is a one-word change rather than another branch.
  const LINUX_DISTROS = [
    'linux', 'ubuntu', 'debian', 'kali', 'centos', 'fedora', 'arch', 'archlinux',
    'mint', 'redhat', 'red hat', 'rhel', 'gentoo', 'mandriva', 'pclinuxos',
    'mageia', 'oracle', 'opensuse', 'suse', 'sled', 'turbolinux', 'xandros',
    'alpine', 'rocky', 'almalinux', 'manjaro', 'elementary', 'zorin', 'pop!_os',
    'slackware', 'clearos', 'scientific linux', 'amazon linux', 'endeavour',
    'nixos', 'void', 'parrot', 'tails', 'raspbian', 'raspberry pi os',
  ];
  const isLinux = LINUX_DISTROS.some(name => combined.includes(name));
  // Unix family that is not Linux - distinct kernels, so they get their own mark.
  const isSolaris = /solaris|sunos|illumos|smartos|omnios|openindiana/.test(combined);
  const isBsd = /freebsd|openbsd|netbsd|dragonflybsd|\bbsd\b/.test(combined);
  // IBM platforms: AIX on POWER, z/OS on mainframe.
  const isIbm = /\baix\b|z\/os|os\/390|os400|ibm i\b|iseries|as\/400/.test(combined);
  const isMac = combined.includes('darwin') || combined.includes('macos') || combined.includes('mac');
  const isAndroid = combined.includes('android');
  const isIos = combined.includes('ios') || combined.includes('iphone') || combined.includes('ipad');
  const isRouter = /router|gateway|firewall|pfsense|opnsense|openwrt|dd[--]?wrt|mikrotik|unifi|asus.*rt|tp[--]?link/.test(combined);
  const isSwitch = /switch|vlan|netgear|cisco.*sg|aruba|zyxel/.test(combined);
  const isPrinter = /printer|print server|brother|epson|hp laserjet|canon.*pixma|ricoh|kyocera/.test(combined);
  const isServer = /server|nas|synology|qnap|proxmox|esxi|vmware|hyper-v|domain controller|dc0|srv0|windows server|ubuntu server|debian server/.test(combined);
  const isTablet = /tablet|ipad|galaxy tab|surface/.test(combined);
  const isCamera = /camera|webcam|ip cam|reolink|dahua|hikvision|ring/.test(combined);
  const isVm = /virtual|vm\b|vbox|virtualbox|qemu|kvm|docker|container|wsl/.test(combined);

  // Offline (or unknown OS), or the operator chose device icons — neutral monitor.
  if (!showOs) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <rect x="3" y="3" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M8 20h8" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 16v4" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }

  if (isRouter) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <rect x="2.5" y="12" width="19" height="7" rx="2" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.15" />
        <circle cx="6" cy="15.5" r="0.9" fill="currentColor" />
        <circle cx="9" cy="15.5" r="0.9" fill="currentColor" opacity="0.6" />
        <path d="M12 12V7.5M12 7.5 9.6 9.6M12 7.5l2.4 2.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M7.5 5.2a6.4 6.4 0 0 1 9 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.7" />
      </svg>
    );
  }

  if (isSwitch) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <rect x="2.5" y="9" width="19" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.15" />
        {[5.5, 8.5, 11.5, 14.5, 17.5].map((x, i) => (
          <rect key={i} x={x} y="11" width="1.6" height="2.4" rx="0.4" fill="currentColor" opacity={0.9 - i * 0.12} />
        ))}
        <path d="M6 9V6M12 9V4.5M18 9V6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    );
  }

  if (isPrinter) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M7 9V3.8h10V9" stroke="currentColor" strokeWidth="1.5" />
        <rect x="3" y="9" width="18" height="7" rx="1.8" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.15" />
        <rect x="7" y="16" width="10" height="4.4" rx="1" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="17.6" cy="12" r="0.9" fill="currentColor" />
      </svg>
    );
  }

  if (isServer) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        {[3.5, 9.5, 15.5].map((y, i) => (
          <g key={i}>
            <rect x="3.5" y={y} width="17" height="5" rx="1.4" stroke="currentColor" strokeWidth="1.4" fill="currentColor" fillOpacity="0.14" />
            <circle cx="6.6" cy={y + 2.5} r="0.85" fill="currentColor" />
            <path d={`M10 ${y + 2.5}h7.4`} stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
          </g>
        ))}
      </svg>
    );
  }

  if (isTablet) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <rect x="4.5" y="2.5" width="15" height="19" rx="2.4" stroke="currentColor" strokeWidth="1.6" fill="currentColor" fillOpacity="0.12" />
        <circle cx="12" cy="18.8" r="1" fill="currentColor" opacity="0.8" />
      </svg>
    );
  }

  if (isCamera) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <rect x="2.5" y="7" width="13" height="9" rx="2" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.15" />
        <path d="M15.5 11.5 21.5 8v8l-6-3.5z" stroke="currentColor" strokeWidth="1.4" fill="currentColor" fillOpacity="0.2" />
        <circle cx="9" cy="11.5" r="2.4" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    );
  }

  if (isVm) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <rect x="3" y="4" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" fill="currentColor" fillOpacity="0.1" />
        <rect x="7" y="7.5" width="10" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
        <path d="M8 20h8M12 16v4" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    );
  }

  if (isSolaris) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <circle cx="12" cy="12" r="4.4" fill="currentColor" opacity="0.9" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map(a => (
          <line
            key={a}
            x1="12" y1="12" x2={12 + 8.6 * Math.cos((a * Math.PI) / 180)}
            y2={12 + 8.6 * Math.sin((a * Math.PI) / 180)}
            stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.8"
          />
        ))}
      </svg>
    );
  }

  if (isBsd) {
    // Daemon-horn silhouette.
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M6.4 5.2c1.6 1.4 2.2 3 2.1 4.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M17.6 5.2c-1.6 1.4-2.2 3-2.1 4.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <ellipse cx="12" cy="13.4" rx="6.2" ry="5.6" fill="currentColor" opacity="0.85" />
        <circle cx="9.9" cy="12.2" r="1.3" fill="#0b0f1a" opacity="0.8" />
        <circle cx="14.1" cy="12.2" r="1.3" fill="#0b0f1a" opacity="0.8" />
        <path d="M9.4 16.2h5.2" stroke="#0b0f1a" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
      </svg>
    );
  }

  if (isIbm) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        {[5, 8, 11, 14, 17].map(y => (
          <g key={y}>
            <rect x="3" y={y} width="5" height="1.6" rx="0.5" fill="currentColor" opacity="0.9" />
            <rect x="9.5" y={y} width="5" height="1.6" rx="0.5" fill="currentColor" opacity="0.9" />
            <rect x="16" y={y} width="5" height="1.6" rx="0.5" fill="currentColor" opacity="0.9" />
          </g>
        ))}
      </svg>
    );
  }

  if (isWindows) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M3 5.6 10.5 4.4v7.1H3V5.6z" fill="currentColor" opacity="0.9" />
        <path d="M12 4.2 21 2.8v8.7h-9V4.2z" fill="currentColor" opacity="0.9" />
        <path d="M3 12.9h7.5v7.1L3 18.8v-5.9z" fill="currentColor" opacity="0.9" />
        <path d="M12 12.9h9v8.3l-9-1.4v-6.9z" fill="currentColor" opacity="0.9" />
      </svg>
    );
  }

  if (isLinux) {
    // Tux-inspired penguin silhouette.
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <ellipse cx="12" cy="12.5" rx="6.5" ry="8" fill="currentColor" opacity="0.85" />
        <ellipse cx="12" cy="14.5" rx="4" ry="5.2" fill="#0b0f1a" opacity="0.55" />
        <circle cx="9.8" cy="8.2" r="1.5" fill="#0b0f1a" opacity="0.75" />
        <circle cx="14.2" cy="8.2" r="1.5" fill="#0b0f1a" opacity="0.75" />
        <circle cx="9.8" cy="8.2" r="0.6" fill="currentColor" />
        <circle cx="14.2" cy="8.2" r="0.6" fill="currentColor" />
        <path d="M10.6 10.6h2.8l-1.4 1.9-1.4-1.9z" fill="#f59e0b" />
        <path d="M7.4 20.2c1.4.9 7.8.9 9.2 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }

  if (isMac) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path
          d="M16.2 12.6c0-2.2 1.8-3.2 1.9-3.3-1-1.5-2.6-1.7-3.2-1.7-1.4-.1-2.7.8-3.4.8-.7 0-1.8-.8-3-.8-1.5 0-2.9.9-3.7 2.3-1.6 2.7-.4 6.8 1.1 9 .7 1.1 1.6 2.3 2.8 2.2 1.1 0 1.6-.7 2.9-.7 1.4 0 1.8.7 3 .7 1.2 0 2-1.1 2.7-2.2.8-1.2 1.2-2.4 1.2-2.5-.1 0-2.3-.9-2.3-3.8z"
          fill="currentColor" opacity="0.9"
        />
        <path d="M14.1 5.9c.6-.8 1-1.8.9-2.9-.9 0-2 .6-2.6 1.4-.6.7-1.1 1.8-.9 2.8 1 .1 2-.5 2.6-1.3z" fill="currentColor" opacity="0.9" />
      </svg>
    );
  }

  if (isAndroid) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M5 11h14v6.5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V11z" fill="currentColor" opacity="0.9" />
        <path d="M5 10.5a7 7 0 0 1 14 0H5z" fill="currentColor" opacity="0.9" />
        <path d="M7.2 6.6 5.8 4.2M16.8 6.6l1.4-2.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="9.3" cy="8.4" r="0.8" fill="#0b0f1a" />
        <circle cx="14.7" cy="8.4" r="0.8" fill="#0b0f1a" />
        <rect x="2.6" y="11.5" width="1.8" height="5.5" rx="0.9" fill="currentColor" opacity="0.8" />
        <rect x="19.6" y="11.5" width="1.8" height="5.5" rx="0.9" fill="currentColor" opacity="0.8" />
      </svg>
    );
  }

  if (isIos) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <rect x="6" y="2.5" width="12" height="19" rx="2.6" stroke="currentColor" strokeWidth="1.6" fill="none" />
        <path d="M10.4 5.2h3.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="12" cy="18.6" r="1.1" fill="currentColor" opacity="0.8" />
      </svg>
    );
  }

  // Online but OS not recognised — lit monitor.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3" y="3" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.18" />
      <path d="M8 20h8" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 16v4" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
};

export default DeviceIcon;
