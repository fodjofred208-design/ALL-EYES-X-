import React from 'react';

interface DeviceIconProps {
  hostname?: string;
  os?: string;
  size?: number;
  className?: string;
}

const DeviceIcon: React.FC<DeviceIconProps> = ({
  hostname = '',
  os = '',
  size = 40,
  className = '',
}) => {
  const combined = (os + ' ' + hostname).toLowerCase();

  if (combined.includes('windows')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <rect x="3" y="3" width="8" height="8" rx="1" fill="currentColor" opacity="0.8"/>
        <rect x="13" y="3" width="8" height="8" rx="1" fill="currentColor" opacity="0.8"/>
        <rect x="3" y="13" width="8" height="8" rx="1" fill="currentColor" opacity="0.8"/>
        <rect x="13" y="13" width="8" height="8" rx="1" fill="currentColor" opacity="0.8"/>
      </svg>
    );
  }

  if (combined.includes('linux') || combined.includes('ubuntu') || combined.includes('debian') || combined.includes('kali') || combined.includes('centos')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M12 2L2 7v10l10 5 10-5V7L12 2z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <path d="M12 8v8" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M8 10v4" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M16 10v4" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    );
  }

  if (combined.includes('darwin') || combined.includes('macos') || combined.includes('mac')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <rect x="5" y="3" width="14" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <path d="M12 3v1" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="9" y="19" width="6" height="2" rx="1" fill="currentColor" opacity="0.6"/>
      </svg>
    );
  }

  if (combined.includes('android')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <rect x="5" y="4" width="14" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <rect x="7" y="8" width="10" height="8" rx="1" fill="currentColor" opacity="0.3"/>
        <path d="M9 2v2" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M15 2v2" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    );
  }

  // Default monitor/desktop
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3" y="3" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
      <path d="M8 20h8" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M12 16v4" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  );
};

export default DeviceIcon;