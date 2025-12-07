import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export const CyberButton: React.FC<{
  onClick?: () => void;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  className?: string;
  disabled?: boolean;
}> = ({ onClick, children, variant = 'primary', className = '', disabled = false }) => {
  const colors = {
    primary: 'border-[#00ff41] text-[#00ff41] hover:bg-[#00ff41] hover:text-black',
    secondary: 'border-cyan-400 text-cyan-400 hover:bg-cyan-400 hover:text-black',
    danger: 'border-rose-500 text-rose-500 hover:bg-rose-500 hover:text-black',
  };

  return (
    <motion.button
      whileHover={{ scale: 1.02, x: 2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      disabled={disabled}
      className={`
        relative px-6 py-3 border-2 uppercase font-bold tracking-widest text-sm transition-all duration-200
        disabled:opacity-50 disabled:cursor-not-allowed
        ${colors[variant]}
        ${className}
        group
      `}
    >
      <span className="relative z-10">{children}</span>
      {/* Corner decorations */}
      <span className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-current opacity-100 group-hover:opacity-0 transition-opacity" />
      <span className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-current opacity-100 group-hover:opacity-0 transition-opacity" />
    </motion.button>
  );
};

export const GlitchText: React.FC<{ text: string; className?: string }> = ({ text, className = '' }) => {
  const [displayText, setDisplayText] = useState(text);

  useEffect(() => {
    const chars = "!<>-_\\/[]{}—=+*^?#________";
    let interval: ReturnType<typeof setInterval>;

    const glitch = () => {
      const iterations = 5;
      let i = 0;
      
      interval = setInterval(() => {
        setDisplayText(
          text
            .split("")
            .map((char, index) => {
              if (index < i) return text[index];
              return chars[Math.floor(Math.random() * chars.length)];
            })
            .join("")
        );

        if (i >= text.length) clearInterval(interval);
        i += 1 / 3; 
      }, 30);
    };

    // Initial glitch
    glitch();
    
    // Random glitch
    const randomInterval = setInterval(() => {
      if (Math.random() > 0.9) glitch();
    }, 5000);

    return () => {
      clearInterval(interval);
      clearInterval(randomInterval);
    };
  }, [text]);

  return <span className={`font-mono ${className}`}>{displayText}</span>;
};

export const ArtifactOverlay: React.FC = () => {
  const [artifacts, setArtifacts] = useState<{id: number, x: number, y: number, char: string}[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() > 0.7) {
        const id = Date.now();
        const chars = "XYZ01_";
        setArtifacts(prev => [
          ...prev.slice(-4), 
          {
            id,
            x: Math.random() * 100,
            y: Math.random() * 100,
            char: chars[Math.floor(Math.random() * chars.length)]
          }
        ]);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {artifacts.map(art => (
        <motion.div
          key={art.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 0.5 }}
          className="absolute text-green-900/40 text-xs font-mono select-none"
          style={{ left: `${art.x}%`, top: `${art.y}%` }}
        >
          {art.char}
        </motion.div>
      ))}
      <div className="absolute top-10 left-10 w-32 h-32 border border-green-900/20 rounded-full animate-pulse" />
      <div className="absolute bottom-20 right-20 w-64 h-[1px] bg-green-900/30" />
    </div>
  );
};

export const RangeSlider: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (val: number) => void;
}> = ({ label, value, min, max, step, onChange }) => {
  return (
    <div className="mb-4 group">
      <div className="flex justify-between mb-1 font-mono text-xs text-green-400">
        <span>{label}</span>
        <span className="bg-green-900/30 px-1">{value}</span>
      </div>
      <div className="relative h-6 flex items-center">
        {/* Track */}
        <div className="absolute w-full h-1 bg-gray-800 border border-gray-700" />
        {/* Fill */}
        <div 
          className="absolute h-1 bg-green-500/50" 
          style={{ width: `${((value - min) / (max - min)) * 100}%` }} 
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute w-full h-full opacity-0 cursor-pointer z-10"
        />
        {/* Thumb Visual */}
        <div 
          className="absolute w-4 h-4 bg-black border-2 border-[#00ff41] transform -translate-x-1/2 transition-transform group-hover:scale-110 pointer-events-none"
          style={{ left: `${((value - min) / (max - min)) * 100}%` }}
        />
      </div>
    </div>
  );
};