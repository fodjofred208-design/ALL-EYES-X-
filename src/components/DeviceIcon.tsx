import React from 'react';

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
  const combined = (os + ' ' + hostname).toLowerCase();

  const isWindows = combined.includes('windows');
  const isLinux =
    combined.includes('linux') || combined.includes('ubuntu') || combined.includes('debian') ||
    combined.includes('kali') || combined.includes('centos') || combined.includes('fedora') ||
    combined.includes('arch') || combined.includes('mint') || combined.includes('redhat');
  const isMac = combined.includes('darwin') || combined.includes('macos') || combined.includes('mac');
  const isAndroid = combined.includes('android');
  const isIos = combined.includes('ios') || combined.includes('iphone') || combined.includes('ipad');

  // Offline (or unknown OS) — neutral monitor.
  if (!online) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <rect x="3" y="3" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M8 20h8" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 16v4" stroke="currentColor" strokeWidth="1.5" />
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
