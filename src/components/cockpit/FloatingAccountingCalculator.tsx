import React, { useState, useEffect } from 'react';
import { 
  Calculator, X, History, Copy, Trash2, ArrowRight, CornerDownLeft, Sparkles
} from 'lucide-react';
import { notify } from '../../context/ToastContext';

interface CalculationRecord {
  id: string;
  expression: string;
  result: string;
  timestamp: string;
}

interface FloatingAccountingCalculatorProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertValue?: (val: number) => void;
}

export const FloatingAccountingCalculator: React.FC<FloatingAccountingCalculatorProps> = ({
  isOpen,
  onClose,
  onInsertValue
}) => {
  const [displayValue, setDisplayValue] = useState<string>('0');
  const [equation, setEquation] = useState<string>('');
  const [waitingForOperand, setWaitingForOperand] = useState<boolean>(false);
  const [pendingOperator, setPendingOperator] = useState<string | null>(null);
  const [valueInMemory, setValueInMemory] = useState<number | null>(null);
  
  // History tape (last 20 calculations)
  const [history, setHistory] = useState<CalculationRecord[]>(() => {
    try {
      const saved = localStorage.getItem('gestok_calc_history');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });
  const [showHistory, setShowHistory] = useState<boolean>(false);

  useEffect(() => {
    try {
      localStorage.setItem('gestok_calc_history', JSON.stringify(history));
    } catch {}
  }, [history]);

  // Keyboard listener when calculator is open
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key;
      if ((key >= '0' && key <= '9') || key === '.') {
        inputDigit(key);
      } else if (key === '+' || key === '-' || key === '*' || key === '/') {
        performOperation(key);
      } else if (key === 'Enter' || key === '=') {
        e.preventDefault();
        handleEquals();
      } else if (key === 'Escape') {
        onClose();
      } else if (key === 'Backspace') {
        handleBackSpace();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, displayValue, waitingForOperand, pendingOperator, valueInMemory]);

  const inputDigit = (digit: string) => {
    if (waitingForOperand) {
      setDisplayValue(digit);
      setWaitingForOperand(false);
    } else {
      setDisplayValue(displayValue === '0' && digit !== '.' ? digit : displayValue + digit);
    }
  };

  const inputDecimal = () => {
    if (waitingForOperand) {
      setDisplayValue('0.');
      setWaitingForOperand(false);
      return;
    }
    if (!displayValue.includes('.')) {
      setDisplayValue(displayValue + '.');
    }
  };

  const clearAll = () => {
    setDisplayValue('0');
    setEquation('');
    setValueInMemory(null);
    setPendingOperator(null);
    setWaitingForOperand(false);
  };

  const toggleSign = () => {
    const val = parseFloat(displayValue);
    if (val === 0) return;
    setDisplayValue(String(-val));
  };

  const inputPercent = () => {
    const val = parseFloat(displayValue);
    if (isNaN(val)) return;
    setDisplayValue(String(val / 100));
  };

  const performOperatorSymbol = (op: string) => {
    if (op === '*') return '×';
    if (op === '/') return '÷';
    return op;
  };

  const performOperation = (nextOperator: string) => {
    const inputValue = parseFloat(displayValue);

    if (valueInMemory === null) {
      setValueInMemory(inputValue);
    } else if (pendingOperator) {
      const currentValue = valueInMemory;
      let result = currentValue;

      if (pendingOperator === '+') result = currentValue + inputValue;
      else if (pendingOperator === '-') result = currentValue - inputValue;
      else if (pendingOperator === '*') result = currentValue * inputValue;
      else if (pendingOperator === '/') result = inputValue !== 0 ? currentValue / inputValue : 0;

      setValueInMemory(result);
      setDisplayValue(String(result));
    }

    setWaitingForOperand(true);
    setPendingOperator(nextOperator);
    setEquation(`${valueInMemory !== null ? valueInMemory : inputValue} ${performOperatorSymbol(nextOperator)} `);
  };

  const handleEquals = () => {
    const inputValue = parseFloat(displayValue);

    if (!pendingOperator || valueInMemory === null) return;

    let result = valueInMemory;
    const currentOp = pendingOperator;
    const memoEquation = `${valueInMemory} ${performOperatorSymbol(currentOp)} ${inputValue}`;

    if (currentOp === '+') result = valueInMemory + inputValue;
    else if (currentOp === '-') result = valueInMemory - inputValue;
    else if (currentOp === '*') result = valueInMemory * inputValue;
    else if (currentOp === '/') result = inputValue !== 0 ? valueInMemory / inputValue : 0;

    const formattedResult = String(Number(result.toFixed(4)));
    
    // Add to history tape (max 20)
    const newRecord: CalculationRecord = {
      id: `calc_${Date.now()}`,
      expression: `${memoEquation} =`,
      result: formattedResult,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };

    setHistory(prev => [newRecord, ...prev].slice(0, 20));

    setDisplayValue(formattedResult);
    setValueInMemory(null);
    setPendingOperator(null);
    setWaitingForOperand(true);
    setEquation('');
  };

  const handleBackSpace = () => {
    if (waitingForOperand) return;
    if (displayValue.length > 1) {
      setDisplayValue(displayValue.slice(0, -1));
    } else {
      setDisplayValue('0');
    }
  };

  const copyToClipboard = (val: string) => {
    navigator.clipboard.writeText(val);
    notify.success(`Copiado al portapapeles: ${val}`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-16 right-5 z-50 w-80 sm:w-96 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-100 animate-in fade-in slide-in-from-bottom-3 duration-200">
      
      {/* Cabecera de la Calculadora (Estilo Widget iOS) */}
      <div className="px-4 py-3 bg-slate-850 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center shadow-xs">
            <Calculator className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white tracking-wide uppercase">Calculadora Táctica & Cinta</h3>
            <p className="text-[10px] text-slate-400">Contabilidad & Análisis Rápido</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`p-1.5 rounded-lg border transition-all cursor-pointer flex items-center gap-1 text-xs ${
              showHistory
                ? 'bg-indigo-600 text-white border-indigo-500'
                : 'bg-slate-800 hover:bg-slate-750 text-slate-300 border-slate-700'
            }`}
            title="Historial / Cinta de Cuentas (Últimos 20)"
          >
            <History className="w-3.5 h-3.5" />
            <span className="text-[10px] font-mono">{history.length}</span>
          </button>

          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            title="Cerrar Calculadora"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showHistory ? (
        // --- VISTA DE CINTA DE HISTORIAL (Últimos 20 cálculos) ---
        <div className="flex-1 flex flex-col h-[360px] bg-slate-900 p-3">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-[11px] text-slate-400">
            <span className="font-bold uppercase">Cinta de Memoria (Últimos cálculos)</span>
            {history.length > 0 && (
              <button
                onClick={() => setHistory([])}
                className="text-rose-400 hover:text-rose-300 flex items-center gap-1 text-[10px] cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                <span>Limpiar cinta</span>
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 no-scrollbar">
            {history.map(item => (
              <div 
                key={item.id}
                onClick={() => {
                  setDisplayValue(item.result);
                  setShowHistory(false);
                }}
                className="group p-2.5 rounded-xl bg-slate-850 hover:bg-slate-800 border border-slate-750 hover:border-indigo-500/50 transition-all cursor-pointer flex items-center justify-between gap-2"
                title="Hacer clic para usar este resultado"
              >
                <div>
                  <div className="text-[11px] text-slate-400 font-mono">{item.expression}</div>
                  <div className="text-sm font-bold text-white font-mono">{item.result}</div>
                  <div className="text-[9px] text-slate-500">{item.timestamp}</div>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      copyToClipboard(item.result);
                    }}
                    className="p-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs"
                    title="Copiar resultado"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  {onInsertValue && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onInsertValue(parseFloat(item.result));
                        onClose();
                      }}
                      className="p-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs"
                      title="Insertar en campo activo"
                    >
                      <CornerDownLeft className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {history.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-1">
                <History className="w-8 h-8 opacity-40 mb-1" />
                <p className="text-xs font-medium">La cinta de memoria está vacía</p>
                <p className="text-[10px]">Realiza operaciones para ver el historial aquí.</p>
              </div>
            )}
          </div>

          <button
            onClick={() => setShowHistory(false)}
            className="mt-3 w-full py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            Volver a la Calculadora
          </button>
        </div>
      ) : (
        // --- TECLADO CALCULADORA (Estilo iOS Pro) ---
        <div className="p-4 space-y-3 bg-slate-900">
          
          {/* Pantalla / Display */}
          <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 text-right space-y-1 shadow-inner">
            <div className="text-[11px] font-mono text-slate-400 min-h-[16px] truncate">
              {equation}
            </div>
            <div className="text-2xl sm:text-3xl font-bold font-mono text-white tracking-tight truncate">
              {displayValue}
            </div>
          </div>

          {/* Botonera 4x4 */}
          <div className="grid grid-cols-4 gap-2">
            {/* Fila 1 */}
            <button
              onClick={clearAll}
              className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-rose-300 font-bold text-xs transition-colors cursor-pointer"
            >
              AC
            </button>
            <button
              onClick={toggleSign}
              className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 font-bold text-xs transition-colors cursor-pointer"
            >
              ±
            </button>
            <button
              onClick={inputPercent}
              className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 font-bold text-xs transition-colors cursor-pointer"
            >
              %
            </button>
            <button
              onClick={() => performOperation('/')}
              className={`py-2.5 rounded-xl font-bold text-sm transition-colors cursor-pointer ${
                pendingOperator === '/' ? 'bg-amber-400 text-slate-950' : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30'
              }`}
            >
              ÷
            </button>

            {/* Fila 2 */}
            <button
              onClick={() => inputDigit('7')}
              className="py-3 rounded-xl bg-slate-800/80 hover:bg-slate-750 text-white font-bold text-sm transition-colors cursor-pointer"
            >
              7
            </button>
            <button
              onClick={() => inputDigit('8')}
              className="py-3 rounded-xl bg-slate-800/80 hover:bg-slate-750 text-white font-bold text-sm transition-colors cursor-pointer"
            >
              8
            </button>
            <button
              onClick={() => inputDigit('9')}
              className="py-3 rounded-xl bg-slate-800/80 hover:bg-slate-750 text-white font-bold text-sm transition-colors cursor-pointer"
            >
              9
            </button>
            <button
              onClick={() => performOperation('*')}
              className={`py-2.5 rounded-xl font-bold text-sm transition-colors cursor-pointer ${
                pendingOperator === '*' ? 'bg-amber-400 text-slate-950' : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30'
              }`}
            >
              ×
            </button>

            {/* Fila 3 */}
            <button
              onClick={() => inputDigit('4')}
              className="py-3 rounded-xl bg-slate-800/80 hover:bg-slate-750 text-white font-bold text-sm transition-colors cursor-pointer"
            >
              4
            </button>
            <button
              onClick={() => inputDigit('5')}
              className="py-3 rounded-xl bg-slate-800/80 hover:bg-slate-750 text-white font-bold text-sm transition-colors cursor-pointer"
            >
              5
            </button>
            <button
              onClick={() => inputDigit('6')}
              className="py-3 rounded-xl bg-slate-800/80 hover:bg-slate-750 text-white font-bold text-sm transition-colors cursor-pointer"
            >
              6
            </button>
            <button
              onClick={() => performOperation('-')}
              className={`py-2.5 rounded-xl font-bold text-sm transition-colors cursor-pointer ${
                pendingOperator === '-' ? 'bg-amber-400 text-slate-950' : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30'
              }`}
            >
              -
            </button>

            {/* Fila 4 */}
            <button
              onClick={() => inputDigit('1')}
              className="py-3 rounded-xl bg-slate-800/80 hover:bg-slate-750 text-white font-bold text-sm transition-colors cursor-pointer"
            >
              1
            </button>
            <button
              onClick={() => inputDigit('2')}
              className="py-3 rounded-xl bg-slate-800/80 hover:bg-slate-750 text-white font-bold text-sm transition-colors cursor-pointer"
            >
              2
            </button>
            <button
              onClick={() => inputDigit('3')}
              className="py-3 rounded-xl bg-slate-800/80 hover:bg-slate-750 text-white font-bold text-sm transition-colors cursor-pointer"
            >
              3
            </button>
            <button
              onClick={() => performOperation('+')}
              className={`py-2.5 rounded-xl font-bold text-sm transition-colors cursor-pointer ${
                pendingOperator === '+' ? 'bg-amber-400 text-slate-950' : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30'
              }`}
            >
              +
            </button>

            {/* Fila 5 */}
            <button
              onClick={() => inputDigit('0')}
              className="col-span-2 py-3 rounded-xl bg-slate-800/80 hover:bg-slate-750 text-white font-bold text-sm transition-colors cursor-pointer text-left pl-5"
            >
              0
            </button>
            <button
              onClick={inputDecimal}
              className="py-3 rounded-xl bg-slate-800/80 hover:bg-slate-750 text-white font-bold text-sm transition-colors cursor-pointer"
            >
              ,
            </button>
            <button
              onClick={handleEquals}
              className="py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-sm transition-colors cursor-pointer shadow-md shadow-amber-500/20"
            >
              =
            </button>
          </div>

          {/* Acciones rápidas (Copiar y pegar) */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => copyToClipboard(displayValue)}
              className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              title="Copiar valor actual"
            >
              <Copy className="w-3.5 h-3.5 text-indigo-400" />
              <span>Copiar</span>
            </button>
            {onInsertValue && (
              <button
                onClick={() => {
                  onInsertValue(parseFloat(displayValue) || 0);
                  onClose();
                }}
                className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                title="Insertar en campo contable"
              >
                <CornerDownLeft className="w-3.5 h-3.5" />
                <span>Insertar</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
