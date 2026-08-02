export const theme = {
  colors: {
    primary: '#0F8F72',
    primaryDark: '#0B6E58',
    primaryLight: '#3FD8B0',
    accent: '#E8A94A',
    background: '#0A0A0F',
    surface: '#14141C',
    surfaceLight: '#1E1E2A',
    surfaceHover: '#262636',
    text: '#F5F5F7',
    textMuted: '#9CA3AF',
    textDim: '#6B7280',
    success: '#22C55E',
    warning: '#F59E0B',
    error: '#EF4444',
    border: '#2A2A3A',
  },
  gradients: {
    hero: 'linear-gradient(180deg, rgba(10,10,15,0) 0%, rgba(10,10,15,0.4) 50%, rgba(10,10,15,1) 100%)',
    heroLeft: 'linear-gradient(90deg, rgba(10,10,15,0.9) 0%, rgba(10,10,15,0.5) 50%, rgba(10,10,15,0) 100%)',
    card: 'linear-gradient(180deg, rgba(10,10,15,0) 40%, rgba(10,10,15,0.95) 100%)',
    primary: 'linear-gradient(135deg, #0F8F72 0%, #0B6E58 100%)',
    glow: 'radial-gradient(circle at 50% 0%, rgba(15,143,114,0.18) 0%, rgba(10,10,15,0) 60%)',
  },
  fonts: {
    display: '"Bebas Neue", "Battambang", "Inter", system-ui, sans-serif',
    body: '"Inter", system-ui, -apple-system, sans-serif',
  },
  radius: {
    sm: '6px',
    md: '10px',
    lg: '16px',
    xl: '24px',
  },
  shadows: {
    card: '0 8px 24px rgba(0,0,0,0.5)',
    elevated: '0 20px 50px rgba(0,0,0,0.6)',
    glow: '0 0 30px rgba(15,143,114,0.35)',
  },
} as const;

export type Theme = typeof theme;
