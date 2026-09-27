import React, { createContext, useContext, useState, useEffect } from 'react';
import { SystemAppFormat } from '../types';
import { SYSTEM_FORMATS, SystemFormatInfo, getSystemFormat } from '../constants/systemFormats';

interface SystemFormatContextType {
  currentFormat: SystemAppFormat;
  formatInfo: SystemFormatInfo;
  setFormat: (format: SystemAppFormat) => void;
  resetToAssigned: () => void;
  assignedFormat: SystemAppFormat;
  setAssignedFormat: (format: SystemAppFormat) => void;
  isAgentic: boolean;
  isPymeFormat: boolean;
  isStudyFormat: boolean;
}

const SystemFormatContext = createContext<SystemFormatContextType>({
  currentFormat: 'VERSION_A',
  formatInfo: SYSTEM_FORMATS.VERSION_A,
  setFormat: () => {},
  resetToAssigned: () => {},
  assignedFormat: 'VERSION_A',
  setAssignedFormat: () => {},
  isAgentic: false,
  isPymeFormat: false,
  isStudyFormat: true,
});

export function SystemFormatProvider({ 
  children,
  initialAssignedFormat
}: { 
  children: React.ReactNode;
  initialAssignedFormat?: SystemAppFormat | null;
}) {
  const [assignedFormat, setAssignedFormatState] = useState<SystemAppFormat>(() => {
    return initialAssignedFormat || 'VERSION_A';
  });

  const [currentFormat, setCurrentFormat] = useState<SystemAppFormat>(() => {
    try {
      const savedOverride = localStorage.getItem('gestok_active_format_override');
      if (savedOverride && (savedOverride === 'VERSION_A' || savedOverride === 'VERSION_B' || savedOverride === 'VERSION_C1' || savedOverride === 'VERSION_C2')) {
        return savedOverride as SystemAppFormat;
      }
    } catch {}
    return initialAssignedFormat || 'VERSION_A';
  });

  // Sync if initialAssignedFormat updates from DB
  useEffect(() => {
    if (initialAssignedFormat) {
      setAssignedFormatState(initialAssignedFormat);
      setCurrentFormat(initialAssignedFormat);
    }
  }, [initialAssignedFormat]);

  const setFormat = (fmt: SystemAppFormat) => {
    setCurrentFormat(fmt);
    try {
      localStorage.setItem('gestok_active_format_override', fmt);
    } catch {}
  };

  const resetToAssigned = () => {
    setCurrentFormat(assignedFormat);
    try {
      localStorage.removeItem('gestok_active_format_override');
    } catch {}
  };

  const setAssignedFormat = (fmt: SystemAppFormat) => {
    if (!fmt) return;
    setAssignedFormatState(fmt);
    setCurrentFormat(fmt);
    try {
      localStorage.removeItem('gestok_active_format_override');
    } catch {}
  };

  const formatInfo = getSystemFormat(currentFormat);
  const isAgentic = formatInfo.isAgentic;
  const isPymeFormat = formatInfo.targetSegment === 'PYME';
  const isStudyFormat = formatInfo.targetSegment === 'STUDY';

  return (
    <SystemFormatContext.Provider
      value={{
        currentFormat,
        formatInfo,
        setFormat,
        resetToAssigned,
        assignedFormat,
        setAssignedFormat,
        isAgentic,
        isPymeFormat,
        isStudyFormat,
      }}
    >
      {children}
    </SystemFormatContext.Provider>
  );
}

export const useSystemFormat = () => useContext(SystemFormatContext);
